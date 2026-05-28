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
    bearer_token: str | None = None,
    since_id: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """
    Search recent tweets matching a query (mentions, hashtags, keywords).
    
    Returns:
        {"posts": [{"id", "text", "author_handle", "author_name", "created_at", "url"}], "newest_id": str}
    """
    token = bearer_token or settings.X_BEARER_TOKEN
    if not token:
        raise MonitorError("X bearer token is not configured")

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
                headers={"Authorization": f"Bearer {token}"},
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
    credentials: dict[str, Any] | None = None,
    since_uid: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """
    Poll IMAP mailbox for new emails.
    
    Returns:
        {"posts": [{"id", "text", "author_handle", "author_name", "subject", "created_at"}], "newest_id": str}
    """
    credentials = credentials or {}
    host = str(credentials.get("imap_host") or credentials.get("host") or settings.IMAP_HOST or "")
    port = int(credentials.get("imap_port") or credentials.get("port") or settings.IMAP_PORT)
    user = str(credentials.get("imap_user") or credentials.get("user") or credentials.get("username") or settings.IMAP_USER or "")
    password = str(credentials.get("imap_password") or credentials.get("password") or settings.IMAP_PASSWORD or "")
    use_ssl = credentials.get("imap_use_ssl", credentials.get("use_ssl", settings.IMAP_USE_SSL))
    if isinstance(use_ssl, str):
        use_ssl = use_ssl.lower() not in {"false", "0", "no"}

    if not host or not user:
        raise MonitorError("IMAP settings not configured")

    try:
        if use_ssl:
            mail = imaplib.IMAP4_SSL(host, port)
        else:
            mail = imaplib.IMAP4(host, port)

        mail.login(user, password)
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
    access_token: str | None = None,
    since_timestamp: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """
    Poll Threads for mentions of the authenticated user.
    
    Returns:
        {"posts": [{"id", "text", "author_handle", "author_name", "created_at", "url"}], "newest_id": str}
    """
    token = access_token or settings.THREADS_ACCESS_TOKEN
    if not token:
        raise MonitorError("Threads access token is not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            params: dict[str, Any] = {
                "fields": "id,text,timestamp,username",
                "access_token": token,
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


def _path_get(data: Any, path: str | None) -> Any:
    if not path:
        return None
    current = data
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            current = current[int(part)] if int(part) < len(current) else None
        else:
            return None
    return current


async def poll_reddit_mentions(
    query: str,
    *,
    credentials: dict[str, Any],
    after: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """Search Reddit for posts/comments that mention the configured bank account."""
    client_id = str(credentials.get("client_id") or "")
    client_secret = str(credentials.get("client_secret") or "")
    user_agent = str(credentials.get("user_agent") or "AURA-CX/1.0")
    if not client_id or not client_secret:
        raise MonitorError("Reddit client_id/client_secret are not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": user_agent}) as client:
            token_resp = await client.post(
                "https://www.reddit.com/api/v1/access_token",
                data={"grant_type": "client_credentials"},
                auth=(client_id, client_secret),
            )
            token_resp.raise_for_status()
            token = token_resp.json().get("access_token")
            if not token:
                raise MonitorError("Reddit did not return an access token")

            subreddit = str(credentials.get("subreddit") or "").strip().lstrip("r/")
            account = query.strip()
            if account.lower().startswith("r/") and not subreddit:
                subreddit = account[2:]
            url = f"https://oauth.reddit.com/r/{subreddit}/search" if subreddit else "https://oauth.reddit.com/search"
            params: dict[str, Any] = {
                "q": str(credentials.get("query") or query),
                "sort": "new",
                "limit": min(max(max_results, 1), 100),
                "restrict_sr": bool(subreddit),
            }
            if after:
                params["after"] = after

            resp = await client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
            resp.raise_for_status()
            data = resp.json().get("data", {})

        posts = []
        for child in data.get("children", []):
            item = child.get("data", {})
            external_id = item.get("name") or item.get("id")
            if not external_id:
                continue
            text = item.get("selftext") or item.get("body") or item.get("title") or ""
            if item.get("title") and item.get("selftext"):
                text = f"{item.get('title')}\n\n{item.get('selftext')}"
            posts.append({
                "id": external_id,
                "text": text,
                "author_handle": f"u/{item.get('author', 'unknown')}",
                "author_name": item.get("author"),
                "created_at": item.get("created_utc"),
                "url": f"https://www.reddit.com{item.get('permalink', '')}" if item.get("permalink") else None,
            })
        return {"posts": posts, "newest_id": data.get("after") or after}

    except MonitorError:
        raise
    except httpx.HTTPStatusError as exc:
        logger.error("Reddit API error: %s %s", exc.response.status_code, exc.response.text[:200])
        return {"posts": [], "newest_id": after}
    except Exception:
        logger.exception("Reddit polling failed")
        return {"posts": [], "newest_id": after}


async def poll_generic_http_platform(
    *,
    account_identifier: str,
    credentials: dict[str, Any],
    cursor: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """
    Poll a custom platform endpoint.

    Expected credential keys: endpoint_url/api_url/url, optional token/api_key,
    optional items_path, next_cursor_path, field_map, params, and headers.
    """
    endpoint = str(credentials.get("endpoint_url") or credentials.get("api_url") or credentials.get("url") or "")
    if not endpoint:
        raise MonitorError("Generic platform requires endpoint_url, api_url, or url")

    method = str(credentials.get("method") or "GET").upper()
    params = dict(credentials.get("params") or {})
    headers = dict(credentials.get("headers") or {})
    token = credentials.get("bearer_token") or credentials.get("access_token") or credentials.get("api_token") or credentials.get("token")
    api_key = credentials.get("api_key")
    if token:
        headers.setdefault("Authorization", f"Bearer {token}")
    if api_key:
        headers[str(credentials.get("api_key_header") or "X-API-Key")] = str(api_key)

    account_param = credentials.get("account_param")
    if account_param:
        params[str(account_param)] = account_identifier
    cursor_param = credentials.get("cursor_param")
    if cursor and cursor_param:
        params[str(cursor_param)] = cursor
    limit_param = credentials.get("limit_param")
    if limit_param:
        params[str(limit_param)] = min(max_results, 100)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "POST":
                resp = await client.post(endpoint, json=dict(credentials.get("body") or {}), params=params, headers=headers)
            else:
                resp = await client.get(endpoint, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        items = _path_get(data, str(credentials.get("items_path") or "")) if credentials.get("items_path") else None
        if items is None:
            for path in ("data", "items", "results"):
                candidate = _path_get(data, path)
                if isinstance(candidate, list):
                    items = candidate
                    break
        if not isinstance(items, list):
            items = data if isinstance(data, list) else []

        field_map = dict(credentials.get("field_map") or {})
        posts = []
        for index, item in enumerate(items[:max_results]):
            if not isinstance(item, dict):
                continue
            def mapped(name: str, *fallbacks: str) -> Any:
                path = field_map.get(name)
                if path:
                    return _path_get(item, str(path))
                for fallback in fallbacks:
                    value = _path_get(item, fallback)
                    if value is not None:
                        return value
                return None

            external_id = mapped("id", "id", "external_id", "message_id") or f"{cursor or 'item'}_{index}"
            text = mapped("text", "text", "content", "body", "message") or ""
            posts.append({
                "id": str(external_id),
                "text": str(text),
                "author_handle": str(mapped("author_handle", "author.username", "author_handle", "sender_id", "from") or "unknown"),
                "author_name": mapped("author_name", "author.name", "sender_name", "name"),
                "created_at": mapped("created_at", "created_at", "timestamp", "date"),
                "url": mapped("url", "url", "permalink"),
                "raw": item,
            })

        next_cursor = _path_get(data, str(credentials.get("next_cursor_path") or "")) if credentials.get("next_cursor_path") else None
        if not next_cursor and posts:
            next_cursor = posts[0]["id"]
        return {"posts": posts, "newest_id": str(next_cursor) if next_cursor else cursor}

    except MonitorError:
        raise
    except httpx.HTTPStatusError as exc:
        logger.error("Generic platform API error: %s %s", exc.response.status_code, exc.response.text[:200])
        return {"posts": [], "newest_id": cursor}
    except Exception:
        logger.exception("Generic platform polling failed")
        return {"posts": [], "newest_id": cursor}
