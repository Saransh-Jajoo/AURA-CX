"""NLP-powered complaint classifier for social media mentions.

Uses Gemini to determine if a social media post is a customer complaint,
and if so, extracts category, severity, and summary.
"""

from __future__ import annotations

import logging

import httpx

from config import settings

logger = logging.getLogger("aura_cx.complaint_classifier")


class ClassificationError(RuntimeError):
    pass


from services.ai_service import _extract_json


async def classify_mention(content: str, platform: str, author_handle: str = "") -> dict:
    """
    Classify a social media mention as complaint or not.
    
    Returns:
        {
            "is_complaint": bool,
            "confidence": float (0.0-1.0),
            "category": str | None,
            "sentiment": str,
            "sentiment_score": float (-1.0 to 1.0),
            "summary": str,
            "detected_language": str,
            "suggested_action": str | None
        }
    """
    if not settings.GEMINI_API_KEY:
        raise ClassificationError("GEMINI_API_KEY is not configured")

    prompt = f"""You are a customer experience analyst. Analyze this social media post and determine if it is a CUSTOMER COMPLAINT about a product or service.

A complaint is: negative feedback, bug report, service failure, billing issue, unresolved problem, expression of frustration with a company/product.
NOT a complaint: general conversation, praise, questions, news sharing, unrelated content.

Post from {platform}:
Author: {author_handle}
Content: {content[:4000]}

Respond with ONLY valid JSON:
{{
  "is_complaint": true/false,
  "confidence": 0.0 to 1.0,
  "category": "product_issue" | "service_failure" | "billing" | "delivery" | "app_bug" | "general_dissatisfaction" | null,
  "sentiment": "furious" | "frustrated" | "disappointed" | "neutral" | "positive",
  "sentiment_score": -1.0 to 1.0,
  "summary": "one sentence summary in same language as post",
  "detected_language": "en" | "hi" | "mr" | etc,
  "suggested_action": "brief suggested response action or null"
}}"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
                params={"key": settings.GEMINI_API_KEY},
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.1,
                        "response_mime_type": "application/json",
                    },
                },
            )
            response.raise_for_status()
            result_text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            result = _extract_json(result_text)

            return {
                "is_complaint": bool(result.get("is_complaint", False)),
                "confidence": max(0.0, min(1.0, float(result.get("confidence", 0.0)))),
                "category": result.get("category"),
                "sentiment": str(result.get("sentiment", "neutral")),
                "sentiment_score": max(-1.0, min(1.0, float(result.get("sentiment_score", 0.0)))),
                "summary": str(result.get("summary", ""))[:500],
                "detected_language": str(result.get("detected_language", "en"))[:8],
                "suggested_action": result.get("suggested_action"),
            }
    except ClassificationError:
        raise
    except Exception:
        logger.exception("Complaint classification failed for %s post", platform)
        return {
            "is_complaint": False,
            "confidence": 0.0,
            "category": None,
            "sentiment": "neutral",
            "sentiment_score": 0.0,
            "summary": "Classification failed — requires manual review",
            "detected_language": "en",
            "suggested_action": None,
        }
