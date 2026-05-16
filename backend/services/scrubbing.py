"""PII and toxicity scrubbing before persistence."""

from __future__ import annotations

import re


PII_PATTERNS: dict[str, tuple[re.Pattern[str], str]] = {
    "email": (re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"), "[EMAIL_REDACTED]"),
    "phone": (re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b"), "[PHONE_REDACTED]"),
    "ssn": (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN_REDACTED]"),
    "card": (re.compile(r"\b(?:\d[ -]*?){13,19}\b"), "[CARD_REDACTED]"),
    "ip": (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP_REDACTED]"),
}

TOXIC_TERMS = {
    "fuck",
    "fucking",
    "shit",
    "idiot",
    "moron",
    "bastard",
    "asshole",
}


def _luhn_like(value: str) -> bool:
    digits = [int(ch) for ch in value if ch.isdigit()]
    if len(digits) < 13:
        return False
    checksum = 0
    parity = len(digits) % 2
    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0


def scrub_text(text: str) -> dict:
    redacted = text[:200_000]
    pii_report: list[dict] = []
    for pii_type, (pattern, replacement) in PII_PATTERNS.items():
        matches = pattern.findall(redacted)
        if pii_type == "card":
            matches = [match for match in matches if _luhn_like(match)]
        if matches:
            pii_report.append({"type": pii_type, "count": len(matches)})
            if pii_type == "card":
                for match in matches:
                    redacted = redacted.replace(match, replacement)
            else:
                redacted = pattern.sub(replacement, redacted)

    words = redacted.split()
    toxic_hits = 0
    scrubbed_words: list[str] = []
    for word in words:
        key = word.lower().strip(".,!?;:'\"()[]{}")
        if key in TOXIC_TERMS:
            toxic_hits += 1
            scrubbed_words.append("[TOXIC_REDACTED]")
        else:
            scrubbed_words.append(word)

    cleaned = " ".join(scrubbed_words)
    toxicity_score = toxic_hits / max(len(words), 1)
    return {
        "cleaned_text": cleaned,
        "pii_report": pii_report,
        "toxicity_score": round(toxicity_score, 4),
        "filtered_terms": toxic_hits,
    }

