import asyncio

from config import settings
from services.ai_service import embed_text, classify_ticket, generate_draft


def test_embed_text_mock_returns_vector_of_length_768():
    # Ensure mock behavior when no API keys are set
    settings.GEMINI_API_KEY = "mock"
    vec = asyncio.run(embed_text("hello world"))
    assert isinstance(vec, list)
    assert len(vec) == 768
    assert all(isinstance(v, float) for v in vec)


def test_classify_ticket_mock_simple_rules():
    settings.USE_MOCK_DATA = True
    result = asyncio.run(classify_ticket("I cannot login to my account, please help", "email"))
    assert isinstance(result, dict)
    assert result.get("intent") in {"Account Issue", "Other"}
    assert result.get("severity") in {"high", "medium", "low", "critical"}


def test_generate_draft_returns_template_in_mock_mode():
    settings.USE_MOCK_DATA = True
    ticket = {"intent": "Bug Report", "customer_name": "Alice", "message": "It crashes"}
    out = asyncio.run(generate_draft(tenant_id="tenant_test", ticket=ticket))
    assert isinstance(out, dict)
    assert "draft" in out and "Alice" in out["draft"]
    assert "confidence" in out
