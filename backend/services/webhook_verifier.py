"""Webhook HMAC verification for secure integration endpoints."""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Optional

logger = logging.getLogger("aura_cx.webhook_verifier")


def verify_webhook_signature(
    secret: str,
    payload: bytes,
    signature: str,
    algorithm: str = "sha256",
) -> bool:
    """Verify webhook signature using HMAC.
    
    Args:
        secret: The webhook signing secret
        payload: The raw request body bytes
        signature: The signature header value (typically hex-encoded)
        algorithm: Hash algorithm to use (sha256 by default for fintech compliance)
    
    Returns:
        True if signature is valid, False otherwise
    
    Raises:
        ValueError: If algorithm is unsupported
    
    Security: Uses constant-time comparison to prevent timing attacks.
    """
    if algorithm not in ("sha256", "sha512", "sha1"):
        raise ValueError(f"Unsupported algorithm: {algorithm}")
    
    # Compute expected signature
    hash_func = getattr(hashlib, algorithm)
    expected = hmac.new(
        secret.encode(),
        payload,
        hash_func,
    ).hexdigest()
    
    # Constant-time comparison (prevents timing attacks)
    is_valid = hmac.compare_digest(expected, signature.lower())
    
    if not is_valid:
        logger.warning("Webhook signature verification failed (algorithm: %s)", algorithm)
    
    return is_valid


def verify_x_webhook(secret: str, payload: bytes, signature: str) -> bool:
    """X/Twitter webhook verification (sha256 hex)."""
    return verify_webhook_signature(secret, payload, signature, algorithm="sha256")


def verify_gmail_webhook(secret: str, payload: bytes, signature: str) -> bool:
    """Gmail webhook verification (sha256 hex)."""
    return verify_webhook_signature(secret, payload, signature, algorithm="sha256")


def verify_threads_webhook(secret: str, payload: bytes, signature: str) -> bool:
    """Threads webhook verification (sha256 hex)."""
    return verify_webhook_signature(secret, payload, signature, algorithm="sha256")


def verify_slack_webhook(secret: str, payload: bytes, signature: str, timestamp: str) -> bool:
    """Slack webhook verification (v0=timestamp + body).
    
    Slack format: v0=<hash>, where hash = HMAC-SHA256("v0:{timestamp}:{body}", secret)
    """
    sig_basestring = f"v0:{timestamp}:{payload.decode()}"
    expected = hmac.new(
        secret.encode(),
        sig_basestring.encode(),
        hashlib.sha256,
    ).hexdigest()
    
    is_valid = hmac.compare_digest(expected, signature.split("=")[1].lower())
    if not is_valid:
        logger.warning("Slack webhook signature verification failed")
    return is_valid
