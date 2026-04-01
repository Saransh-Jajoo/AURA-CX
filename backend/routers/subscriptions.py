"""Subscriptions Router — B2B SaaS Tier Management."""
import random
from fastapi import APIRouter

router = APIRouter()

PLANS = [
    {
        "id": "starter",
        "name": "Starter",
        "price_monthly": 299,
        "price_yearly": 2990,
        "features": [
            "Up to 5,000 tickets/month",
            "2 channel integrations",
            "Basic sentiment analysis",
            "Email support",
            "5 agent seats",
        ],
        "limits": {"tickets_per_month": 5000, "api_calls_per_day": 1000, "ai_drafts_per_month": 500, "agent_seats": 5},
    },
    {
        "id": "pro",
        "name": "Professional",
        "price_monthly": 799,
        "price_yearly": 7990,
        "popular": True,
        "features": [
            "Up to 50,000 tickets/month",
            "All channel integrations",
            "Advanced NLP + Sentiment Velocity",
            "Identity Resolution (Cosine > 0.92)",
            "HITL Verification Queue",
            "Priority support",
            "25 agent seats",
        ],
        "limits": {"tickets_per_month": 50000, "api_calls_per_day": 25000, "ai_drafts_per_month": 10000, "agent_seats": 25},
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "price_monthly": None,
        "price_yearly": None,
        "features": [
            "Unlimited tickets",
            "All channels + custom webhooks",
            "Full 4-Stage AI Pipeline",
            "HDBSCAN Shadow Tickets",
            "RLHF Training Loop",
            "Dedicated success manager",
            "Custom SLA & GDPR audit",
            "SSO / SAML",
            "Unlimited agent seats",
        ],
        "limits": {"tickets_per_month": -1, "api_calls_per_day": -1, "ai_drafts_per_month": -1, "agent_seats": -1},
    },
]


@router.get("/subscriptions/plans")
async def get_plans():
    return {"plans": PLANS}


@router.get("/subscriptions/usage")
async def get_usage():
    """Mock usage metrics for the current tenant."""
    return {
        "plan": "pro",
        "billing_cycle": "monthly",
        "current_period_start": "2026-03-01T00:00:00Z",
        "current_period_end": "2026-03-31T23:59:59Z",
        "usage": {
            "tickets_processed": random.randint(12000, 38000),
            "tickets_limit": 50000,
            "api_calls_today": random.randint(4000, 18000),
            "api_calls_limit": 25000,
            "ai_drafts_generated": random.randint(3000, 8500),
            "ai_drafts_limit": 10000,
            "agent_seats_used": random.randint(8, 20),
            "agent_seats_limit": 25,
            "storage_gb_used": round(random.uniform(2.1, 18.5), 1),
        },
    }
