from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

try:
    from .env_config import resolve_glyph_router_llm_config
except ImportError:
    from env_config import resolve_glyph_router_llm_config


@dataclass(frozen=True)
class Settings:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float
    log_level: str
    source_family: str
    field_sources: dict[str, str]
    env_files_loaded: tuple[str, ...]
    api_key_hint: str | None
    root_dir: Path
    outputs_dir: Path
    logs_dir: Path
    cards_dir: Path
    full_templates_dir: Path


def load_settings() -> Settings:
    resolved = resolve_glyph_router_llm_config()
    if resolved.missing:
        raise ValueError(f"missing_env={','.join(resolved.missing)}")

    root_dir = Path(__file__).resolve().parent

    return Settings(
        base_url=(resolved.base_url or "").rstrip("/"),
        api_key=resolved.api_key or "",
        model=resolved.model or "",
        timeout_seconds=resolved.timeout_seconds,
        log_level=resolved.log_level,
        source_family=resolved.source_family,
        field_sources=dict(resolved.field_sources),
        env_files_loaded=resolved.env_files_loaded,
        api_key_hint=resolved.api_key_hint(),
        root_dir=root_dir,
        outputs_dir=root_dir / "outputs",
        logs_dir=root_dir / "logs",
        cards_dir=root_dir / "templates" / "cards",
        full_templates_dir=root_dir / "templates" / "full",
    )
