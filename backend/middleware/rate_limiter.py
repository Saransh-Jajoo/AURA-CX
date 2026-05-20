"""Redis-based per-tenant and per-IP rate limiting middleware.

Uses sliding window counters in Redis:
- Per-tenant: rate:tenant:{tenant_id}:{minute_bucket} → max RATE_LIMIT_PER_TENANT/min
- Per-IP for webhooks: rate:ip:{ip}:{minute_bucket} → max RATE_LIMIT_WEBHOOK_PER_IP/min
"""

from __future__ import annotations

import logging
import time

import redis
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from config import settings

logger = logging.getLogger("aura_cx.rate_limiter")


def _get_redis() -> redis.Redis | None:
    try:
        url = settings.REDIS_URL
        if settings.REDIS_PASSWORD and "://:@" not in url and "://:" not in url:
            # Inject password into URL if not already present
            url = url.replace("://", f"://:{settings.REDIS_PASSWORD}@", 1)
        return redis.from_url(url, socket_connect_timeout=2)
    except Exception:
        logger.warning("Rate limiter: Redis unavailable, rate limiting disabled")
        return None


class RateLimiterMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._redis: redis.Redis | None = None
        self._initialized = False

    def _ensure_redis(self) -> redis.Redis | None:
        if not self._initialized:
            self._redis = _get_redis()
            self._initialized = True
        return self._redis

    async def dispatch(self, request: Request, call_next) -> Response:
        r = self._ensure_redis()
        if r is None:
            return await call_next(request)

        minute_bucket = int(time.time() // 60)

        # ── Per-IP rate limit for webhook endpoints ──────────
        if "/webhooks/" in request.url.path and request.method == "POST":
            client_ip = request.client.host if request.client else "unknown"
            ip_key = f"rate:ip:{client_ip}:{minute_bucket}"
            try:
                count = r.incr(ip_key)
                if count == 1:
                    r.expire(ip_key, 120)  # 2 min TTL
                if count > settings.RATE_LIMIT_WEBHOOK_PER_IP:
                    logger.warning("Rate limit exceeded for IP %s on webhooks", client_ip)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Rate limit exceeded. Try again later."},
                        headers={"Retry-After": "60"},
                    )
            except redis.RedisError:
                pass  # fail-open

        # ── Per-tenant rate limit ────────────────────────────
        tenant_id = request.headers.get("x-tenant-id")
        if not tenant_id:
            parts = request.url.path.split("/")
            if "webhooks" in parts:
                idx = parts.index("webhooks")
                if idx + 1 < len(parts):
                    tenant_id = parts[idx + 1]

        if tenant_id:
            tenant_key = f"rate:tenant:{tenant_id}:{minute_bucket}"
            try:
                count = r.incr(tenant_key)
                if count == 1:
                    r.expire(tenant_key, 120)
                if count > settings.RATE_LIMIT_PER_TENANT:
                    logger.warning("Rate limit exceeded for tenant %s", tenant_id)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Tenant rate limit exceeded. Contact support to increase your plan limit."},
                        headers={"Retry-After": "60"},
                    )
            except redis.RedisError:
                pass

        return await call_next(request)
