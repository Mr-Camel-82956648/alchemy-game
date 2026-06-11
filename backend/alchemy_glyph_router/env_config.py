from __future__ import annotations

import os
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


ROUTER_ROOT = Path(__file__).resolve().parent
BACKEND_ROOT = ROUTER_ROOT.parent
REPO_ROOT = BACKEND_ROOT.parent
BACKEND_ENV_PATH = BACKEND_ROOT / ".env"
DEPRECATED_ENV_PATHS = {
    "repo/.env": REPO_ROOT / ".env",
    "backend/alchemy_glyph_router/.env": ROUTER_ROOT / ".env",
}
_REQUEST_LLM_CONFIG: ContextVar[dict[str, str] | None] = ContextVar("request_llm_config", default=None)


@dataclass(frozen=True)
class ResolvedLLMConfig:
    kind: str
    provider: str
    base_url: str | None
    api_key: str | None
    model: str | None
    timeout_seconds: float
    max_retries: int | None = None
    log_level: str = "INFO"
    source_family: str = "unknown"
    field_sources: dict[str, str] = field(default_factory=dict)
    env_files_loaded: tuple[str, ...] = ()
    missing: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    def api_key_hint(self) -> str | None:
        text = str(self.api_key or "").strip()
        if not text:
            return None
        if len(text) <= 8:
            return "*" * len(text)
        return f"{text[:4]}...{text[-4:]}"

    def summary(self) -> dict:
        return {
            "kind": self.kind,
            "provider": self.provider,
            "baseUrl": self.base_url,
            "apiKeyHint": self.api_key_hint(),
            "model": self.model,
            "timeoutSeconds": self.timeout_seconds,
            "maxRetries": self.max_retries,
            "logLevel": self.log_level,
            "sourceFamily": self.source_family,
            "fieldSources": dict(self.field_sources),
            "envFilesLoaded": list(self.env_files_loaded),
            "missing": list(self.missing),
            "warnings": list(self.warnings),
        }


def ensure_repo_env_loaded() -> tuple[str, ...]:
    loaded: list[str] = []

    if BACKEND_ENV_PATH.exists():
        load_dotenv(BACKEND_ENV_PATH, override=False)
        loaded.append("backend/.env")

    return tuple(loaded)


@contextmanager
def request_llm_config(config: dict[str, str] | None):
    token = _REQUEST_LLM_CONFIG.set(config or None)
    try:
        yield
    finally:
        _REQUEST_LLM_CONFIG.reset(token)


def resolve_forge_llm_config() -> ResolvedLLMConfig:
    env_files = ensure_repo_env_loaded()
    timeout_seconds = _parse_float(os.getenv("LLM_TIMEOUT_SECONDS"), 30.0)
    max_retries = _parse_int(os.getenv("LLM_MAX_RETRIES"), 1)
    raw_provider = _clean(os.getenv("LLM_PROVIDER"))
    provider_source = "LLM_PROVIDER" if raw_provider else "default:openai_compat"
    provider = _normalize_provider(raw_provider)
    warnings: list[str] = []
    if provider != "openai_compat":
        warnings.append(f"unsupported_provider_ignored:{raw_provider or provider}")

    shared = _resolve_openai_compat_config(
        kind="forge",
        source_family="primary_openai_compat",
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        provider_hint="openai_compat",
        provider_source=provider_source,
        extra_warnings=warnings,
    )
    field_sources = {"provider": provider_source, **shared.field_sources}
    return ResolvedLLMConfig(
        kind="forge",
        provider="openai_compat",
        base_url=shared.base_url,
        api_key=shared.api_key,
        model=shared.model,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        log_level=shared.log_level,
        source_family=shared.source_family,
        field_sources=field_sources,
        env_files_loaded=env_files,
        missing=shared.missing,
        warnings=shared.warnings,
    )


def resolve_forge_fallback_llm_config() -> ResolvedLLMConfig:
    env_files = ensure_repo_env_loaded()
    timeout_seconds = _parse_float(os.getenv("LLM_TIMEOUT_SECONDS"), 30.0)
    return ResolvedLLMConfig(
        kind="forge_fallback",
        provider="disabled",
        base_url=None,
        api_key=None,
        model=None,
        timeout_seconds=timeout_seconds,
        max_retries=None,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        source_family="disabled",
        field_sources={"provider": "disabled"},
        env_files_loaded=env_files,
        warnings=("fallback LLM disabled; only GPT openai-compatible primary config is used",),
    )


def resolve_glyph_router_llm_config() -> ResolvedLLMConfig:
    timeout_seconds = _parse_float(os.getenv("LLM_TIMEOUT_SECONDS"), 60.0)
    provider_hint = _normalize_provider(os.getenv("LLM_PROVIDER"))
    warnings: list[str] = []
    if provider_hint != "openai_compat":
        warnings.append("Only openai-compatible GPT models are enabled")
    return _resolve_openai_compat_config(
        kind="glyph_router",
        source_family="primary_openai_compat",
        timeout_seconds=timeout_seconds,
        max_retries=None,
        provider_hint=provider_hint,
        provider_source="LLM_PROVIDER",
        extra_warnings=warnings,
    )


def build_runtime_snapshot() -> dict:
    forge = resolve_forge_llm_config()
    forge_fallback = resolve_forge_fallback_llm_config()
    glyph_router = resolve_glyph_router_llm_config()
    aligned, reason = _describe_alignment(forge, glyph_router)

    return {
        "fileConfigSource": "backend/.env",
        "fileConfigPresent": BACKEND_ENV_PATH.exists(),
        "ignoredEnvFilesDetected": _detect_ignored_env_files(),
        "envFilesLoaded": list(dict.fromkeys([*forge.env_files_loaded, *glyph_router.env_files_loaded])),
        "aligned": aligned,
        "alignmentReason": reason,
        "forge": forge.summary(),
        "forgeFallback": forge_fallback.summary(),
        "glyphRouter": glyph_router.summary(),
    }


def _resolve_openai_compat_config(
    *,
    kind: str,
    source_family: str,
    timeout_seconds: float,
    max_retries: int | None,
    provider_hint: str,
    provider_source: str,
    extra_warnings: list[str] | None = None,
) -> ResolvedLLMConfig:
    env_files = ensure_repo_env_loaded()
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    request_config = _REQUEST_LLM_CONFIG.get()
    if request_config:
        base_url = _clean(request_config.get("base_url"))
        api_key = _clean(request_config.get("api_key"))
        model = _clean(request_config.get("model")) or "gpt-5.4"
        base_url_source = "request.aiConfig.baseUrl"
        api_key_source = "request.aiConfig.apiKey"
        model_source = "request.aiConfig.model" if _clean(request_config.get("model")) else "default:gpt-5.4"
    else:
        base_url, base_url_source = _pick_first("LLM_BASE_URL")
        api_key, api_key_source = _pick_first("LLM_API_KEY")
        model, model_source = _pick_router_model(provider_hint, base_url, api_key)

    warnings = list(extra_warnings or [])
    resolved_family = source_family
    model_is_gpt = bool(model and model.lower().startswith("gpt-"))
    if model and not model_is_gpt:
        warnings.append(f"unsupported_model_requires_gpt:{model}")

    missing_items = [
        name
        for name, value in (
            ("LLM_BASE_URL", base_url),
            ("LLM_API_KEY", api_key),
            ("OPENAI_COMPAT_MODEL", model),
        )
        if not value
    ]
    if model and not model_is_gpt:
        missing_items.append("OPENAI_COMPAT_MODEL(gpt-*)")
    missing = tuple(missing_items)

    field_sources = {
        "provider": provider_source,
        "base_url": base_url_source,
        "api_key": api_key_source,
        "model": model_source,
    }

    return ResolvedLLMConfig(
        kind=kind,
        provider="openai_compat",
        base_url=base_url.rstrip("/") if base_url else None,
        api_key=api_key,
        model=model,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        log_level=log_level,
        source_family=resolved_family,
        field_sources=field_sources,
        env_files_loaded=env_files,
        missing=missing,
        warnings=tuple(dict.fromkeys(warnings)),
    )


def _pick_router_model(
    provider_hint: str,
    base_url: str | None,
    api_key: str | None,
) -> tuple[str | None, str]:
    direct = _clean(os.getenv("OPENAI_COMPAT_MODEL"))
    if direct:
        return direct, "OPENAI_COMPAT_MODEL"

    return "gpt-5.4", "default:gpt-5.4"


def _describe_alignment(forge: ResolvedLLMConfig, glyph_router: ResolvedLLMConfig) -> tuple[bool, str]:
    if forge.provider != "openai_compat":
        return False, f"forge provider is {forge.provider}; expected openai_compat"

    if forge.missing:
        return False, f"forge missing config: {', '.join(forge.missing)}"

    if glyph_router.missing:
        return False, f"glyph router missing config: {', '.join(glyph_router.missing)}"

    same_key = forge.api_key == glyph_router.api_key
    same_base = forge.base_url == glyph_router.base_url
    same_model = forge.model == glyph_router.model
    if same_key and same_base and same_model:
        return True, "forge and glyph router share one openai-compatible GPT config"

    return False, "forge and glyph router both use openai_compat, but base_url / api_key / model differ"


def _detect_ignored_env_files() -> list[str]:
    return [label for label, path in DEPRECATED_ENV_PATHS.items() if path.exists()]


def _normalize_provider(raw: str | None) -> str:
    text = _clean(raw).lower()
    if text in {""}:
        return "openai_compat"
    if text in {"openai_compat", "openai-compatible", "openai"}:
        return "openai_compat"
    return text or "openai_compat"


def _pick_first(name: str) -> tuple[str | None, str]:
    value = _clean(os.getenv(name))
    return value, name


def _clean(value: str | None) -> str | None:
    text = str(value or "").strip()
    return text or None


def _has_text(value: str | None) -> bool:
    return bool(_clean(value))


def _parse_int(raw: str | None, default: int) -> int:
    try:
        return int(str(raw or "").strip())
    except ValueError:
        return default


def _parse_float(raw: str | None, default: float) -> float:
    try:
        return float(str(raw or "").strip())
    except ValueError:
        return default
