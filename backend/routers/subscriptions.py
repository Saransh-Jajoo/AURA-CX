"""Stripe-backed subscription and usage endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import Tenant, Ticket, User
from security import assert_tenant, require_roles

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
            "Tenant-isolated knowledge namespace",
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
            "X, Reddit, and Gmail integrations",
            "Gemini 1.5 Pro drafting",
            "Golden Profile identity resolution",
            "HITL and RLHF loop",
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
            "Custom signed webhooks",
            "Separate vector namespaces per company",
            "HDBSCAN shadow tickets",
            "SAML/SSO ready RBAC",
            "Dedicated success manager",
        ],
        "limits": {"tickets_per_month": -1, "api_calls_per_day": -1, "ai_drafts_per_month": -1, "agent_seats": -1},
    },
]


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: str = ""
    cancel_url: str = ""


@router.get("/subscriptions/plans")
async def get_plans():
    return {"plans": PLANS}


@router.get("/subscriptions/usage")
async def get_usage(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    tenant = await session.get(Tenant, scoped_tenant)
    plan = tenant.plan if tenant else "starter"
    plan_def = next((item for item in PLANS if item["id"] == plan), PLANS[0])
    limits = plan_def["limits"]
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    tickets_processed = await session.scalar(
        select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.received_at >= month_start)
    )
    ai_drafts = await session.scalar(
        select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.ai_draft.is_not(None), Ticket.received_at >= month_start)
    )
    agents = await session.scalar(select(func.count(User.id)).where(User.tenant_id == scoped_tenant, User.active.is_(True)))
    return {
        "plan": plan,
        "billing_cycle": "monthly",
        "current_period_start": month_start.isoformat(),
        "current_period_end": "",
        "usage": {
            "tickets_processed": tickets_processed or 0,
            "tickets_limit": limits["tickets_per_month"],
            "api_calls_today": 0,
            "api_calls_limit": limits["api_calls_per_day"],
            "ai_drafts_generated": ai_drafts or 0,
            "ai_drafts_limit": limits["ai_drafts_per_month"],
            "agent_seats_used": agents or 0,
            "agent_seats_limit": limits["agent_seats"],
            "storage_gb_used": 0,
        },
    }


@router.post("/subscriptions/checkout")
async def create_checkout_session(
    body: CheckoutRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    price_map = {
        "starter": settings.STRIPE_PRICE_STARTER,
        "pro": settings.STRIPE_PRICE_PRO,
        "enterprise": settings.STRIPE_PRICE_ENTERPRISE,
    }
    price_id = price_map.get(body.plan_id)
    if not price_id:
        raise HTTPException(status_code=400, detail="Stripe price is not configured for this plan")
    tenant = await session.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    checkout_args = {
        "mode": "subscription",
        "client_reference_id": tenant.id,
        "payment_method_types": ["card"],
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": body.success_url
        or f"{settings.FRONTEND_URL.rstrip('/')}/dashboard/subscriptions?session_id={{CHECKOUT_SESSION_ID}}&status=success",
        "cancel_url": body.cancel_url or f"{settings.FRONTEND_URL.rstrip('/')}/dashboard/subscriptions?status=cancelled",
        "metadata": {"tenant_id": tenant.id, "plan_id": body.plan_id},
    }
    if tenant.stripe_customer_id:
        checkout_args["customer"] = tenant.stripe_customer_id
    session_obj = stripe.checkout.Session.create(**checkout_args)
    return {"checkout_url": session_obj.url, "session_id": session_obj.id}
