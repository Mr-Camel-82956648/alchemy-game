from __future__ import annotations

import os
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


def resolve_forge_llm_config() -> ResolvedLLMConfig:
    env_files = ensure_repo_env_loaded()
    timeout_seconds = _parse_float(os.getenv("LLM_TIMEOUT_SECONDS"), 30.0)
    max_retries = _parse_int(os.getenv("LLM_MAX_RETRIES"), 1)
    raw_provider = _clean(os.getenv("LLM_PROVIDER"))
    provider_source = "LLM_PROVIDER" if raw_provider else "default:gemini_rest"
    provider = _normalize_provider(raw_provider)

    if provider == "openai_compat":
        shared = _resolve_openai_compat_config(
            kind="forge",
            source_family="primary_openai_compat",
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            provider_hint=provider,
            provider_source=provider_source,
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

    warnings: list[str] = []
    if raw_provider and provider not in {"gemini_rest", "openai_compat"}:
        warnings.append(f"unknown_provider_fallback:{raw_provider}")
    return _resolve_gemini_config(
        kind="forge",
        source_family="primary_gemini_rest",
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        provider_source=provider_source,
        extra_warnings=warnings,
    )


def resolve_forge_fallback_llm_config() -> ResolvedLLMConfig:
    ensure_repo_env_loaded()
    timeout_seconds = _parse_float(os.getenv("LLM_TIMEOUT_SECONDS"), 30.0)
    max_retries = _parse_int(os.getenv("LLM_MAX_RETRIES"), 1)
    provider = _normalize_provider(os.getenv("LLM_PROVIDER"))

    if provider == "openai_compat":
        return _resolve_gemini_config(
            kind="forge_fallback",
            source_family="fallback_gemini_rest",
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            provider_source="GEMINI_API_KEY / LLM_MODEL",
        )

    return _resolve_openai_compat_config(
        kind="forge_fallback",
        source_family="fallback_openai_compat",
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        provider_hint="openai_compat",
        provider_source="LLM_BASE_URL / LLM_API_KEY / OPENAI_COMPAT_MODEL",
    )


def resolve_glyph_router_llm_config() -> ResolvedLLMConfig:
    timeout_seconds = _parse_float(os.getenv("LLM_TIMEOUT_SECONDS"), 60.0)
    provider_hint = _normalize_provider(os.getenv("LLM_PROVIDER"))
    warnings: list[str] = []
    if provider_hint == "gemini_rest":
        warnings.append("LLM_PROVIDER=gemini_rest: glyph router still requires the primary openai-compatible config")
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
    base_url, base_url_source = _pick_first("LLM_BASE_URL")
    api_key, api_key_source = _pick_first("LLM_API_KEY")
    model, model_source = _pick_router_model(provider_hint, base_url, api_key)

    warnings = list(extra_warnings or [])
    resolved_family = source_family
    if model_source == "LLM_MODEL":
        resolved_family = f"{source_family}_legacy_model_alias"
        warnings.append("OPENAI_COMPAT_MODEL missing: fell back to LLM_MODEL")

    missing = tuple(
        name for name, value in (
            ("LLM_BASE_URL", base_url),
            ("LLM_API_KEY", api_key),
            ("OPENAI_COMPAT_MODEL", model),
        )
        if not value
    )

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


def _resolve_gemini_config(
    *,
    kind: str,
    source_family: str,
    timeout_seconds: float,
    max_retries: int | None,
    provider_source: str,
    extra_warnings: list[str] | None = None,
) -> ResolvedLLMConfig:
    env_files = ensure_repo_env_loaded()
    api_key = _clean(os.getenv("GEMINI_API_KEY"))
    model = _clean(os.getenv("LLM_MODEL")) or "gemini-2.0-flash"
    missing = tuple(name for name, value in (("GEMINI_API_KEY", api_key),) if not value)
    field_sources = {
        "provider": provider_source,
        "api_key": "GEMINI_API_KEY",
        "model": "LLM_MODEL" if _has_text(os.getenv("LLM_MODEL")) else "default:gemini-2.0-flash",
    }

    return ResolvedLLMConfig(
        kind=kind,
        provider="gemini_rest",
        base_url=None,
        api_key=api_key,
        model=model,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        source_family=source_family,
        field_sources=field_sources,
        env_files_loaded=env_files,
        missing=missing,
        warnings=tuple(extra_warnings or ()),
    )


def _pick_router_model(
    provider_hint: str,
    base_url: str | None,
    api_key: str | None,
) -> tuple[str | None, str]:
    direct = _clean(os.getenv("OPENAI_COMPAT_MODEL"))
    if direct:
        return direct, "OPENAI_COMPAT_MODEL"

    alias = _clean(os.getenv("LLM_MODEL"))
    if not alias:
        return None, "OPENAI_COMPAT_MODEL"

    if provider_hint == "openai_compat":
        return alias, "LLM_MODEL"

    if provider_hint == "gemini_rest":
        return None, "OPENAI_COMPAT_MODEL"

    if base_url and api_key:
        return alias, "LLM_MODEL"

    return None, "OPENAI_COMPAT_MODEL"


def _describe_alignment(forge: ResolvedLLMConfig, glyph_router: ResolvedLLMConfig) -> tuple[bool, str]:
    if forge.provider != "openai_compat":
        return False, "forge 当前走 gemini_rest；glyph router 当前固定走 openai_compat"

    if forge.missing:
        return False, f"forge 缺少配置: {', '.join(forge.missing)}"

    if glyph_router.missing:
        return False, f"glyph router 缺少配置: {', '.join(glyph_router.missing)}"

    same_key = forge.api_key == glyph_router.api_key
    same_base = forge.base_url == glyph_router.base_url
    same_model = forge.model == glyph_router.model
    if same_key and same_base and same_model:
        return True, "forge 与 glyph router 当前共用同一套 openai-compatible 配置"

    return False, "forge 与 glyph router 当前 provider 同为 openai_compat，但 base_url / api_key / model 仍未完全一致"


def _detect_ignored_env_files() -> list[str]:
    return [label for label, path in DEPRECATED_ENV_PATHS.items() if path.exists()]


def _normalize_provider(raw: str | None) -> str:
    text = _clean(raw).lower()
    if text in {"", "gemini", "gemini_rest"}:
        return "gemini_rest"
    if text in {"openai_compat", "openai-compatible", "openai"}:
        return "openai_compat"
    return text or "gemini_rest"


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
