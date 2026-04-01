"""Authentication & 5-Tier RBAC Router."""
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel

from config import settings

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_pw(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

# ── Role Definitions ───────────────────────────────────────────────
ROLES = {
    "super_admin": {
        "label": "Super Admin",
        "permissions": ["*"],
        "description": "Global system health, multi-tenant creation, API management",
    },
    "company_chief": {
        "label": "Company Chief (C-Level)",
        "permissions": ["analytics.read", "gdpr.read", "churn.read", "roi.read"],
        "description": "High-level analytics, ROI/Churn reduction, GDPR reporting",
    },
    "senior_developer": {
        "label": "Senior Developer",
        "permissions": ["shadow_tickets.read", "clusters.read", "engineering.read"],
        "description": "Engineering panel, proactive Shadow Tickets from HDBSCAN",
    },
    "support_manager": {
        "label": "Support Manager",
        "permissions": ["qa.read", "qa.write", "rlhf.review", "agents.manage"],
        "description": "QA dashboard, review agent edits before RLHF loop",
    },
    "support_agent": {
        "label": "Support Agent",
        "permissions": ["tickets.read", "tickets.write", "hitl.read", "hitl.write", "profiles.read"],
        "description": "Unified Command Center, Golden Profile, HITL Queue",
    },
}

# ── Mock Users (scaffolded; swap for DB later) ─────────────────────
MOCK_USERS = {
    "admin@auracx.io": {
        "email": "admin@auracx.io",
        "name": "System Administrator",
        "hashed_password": _hash_pw("admin123"),
        "role": "super_admin",
        "tenant_id": "TENANT-GLOBAL",
        "avatar": "SA",
    },
    "ceo@acme.com": {
        "email": "ceo@acme.com",
        "name": "Jordan Mitchell",
        "hashed_password": _hash_pw("chief123"),
        "role": "company_chief",
        "tenant_id": "TENANT-ACME",
        "avatar": "JM",
    },
    "dev@acme.com": {
        "email": "dev@acme.com",
        "name": "Taylor Reeves",
        "hashed_password": _hash_pw("dev123"),
        "role": "senior_developer",
        "tenant_id": "TENANT-ACME",
        "avatar": "TR",
    },
    "manager@acme.com": {
        "email": "manager@acme.com",
        "name": "Morgan Blake",
        "hashed_password": _hash_pw("manager123"),
        "role": "support_manager",
        "tenant_id": "TENANT-ACME",
        "avatar": "MB",
    },
    "agent@acme.com": {
        "email": "agent@acme.com",
        "name": "Casey Harper",
        "hashed_password": _hash_pw("agent123"),
        "role": "support_agent",
        "tenant_id": "TENANT-ACME",
        "avatar": "CH",
    },
}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(status_code=401, detail="Invalid credentials")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = MOCK_USERS.get(email)
    if user is None:
        raise credentials_exception
    return {k: v for k, v in user.items() if k != "hashed_password"}


@router.post("/auth/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = MOCK_USERS.get(form_data.username)
    if not user or not _verify_pw(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(data={"sub": user["email"], "role": user["role"], "tenant": user["tenant_id"]})
    safe_user = {k: v for k, v in user.items() if k != "hashed_password"}
    return TokenResponse(access_token=token, user=safe_user)


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    role_info = ROLES.get(current_user["role"], {})
    return {**current_user, "role_info": role_info}


@router.get("/auth/roles")
async def list_roles():
    return {"roles": ROLES}
