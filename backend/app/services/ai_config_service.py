from __future__ import annotations

import os
from typing import Any

import httpx

from alchemy_glyph_router.env_config import resolve_forge_llm_config

from ..models import ForgeAIConfig


class AIConfigError(ValueError):
    pass


def ai_auth_required() -> bool:
    return str(os.getenv("FORGE_REQUIRE_AI_AUTH", "true")).strip().lower() not in {"0", "false", "no", "off"}


def resolve_request_llm_override(config: ForgeAIConfig | None) -> dict[str, str] | None:
    if config is None:
        if ai_auth_required():
            raise AIConfigError("AI engine is not connected")
        return None

    mode = _clean(config.mode).lower() or "internal"
    if mode == "internal":
        _validate_internal_password(config.internalPassword)
        return None

    if mode == "personal":
        base_url = _normalize_base_url(config.baseUrl)
        api_key = _clean(config.apiKey)
        model = _normalize_gpt_model(config.model)
        if not api_key:
            raise AIConfigError("API key is required")
        return {
            "base_url": base_url,
            "api_key": api_key,
            "model": model,
        }

    raise AIConfigError("Unsupported AI config mode")


async def test_ai_config(config: ForgeAIConfig) -> dict[str, Any]:
    override = resolve_request_llm_override(config)
    if override is None:
        resolved = resolve_forge_llm_config()
        if resolved.missing:
            raise AIConfigError(f"Missing env LLM config: {', '.join(resolved.missing)}")
        override = {
            "base_url": resolved.base_url or "",
            "api_key": resolved.api_key or "",
            "model": resolved.model or "gpt-5.4",
        }
        mode = "internal"
    else:
        mode = "personal"

    await _probe_openai_compat(override)
    return {
        "ok": True,
        "mode": mode,
        "model": override["model"],
        "baseUrl": override["base_url"],
        "apiKeyHint": _api_key_hint(override["api_key"]),
        "message": "connected",
    }


async def _probe_openai_compat(config: dict[str, str]) -> None:
    url = f"{config['base_url'].rstrip('/')}/chat/completions"
    payload = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": "Return exactly OK."},
            {"role": "user", "content": "Connection test."},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json",
    }
    try:
        resp = httpx.post(url, headers=headers, json=payload, timeout=20)
        resp.raise_for_status()
        body = resp.json()
        choices = body.get("choices")
        if not isinstance(choices, list) or not choices:
            raise AIConfigError("LLM response missing choices")
    except httpx.HTTPStatusError as exc:
        snippet = (exc.response.text or "").strip().replace("\n", " ")[:200]
        raise AIConfigError(f"LLM HTTP {exc.response.status_code}: {snippet}") from exc
    except httpx.RequestError as exc:
        raise AIConfigError(f"LLM request failed: {exc}") from exc
    except ValueError as exc:
        raise AIConfigError(f"LLM response error: {exc}") from exc


def _validate_internal_password(value: str | None) -> None:
    expected = str(os.getenv("INTERNAL_API_PASSWORD", "3284"))
    if str(value or "") != expected:
        raise AIConfigError("Internal password is incorrect")


def _normalize_base_url(value: str | None) -> str:
    text = _clean(value).rstrip("/")
    if not text:
        raise AIConfigError("Base URL is required")
    if not (text.startswith("https://") or text.startswith("http://")):
        raise AIConfigError("Base URL must start with http:// or https://")
    return text


def _normalize_gpt_model(value: str | None) -> str:
    model = _clean(value) or "gpt-5.4"
    if not model.lower().startswith("gpt-"):
        raise AIConfigError("Only gpt-* models are supported")
    return model


def _api_key_hint(value: str | None) -> str | None:
    text = _clean(value)
    if not text:
        return None
    if len(text) <= 8:
        return "*" * len(text)
    return f"{text[:4]}...{text[-4:]}"


def _clean(value: str | None) -> str:
    return str(value or "").strip()
