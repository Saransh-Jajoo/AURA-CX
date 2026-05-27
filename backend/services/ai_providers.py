"""LLM provider abstraction for tenant-configurable BYOK execution."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import AsyncIterator, TYPE_CHECKING

import httpx

from config import settings

logger = logging.getLogger("aura_cx.ai_providers")

SUPPORTED_PROVIDERS = {"gemini", "openai", "anthropic", "mistral", "ollama", "openrouter", "self_hosted"}

if TYPE_CHECKING:
    from models import TenantConfig


class ProviderConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    api_key: str = ""
    base_url: str = ""
    model: str = ""


def configured_providers() -> list[str]:
    providers: list[str] = []
    if settings.GEMINI_API_KEY:
        providers.append("gemini")
    if settings.OPENAI_API_KEY:
        providers.append("openai")
    if settings.ANTHROPIC_API_KEY:
        providers.append("anthropic")
    if settings.MISTRAL_API_KEY:
        providers.append("mistral")
    if settings.OPENROUTER_API_KEY:
        providers.append("openrouter")
    if settings.OLLAMA_BASE_URL:
        providers.append("ollama")
    if settings.SELF_HOSTED_AI_BASE_URL:
        providers.append("self_hosted")
    return providers


def env_provider_config(provider: str) -> ProviderConfig:
    provider = provider.lower().strip()
    if provider == "gemini":
        return ProviderConfig("gemini", settings.GEMINI_API_KEY, "", settings.GEMINI_MODEL)
    if provider == "openai":
        return ProviderConfig("openai", settings.OPENAI_API_KEY, "https://api.openai.com/v1", settings.OPENAI_MODEL)
    if provider == "anthropic":
        return ProviderConfig("anthropic", settings.ANTHROPIC_API_KEY, "https://api.anthropic.com/v1", settings.ANTHROPIC_MODEL)
    if provider == "mistral":
        return ProviderConfig("mistral", settings.MISTRAL_API_KEY, "https://api.mistral.ai/v1", settings.MISTRAL_MODEL)
    if provider == "openrouter":
        return ProviderConfig("openrouter", settings.OPENROUTER_API_KEY, "https://openrouter.ai/api/v1", settings.OPENROUTER_MODEL)
    if provider == "ollama":
        return ProviderConfig("ollama", "", settings.OLLAMA_BASE_URL.rstrip("/"), settings.OLLAMA_MODEL)
    if provider == "self_hosted":
        return ProviderConfig("self_hosted", settings.SELF_HOSTED_AI_API_KEY, settings.SELF_HOSTED_AI_BASE_URL.rstrip("/"), settings.SELF_HOSTED_AI_MODEL)
    raise ProviderConfigurationError(f"Unsupported AI provider: {provider}")


def _default_model(provider: str) -> str:
    return env_provider_config(provider).model


def tenant_provider_configs(config: "TenantConfig | None") -> dict[str, ProviderConfig]:
    """Build decrypted provider configs from a tenant BYOK record.

    The returned map is intentionally tenant-scoped and secret-bearing; callers
    should use it only in-process for outbound provider calls and never return
    it in API responses or logs.
    """
    if config is None:
        return {}

    from services.encryption import decrypt_value

    def dec(value: str | None) -> str:
        return decrypt_value(value) if value else ""

    preferred_model = (config.ai_model or "").strip()
    configs: dict[str, ProviderConfig] = {}
    if config.gemini_api_key_enc:
        configs["gemini"] = ProviderConfig(
            "gemini",
            dec(config.gemini_api_key_enc),
            "",
            preferred_model if config.ai_provider == "gemini" and preferred_model else _default_model("gemini"),
        )
    if config.openai_api_key_enc:
        configs["openai"] = ProviderConfig(
            "openai",
            dec(config.openai_api_key_enc),
            "https://api.openai.com/v1",
            preferred_model if config.ai_provider == "openai" and preferred_model else _default_model("openai"),
        )
    if config.anthropic_api_key_enc:
        configs["anthropic"] = ProviderConfig(
            "anthropic",
            dec(config.anthropic_api_key_enc),
            "https://api.anthropic.com/v1",
            preferred_model if config.ai_provider == "anthropic" and preferred_model else _default_model("anthropic"),
        )
    if config.mistral_api_key_enc:
        configs["mistral"] = ProviderConfig(
            "mistral",
            dec(config.mistral_api_key_enc),
            "https://api.mistral.ai/v1",
            preferred_model if config.ai_provider == "mistral" and preferred_model else _default_model("mistral"),
        )
    if config.openrouter_api_key_enc:
        configs["openrouter"] = ProviderConfig(
            "openrouter",
            dec(config.openrouter_api_key_enc),
            "https://openrouter.ai/api/v1",
            preferred_model if config.ai_provider == "openrouter" and preferred_model else _default_model("openrouter"),
        )
    if config.ollama_base_url:
        configs["ollama"] = ProviderConfig(
            "ollama",
            "",
            config.ollama_base_url.rstrip("/"),
            preferred_model if config.ai_provider == "ollama" and preferred_model else _default_model("ollama"),
        )
    if config.self_hosted_base_url:
        configs["self_hosted"] = ProviderConfig(
            "self_hosted",
            dec(config.self_hosted_api_key_enc),
            config.self_hosted_base_url.rstrip("/"),
            preferred_model if config.ai_provider == "self_hosted" and preferred_model else settings.SELF_HOSTED_AI_MODEL,
        )
    return configs


def _text_from_openai(data: dict) -> str:
    return data["choices"][0]["message"]["content"]


async def generate_text(
    prompt: str,
    *,
    response_json: bool = False,
    preferred_provider: str | None = None,
    fallback_order: list[str] | None = None,
    override: ProviderConfig | None = None,
    provider_configs: dict[str, ProviderConfig] | None = None,
) -> tuple[str, str]:
    providers = [preferred_provider or settings.AI_PROVIDER, *(fallback_order or settings.ai_fallback_order_list)]
    seen: set[str] = set()
    last_error: Exception | None = None
    for provider in providers:
        provider = provider.lower().strip()
        if provider in seen or provider not in SUPPORTED_PROVIDERS:
            continue
        seen.add(provider)
        config = (
            override
            if override and override.provider == provider
            else (provider_configs or {}).get(provider, env_provider_config(provider))
        )
        try:
            return await _generate_with_retries(config, prompt, response_json=response_json), provider
        except ProviderConfigurationError as exc:
            last_error = exc
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("AI provider %s failed, trying fallback: %s", provider, exc)
    raise ProviderConfigurationError(str(last_error or "No configured AI provider is available"))


async def stream_text(prompt: str, *, preferred_provider: str | None = None) -> AsyncIterator[str]:
    text, _ = await generate_text(prompt, preferred_provider=preferred_provider)
    for chunk in text.split():
        yield chunk + " "
        await asyncio.sleep(0)


async def provider_health(provider_configs: dict[str, ProviderConfig] | None = None) -> dict[str, dict]:
    status: dict[str, dict] = {}
    for provider in SUPPORTED_PROVIDERS:
        cfg = (provider_configs or {}).get(provider, env_provider_config(provider))
        status[provider] = {
            "configured": bool(cfg.api_key or (provider in {"ollama", "self_hosted"} and cfg.base_url)),
            "model": cfg.model,
            "base_url": cfg.base_url if provider in {"ollama", "self_hosted"} else "",
        }
    return status


async def _generate_with_retries(config: ProviderConfig, prompt: str, *, response_json: bool) -> str:
    if config.provider != "ollama" and config.provider != "self_hosted" and not config.api_key:
        raise ProviderConfigurationError(f"{config.provider} credentials are not configured")
    if config.provider in {"ollama", "self_hosted"} and not config.base_url:
        raise ProviderConfigurationError(f"{config.provider} base URL is not configured")
    attempts = max(1, settings.AI_MAX_RETRIES + 1)
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                return await _dispatch(client, config, prompt, response_json=response_json)
        except (httpx.TimeoutException, httpx.HTTPError):
            if attempt >= attempts - 1:
                raise
            await asyncio.sleep(0.4 * (attempt + 1))
    raise ProviderConfigurationError(f"{config.provider} generation failed")


async def _dispatch(client: httpx.AsyncClient, config: ProviderConfig, prompt: str, *, response_json: bool) -> str:
    if config.provider == "gemini":
        generation_config: dict = {"temperature": 0.2}
        if response_json:
            generation_config["response_mime_type"] = "application/json"
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{config.model}:generateContent",
            params={"key": config.api_key},
            json={"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": generation_config},
        )
        response.raise_for_status()
        return response.json()["candidates"][0]["content"]["parts"][0]["text"]

    if config.provider == "anthropic":
        response = await client.post(
            f"{config.base_url}/messages",
            headers={"x-api-key": config.api_key, "anthropic-version": "2023-06-01"},
            json={"model": config.model, "max_tokens": 1200, "temperature": 0.2, "messages": [{"role": "user", "content": prompt}]},
        )
        response.raise_for_status()
        return response.json()["content"][0]["text"]

    if config.provider == "ollama":
        response = await client.post(
            f"{config.base_url}/api/chat",
            json={"model": config.model, "stream": False, "messages": [{"role": "user", "content": prompt}]},
        )
        response.raise_for_status()
        return response.json()["message"]["content"]

    headers = {"Authorization": f"Bearer {config.api_key}"}
    if config.provider == "openrouter":
        headers.update({"HTTP-Referer": settings.FRONTEND_URL, "X-Title": "AURA-CX"})
    response_format = {"type": "json_object"} if response_json else None
    response = await client.post(
        f"{config.base_url}/chat/completions",
        headers=headers,
        json={
            "model": config.model,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": prompt}],
            **({"response_format": response_format} if response_format else {}),
        },
    )
    response.raise_for_status()
    return _text_from_openai(response.json())
