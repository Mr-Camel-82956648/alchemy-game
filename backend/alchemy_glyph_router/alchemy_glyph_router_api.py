from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from config import load_settings
from generator import generate_prompt, load_full_template
from llm_client import LLMClient
from router import route_theme

__all__ = ["run_alchemy_glyph_router"]


FULL_TEMPLATE_MAP = {
    "A": "A_container_full",
    "B1": "B1_fallback_full",
    "B2": "B2_rain_full",
    "C": "C_eruption_full",
    "D": "D_trail_full",
    "E": "E_burst_full",
    "F": "F_manifest_full",
}


class _RuntimeLogger:
    def __init__(self, verbose: bool, stream: Any | None = None) -> None:
        self.verbose = verbose
        self.stream = stream or sys.stdout
        self.log_path: Path | None = None

    def attach_log_file(self, logs_dir: Path) -> None:
        logs_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = logs_dir / "app.log"

    def info(self, key: str, value: object) -> None:
        self._emit("INFO", key, value)

    def error(self, key: str, value: object) -> None:
        self._emit("ERROR", key, value)

    def _emit(self, level: str, key: str, value: object) -> None:
        message = f"[{level}] {key}={value}"
        if self.verbose:
            print(message, file=self.stream)
        if self.log_path is not None:
            with self.log_path.open("a", encoding="utf-8") as handle:
                handle.write(f"{message}\n")


def run_alchemy_glyph_router(
    theme: str,
    save_output: bool = False,
    verbose: bool = False,
) -> dict:
    """Run the route-plus-generate workflow and return a JSON-shaped result dict."""
    logger = _RuntimeLogger(verbose=verbose)

    try:
        settings = load_settings()
        if verbose:
            logger.attach_log_file(settings.logs_dir)
        if save_output:
            settings.outputs_dir.mkdir(parents=True, exist_ok=True)

        client = LLMClient(settings)
        started_at_dt = datetime.now().astimezone()
        started_at = started_at_dt.strftime("%Y-%m-%d %H:%M:%S")
        total_started = time.perf_counter()

        logger.info("started_at", started_at)
        logger.info("theme", theme)

        route_started = time.perf_counter()
        route = route_theme(theme, settings.cards_dir, client)
        route_elapsed_ms = _elapsed_ms(route_started)

        fallback_applied = False
        final_route_code = route.selected_template
        final_template = FULL_TEMPLATE_MAP.get(final_route_code)
        if not final_template and route.fallback_needed and route.fallback_target:
            final_route_code = route.fallback_target
            final_template = FULL_TEMPLATE_MAP.get(final_route_code)
            fallback_applied = bool(final_template)
        if not final_template:
            raise ValueError(f"missing_full_template_mapping={final_route_code}")

        logger.info("route_selected", route.selected_template)
        logger.info("route_reason", route.route_reason)
        logger.info("fallback_applied", str(fallback_applied).lower())
        logger.info("route_elapsed_ms", route_elapsed_ms)
        logger.info("final_template", final_template)

        generation_started = time.perf_counter()
        template_markdown = load_full_template(settings.full_templates_dir, final_template)
        final_prompt = generate_prompt(theme, template_markdown, client)
        generation_elapsed_ms = _elapsed_ms(generation_started)
        total_elapsed_ms = _elapsed_ms(total_started)

        logger.info("generation_elapsed_ms", generation_elapsed_ms)
        logger.info("total_elapsed_ms", total_elapsed_ms)
        logger.info("model", settings.model)

        payload = {
            "theme": theme,
            "route_selected": route.selected_template,
            "route_reason": route.route_reason,
            "fallback_applied": fallback_applied,
            "final_template": final_template,
            "model": settings.model,
            "final_prompt": final_prompt,
            "created_at": datetime.now().astimezone().isoformat(),
            "started_at": started_at,
            "route_elapsed_ms": route_elapsed_ms,
            "generation_elapsed_ms": generation_elapsed_ms,
            "total_elapsed_ms": total_elapsed_ms,
        }

        if save_output:
            output_path = _save_output(payload, settings.outputs_dir, theme)
            logger.info("output", output_path.relative_to(settings.root_dir).as_posix())

        return payload
    except Exception as exc:
        logger.error("run_failed", exc)
        raise


def _save_output(payload: dict, outputs_dir: Path, theme: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    theme_slug = _slugify_theme(theme)
    file_name = f"{timestamp}_{theme_slug}.json" if theme_slug else f"{timestamp}.json"
    output_path = outputs_dir / file_name
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def _slugify_theme(theme: str) -> str:
    slug = "".join(char if (char.isalnum() or char in "-_") else "_" for char in theme.strip())
    return slug.strip("_")[:40]


def _elapsed_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)
