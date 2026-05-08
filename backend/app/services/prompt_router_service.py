import importlib
import json
import logging
import sys
from pathlib import Path

from alchemy_glyph_router.env_config import resolve_glyph_router_llm_config

logger = logging.getLogger("forge.prompt_router")

_RUNNER = None


def run_prompt_router(theme: str, *, task_id: str | None = None) -> dict:
    cleaned_theme = str(theme or "").strip()
    entered_module_b = False
    glyph_config = resolve_glyph_router_llm_config()
    config_summary = glyph_config.summary()

    logger.info(
        "prompt_router.request %s",
        _json_log(
            {
                "taskId": task_id,
                "themeText": cleaned_theme,
                "moduleBAttempted": True,
                "llmConfig": config_summary,
            }
        ),
    )

    try:
        runner = _load_runner()
        entered_module_b = True
        payload = runner(cleaned_theme, save_output=False, verbose=False)
        logger.info(
            "prompt_router.success %s",
            _json_log(
                {
                    "taskId": task_id,
                    "themeText": cleaned_theme,
                    "moduleBEntered": entered_module_b,
                    "route": payload.get("route_selected"),
                    "routeReason": payload.get("route_reason"),
                    "fallbackApplied": bool(payload.get("fallback_applied", False)),
                    "template": payload.get("final_template"),
                    "model": payload.get("model"),
                    "routeElapsedMs": payload.get("route_elapsed_ms"),
                    "generationElapsedMs": payload.get("generation_elapsed_ms"),
                    "totalElapsedMs": payload.get("total_elapsed_ms"),
                    "llmConfig": config_summary,
                }
            ),
        )
        return payload
    except Exception as exc:
        failure_reason = _summarize_prompt_router_failure(exc)
        logger.error(
            "prompt_router.failure %s",
            _json_log(
                {
                    "taskId": task_id,
                    "themeText": cleaned_theme,
                    "moduleBEntered": entered_module_b,
                    "enteredLocalFallback": True,
                    "fallbackReason": failure_reason,
                    "exceptionType": type(exc).__name__,
                    "exceptionSummary": _exception_summary(exc),
                    "llmConfig": config_summary,
                }
            ),
        )
        raise RuntimeError(failure_reason) from exc


def build_prompt_fallback(theme_text: str) -> str:
    cleaned = str(theme_text or "").strip()
    if not cleaned:
        return "标准等距2.5D游戏俯视视角，纯黑背景，仅展示一个独立技能特效资产，边界清晰，能量受控，中心主体明确。"
    return (
        "标准等距2.5D游戏俯视视角，纯黑背景，仅展示一个独立技能特效资产。"
        f"{cleaned}"
    )


def _load_runner():
    global _RUNNER
    if _RUNNER is not None:
        return _RUNNER

    router_root = Path(__file__).resolve().parents[2] / "alchemy_glyph_router"
    router_path = str(router_root)
    if router_path not in sys.path:
        sys.path.insert(0, router_path)

    logger.info("loading glyph router from %s", router_root)
    module = importlib.import_module("alchemy_glyph_router_api")
    _RUNNER = getattr(module, "run_alchemy_glyph_router")
    return _RUNNER


def _json_log(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))


def _exception_summary(exc: Exception) -> str:
    summary = []
    current = exc
    visited = set()
    while current and id(current) not in visited:
        visited.add(id(current))
        text = str(current).strip()
        if text:
            summary.append(text)
        current = current.__cause__ or current.__context__
    return " <- ".join(summary) if summary else type(exc).__name__


def _summarize_prompt_router_failure(exc: Exception) -> str:
    summary = _exception_summary(exc)
    primary = summary.split(" <- ", 1)[0]
    lowered = summary.lower()

    if "missing_env=" in lowered:
        return f"config_missing_env: {primary}"
    if "route_stage_failed:" in lowered:
        return f"route_stage_failed: {primary}"
    if "generation_stage_failed:" in lowered:
        return f"generation_stage_failed: {primary}"
    if "llm_timeout" in lowered or "timed out" in lowered or "readtimeout" in lowered:
        return f"llm_timeout: {primary}"
    if "llm_http_error" in lowered or "http error" in lowered or "status=" in lowered:
        return f"llm_http_error: {primary}"
    if "llm_request_error" in lowered or "connection aborted" in lowered or "connectionerror" in lowered:
        return f"llm_request_error: {primary}"
    if "llm_response_error" in lowered or "invalid_llm_response" in lowered or "empty_llm_content" in lowered:
        return f"llm_response_error: {primary}"
    if "route_response_not_json" in lowered or "invalid_selected_template" in lowered:
        return f"route_parse_error: {primary}"
    if "missing_full_template_mapping=" in lowered:
        return f"template_mapping_error: {primary}"
    return f"module_b_error: {primary}"
