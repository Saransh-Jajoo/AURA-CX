"""Platform Integrations Router — Multi-Tenant Source Tracking."""
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class IntegrationSource(BaseModel):
    platform: str  # "x", "reddit", "email"
    identifier: str  # handle, subreddit, or email address
    label: Optional[str] = None
    active: bool = True


# Mock integration store (swap for DB)
MOCK_INTEGRATIONS = {
    "TENANT-ACME": {
        "tenant_id": "TENANT-ACME",
        "company_name": "Acme Corp",
        "sources": [
            {"platform": "x", "identifier": "@AcmeCorp", "label": "Main Brand", "active": True, "added_at": "2026-01-15T10:00:00Z"},
            {"platform": "x", "identifier": "@AcmeSupport", "label": "Support Handle", "active": True, "added_at": "2026-01-15T10:05:00Z"},
            {"platform": "reddit", "identifier": "r/AcmeCorp", "label": "Official Subreddit", "active": True, "added_at": "2026-02-01T09:00:00Z"},
            {"platform": "reddit", "identifier": "r/AcmeTech", "label": "Tech Community", "active": False, "added_at": "2026-02-10T14:00:00Z"},
            {"platform": "email", "identifier": "support@acme.com", "label": "Support Inbox", "active": True, "added_at": "2026-01-10T08:00:00Z"},
            {"platform": "email", "identifier": "billing@acme.com", "label": "Billing Inbox", "active": True, "added_at": "2026-01-10T08:30:00Z"},
        ],
    }
}


@router.get("/integrations")
async def get_integrations():
    data = MOCK_INTEGRATIONS.get("TENANT-ACME", {})
    return {
        "tenant_id": data.get("tenant_id"),
        "company_name": data.get("company_name"),
        "sources": data.get("sources", []),
        "total": len(data.get("sources", [])),
    }


@router.post("/integrations")
async def add_integration(source: IntegrationSource):
    new_source = {
        **source.model_dump(),
        "added_at": datetime.utcnow().isoformat() + "Z",
    }
    tenant = MOCK_INTEGRATIONS.setdefault("TENANT-ACME", {"tenant_id": "TENANT-ACME", "company_name": "Acme Corp", "sources": []})
    tenant["sources"].append(new_source)
    return {"status": "added", "source": new_source}


@router.delete("/integrations/{platform}/{identifier}")
async def remove_integration(platform: str, identifier: str):
    tenant = MOCK_INTEGRATIONS.get("TENANT-ACME")
    if tenant:
        tenant["sources"] = [s for s in tenant["sources"] if not (s["platform"] == platform and s["identifier"] == identifier)]
    return {"status": "removed", "platform": platform, "identifier": identifier}
