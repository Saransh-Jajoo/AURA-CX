from datetime import datetime, timezone

from jose import jwt

from config import settings
from security import ROLE_SCOPES, ROLES, create_access_token, create_refresh_token, decode_refresh_token, hash_password, hash_token, verify_password


class DummyUser:
    id = "usr_test"
    email = "agent@example.com"
    role = "support_agent"
    tenant_id = "tenant_test"


def test_required_roles_are_registered():
    expected = {"super_admin", "tenant_admin", "executive", "manager", "support_agent", "qa_reviewer", "read_only_analyst"}
    assert expected.issubset(set(ROLES))
    assert expected.issubset(set(ROLE_SCOPES))


def test_password_hash_roundtrip():
    hashed = hash_password("VeryStrongPassword123!")
    assert hashed != "VeryStrongPassword123!"
    assert verify_password("VeryStrongPassword123!", hashed)


def test_refresh_token_contains_jti_and_hashes():
    token = create_refresh_token(DummyUser())
    payload = decode_refresh_token(token)
    assert payload["type"] == "refresh"
    assert payload["jti"]
    assert hash_token(token) == hash_token(token)


def test_access_token_is_tenant_scoped():
    token = create_access_token(DummyUser())
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload["tenant"] == "tenant_test"
    assert payload["role"] == "support_agent"
    assert payload["exp"] > int(datetime.now(timezone.utc).timestamp())
