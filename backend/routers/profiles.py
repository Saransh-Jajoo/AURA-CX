"""Profiles Router — Golden Profile & Identity Resolution."""
from fastapi import APIRouter
from services.mock_data import generate_golden_profile, generate_all_profiles

router = APIRouter()


@router.get("/profiles")
async def get_all_profiles():
    """Get all customer profiles for the directory."""
    profiles = generate_all_profiles()
    return {
        "profiles": [
            {
                "id": p["id"],
                "name": p["name"],
                "email": p["email"],
                "x_handle": p["x_handle"],
                "avatar_url": p["avatar_url"],
                "ltv": p["ltv"],
                "churn_risk": p["churn_risk"],
                "churn_alert": p["churn_alert"],
                "plan": p["plan"],
                "tags": p["tags"],
                "total_tickets": p["total_tickets"],
            }
            for p in profiles
        ],
        "total": len(profiles),
    }


@router.get("/profiles/{profile_id}")
async def get_profile(profile_id: str):
    """Get a single Golden Profile with full identity resolution data."""
    idx = int(profile_id.replace("CUS-", "")) - 10000
    if 0 <= idx < 16:
        return generate_golden_profile(idx)
    return generate_golden_profile(0)
