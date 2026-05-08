from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Any, Optional

from .card_asset_service import (
    get_player_generated_asset_by_card,
    load_persisted_video_tasks,
    save_video_task,
    sync_card_asset_with_video_task,
)
from .forge_service import get_task_status
from .pixverse_client import PixVerseAPIError, PixVerseClient, new_trace_id, resolve_pixverse_config

logger = logging.getLogger("pixverse.service")

_video_tasks: dict[str, dict[str, Any]] = load_persisted_video_tasks()
_video_lock = threading.Lock()
_video_worker_lock = threading.Lock()
_active_video_workers: set[str] = set()


def _json_log(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))


def create_video_task_from_forge_task(forge_task_id: str) -> dict[str, Any]:
    forge_task = get_task_status(forge_task_id)
    if forge_task is None:
        raise ValueError("Forge task not found")
    if forge_task.get("status") != "completed" or not forge_task.get("result"):
        raise ValueError("Forge task is not completed yet")

    result = forge_task["result"]
    prompt = str(getattr(result, "videoPrompt", None) or "").strip()
    if not prompt:
        raise ValueError("Forge result has no videoPrompt")

    active = _find_active_task_by_forge(forge_task_id)
    if active is not None:
        logger.info(
            "pixverse.reuse_active_task %s",
            _json_log(
                {
                    "forgeTaskId": forge_task_id,
                    "videoTaskId": active["videoTaskId"],
                    "status": active["status"],
                }
            ),
        )
        return active

    prompt_summary = str(getattr(result, "name", None) or getattr(result, "themeText", None) or "").strip()
    return _create_video_task(
        prompt=prompt,
        forge_task_id=forge_task_id,
        card_id=None,
        prompt_summary=prompt_summary or "forge_result",
    )


def create_video_task_from_card(card_id: str) -> dict[str, Any]:
    asset = get_player_generated_asset_by_card(card_id)
    if asset is None:
        raise ValueError("Card video asset not registered yet")

    prompt = str(asset.get("videoPrompt") or "").strip()
    if not prompt:
        raise ValueError("Card video asset has no videoPrompt")

    existing = _find_reusable_task_by_card(card_id)
    if existing is not None:
        logger.info(
            "pixverse.reuse_card_task %s",
            _json_log(
                {
                    "cardId": card_id,
                    "videoTaskId": existing["videoTaskId"],
                    "status": existing["status"],
                }
            ),
        )
        return existing

    prompt_summary = str(asset.get("name") or asset.get("themeText") or "").strip()
    return _create_video_task(
        prompt=prompt,
        forge_task_id=str(asset.get("forgeTaskId") or "").strip() or None,
        card_id=card_id,
        prompt_summary=prompt_summary or "card_asset",
    )


def get_video_task(video_task_id: str) -> Optional[dict[str, Any]]:
    with _video_lock:
        task = _video_tasks.get(video_task_id)
        if task is None:
            return None
        return _clone_task(task)


def list_video_tasks(
    *,
    limit: int = 20,
    forge_task_id: str | None = None,
    card_id: str | None = None,
) -> list[dict[str, Any]]:
    with _video_lock:
        tasks = list(_video_tasks.values())

    if forge_task_id:
        tasks = [task for task in tasks if task.get("forgeTaskId") == forge_task_id]
    if card_id:
        tasks = [task for task in tasks if task.get("cardId") == card_id]

    tasks.sort(key=lambda item: item.get("createdAt", 0), reverse=True)
    return [_clone_task(task) for task in tasks[: max(1, limit)]]


def get_pixverse_config_snapshot() -> dict[str, Any]:
    config = resolve_pixverse_config()
    return config.summary()


def get_video_task_debug(video_task_id: str) -> Optional[dict[str, Any]]:
    task = get_video_task(video_task_id)
    if task is None:
        return None
    return {
        "task": task,
        "config": get_pixverse_config_snapshot(),
        "latestSubmitCall": task.get("latestSubmitCall"),
        "latestPollCall": task.get("latestPollCall"),
    }


def _create_video_task(
    *,
    prompt: str,
    forge_task_id: str | None,
    card_id: str | None,
    prompt_summary: str,
) -> dict[str, Any]:
    now = _now_ms()
    config = resolve_pixverse_config()
    video_task_id = f"vtask_{uuid.uuid4().hex[:12]}"
    task = {
        "videoTaskId": video_task_id,
        "cardId": card_id,
        "forgeTaskId": forge_task_id,
        "pixverseVideoId": None,
        "traceId": None,
        "lastPollTraceId": None,
        "status": "queued",
        "providerStatus": None,
        "providerErrCode": None,
        "providerErrMsg": None,
        "error": None,
        "resultUrl": None,
        "promptSummary": prompt_summary,
        "promptLength": len(prompt),
        "submitAttempts": 0,
        "pollCount": 0,
        "createdAt": now,
        "updatedAt": now,
        "finishedAt": None,
        "events": [],
        "configSnapshot": config.summary(),
        "latestSubmitCall": None,
        "latestPollCall": None,
        "_prompt": prompt,
    }

    with _video_lock:
        _video_tasks[video_task_id] = task
        _persist_task_locked(task)

    _append_event(
        video_task_id,
        kind="queued",
        message="PixVerse video task created from forge result",
    )
    logger.info(
        "pixverse.task_created %s",
        _json_log(
            {
                "videoTaskId": video_task_id,
                "cardId": card_id,
                "forgeTaskId": forge_task_id,
                "promptSummary": prompt_summary,
                "promptLength": len(prompt),
            }
        ),
    )

    _start_video_worker(video_task_id)
    return get_video_task(video_task_id) or {}


def _run_video_task(video_task_id: str) -> None:
    try:
        task = _get_internal_task(video_task_id)
        if task is None:
            return

        prompt = str(task.get("_prompt") or "")
        config = resolve_pixverse_config()
        if config.missing:
            reason = f"Missing PixVerse config: {', '.join(config.missing)}"
            _mark_failed(video_task_id, reason)
            return

        client = PixVerseClient(config)
        video_id = _to_int(task.get("pixverseVideoId"))

        if video_id is None:
            total_submit_attempts = 1 + max(0, int(config.max_retries))
            for attempt in range(1, total_submit_attempts + 1):
                trace_id = new_trace_id()
                _update_task(
                    video_task_id,
                    status="submitting",
                    traceId=trace_id,
                    submitAttempts=attempt,
                    error=None,
                    providerErrCode=None,
                    providerErrMsg=None,
                )
                _append_event(
                    video_task_id,
                    kind="submit_attempt",
                    message=f"Submit attempt {attempt}/{total_submit_attempts}",
                    trace_id=trace_id,
                )
                logger.info(
                    "pixverse.submit_attempt %s",
                    _json_log(
                        {
                            "videoTaskId": video_task_id,
                            "cardId": task.get("cardId"),
                            "forgeTaskId": task.get("forgeTaskId"),
                            "attempt": attempt,
                            "traceId": trace_id,
                            "model": config.model,
                            "quality": config.quality,
                            "aspectRatio": config.aspect_ratio,
                            "duration": config.duration_seconds,
                        }
                    ),
                )
                try:
                    call = client.generate_text_video(prompt=prompt, trace_id=trace_id)
                    resp = call.resp
                    video_id = _to_int(resp.get("video_id"))
                    if video_id is None:
                        raise PixVerseAPIError(
                            "PixVerse generate succeeded but Resp.video_id is missing",
                            response=resp,
                            diagnostic=call.diagnostic,
                        )

                    _update_task(
                        video_task_id,
                        status="polling",
                        pixverseVideoId=video_id,
                        providerStatus=5,
                        providerErrCode=0,
                        providerErrMsg="Success",
                        error=None,
                        latestSubmitCall=call.diagnostic,
                    )
                    _append_event(
                        video_task_id,
                        kind="submit_success",
                        message=f"PixVerse accepted request, video_id={video_id}",
                        trace_id=trace_id,
                        provider_status=5,
                        err_code=0,
                        err_msg="Success",
                    )
                    logger.info(
                        "pixverse.submit_success %s",
                        _json_log(
                            {
                                "videoTaskId": video_task_id,
                                "cardId": task.get("cardId"),
                                "forgeTaskId": task.get("forgeTaskId"),
                                "pixverseVideoId": video_id,
                                "traceId": trace_id,
                                "url": call.diagnostic.get("url"),
                                "requestHeaders": call.diagnostic.get("requestHeaders"),
                                "httpStatus": call.diagnostic.get("httpStatus"),
                                "providerErrCode": call.diagnostic.get("providerErrCode"),
                                "providerErrMsg": call.diagnostic.get("providerErrMsg"),
                                "responseSummary": call.diagnostic.get("responseSummary"),
                            }
                        ),
                    )
                    break
                except PixVerseAPIError as exc:
                    error_text = str(exc)
                    diagnostic = exc.diagnostic or {}
                    _update_task(
                        video_task_id,
                        providerErrCode=exc.err_code,
                        providerErrMsg=exc.err_msg,
                        error=error_text,
                        latestSubmitCall=diagnostic or None,
                    )
                    _append_event(
                        video_task_id,
                        kind="submit_failed",
                        message=error_text,
                        trace_id=trace_id,
                        err_code=exc.err_code,
                        err_msg=exc.err_msg,
                    )
                    logger.warning(
                        "pixverse.submit_failed %s",
                        _json_log(
                            {
                                "videoTaskId": video_task_id,
                                "attempt": attempt,
                                "traceId": trace_id,
                                "url": diagnostic.get("url"),
                                "requestHeaders": diagnostic.get("requestHeaders"),
                                "httpStatus": diagnostic.get("httpStatus"),
                                "errCode": exc.err_code,
                                "errMsg": exc.err_msg,
                                "error": error_text,
                                "responseSummary": diagnostic.get("responseSummary"),
                            }
                        ),
                    )
                    if attempt >= total_submit_attempts:
                        _mark_failed(video_task_id, f"PixVerse submit failed after {attempt} attempt(s): {error_text}")
                        return
                    time.sleep(1.0)

        if video_id is None:
            _mark_failed(video_task_id, "PixVerse submit did not return a usable video_id")
            return

        deadline = time.monotonic() + max(5.0, float(config.timeout_seconds))
        poll_interval = max(0.5, float(config.poll_interval_seconds))

        while time.monotonic() < deadline:
            time.sleep(poll_interval)
            poll_trace_id = new_trace_id()
            current = _get_internal_task(video_task_id)
            if current is None:
                return
            next_poll_count = int(current.get("pollCount") or 0) + 1
            _update_task(
                video_task_id,
                status="polling",
                lastPollTraceId=poll_trace_id,
                pollCount=next_poll_count,
            )
            try:
                call = client.get_video_result(video_id=video_id, trace_id=poll_trace_id)
                resp = call.resp
                provider_status = _to_int(resp.get("status"))
                result_url = str(resp.get("url") or "").strip() or None
                provider_err_msg = "Success"

                _update_task(
                    video_task_id,
                    providerStatus=provider_status,
                    providerErrCode=0,
                    providerErrMsg=provider_err_msg,
                    error=None,
                    latestPollCall=call.diagnostic,
                )
                _append_event(
                    video_task_id,
                    kind="poll_result",
                    message=f"Poll #{next_poll_count} returned status={provider_status}",
                    trace_id=poll_trace_id,
                    provider_status=provider_status,
                    err_code=0,
                    err_msg=provider_err_msg,
                )
                logger.info(
                    "pixverse.poll_result %s",
                    _json_log(
                        {
                            "videoTaskId": video_task_id,
                            "pixverseVideoId": video_id,
                            "pollCount": next_poll_count,
                            "traceId": poll_trace_id,
                            "url": call.diagnostic.get("url"),
                            "requestHeaders": call.diagnostic.get("requestHeaders"),
                            "httpStatus": call.diagnostic.get("httpStatus"),
                            "providerStatus": provider_status,
                            "providerErrCode": call.diagnostic.get("providerErrCode"),
                            "providerErrMsg": call.diagnostic.get("providerErrMsg"),
                            "hasUrl": bool(result_url),
                            "responseSummary": call.diagnostic.get("responseSummary"),
                        }
                    ),
                )

                if provider_status == 1:
                    if not result_url:
                        _mark_failed(video_task_id, "PixVerse returned status=1 but Resp.url is empty")
                        return
                    _update_task(
                        video_task_id,
                        status="succeeded",
                        resultUrl=result_url,
                        finishedAt=_now_ms(),
                    )
                    _append_event(
                        video_task_id,
                        kind="completed",
                        message="PixVerse task completed and MP4 URL is ready",
                        trace_id=poll_trace_id,
                        provider_status=provider_status,
                        err_code=0,
                        err_msg=provider_err_msg,
                    )
                    logger.info(
                        "pixverse.task_completed %s",
                        _json_log(
                            {
                                "videoTaskId": video_task_id,
                                "pixverseVideoId": video_id,
                                "traceId": poll_trace_id,
                                "resultUrl": result_url,
                            }
                        ),
                    )
                    return

                if provider_status == 5:
                    continue

                if provider_status == 7:
                    _mark_failed(video_task_id, "PixVerse审核未通过 (status=7)")
                    return

                if provider_status == 8:
                    _mark_failed(video_task_id, "PixVerse生成失败 (status=8)")
                    return

                _mark_failed(video_task_id, f"PixVerse returned unexpected status={provider_status}")
                return
            except PixVerseAPIError as exc:
                error_text = str(exc)
                diagnostic = exc.diagnostic or {}
                _update_task(
                    video_task_id,
                    providerErrCode=exc.err_code,
                    providerErrMsg=exc.err_msg,
                    error=error_text,
                    latestPollCall=diagnostic or None,
                )
                _append_event(
                    video_task_id,
                    kind="poll_error",
                    message=error_text,
                    trace_id=poll_trace_id,
                    err_code=exc.err_code,
                    err_msg=exc.err_msg,
                )
                logger.warning(
                    "pixverse.poll_error %s",
                    _json_log(
                        {
                            "videoTaskId": video_task_id,
                            "pixverseVideoId": video_id,
                            "pollCount": next_poll_count,
                            "traceId": poll_trace_id,
                            "url": diagnostic.get("url"),
                            "requestHeaders": diagnostic.get("requestHeaders"),
                            "httpStatus": diagnostic.get("httpStatus"),
                            "errCode": exc.err_code,
                            "errMsg": exc.err_msg,
                            "error": error_text,
                            "responseSummary": diagnostic.get("responseSummary"),
                        }
                    ),
                )
            except Exception as exc:
                error_text = f"Unexpected poll error: {exc}"
                _update_task(video_task_id, error=error_text)
                _append_event(
                    video_task_id,
                    kind="poll_error",
                    message=error_text,
                    trace_id=poll_trace_id,
                )
                logger.warning(
                    "pixverse.poll_error %s",
                    _json_log(
                        {
                            "videoTaskId": video_task_id,
                            "pixverseVideoId": video_id,
                            "pollCount": next_poll_count,
                            "traceId": poll_trace_id,
                            "error": error_text,
                        }
                    ),
                )

        _mark_failed(video_task_id, f"PixVerse timed out after {config.timeout_seconds:.0f}s without a terminal status")
    finally:
        with _video_worker_lock:
            _active_video_workers.discard(video_task_id)


def _find_active_task_by_forge(forge_task_id: str) -> Optional[dict[str, Any]]:
    with _video_lock:
        for task in _video_tasks.values():
            if task.get("forgeTaskId") != forge_task_id:
                continue
            if task.get("status") in {"queued", "submitting", "polling"}:
                return _clone_task(task)
    return None


def _find_reusable_task_by_card(card_id: str) -> Optional[dict[str, Any]]:
    with _video_lock:
        tasks = list(_video_tasks.values())

    active_statuses = {"queued", "submitting", "polling"}
    completed_task: dict[str, Any] | None = None
    for task in tasks:
        if task.get("cardId") != card_id:
            continue
        if task.get("status") in active_statuses:
            return _clone_task(task)
        if task.get("status") == "succeeded" and task.get("resultUrl"):
            completed_task = task
    return _clone_task(completed_task) if completed_task else None


def _get_internal_task(video_task_id: str) -> Optional[dict[str, Any]]:
    with _video_lock:
        return _video_tasks.get(video_task_id)


def _update_task(video_task_id: str, **updates: Any) -> None:
    with _video_lock:
        task = _video_tasks.get(video_task_id)
        if task is None:
            return
        task.update(updates)
        task["updatedAt"] = _now_ms()
        _persist_task_locked(task)


def _append_event(
    video_task_id: str,
    *,
    kind: str,
    message: str,
    trace_id: str | None = None,
    provider_status: int | None = None,
    err_code: int | None = None,
    err_msg: str | None = None,
) -> None:
    with _video_lock:
        task = _video_tasks.get(video_task_id)
        if task is None:
            return
        events = list(task.get("events") or [])
        events.append(
            {
                "at": _now_ms(),
                "kind": kind,
                "message": message,
                "traceId": trace_id,
                "providerStatus": provider_status,
                "errCode": err_code,
                "errMsg": err_msg,
            }
        )
        task["events"] = events[-20:]
        task["updatedAt"] = _now_ms()
        _persist_task_locked(task)


def _mark_failed(video_task_id: str, reason: str) -> None:
    current = _get_internal_task(video_task_id)
    provider_status = current.get("providerStatus") if current else None
    _update_task(
        video_task_id,
        status="failed",
        error=reason,
        finishedAt=_now_ms(),
    )
    _append_event(
        video_task_id,
        kind="failed",
        message=reason,
        provider_status=provider_status,
    )
    logger.warning(
        "pixverse.task_failed %s",
        _json_log(
            {
                "videoTaskId": video_task_id,
                "providerStatus": provider_status,
                "error": reason,
            }
        ),
    )


def _clone_task(task: dict[str, Any]) -> dict[str, Any]:
    cloned = dict(task)
    cloned.pop("_prompt", None)
    cloned.pop("configSnapshot", None)
    cloned["events"] = [dict(event) for event in list(task.get("events") or [])]
    return cloned


def _persist_task_locked(task: dict[str, Any]) -> None:
    save_video_task(task)
    sync_card_asset_with_video_task(task)


def _start_video_worker(video_task_id: str) -> None:
    with _video_worker_lock:
        if video_task_id in _active_video_workers:
            return
        _active_video_workers.add(video_task_id)
    thread = threading.Thread(target=_run_video_task, args=(video_task_id,), daemon=True)
    thread.start()


def _to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _now_ms() -> int:
    return int(time.time() * 1000)


def _resume_pending_video_tasks() -> None:
    with _video_lock:
        pending_ids = [
            task_id
            for task_id, task in _video_tasks.items()
            if task.get("status") in {"queued", "submitting", "polling"}
        ]
    for task_id in pending_ids:
        _start_video_worker(task_id)


_resume_pending_video_tasks()
