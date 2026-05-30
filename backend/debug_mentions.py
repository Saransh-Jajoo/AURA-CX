"""Debug script: check social mentions and why tickets aren't created."""
import asyncio
import json
from database import SessionLocal
from sqlalchemy import text

async def check():
    async with SessionLocal() as db:
        # Check the latest social mention
        result = await db.execute(text(
            "SELECT id, external_id, author_handle, content, raw_metadata, promoted_to_ticket_id "
            "FROM social_mentions ORDER BY captured_at DESC LIMIT 3"
        ))
        rows = result.fetchall()
        for row in rows:
            print("=" * 60)
            print("id:", row[0])
            print("external_id:", row[1])
            print("author_handle:", row[2])
            print("content (first 200):", row[3][:200] if row[3] else None)
            meta = row[4]
            if meta and "post" in meta:
                post = meta["post"]
                print("post keys:", list(post.keys()))
                print("post.sender_email:", post.get("sender_email"))
                print("post.reply_to:", post.get("reply_to"))
                print("post.author_handle:", post.get("author_handle"))
                print("post.subject:", post.get("subject"))
                print("post.imap_uid:", post.get("imap_uid"))
            print("promoted_to_ticket_id:", row[5])

        # Now simulate what _source_matches does
        print("\n" + "=" * 60)
        print("=== Simulating _source_matches ===")
        
        # Get the integration source
        result2 = await db.execute(text(
            "SELECT id, platform, identifier, filters FROM integration_sources "
            "WHERE tenant_id = 'tenant-default' AND platform = 'gmail'"
        ))
        sources = result2.fetchall()
        for src in sources:
            print(f"\nSource: id={src[0]}, platform={src[1]}, identifier={src[2]}")
            print(f"  filters: {src[3]}")
            
        # Now build the haystack for the latest mention
        if rows:
            latest = rows[0]
            meta = latest[4] or {}
            post = meta.get("post", {})
            sender_id = latest[2]  # author_handle
            sender_name = post.get("author_name", "")
            raw_content = latest[3] or ""
            metadata_values = " ".join([
                post.get("sender_email", ""),
                post.get("reply_to", ""),
                post.get("subject", ""),
                post.get("imap_uid", ""),
            ])
            
            haystack = " ".join([
                sender_id,
                sender_name,
                raw_content,
                metadata_values,
            ]).lower()
            
            for src in sources:
                identifier = src[2].lower()
                print(f"\nChecking if '{identifier}' is in haystack...")
                print(f"  Result: {identifier in haystack}")
                if identifier not in haystack:
                    print(f"  Haystack snippet (first 500): {haystack[:500]}")

asyncio.run(check())
