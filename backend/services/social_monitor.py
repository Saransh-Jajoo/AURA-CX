"""Social media monitoring service.

Polls X (Twitter), Email (IMAP), and Threads for mentions,
hashtags, and keywords matching tenant monitor configurations.
"""

from __future__ import annotations

import email as email_lib
import imaplib
import logging
from email.utils import parseaddr
from typing import Any

import httpx

from config import settings

logger = logging.getLogger("aura_cx.social_monitor")


class MonitorError(RuntimeError):
    pass


# ── X (Twitter) API v2 ────────────────────────────────────────

async def poll_x_mentions(
    query: str,
    *,
    since_id: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """
    Search recent tweets matching a query (mentions, hashtags, keywords).
    
    Returns:
        {"posts": [{"id", "text", "author_handle", "author_name", "created_at", "url"}], "newest_id": str}
    """
    if not settings.X_BEARER_TOKEN:
        raise MonitorError("X_BEARER_TOKEN is not configured")

    params: dict[str, Any] = {
        "query": query,
        "max_results": min(max(10, max_results), 100),
        "tweet.fields": "created_at,author_id,text,lang",
        "expansions": "author_id",
        "user.fields": "username,name",
    }
    if since_id:
        params["since_id"] = since_id

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://api.twitter.com/2/tweets/search/recent",
                params=params,
                headers={"Authorization": f"Bearer {settings.X_BEARER_TOKEN}"},
            )
            resp.raise_for_status()
            data = resp.json()

        users_map: dict[str, dict] = {}
        for user in data.get("includes", {}).get("users", []):
            users_map[user["id"]] = {"handle": f"@{user['username']}", "name": user.get("name", "")}

        posts = []
        for tweet in data.get("data", []):
            author = users_map.get(tweet.get("author_id", ""), {})
            posts.append({
                "id": tweet["id"],
                "text": tweet.get("text", ""),
                "author_handle": author.get("handle", f"user:{tweet.get('author_id', 'unknown')}"),
                "author_name": author.get("name", ""),
                "created_at": tweet.get("created_at", ""),
                "url": f"https://x.com/i/status/{tweet['id']}",
                "lang": tweet.get("lang", "en"),
            })

        newest_id = data.get("meta", {}).get("newest_id")
        return {"posts": posts, "newest_id": newest_id}

    except MonitorError:
        raise
    except httpx.HTTPStatusError as exc:
        logger.error("X API error: %s %s", exc.response.status_code, exc.response.text[:200])
        return {"posts": [], "newest_id": since_id}
    except Exception:
        logger.exception("X polling failed")
        return {"posts": [], "newest_id": since_id}


# ── Email (IMAP) ─────────────────────────────────────────────

def poll_email_inbox(
    folder: str = "INBOX",
    *,
    since_uid: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """
    Poll IMAP mailbox for new emails.
    
    Returns:
        {"posts": [{"id", "text", "author_handle", "author_name", "subject", "created_at"}], "newest_id": str}
    """
    if not settings.IMAP_HOST or not settings.IMAP_USER:
        raise MonitorError("IMAP settings not configured")

    try:
        if settings.IMAP_USE_SSL:
            mail = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
        else:
            mail = imaplib.IMAP4(settings.IMAP_HOST, settings.IMAP_PORT)

        mail.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        mail.select(folder, readonly=True)

        if since_uid:
            _status, data = mail.uid("search", None, f"UID {since_uid}:*")
        else:
            _status, data = mail.uid("search", None, "ALL")

        if _status != "OK" or not data[0]:
            mail.logout()
            return {"posts": [], "newest_id": since_uid}

        uid_list = data[0].split()
        if since_uid:
            uid_list = [uid for uid in uid_list if uid.decode() != since_uid]
        uid_list = uid_list[-max_results:]

        posts = []
        newest_uid = since_uid

        for uid in uid_list:
            _status, msg_data = mail.uid("fetch", uid, "(RFC822)")
            if _status != "OK" or not msg_data[0]:
                continue

            raw = msg_data[0][1]
            msg = email_lib.message_from_bytes(raw)

            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain":
                        charset = part.get_content_charset() or "utf-8"
                        body = part.get_payload(decode=True).decode(charset, errors="replace")
                        break
            else:
                charset = msg.get_content_charset() or "utf-8"
                body = msg.get_payload(decode=True).decode(charset, errors="replace")

            sender = msg.get("From", "")
            subject = msg.get("Subject", "")
            date = msg.get("Date", "")
            sender_name, sender_email = parseaddr(sender)

            posts.append({
                "id": uid.decode(),
                "text": f"Subject: {subject}\n\n{body[:5000]}",
                "author_handle": sender_email or sender,
                "author_name": sender_name or sender_email,
                "subject": subject,
                "created_at": date,
                "url": None,
            })
            newest_uid = uid.decode()

        mail.logout()
        return {"posts": posts, "newest_id": newest_uid}

    except MonitorError:
        raise
    except Exception:
        logger.exception("Email IMAP polling failed")
        return {"posts": [], "newest_id": since_uid}


# ── Threads (Meta) ───────────────────────────────────────────

async def poll_threads_mentions(
    *,
    since_timestamp: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """
    Poll Threads for mentions of the authenticated user.
    
    Returns:
        {"posts": [{"id", "text", "author_handle", "author_name", "created_at", "url"}], "newest_id": str}
    """
    if not settings.THREADS_ACCESS_TOKEN:
        raise MonitorError("THREADS_ACCESS_TOKEN is not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            params: dict[str, Any] = {
                "fields": "id,text,timestamp,username",
                "access_token": settings.THREADS_ACCESS_TOKEN,
                "limit": min(max_results, 100),
            }
            if since_timestamp:
                params["since"] = since_timestamp

            resp = await client.get(
                "https://graph.threads.net/v1.0/me/mentions",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

        posts = []
        newest_ts = since_timestamp

        for post in data.get("data", []):
            ts = post.get("timestamp", "")
            posts.append({
                "id": post["id"],
                "text": post.get("text", ""),
                "author_handle": f"@{post.get('username', 'unknown')}",
                "author_name": post.get("username", ""),
                "created_at": ts,
                "url": f"https://www.threads.net/post/{post['id']}",
            })
            if ts and (not newest_ts or ts > newest_ts):
                newest_ts = ts

        return {"posts": posts, "newest_id": newest_ts}

    except MonitorError:
        raise
    except httpx.HTTPStatusError as exc:
        logger.error("Threads API error: %s %s", exc.response.status_code, exc.response.text[:200])
        return {"posts": [], "newest_id": since_timestamp}
    except Exception:
        logger.exception("Threads polling failed")
        return {"posts": [], "newest_id": since_timestamp}
