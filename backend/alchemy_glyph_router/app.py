from __future__ import annotations

import argparse

from alchemy_glyph_router_api import run_alchemy_glyph_router


def main() -> int:
    args = _parse_args()

    try:
        run_alchemy_glyph_router(args.theme, save_output=True, verbose=True)
        return 0
    except Exception:
        return 1


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--theme", required=True, help="输入主题词或短语")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
