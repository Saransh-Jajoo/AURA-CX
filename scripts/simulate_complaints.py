#!/usr/bin/env python3
"""AURA-CX Ingestion Simulator

Simulates customer complaints on X (Twitter), Reddit, and Gmail to demonstrate
real-time ticket ingestion, identity resolution, smart classification, SLA countdowns,
and the Human-in-the-Loop copilot draft interface.
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from urllib.error import HTTPError, URLError

API_URL = "http://127.0.0.1:8000/api/v1"
ADMIN_EMAIL = "admin@aura.cx"
ADMIN_PASSWORD = "Admin@123"

COMPLAINTS = [
    {
        "channel": "x",
        "sender_id": "alex_tech_support",
        "sender_name": "Alex Mercer",
        "raw_content": "@CustomerCare My AURA-CX account is completely locked. I tried to reset my password but I'm not receiving any reset emails! Please help urgently!",
        "product": "AURA-CX Platform",
        "external_id": "tweet_11223344",
        "metadata": {"followers_count": 1420}
    },
    {
        "channel": "reddit",
        "sender_id": "u/coding_ninja",
        "sender_name": "Marcus Vance",
        "raw_content": "Is anyone else experiencing terrible lag on the new dashboard? When I click the Kanban board, it takes almost 10 seconds to load and sometimes the browser completely freezes. Is there a performance outage today?",
        "product": "Dashboard UI",
        "external_id": "reddit_post_887766",
        "metadata": {"subreddit": "r/aura_cx", "karma": 12450}
    },
    {
        "channel": "gmail",
        "sender_id": "sarah.jenkins@gmail.com",
        "sender_name": "Sarah Jenkins",
        "raw_content": "Dear Billing Team, I was charged twice for my subscription this month! The invoice number is INV-99882. Please process a refund for the duplicate charge immediately. This is extremely disappointing.",
        "product": "Billing Engine",
        "external_id": "email_msg_993311",
        "metadata": {"subject": "Duplicate Billing Charge - Invoice INV-99882", "to": "support@aura.cx"}
    },
    {
        "channel": "x",
        "sender_id": "innovator_lisa",
        "sender_name": "Lisa Sterling",
        "raw_content": "@CustomerCare I really love the new glassmorphism dashboard styling! Could you guys add a dark mode toggle to the sidebar? That would make this app absolutely perfect.",
        "product": "Dashboard UI",
        "external_id": "tweet_55667788",
        "metadata": {"followers_count": 8290}
    }
]


def get_environment():
    environment = os.getenv("ENVIRONMENT") or os.getenv("AURA_ENV") or os.getenv("NODE_ENV")
    if environment:
        return environment
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    try:
        with open(env_path, "r", encoding="utf-8") as env_file:
            for line in env_file:
                if line.strip().startswith("ENVIRONMENT="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return "development"


def make_request(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    
    req_data = None
    if data is not None:
        if isinstance(data, dict):
            if headers.get("Content-Type") == "application/x-www-form-urlencoded":
                req_data = urllib.parse.urlencode(data).encode("utf-8")
            else:
                req_data = json.dumps(data).encode("utf-8")
                if "Content-Type" not in headers:
                    headers["Content-Type"] = "application/json"
        else:
            req_data = data

    req = urllib.request.Request(url, method=method, data=req_data, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body) if res_body else {}
    except HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"\n[Error] {method} {url} returned HTTP {e.code}: {e.reason}")
        print(f"Details: {err_body}")
        sys.exit(1)
    except URLError as e:
        print(f"\n[Error] Failed to connect to server at {url}. Is the AURA-CX backend running?")
        print(f"Details: {e.reason}")
        sys.exit(1)


def main():
    environment = get_environment()
    if environment.lower() == "production":
        print("[Blocked] The complaint simulator is disabled in production.")
        print("Set ENVIRONMENT=development locally to run simulated ingestion.")
        sys.exit(2)

    print("=" * 60)
    print("           AURA-CX INGESTION SIMULATOR")
    print("=" * 60)

    # 1. Log in to get token
    print(f"\n[1/3] Authenticating as {ADMIN_EMAIL}...")
    login_data = {
        "username": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    auth_headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    login_res = make_request(
        f"{API_URL}/auth/login",
        method="POST",
        data=login_data,
        headers=auth_headers
    )
    token = login_res.get("access_token")
    if not token:
        print("[Error] Failed to obtain access token.")
        sys.exit(1)
    print("[OK] Authentication successful!")

    token_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 2. Check and ensure integrations exist
    print(f"\n[2/3] Verifying platform connection listeners...")
    integrations_res = make_request(f"{API_URL}/integrations", headers=token_headers)
    existing_sources = integrations_res.get("sources", [])
    
    active_platforms = {s["platform"].lower() for s in existing_sources if s["active"]}
    required_platforms = {"x", "reddit", "gmail"}
    missing_platforms = required_platforms - active_platforms

    if missing_platforms:
        print(f"Creating missing integration listeners: {', '.join(missing_platforms)}...")
        for platform in missing_platforms:
            identifier = ""
            label = ""
            if platform == "x":
                identifier = "@CustomerCare"
                label = "X / Twitter Support Listener"
            elif platform == "reddit":
                identifier = "r/aura_cx"
                label = "Reddit Subreddit Listener"
            elif platform == "gmail":
                identifier = "support@aura.cx"
                label = "Support Email Inbox"

            source_payload = {
                "platform": platform,
                "identifier": identifier,
                "label": label,
                "active": True,
                "filters": {}
            }
            make_request(
                f"{API_URL}/integrations",
                method="POST",
                data=source_payload,
                headers=token_headers
            )
            print(f"  [OK] Created active {platform.upper()} source for '{identifier}'")
    else:
        print("[OK] All platform listeners are ready and active!")

    # 3. Simulate complaints
    print(f"\n[3/3] Ingesting test complaints...")
    for i, complaint in enumerate(COMPLAINTS, 1):
        channel = complaint["channel"]
        print(f"\nIngesting Complaint #{i} ({channel.upper()}) from @{complaint['sender_id']}...")
        
        # Ingest payload matching the WebhookPayload structure
        ingest_payload = {
            "channel": channel,
            "raw_content": complaint["raw_content"],
            "sender_id": complaint["sender_id"],
            "sender_name": complaint["sender_name"],
            "product": complaint["product"],
            "external_id": complaint["external_id"],
            "metadata": complaint["metadata"]
        }

        ingest_res = make_request(
            f"{API_URL}/ingest/{channel}",
            method="POST",
            data=ingest_payload,
            headers=token_headers
        )

        ticket = ingest_res.get("ticket", {})
        print(f"  [OK] Ingested ticket: ID={ticket.get('id')}")
        print(f"  [OK] Resolved Customer: {ticket.get('customer_name')} ({ticket.get('customer_handle')})")
        print(f"  [OK] Smart AI Classification:")
        print(f"      - Intent:    {ticket.get('intent')}")
        print(f"      - Severity:  {ticket.get('severity')}")
        print(f"      - Sentiment: {ticket.get('sentiment')} (Score: {ticket.get('sentiment_score')})")

    print("\n" + "=" * 60)
    print("[SUCCESS] Complaints simulated successfully!")
    print("Go to http://localhost:3000 to see these tickets instantly")
    print("pop up on the dashboard with full real-time updates!")
    print("=" * 60)


if __name__ == "__main__":
    main()
