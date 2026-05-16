"""Multilingual language detection and translation support.

Supports Hindi, Marathi, Tamil, Bengali, Gujarati, Telugu, Kannada, Malayalam,
and English. Uses Unicode script detection for Indic languages and integrates
with Gemini for AI-powered translation when needed.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from config import settings

logger = logging.getLogger("aura_cx.language")

# Unicode script ranges for Indic languages
INDIC_SCRIPTS = {
    "hi": (0x0900, 0x097F, "Devanagari"),   # Hindi
    "mr": (0x0900, 0x097F, "Devanagari"),   # Marathi (same script as Hindi)
    "ta": (0x0B80, 0x0BFF, "Tamil"),
    "bn": (0x0980, 0x09FF, "Bengali"),
    "gu": (0x0A80, 0x0AFF, "Gujarati"),
    "te": (0x0C00, 0x0C7F, "Telugu"),
    "kn": (0x0C80, 0x0CFF, "Kannada"),
    "ml": (0x0D00, 0x0D7F, "Malayalam"),
}

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "mr": "Marathi",
    "ta": "Tamil",
    "bn": "Bengali",
    "gu": "Gujarati",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
}

# Common Hindi words to distinguish Hindi from Marathi (both Devanagari)
HINDI_MARKERS = {"है", "हैं", "और", "का", "की", "के", "को", "में", "से", "पर", "ने", "यह", "वह", "कि", "जो", "एक"}
MARATHI_MARKERS = {"आहे", "आणि", "हा", "ही", "हे", "तो", "ती", "ते", "मी", "तू", "आम्ही", "काय", "नाही", "होता"}


def detect_script(text: str) -> dict[str, int]:
    """Count characters belonging to each Indic script."""
    script_counts: dict[str, int] = {}
    for char in text:
        code_point = ord(char)
        for lang, (start, end, script_name) in INDIC_SCRIPTS.items():
            if start <= code_point <= end:
                script_counts[script_name] = script_counts.get(script_name, 0) + 1
                break
    return script_counts


def detect_language(text: str) -> str:
    """Detect the primary language of a text string.

    Returns ISO 639-1 language code.
    Uses Unicode script detection for Indic languages, with word-level
    disambiguation for Hindi vs Marathi (both use Devanagari).
    """
    if not text or not text.strip():
        return "en"

    script_counts = detect_script(text)
    total_chars = len(text.strip())

    # Check if mostly ASCII (English)
    ascii_count = sum(1 for ch in text if ord(ch) < 128 and ch.isalpha())
    if not script_counts and ascii_count > 0:
        return "en"

    if not script_counts:
        return "en"

    # Find the dominant script
    dominant_script = max(script_counts, key=script_counts.get)  # type: ignore[arg-type]
    dominant_count = script_counts[dominant_script]

    # If dominant script covers less than 20% of text, assume English
    if dominant_count < total_chars * 0.15:
        return "en"

    # Map script to language
    script_to_lang: dict[str, str] = {
        "Tamil": "ta",
        "Bengali": "bn",
        "Gujarati": "gu",
        "Telugu": "te",
        "Kannada": "kn",
        "Malayalam": "ml",
    }

    if dominant_script in script_to_lang:
        return script_to_lang[dominant_script]

    # Devanagari: disambiguate Hindi vs Marathi
    if dominant_script == "Devanagari":
        words = set(text.split())
        hindi_hits = len(words & HINDI_MARKERS)
        marathi_hits = len(words & MARATHI_MARKERS)
        return "mr" if marathi_hits > hindi_hits else "hi"

    return "en"


def get_language_name(code: str) -> str:
    """Get human-readable language name from code."""
    return LANGUAGE_NAMES.get(code, "Unknown")


def is_supported_language(code: str) -> bool:
    """Check if a language is supported."""
    return code in settings.supported_languages_list


async def translate_with_ai(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text using Gemini AI.

    Falls back to original text if translation fails.
    """
    if source_lang == target_lang:
        return text

    if not settings.GEMINI_API_KEY:
        return text

    try:
        import httpx

        source_name = get_language_name(source_lang)
        target_name = get_language_name(target_lang)

        prompt = f"""Translate the following text from {source_name} to {target_name}.
Return ONLY the translated text, no explanations or additional content.

Text to translate:
{text}"""

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
                params={"key": settings.GEMINI_API_KEY},
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.1},
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        logger.exception("Translation failed: %s → %s", source_lang, target_lang)
        return text


async def draft_in_language(draft: str, target_lang: str) -> str:
    """Generate a customer-facing draft in the target language."""
    if target_lang == "en":
        return draft
    return await translate_with_ai(draft, "en", target_lang)
