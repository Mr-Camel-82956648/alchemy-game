from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float
    log_level: str
    root_dir: Path
    outputs_dir: Path
    logs_dir: Path
    cards_dir: Path
    full_templates_dir: Path


def load_settings() -> Settings:
    load_dotenv()

    required_values = {
        "LLM_BASE_URL": os.getenv("LLM_BASE_URL"),
        "LLM_API_KEY": os.getenv("LLM_API_KEY"),
        "OPENAI_COMPAT_MODEL": os.getenv("OPENAI_COMPAT_MODEL"),
    }
    missing = [name for name, value in required_values.items() if not value]
    if missing:
        raise ValueError(f"missing_env={','.join(missing)}")

    timeout_raw = os.getenv("LLM_TIMEOUT_SECONDS", "60")
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    root_dir = Path(__file__).resolve().parent

    return Settings(
        base_url=required_values["LLM_BASE_URL"].rstrip("/"),
        api_key=required_values["LLM_API_KEY"],
        model=required_values["OPENAI_COMPAT_MODEL"],
        timeout_seconds=float(timeout_raw),
        log_level=log_level,
        root_dir=root_dir,
        outputs_dir=root_dir / "outputs",
        logs_dir=root_dir / "logs",
        cards_dir=root_dir / "templates" / "cards",
        full_templates_dir=root_dir / "templates" / "full",
    )
