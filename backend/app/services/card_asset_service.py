from __future__ import annotations

import copy
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("card.assets")

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
STATE_FILE = DATA_DIR / "card_asset_state.json"
STATIC_ASSET_DIR = BACKEND_DIR / "assets" / "cards"

STATUS_NOT_GENERATED = "not_generated"
STATUS_GENERATING = "generating"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

ALLOWED_SOURCE_TYPES = {"built_in", "player_generated", "curated"}
ATTR_ALIASES = {
    "poison": "blight",
    "blight": "blight",
    "fire": "fire",
    "ice": "ice",
    "thunder": "thunder",
    "lightning": "thunder",
}

_state_lock = threading.Lock()


def _default_state() -> dict[str, Any]:
    return {
        "version": 1,
        "playerGeneratedAssets": {},
        "videoTasks": {},
    }


def _load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return _default_state()

    try:
        payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("card.assets_state_load_failed %s", exc)
        return _default_state()

    state = _default_state()
    if isinstance(payload, dict):
        state["version"] = int(payload.get("version") or 1)
        state["playerGeneratedAssets"] = dict(payload.get("playerGeneratedAssets") or {})
        state["videoTasks"] = dict(payload.get("videoTasks") or {})
    return state


_state = _load_state()


def _save_state_locked() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = STATE_FILE.with_suffix(".tmp")
    temp_path.write_text(
        json.dumps(_state, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    temp_path.replace(STATE_FILE)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _clean_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_source_type(value: Any, default: str = "player_generated") -> str:
    text = str(value or "").strip().lower()
    return text if text in ALLOWED_SOURCE_TYPES else default


def _normalize_attr_set(values: Any) -> list[str]:
    if not values:
        return []
    raw_values = values if isinstance(values, list) else [values]
    normalized: list[str] = []
    seen = set()
    for item in raw_values:
        key = str(item or "").strip().lower()
        attr = ATTR_ALIASES.get(key, key)
        if not attr or attr in seen:
            continue
        seen.add(attr)
        normalized.append(attr)
    return normalized[:3]


def _normalize_status(value: Any, *, default: str = STATUS_NOT_GENERATED) -> str:
    text = str(value or "").strip().lower()
    if text in {STATUS_NOT_GENERATED, "none", "idle"}:
        return STATUS_NOT_GENERATED
    if text in {STATUS_GENERATING, "queued", "submitting", "polling", "running", "in_progress"}:
        return STATUS_GENERATING
    if text in {STATUS_COMPLETED, "completed", "ready", "succeeded", "success"}:
        return STATUS_COMPLETED
    if text in {STATUS_FAILED, "failed", "error"}:
        return STATUS_FAILED
    return default


def _make_player_asset_id(card_id: str) -> str:
    return f"player_generated:{card_id}"


def _copy_asset(asset: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(asset)


def load_persisted_video_tasks() -> dict[str, dict[str, Any]]:
    with _state_lock:
        stored = dict(_state.get("videoTasks") or {})
    return {task_id: copy.deepcopy(task) for task_id, task in stored.items()}


def save_video_task(task: dict[str, Any]) -> None:
    task_id = _clean_text(task.get("videoTaskId"))
    if not task_id:
        return
    with _state_lock:
        _state["videoTasks"][task_id] = copy.deepcopy(task)
        _save_state_locked()


def list_player_generated_assets() -> list[dict[str, Any]]:
    with _state_lock:
        assets = list((_state.get("playerGeneratedAssets") or {}).values())
    assets.sort(key=lambda item: item.get("updatedAt", 0), reverse=True)
    return [_copy_asset(asset) for asset in assets]


def get_player_generated_asset_by_card(card_id: str) -> dict[str, Any] | None:
    card_key = _clean_text(card_id)
    if not card_key:
        return None
    asset_id = _make_player_asset_id(card_key)
    with _state_lock:
        asset = (_state.get("playerGeneratedAssets") or {}).get(asset_id)
        return _copy_asset(asset) if asset else None


def register_generated_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    registered: list[dict[str, Any]] = []
    for item in cards:
        asset = register_generated_card(item)
        if asset is not None:
            registered.append(asset)
    return registered


def register_generated_card(card: dict[str, Any]) -> dict[str, Any] | None:
    card_id = _clean_text((card or {}).get("cardId"))
    if not card_id:
        return None

    now = _now_ms()
    source_type = _normalize_source_type((card or {}).get("sourceType"), default="player_generated")
    incoming_status = _clean_text((card or {}).get("status"))
    playable_url = _clean_text((card or {}).get("videoUrl")) or _clean_text((card or {}).get("resultUrl"))
    normalized_status = (
        _normalize_status(incoming_status)
        if incoming_status
        else (STATUS_COMPLETED if playable_url else None)
    )

    with _state_lock:
        assets = _state.setdefault("playerGeneratedAssets", {})
        asset_id = _make_player_asset_id(card_id)
        existing = copy.deepcopy(assets.get(asset_id) or {})
        asset = existing or {
            "assetId": asset_id,
            "cardId": card_id,
            "sourceType": source_type,
            "status": STATUS_NOT_GENERATED,
            "name": None,
            "attrSet": [],
            "generation": 1,
            "themeText": None,
            "videoPrompt": None,
            "thumbnailUrl": None,
            "forgeTaskId": None,
            "videoTaskId": None,
            "pixverseVideoId": None,
            "providerStatus": None,
            "submitAttempts": 0,
            "pollCount": 0,
            "error": None,
            "resultUrl": None,
            "videoUrl": None,
            "createdAt": now,
            "updatedAt": now,
            "completedAt": None,
            "metadataPath": None,
            "assetDir": None,
        }

        asset["sourceType"] = source_type
        asset["name"] = _clean_text(card.get("name")) or asset.get("name")
        asset["attrSet"] = _normalize_attr_set(card.get("attrSet")) or asset.get("attrSet") or []
        asset["generation"] = int(card.get("generation") or asset.get("generation") or 1)
        asset["themeText"] = _clean_text(card.get("themeText")) or asset.get("themeText")
        asset["videoPrompt"] = _clean_text(card.get("videoPrompt")) or asset.get("videoPrompt")
        asset["thumbnailUrl"] = _clean_text(card.get("thumbnailUrl")) or asset.get("thumbnailUrl")
        asset["forgeTaskId"] = _clean_text(card.get("forgeTaskId")) or asset.get("forgeTaskId")
        asset["videoTaskId"] = _clean_text(card.get("videoTaskId")) or asset.get("videoTaskId")
        asset["pixverseVideoId"] = card.get("pixverseVideoId") or asset.get("pixverseVideoId")
        asset["providerStatus"] = (
            card.get("providerStatus")
            if card.get("providerStatus") is not None
            else asset.get("providerStatus")
        )
        asset["submitAttempts"] = int(card.get("submitAttempts") or asset.get("submitAttempts") or 0)
        asset["pollCount"] = int(card.get("pollCount") or asset.get("pollCount") or 0)
        if normalized_status:
            asset["status"] = normalized_status
        if playable_url:
            asset["resultUrl"] = playable_url
            asset["videoUrl"] = playable_url
            asset["status"] = STATUS_COMPLETED
            asset["completedAt"] = int(card.get("completedAt") or asset.get("completedAt") or now)
        incoming_error = _clean_text(card.get("error"))
        if incoming_error or asset.get("status") == STATUS_FAILED:
            asset["error"] = incoming_error or asset.get("error")
        elif asset.get("status") in {STATUS_GENERATING, STATUS_COMPLETED}:
            asset["error"] = None
        asset["updatedAt"] = int(card.get("updatedAt") or now)

        assets[asset_id] = asset
        _save_state_locked()
        return _copy_asset(asset)


def sync_card_asset_with_video_task(task: dict[str, Any]) -> dict[str, Any] | None:
    card_id = _clean_text(task.get("cardId"))
    if not card_id:
        return None

    now = _now_ms()
    with _state_lock:
        assets = _state.setdefault("playerGeneratedAssets", {})
        asset_id = _make_player_asset_id(card_id)
        asset = copy.deepcopy(assets.get(asset_id) or {})
        if not asset:
            asset = {
                "assetId": asset_id,
                "cardId": card_id,
                "sourceType": "player_generated",
                "status": STATUS_NOT_GENERATED,
                "name": task.get("promptSummary"),
                "attrSet": [],
                "generation": 1,
                "themeText": None,
                "videoPrompt": None,
                "thumbnailUrl": None,
                "forgeTaskId": task.get("forgeTaskId"),
                "videoTaskId": None,
                "pixverseVideoId": None,
                "providerStatus": None,
                "submitAttempts": 0,
                "pollCount": 0,
                "error": None,
                "resultUrl": None,
                "videoUrl": None,
                "createdAt": int(task.get("createdAt") or now),
                "updatedAt": int(task.get("updatedAt") or now),
                "completedAt": None,
                "metadataPath": None,
                "assetDir": None,
            }

        asset["forgeTaskId"] = _clean_text(task.get("forgeTaskId")) or asset.get("forgeTaskId")
        asset["videoTaskId"] = _clean_text(task.get("videoTaskId")) or asset.get("videoTaskId")
        asset["pixverseVideoId"] = task.get("pixverseVideoId")
        asset["providerStatus"] = task.get("providerStatus")
        asset["submitAttempts"] = int(task.get("submitAttempts") or 0)
        asset["pollCount"] = int(task.get("pollCount") or 0)
        asset["updatedAt"] = int(task.get("updatedAt") or now)

        task_status = _clean_text(task.get("status"))
        if task_status:
            asset["status"] = _normalize_status(task_status)

        if task.get("status") == "succeeded":
            result_url = _clean_text(task.get("resultUrl"))
            asset["status"] = STATUS_COMPLETED
            asset["resultUrl"] = result_url
            asset["videoUrl"] = result_url
            asset["error"] = None
            asset["completedAt"] = int(task.get("finishedAt") or now)
        elif task.get("status") == "failed":
            asset["status"] = STATUS_FAILED
            asset["error"] = _clean_text(task.get("error")) or _clean_text(task.get("providerErrMsg"))
        elif task.get("status") in {"queued", "submitting", "polling"}:
            asset["status"] = STATUS_GENERATING
            asset["error"] = None

        assets[asset_id] = asset
        _save_state_locked()
        return _copy_asset(asset)


def list_card_assets(*, source_type: str | None = None) -> list[dict[str, Any]]:
    normalized_source = _normalize_source_type(source_type, default="") if source_type else None
    static_assets = _scan_static_assets()
    player_assets = list_player_generated_assets()
    merged = static_assets + player_assets
    if normalized_source:
        merged = [asset for asset in merged if asset.get("sourceType") == normalized_source]
    merged.sort(key=lambda item: item.get("updatedAt", 0), reverse=True)
    return merged


def get_card_asset(asset_id: str) -> dict[str, Any] | None:
    asset_key = _clean_text(asset_id)
    if not asset_key:
        return None
    with _state_lock:
        player_asset = (_state.get("playerGeneratedAssets") or {}).get(asset_key)
        if player_asset is not None:
            return _copy_asset(player_asset)
    for asset in _scan_static_assets():
        if asset.get("assetId") == asset_key:
            return asset
    return None


def _scan_static_assets() -> list[dict[str, Any]]:
    if not STATIC_ASSET_DIR.exists():
        return []

    assets: list[dict[str, Any]] = []
    for metadata_path in sorted(STATIC_ASSET_DIR.rglob("metadata.json")):
        try:
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                continue
        except Exception as exc:
            logger.warning("card.asset_metadata_read_failed %s %s", metadata_path, exc)
            continue

        attr_set = _normalize_attr_set(payload.get("attrSet"))
        video_url = _clean_text(payload.get("videoUrl"))
        status = STATUS_COMPLETED if video_url else STATUS_NOT_GENERATED
        source_type = _normalize_source_type(payload.get("sourceType"), default="built_in")
        asset = {
            "assetId": _clean_text(payload.get("id")) or metadata_path.parent.name,
            "cardId": None,
            "forgeTaskId": None,
            "sourceType": source_type,
            "status": status,
            "name": _clean_text(payload.get("name")) or metadata_path.parent.name,
            "attrSet": attr_set,
            "generation": int(payload.get("generation") or 1),
            "themeText": _clean_text(payload.get("themeText")),
            "videoPrompt": None,
            "thumbnailUrl": _clean_text(payload.get("thumbnailUrl")),
            "videoTaskId": None,
            "pixverseVideoId": None,
            "providerStatus": 1 if video_url else None,
            "submitAttempts": 0,
            "pollCount": 0,
            "error": None,
            "resultUrl": video_url,
            "videoUrl": video_url,
            "createdAt": int(payload.get("createdAt") or 0),
            "updatedAt": int(payload.get("updatedAt") or 0),
            "completedAt": int(payload.get("completedAt") or 0) or None,
            "metadataPath": str(metadata_path.relative_to(BACKEND_DIR)).replace("\\", "/"),
            "assetDir": str(metadata_path.parent.relative_to(BACKEND_DIR)).replace("\\", "/"),
        }
        assets.append(asset)
    return assets
