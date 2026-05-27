"""Rate limiting middleware for API requests (tenant-aware and IP-aware).

Per production spec:
- 500 requests/min per tenant (configurable per plan tier)
- 100 requests/min per IP (for unauthenticated requests)
- Webhook paths: 20 POSTs/min per source IP
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import redis
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("aura_cx.rate_limiting")


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware using Redis for distributed counting."""
    
    # Configuration (can be overridden per plan tier)
    TENANT_LIMIT_PER_MINUTE = 500  # requests/min per tenant
    IP_LIMIT_PER_MINUTE = 100  # requests/min per IP (unauthenticated)
    WEBHOOK_LIMIT_PER_MINUTE = 20  # POST requests/min per webhook source
    
    def __init__(self, app, redis_client: Optional[redis.Redis] = None):
        super().__init__(app)
        self.redis = redis_client
    
    async def dispatch(self, request: Request, call_next):
        if not self.redis:
            # If Redis is not available, skip rate limiting
            return await call_next(request)
        
        # Skip rate limiting for health checks
        if request.url.path == "/health":
            return await call_next(request)
        
        # Get tenant from JWT or IP
        tenant_id = self._extract_tenant(request)
        client_ip = self._get_client_ip(request)
        
        # Check rate limits
        current_minute = int(time.time() // 60)
        
        # Webhook-specific rate limit (stricter)
        if request.url.path.startswith("/api/v1/ingestion/webhook"):
            limit_key = f"webhook_limit:{client_ip}:{current_minute}"
            limit = self.WEBHOOK_LIMIT_PER_MINUTE
        # Per-tenant rate limit (authenticated)
        elif tenant_id:
            limit_key = f"tenant_limit:{tenant_id}:{current_minute}"
            limit = self.TENANT_LIMIT_PER_MINUTE
        # Per-IP rate limit (unauthenticated)
        else:
            limit_key = f"ip_limit:{client_ip}:{current_minute}"
            limit = self.IP_LIMIT_PER_MINUTE
        
        try:
            current_count = self.redis.incr(limit_key)
            
            # Set expiry only on first increment in the minute
            if current_count == 1:
                self.redis.expire(limit_key, 65)  # 65 seconds to cover the minute window
            
            # Check if exceeded
            if current_count > limit:
                logger.warning(
                    "Rate limit exceeded: %s (limit_key=%s, count=%s, limit=%s)",
                    client_ip, limit_key, current_count, limit
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Max {limit} requests per minute.",
                    headers={"Retry-After": "60"},
                )
            
            # Add rate limit info to response headers
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(limit - current_count)
            response.headers["X-RateLimit-Reset"] = str((current_minute + 1) * 60)
            
            return response
        
        except redis.RedisError as exc:
            logger.error("Redis error in rate limiting: %s", exc)
            # Fail open: if Redis is down, allow requests
            return await call_next(request)
    
    def _extract_tenant(self, request: Request) -> Optional[str]:
        """Extract tenant_id from JWT or request."""
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            # Parse JWT (in production, use proper JWT parsing)
            # For now, return None - actual implementation in route dependencies
            pass
        return None
    
    def _get_client_ip(self, request: Request) -> str:
        """Get client IP, considering X-Forwarded-For header."""
        x_forwarded_for = request.headers.get("X-Forwarded-For")
        if x_forwarded_for:
            # X-Forwarded-For can have multiple IPs, get the first one
            return x_forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
