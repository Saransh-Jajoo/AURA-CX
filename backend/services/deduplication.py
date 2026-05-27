"""Message deduplication service using Redis."""

from __future__ import annotations

import logging

import redis

from config import settings

logger = logging.getLogger(__name__)


class DeduplicationService:
    """Prevents duplicate message processing using Redis with SET NX (set if not exists)."""

    def __init__(self, redis_client: redis.Redis | None = None):
        """
        Initialize deduplication service.

        Args:
            redis_client: Redis client instance. If None, creates a new one from settings.
        """
        self.redis = redis_client or redis.from_url(settings.REDIS_URL)

    def get_dedup_key(
        self,
        tenant_id: str,
        platform: str,
        message_id: str,
    ) -> str:
        """
        Generate a deduplication key.

        Format: dedup:{tenant_id}:{platform}:{message_id}
        """
        return f"dedup:{tenant_id}:{platform}:{message_id}"

    def check_and_mark_processed(
        self,
        tenant_id: str,
        platform: str,
        message_id: str,
        ttl_seconds: int = 86400,  # 24 hours default
    ) -> bool:
        """
        Check if message was already processed; if not, mark it as processed.

        Uses atomic Redis SET with NX (only set if not exists) to prevent race conditions.

        Args:
            tenant_id: Tenant identifier
            platform: Message platform (x, reddit, gmail, etc.)
            message_id: Unique message identifier from external platform
            ttl_seconds: Time-to-live for the dedup key (default: 24 hours)

        Returns:
            True if this is a NEW message (not seen before)
            False if this is a DUPLICATE (was already processed)

        Security:
            - Uses atomic Redis operations to prevent race conditions
            - TTL ensures keys don't persist indefinitely (saves memory)
            - Scoped by tenant_id to prevent cross-tenant dedup issues
        """
        dedup_key = self.get_dedup_key(tenant_id, platform, message_id)

        try:
            # SET NX EX = Set with NX (only if not exists) + EX (expiry in seconds)
            # Returns True if set (was new), False if key already existed
            was_new = self.redis.set(
                dedup_key,
                "1",
                nx=True,  # Only set if key does NOT exist
                ex=ttl_seconds,  # Expire after this many seconds
            )

            if was_new:
                logger.debug(
                    "Dedup: New message marked (tenant=%s, platform=%s, msg_id=%s)",
                    tenant_id,
                    platform,
                    message_id,
                )
            else:
                logger.warning(
                    "Dedup: Duplicate message skipped (tenant=%s, platform=%s, msg_id=%s)",
                    tenant_id,
                    platform,
                    message_id,
                )

            return was_new

        except redis.RedisError as exc:
            logger.error(
                "Dedup: Redis error checking message (tenant=%s, platform=%s): %s",
                tenant_id,
                platform,
                exc,
            )
            # In case of Redis failure, allow processing to continue
            # (fail-open rather than fail-closed)
            return True

    def clear_dedup_key(
        self,
        tenant_id: str,
        platform: str,
        message_id: str,
    ) -> bool:
        """
        Manually clear a dedup key (useful for retrying failed messages).

        Args:
            tenant_id: Tenant identifier
            platform: Message platform
            message_id: Message identifier

        Returns:
            True if key existed and was deleted, False otherwise
        """
        dedup_key = self.get_dedup_key(tenant_id, platform, message_id)
        return bool(self.redis.delete(dedup_key))


# Global singleton instance
_dedup_service: DeduplicationService | None = None


def get_dedup_service() -> DeduplicationService:
    """Get or create the global deduplication service instance."""
    global _dedup_service
    if _dedup_service is None:
        _dedup_service = DeduplicationService()
    return _dedup_service
