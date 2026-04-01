"""
AURA-CX Mock Data Generator
Produces realistic multi-channel customer complaint data for demo purposes.
"""
import random
import uuid
import math
from datetime import datetime, timedelta

CHANNELS = ["x", "reddit", "gmail"]
CHANNEL_ICONS = {"x": "𝕏", "reddit": "🔴", "gmail": "📧"}

PRODUCTS = ["Mobile App", "Payment Gateway", "Cloud Storage", "API Platform", "Billing System", "Auth Service"]

INTENTS = ["Bug Report", "Feature Request", "Account Issue", "Billing Dispute", "Security Concern", "Performance Issue"]

SEVERITIES = ["critical", "high", "medium", "low"]
SENTIMENTS = ["furious", "frustrated", "neutral", "satisfied"]

CUSTOMER_NAMES = [
    "Alex Chen", "Priya Sharma", "Marcus Johnson", "Sofia Rodriguez",
    "David Kim", "Emma Williams", "Raj Patel", "Olivia Brown",
    "James Wilson", "Aisha Mohammed", "Lucas Garcia", "Sarah Miller",
    "Ryan O'Brien", "Mei Lin", "Carlos Mendez", "Hannah Taylor",
]

X_HANDLES = [
    "@alexc_dev", "@priya_codes", "@marcusj_tech", "@sofia_r92",
    "@dkim_cloud", "@emwilliams", "@raj_patel99", "@oliviab_eng",
    "@jwilson_cto", "@aisha_m_tech", "@lucas_g_dev", "@sarahm_pm",
    "@robrien_io", "@meilin_ai", "@carlosm_dev", "@htaylor_ops",
]

REDDIT_USERS = [
    "u/alexchen_dev", "u/priyasharma_codes", "u/marcusj_2024", "u/sofia_rodriguez",
    "u/davidkim_cloud", "u/emma_w_tech", "u/rajpatel99", "u/olivia_brown_eng",
    "u/jameswilson_cto", "u/aisha_mohammed", "u/lucasgarcia_dev", "u/sarahmiller_pm",
    "u/ryanobrien_io", "u/meilin_ai", "u/carlosmendez", "u/hannahtaylor_ops",
]

EMAILS = [
    "alex.chen@techcorp.com", "priya.sharma@devhouse.io", "marcus.johnson@enterprise.co",
    "sofia.rodriguez@startup.dev", "david.kim@cloudops.io", "emma.williams@bigtech.com",
    "raj.patel@innovate.co", "olivia.brown@dataeng.io", "james.wilson@execteam.com",
    "aisha.mohammed@globaltech.io", "lucas.garcia@devteam.co", "sarah.miller@product.io",
    "ryan.obrien@sysops.com", "mei.lin@ailab.io", "carlos.mendez@devops.co",
    "hannah.taylor@ops.io",
]

COMPLAINT_TEMPLATES = {
    "x": [
        "@AuraCX your {product} has been down for 2 hours! This is unacceptable for a paid service. Fix it NOW! #{product_tag}",
        "Anyone else having issues with @AuraCX {product}? Getting constant 500 errors since this morning 😤",
        "Hey @AuraCX, I've been locked out of my account for 3 days. Support hasn't responded. What's going on? #CustomerService",
        "@AuraCX the new update completely broke {product}. Rolling back isn't even an option. Terrible release management.",
        "Shoutout to @AuraCX support team — resolved my {product} issue in under 5 minutes! 🙌",
        "@AuraCX payment failed again. Third time this week. About to cancel my enterprise subscription.",
    ],
    "reddit": [
        "[Rant] AuraCX {product} has been completely unusable since the last update. Anyone else affected?",
        "PSA: If you're getting auth errors on AuraCX {product}, clear your cache and re-authenticate. Worked for me.",
        "Serious security concern with AuraCX {product} — my API keys were exposed in the dashboard logs. This needs immediate attention.",
        "Has anyone successfully migrated from {product} v2 to v3? The documentation is completely outdated.",
        "AuraCX {product} performance has degraded by 40% in the last month. Running benchmarks to confirm.",
        "Billing department charged me twice for {product}. Support says 'we're looking into it' for 2 weeks now.",
    ],
    "gmail": [
        "Subject: URGENT — {product} Production Outage\n\nDear Support,\nOur entire production environment running on {product} went down at 3:00 AM EST. We have 50,000 affected users. This is a P0 incident requiring immediate escalation.",
        "Subject: Billing Discrepancy — Invoice #INV-2024\n\nHi,\nI noticed a $2,400 overcharge on our latest {product} invoice. Please review and issue a credit memo at your earliest convenience.",
        "Subject: Feature Request — {product} API Enhancement\n\nHello,\nWe'd love to see webhook support added to {product}. This would significantly improve our integration workflow. Happy to discuss requirements.",
        "Subject: Account Security Alert\n\nDear AuraCX Team,\nI received a suspicious login notification from {product} at 2 AM from an IP in a country I've never visited. Please investigate.",
        "Subject: RE: Ongoing {product} Performance Issues\n\nTeam,\nFollowing up on ticket #TKT-4892. The latency issues with {product} are now affecting our SLA commitments to our own customers.",
    ],
}

DRAFT_RESPONSES = [
    "Thank you for reaching out, {name}. I understand your frustration with {product}. Our engineering team has identified the root cause and a fix is being deployed within the next 30 minutes. I'll personally follow up once it's resolved.",
    "Hi {name}, I sincerely apologize for the inconvenience with {product}. I've escalated this to our senior engineering team as a P0 priority. You should see improvement within the next hour. We're also crediting your account for the downtime.",
    "Dear {name}, Thank you for reporting this {product} issue. I've reviewed your account and can confirm the billing discrepancy. A credit of ${amount} has been applied and will reflect in 2-3 business days.",
    "{name}, I appreciate you bringing this to our attention. The security concern with {product} is being investigated by our InfoSec team. As a precaution, I've enabled additional security monitoring on your account.",
    "Hi {name}! Great news — the {product} issue you reported has been resolved in our latest patch (v3.2.1). Please update and let us know if you experience any further issues. We value your patience!",
]

CLUSTER_LABELS = [
    "Login Authentication Failures (West Coast)",
    "Payment Gateway Timeout Cluster",
    "Mobile App Crash on iOS 18.2",
    "API Rate Limiting False Positives",
    "Cloud Storage Sync Corruption",
    "Billing Double-Charge Pattern",
    "Dashboard Loading Performance",
    "Webhook Delivery Failures",
]


def _generate_id():
    return f"TKT-{random.randint(10000, 99999)}"


def _random_timestamp(hours_back=48):
    now = datetime.utcnow()
    delta = timedelta(hours=random.uniform(0, hours_back))
    return (now - delta).isoformat() + "Z"


def generate_live_ticket():
    """Generate a single realistic ticket for the live feed."""
    idx = random.randint(0, len(CUSTOMER_NAMES) - 1)
    channel = random.choice(CHANNELS)
    product = random.choice(PRODUCTS)
    severity = random.choices(SEVERITIES, weights=[10, 25, 40, 25])[0]
    sentiment = random.choices(SENTIMENTS, weights=[15, 35, 35, 15])[0]
    intent = random.choice(INTENTS)

    templates = COMPLAINT_TEMPLATES[channel]
    message = random.choice(templates).format(
        product=product,
        product_tag=product.replace(" ", ""),
        name=CUSTOMER_NAMES[idx],
        amount=random.choice([149, 299, 499, 899, 1299, 2400]),
    )

    confidence = round(random.uniform(0.65, 0.98), 2)
    sentiment_score = {"furious": -0.9, "frustrated": -0.5, "neutral": 0.1, "satisfied": 0.8}[sentiment]

    return {
        "id": _generate_id(),
        "channel": channel,
        "channel_icon": CHANNEL_ICONS[channel],
        "customer_name": CUSTOMER_NAMES[idx],
        "customer_handle": X_HANDLES[idx] if channel == "x" else REDDIT_USERS[idx] if channel == "reddit" else EMAILS[idx],
        "email": EMAILS[idx],
        "message": message,
        "product": product,
        "intent": intent,
        "severity": severity,
        "sentiment": sentiment,
        "sentiment_score": sentiment_score,
        "confidence": confidence,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "status": "new",
        "pii_scrubbed": True,
        "toxicity_filtered": random.random() < 0.15,
        "response_time_seconds": None,
        "ai_draft": None,
    }


def generate_ticket_batch(count=25):
    """Generate a batch of historical tickets."""
    tickets = []
    for _ in range(count):
        t = generate_live_ticket()
        t["timestamp"] = _random_timestamp(72)
        t["status"] = random.choice(["new", "in_progress", "resolved", "escalated"])
        if t["status"] in ("resolved", "in_progress"):
            t["response_time_seconds"] = random.randint(45, 600)
        if random.random() > 0.4:
            idx = random.randint(0, len(CUSTOMER_NAMES) - 1)
            t["ai_draft"] = random.choice(DRAFT_RESPONSES).format(
                name=CUSTOMER_NAMES[idx],
                product=t["product"],
                amount=random.choice([149, 299, 499]),
            )
        tickets.append(t)
    tickets.sort(key=lambda x: x["timestamp"], reverse=True)
    return tickets


def generate_golden_profile(customer_idx=None):
    """Generate a full Golden Profile for identity resolution demo."""
    idx = customer_idx if customer_idx is not None else random.randint(0, len(CUSTOMER_NAMES) - 1)

    cosine_score = round(random.uniform(0.92, 0.99), 4)
    ltv = round(random.uniform(2400, 85000), 2)
    churn_risk = round(random.uniform(0.05, 0.65), 2)

    interactions = []
    for _ in range(random.randint(5, 15)):
        ch = random.choice(CHANNELS)
        interactions.append({
            "channel": ch,
            "handle": X_HANDLES[idx] if ch == "x" else REDDIT_USERS[idx] if ch == "reddit" else EMAILS[idx],
            "message": random.choice(COMPLAINT_TEMPLATES[ch]).format(
                product=random.choice(PRODUCTS),
                product_tag=random.choice(PRODUCTS).replace(" ", ""),
                name=CUSTOMER_NAMES[idx],
                amount=random.choice([149, 299]),
            ),
            "sentiment": random.choice(SENTIMENTS),
            "timestamp": _random_timestamp(720),
        })
    interactions.sort(key=lambda x: x["timestamp"], reverse=True)

    # Sentiment velocity
    velocities = []
    for i in range(12):
        hour = datetime.utcnow() - timedelta(hours=12 - i)
        velocities.append({
            "timestamp": hour.isoformat() + "Z",
            "score": round(random.uniform(-1, 0.5), 2),
            "velocity": round(random.uniform(-0.3, 0.3), 3),
        })

    return {
        "id": f"CUS-{10000 + idx}",
        "name": CUSTOMER_NAMES[idx],
        "email": EMAILS[idx],
        "x_handle": X_HANDLES[idx],
        "reddit_handle": REDDIT_USERS[idx],
        "avatar_url": f"https://api.dicebear.com/7.x/initials/svg?seed={CUSTOMER_NAMES[idx].replace(' ', '+')}",
        "identity_resolution": {
            "cosine_similarity": cosine_score,
            "x_vector": [round(random.uniform(-1, 1), 4) for _ in range(8)],
            "email_vector": [round(random.uniform(-1, 1), 4) for _ in range(8)],
            "match_confidence": "verified" if cosine_score > 0.95 else "high",
            "method": "Vector Similarity (Cosine > 0.92)",
        },
        "ltv": ltv,
        "plan": random.choice(["Enterprise", "Professional", "Starter", "Business"]),
        "churn_risk": churn_risk,
        "churn_alert": churn_risk > 0.45,
        "total_tickets": random.randint(3, 45),
        "avg_resolution_hours": round(random.uniform(0.5, 24), 1),
        "satisfaction_score": round(random.uniform(2.5, 5.0), 1),
        "interactions": interactions,
        "sentiment_velocity": velocities,
        "tags": random.sample(["VIP", "Enterprise", "At-Risk", "Power User", "New Customer", "Escalated"], k=random.randint(1, 3)),
    }


def generate_all_profiles():
    return [generate_golden_profile(i) for i in range(len(CUSTOMER_NAMES))]


def generate_hitl_queue():
    """Generate HITL verification queue items."""
    items = []
    for _ in range(12):
        idx = random.randint(0, len(CUSTOMER_NAMES) - 1)
        channel = random.choice(CHANNELS)
        product = random.choice(PRODUCTS)
        severity = random.choices(SEVERITIES, weights=[15, 30, 35, 20])[0]
        confidence = round(random.uniform(0.55, 0.97), 2)

        message = random.choice(COMPLAINT_TEMPLATES[channel]).format(
            product=product,
            product_tag=product.replace(" ", ""),
            name=CUSTOMER_NAMES[idx],
            amount=random.choice([149, 299, 499, 899]),
        )

        draft = random.choice(DRAFT_RESPONSES).format(
            name=CUSTOMER_NAMES[idx],
            product=product,
            amount=random.choice([149, 299, 499]),
        )

        items.append({
            "id": _generate_id(),
            "customer_name": CUSTOMER_NAMES[idx],
            "customer_email": EMAILS[idx],
            "channel": channel,
            "channel_icon": CHANNEL_ICONS[channel],
            "product": product,
            "severity": severity,
            "sentiment": random.choice(SENTIMENTS),
            "intent": random.choice(INTENTS),
            "message": message,
            "ai_draft": draft,
            "confidence": confidence,
            "auto_approvable": confidence > 0.85 and severity not in ("critical",),
            "requires_senior_review": severity == "critical" or confidence < 0.70,
            "rag_sources": random.sample([
                "KB-001: Authentication Troubleshooting Guide",
                "KB-002: Billing & Refund Policy",
                "KB-003: API Rate Limiting Documentation",
                "KB-004: Account Recovery Procedures",
                "KB-005: Service Level Agreement (SLA)",
                "KB-006: Security Incident Response Playbook",
                "KB-007: Migration Guide v2 → v3",
            ], k=random.randint(1, 3)),
            "timestamp": _random_timestamp(24),
            "status": "pending_review",
        })
    items.sort(key=lambda x: (x["requires_senior_review"], -x["confidence"]), reverse=True)
    return items


def generate_cluster_data():
    """Generate HDBSCAN cluster data for trend analysis."""
    clusters = []
    for i, label in enumerate(CLUSTER_LABELS):
        size = random.randint(8, 85)
        severity_dist = {
            "critical": random.randint(0, size // 3),
            "high": random.randint(0, size // 2),
            "medium": random.randint(0, size),
            "low": random.randint(0, size // 3),
        }
        total = sum(severity_dist.values()) or 1

        clusters.append({
            "id": f"CLU-{1000 + i}",
            "label": label,
            "size": size,
            "severity_distribution": severity_dist,
            "avg_sentiment": round(random.uniform(-0.8, -0.1), 2),
            "growth_rate": round(random.uniform(-5, 45), 1),
            "is_anomaly": random.random() < 0.35,
            "first_seen": _random_timestamp(168),
            "channels": random.sample(CHANNELS, k=random.randint(1, 3)),
            "affected_product": random.choice(PRODUCTS),
            "x": round(random.uniform(-3, 3), 2),
            "y": round(random.uniform(-3, 3), 2),
            "radius": max(15, size * 1.5),
        })
    return clusters


def generate_shadow_tickets():
    """Generate proactive shadow tickets from anomaly detection."""
    shadows = []
    anomalies = [c for c in generate_cluster_data() if c["is_anomaly"]]
    for cluster in anomalies:
        shadows.append({
            "id": f"SHADOW-{random.randint(1000, 9999)}",
            "cluster_id": cluster["id"],
            "title": f"⚠️ Anomaly Detected: {cluster['label']}",
            "description": f"HDBSCAN detected {cluster['size']} complaints clustering around '{cluster['label']}' across {', '.join(cluster['channels'])} channels. Growth rate: {cluster['growth_rate']}%/hr.",
            "severity": "critical" if cluster["growth_rate"] > 20 else "high",
            "affected_product": cluster["affected_product"],
            "ticket_count": cluster["size"],
            "growth_rate": cluster["growth_rate"],
            "created_at": datetime.utcnow().isoformat() + "Z",
            "status": random.choice(["active", "monitoring", "acknowledged"]),
        })
    return shadows


def generate_kpi_metrics():
    """Generate dashboard KPI metrics."""
    return {
        "frt_seconds": random.randint(95, 175),
        "frt_target": 180,
        "automation_rate": round(random.uniform(0.68, 0.78), 2),
        "automation_target": 0.70,
        "active_tickets": random.randint(45, 120),
        "resolved_today": random.randint(180, 340),
        "escalated": random.randint(3, 15),
        "csat_score": round(random.uniform(4.1, 4.8), 1),
        "channels_active": 3,
        "ai_confidence_avg": round(random.uniform(0.82, 0.93), 2),
        "shadow_tickets_active": random.randint(1, 5),
        "high_risk_churn": random.randint(2, 8),
        "pipeline_latency_ms": random.randint(120, 380),
        "throughput_per_min": round(random.uniform(12, 35), 1),
    }


def generate_trend_timeseries():
    """Generate time-series data for trend charts."""
    now = datetime.utcnow()
    data = []
    for i in range(72):
        t = now - timedelta(hours=72 - i)
        data.append({
            "timestamp": t.isoformat() + "Z",
            "hour": t.strftime("%H:%M"),
            "x_volume": random.randint(5, 45),
            "reddit_volume": random.randint(3, 30),
            "gmail_volume": random.randint(8, 55),
            "total": 0,
            "avg_sentiment": round(random.uniform(-0.6, 0.3), 2),
            "critical_count": random.randint(0, 8),
        })
        data[-1]["total"] = data[-1]["x_volume"] + data[-1]["reddit_volume"] + data[-1]["gmail_volume"]
    return data[-24:]
