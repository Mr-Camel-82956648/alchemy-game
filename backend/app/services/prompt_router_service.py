import importlib
import logging
import sys
from pathlib import Path

logger = logging.getLogger("forge.prompt_router")

_RUNNER = None


def run_prompt_router(theme: str) -> dict:
    runner = _load_runner()
    return runner(theme, save_output=False, verbose=False)


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
