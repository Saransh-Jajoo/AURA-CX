"""Fernet-based credential encryption for BYOI tenant secrets.

Provides symmetric encryption/decryption for API keys,
passwords, and other sensitive tenant-scoped credentials.
All secrets are encrypted at rest and decrypted only at runtime.
"""

from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from config import settings

logger = logging.getLogger("aura_cx.encryption")


def _get_fernet() -> Fernet:
    """Derive a Fernet key from the ENCRYPTION_KEY or SECRET_KEY."""
    key_source = settings.ENCRYPTION_KEY or settings.SECRET_KEY
    if not key_source:
        raise RuntimeError("No encryption key configured. Set ENCRYPTION_KEY or SECRET_KEY.")
    # Derive a 32-byte key via SHA-256, then base64-encode for Fernet
    derived = hashlib.sha256(key_source.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(derived)
    return Fernet(fernet_key)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns base64-encoded ciphertext."""
    if not plaintext:
        return ""
    try:
        return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")
    except Exception:
        logger.exception("Encryption failed")
        raise


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string. Returns plaintext."""
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.error("Decryption failed — invalid token or key mismatch")
        return ""
    except Exception:
        logger.exception("Decryption failed")
        return ""


def rotate_encryption(old_key: str, new_key: str, ciphertext: str) -> str:
    """Re-encrypt a value from old_key to new_key for key rotation."""
    if not ciphertext:
        return ""
    # Decrypt with old key
    old_derived = hashlib.sha256(old_key.encode("utf-8")).digest()
    old_fernet = Fernet(base64.urlsafe_b64encode(old_derived))
    plaintext = old_fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    # Encrypt with new key
    new_derived = hashlib.sha256(new_key.encode("utf-8")).digest()
    new_fernet = Fernet(base64.urlsafe_b64encode(new_derived))
    return new_fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")
