from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
from alchemy_glyph_router.env_config import ensure_repo_env_loaded

logger = logging.getLogger("pixverse.client")

DEFAULT_PIXVERSE_BASE_URL = "https://app-api.pixverseai.cn/openapi/v2"


class PixVerseAPIError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        err_code: int | None = None,
        err_msg: str | None = None,
        response: Any = None,
        status_code: int | None = None,
        diagnostic: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.err_code = err_code
        self.err_msg = err_msg
        self.response = response
        self.status_code = status_code
        self.diagnostic = diagnostic


@dataclass(frozen=True)
class PixVerseCallResult:
    resp: dict[str, Any]
    diagnostic: dict[str, Any]


@dataclass(frozen=True)
class PixVerseConfig:
    base_url: str
    api_key: str | None
    model: str
    quality: str
    aspect_ratio: str
    duration_seconds: int
    water_mark: bool
    seed: int
    generate_audio_switch: bool
    max_retries: int
    poll_interval_seconds: float
    timeout_seconds: float
    missing: tuple[str, ...] = ()
    field_sources: dict[str, str] = field(default_factory=dict)

    def api_key_hint(self) -> str | None:
        text = str(self.api_key or "").strip()
        if not text:
            return None
        if len(text) <= 8:
            return "*" * len(text)
        return f"{text[:4]}...{text[-4:]}"

    def request_timeout_seconds(self) -> float:
        return min(max(self.timeout_seconds, 10.0), 30.0)

    def summary(self) -> dict[str, Any]:
        return {
            "configSource": "backend/.env",
            "baseUrl": self.base_url,
            "submitUrl": self.submit_url(),
            "resultUrlTemplate": self.result_url_template(),
            "apiKeyHint": self.api_key_hint(),
            "model": self.model,
            "quality": self.quality,
            "aspectRatio": self.aspect_ratio,
            "durationSeconds": self.duration_seconds,
            "waterMark": self.water_mark,
            "seed": self.seed,
            "generateAudioSwitch": self.generate_audio_switch,
            "maxRetries": self.max_retries,
            "pollIntervalSeconds": self.poll_interval_seconds,
            "timeoutSeconds": self.timeout_seconds,
            "missing": list(self.missing),
            "fieldSources": dict(self.field_sources),
        }

    def submit_url(self) -> str:
        return f"{self.base_url}/video/text/generate"

    def result_url_template(self) -> str:
        return f"{self.base_url}/video/result/{{video_id}}"


def resolve_pixverse_config() -> PixVerseConfig:
    ensure_repo_env_loaded()

    base_url = _clean(os.getenv("PIXVERSE_BASE_URL")) or DEFAULT_PIXVERSE_BASE_URL
    api_key = _clean(os.getenv("PIXVERSE_API_KEY"))
    model = _clean(os.getenv("PIXVERSE_MODEL")) or "c1"
    quality = _clean(os.getenv("PIXVERSE_QUALITY")) or "360p"
    aspect_ratio = _clean(os.getenv("PIXVERSE_ASPECT_RATIO")) or "1:1"
    duration_seconds = _parse_int(os.getenv("PIXVERSE_DURATION_SECONDS"), 1)
    water_mark = _parse_bool(os.getenv("PIXVERSE_WATERMARK"), False)
    seed = _parse_int(os.getenv("PIXVERSE_SEED"), 1320994540)
    generate_audio_switch = _parse_bool(os.getenv("PIXVERSE_GENERATE_AUDIO_SWITCH"), True)
    max_retries = _parse_int(os.getenv("PIXVERSE_MAX_RETRIES"), 1)
    poll_interval_seconds = _parse_float(os.getenv("PIXVERSE_POLL_INTERVAL_SECONDS"), 5.0)
    timeout_seconds = _parse_float(os.getenv("PIXVERSE_TIMEOUT_SECONDS"), 120.0)

    missing = tuple(name for name, value in (("PIXVERSE_API_KEY", api_key),) if not value)
    field_sources = {
        "base_url": "PIXVERSE_BASE_URL" if _clean(os.getenv("PIXVERSE_BASE_URL")) else f"default:{DEFAULT_PIXVERSE_BASE_URL}",
        "api_key": "PIXVERSE_API_KEY",
        "model": "PIXVERSE_MODEL" if _clean(os.getenv("PIXVERSE_MODEL")) else "default:c1",
        "quality": "PIXVERSE_QUALITY" if _clean(os.getenv("PIXVERSE_QUALITY")) else "default:360p",
        "aspect_ratio": "PIXVERSE_ASPECT_RATIO" if _clean(os.getenv("PIXVERSE_ASPECT_RATIO")) else "default:1:1",
        "duration_seconds": "PIXVERSE_DURATION_SECONDS" if _clean(os.getenv("PIXVERSE_DURATION_SECONDS")) else "default:1",
        "water_mark": "PIXVERSE_WATERMARK" if _clean(os.getenv("PIXVERSE_WATERMARK")) else "default:false",
        "seed": "PIXVERSE_SEED" if _clean(os.getenv("PIXVERSE_SEED")) else "default:1320994540",
        "generate_audio_switch": (
            "PIXVERSE_GENERATE_AUDIO_SWITCH"
            if _clean(os.getenv("PIXVERSE_GENERATE_AUDIO_SWITCH"))
            else "default:true"
        ),
        "max_retries": "PIXVERSE_MAX_RETRIES" if _clean(os.getenv("PIXVERSE_MAX_RETRIES")) else "default:1",
        "poll_interval_seconds": (
            "PIXVERSE_POLL_INTERVAL_SECONDS"
            if _clean(os.getenv("PIXVERSE_POLL_INTERVAL_SECONDS"))
            else "default:5"
        ),
        "timeout_seconds": "PIXVERSE_TIMEOUT_SECONDS" if _clean(os.getenv("PIXVERSE_TIMEOUT_SECONDS")) else "default:120",
    }

    return PixVerseConfig(
        base_url=base_url.rstrip("/"),
        api_key=api_key,
        model=model,
        quality=quality,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration_seconds,
        water_mark=water_mark,
        seed=seed,
        generate_audio_switch=generate_audio_switch,
        max_retries=max_retries,
        poll_interval_seconds=poll_interval_seconds,
        timeout_seconds=timeout_seconds,
        missing=missing,
        field_sources=field_sources,
    )


def new_trace_id() -> str:
    return str(uuid.uuid4())


class PixVerseClient:
    def __init__(self, config: PixVerseConfig | None = None) -> None:
        self.config = config or resolve_pixverse_config()

    def generate_text_video(self, *, prompt: str, trace_id: str) -> PixVerseCallResult:
        payload = {
            "aspect_ratio": self.config.aspect_ratio,
            "duration": self.config.duration_seconds,
            "model": self.config.model,
            "prompt": prompt,
            "quality": self.config.quality,
            "seed": self.config.seed,
            "water_mark": self.config.water_mark,
            "generate_audio_switch": self.config.generate_audio_switch,
        }
        return self._request(
            "POST",
            "/video/text/generate",
            phase="submit",
            trace_id=trace_id,
            payload=payload,
            request_summary={
                "model": self.config.model,
                "quality": self.config.quality,
                "aspectRatio": self.config.aspect_ratio,
                "durationSeconds": self.config.duration_seconds,
                "waterMark": self.config.water_mark,
                "seed": self.config.seed,
                "generateAudioSwitch": self.config.generate_audio_switch,
                "promptLength": len(prompt),
            },
        )

    def get_video_result(self, *, video_id: int, trace_id: str) -> PixVerseCallResult:
        return self._request(
            "GET",
            f"/video/result/{video_id}",
            phase="poll",
            trace_id=trace_id,
            payload=None,
            request_summary={"videoId": video_id},
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        phase: str,
        trace_id: str,
        payload: dict[str, Any] | None,
        request_summary: dict[str, Any] | None = None,
    ) -> PixVerseCallResult:
        url = f"{self.config.base_url}{path}"
        headers = self._build_headers(trace_id=trace_id, has_json_body=payload is not None)
        request_kwargs: dict[str, Any] = {
            "headers": headers,
            "timeout": self.config.request_timeout_seconds(),
        }
        if payload is not None:
            request_kwargs["json"] = payload

        diagnostic = {
            "at": _now_ms(),
            "phase": phase,
            "method": method.upper(),
            "url": url,
            "traceId": trace_id,
            "requestHeaders": self._mask_headers(headers),
            "requestSummary": dict(request_summary or {}),
            "httpStatus": None,
            "providerErrCode": None,
            "providerErrMsg": None,
            "providerStatus": None,
            "responseSummary": {},
        }

        try:
            response = httpx.request(method, url, **request_kwargs)
            diagnostic["httpStatus"] = response.status_code
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = _safe_json(exc.response)
            err_code = _coerce_int((body or {}).get("ErrCode"))
            err_msg = str((body or {}).get("ErrMsg") or exc.response.text[:200]).strip() or None
            diagnostic["httpStatus"] = exc.response.status_code
            diagnostic["providerErrCode"] = err_code
            diagnostic["providerErrMsg"] = err_msg
            diagnostic["responseSummary"] = _summarize_provider_body(body, exc.response.text)
            raise PixVerseAPIError(
                f"PixVerse HTTP {exc.response.status_code}: {err_msg or 'request failed'}",
                err_code=err_code,
                err_msg=err_msg,
                response=body,
                status_code=exc.response.status_code,
                diagnostic=diagnostic,
            ) from exc
        except httpx.RequestError as exc:
            diagnostic["responseSummary"] = {"requestError": str(exc)}
            raise PixVerseAPIError(
                f"PixVerse request error: {exc}",
                diagnostic=diagnostic,
            ) from exc

        body = _safe_json(response)
        if not isinstance(body, dict):
            diagnostic["responseSummary"] = {"rawTextPreview": response.text[:200]}
            raise PixVerseAPIError(
                "PixVerse returned a non-JSON response",
                status_code=response.status_code,
                diagnostic=diagnostic,
            )

        err_code = _coerce_int(body.get("ErrCode"))
        err_msg = str(body.get("ErrMsg") or "").strip() or None
        diagnostic["providerErrCode"] = err_code
        diagnostic["providerErrMsg"] = err_msg
        if err_code != 0:
            diagnostic["responseSummary"] = _summarize_provider_body(body, response.text)
            raise PixVerseAPIError(
                f"PixVerse ErrCode={err_code}: {err_msg or 'unknown error'}",
                err_code=err_code,
                err_msg=err_msg,
                response=body,
                status_code=response.status_code,
                diagnostic=diagnostic,
            )

        resp = body.get("Resp")
        if not isinstance(resp, dict):
            diagnostic["responseSummary"] = _summarize_provider_body(body, response.text)
            raise PixVerseAPIError(
                "PixVerse response missing Resp object",
                err_code=err_code,
                err_msg=err_msg,
                response=body,
                status_code=response.status_code,
                diagnostic=diagnostic,
            )

        diagnostic["providerStatus"] = _coerce_int(resp.get("status"))
        diagnostic["responseSummary"] = _summarize_provider_body(body, response.text)

        logger.debug(
            "pixverse.http_ok %s",
            json.dumps(
                {
                    "method": method,
                    "path": path,
                    "traceId": trace_id,
                    "keys": sorted(resp.keys()),
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )
        return PixVerseCallResult(resp=resp, diagnostic=diagnostic)

    def _build_headers(self, *, trace_id: str, has_json_body: bool) -> dict[str, str]:
        headers = {
            "API-KEY": str(self.config.api_key or ""),
            "Ai-trace-id": trace_id,
        }
        if has_json_body:
            headers["Content-Type"] = "application/json"
        return headers

    def _mask_headers(self, headers: dict[str, str]) -> dict[str, str]:
        masked = {}
        for key, value in headers.items():
            if key.upper() == "API-KEY":
                masked[key] = self.config.api_key_hint() or ""
            else:
                masked[key] = value
        return masked


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


def _summarize_provider_body(body: Any, raw_text: str | None) -> dict[str, Any]:
    if isinstance(body, dict):
        resp = body.get("Resp")
        summary: dict[str, Any] = {
            "topLevelKeys": sorted(body.keys()),
            "ErrCode": _coerce_int(body.get("ErrCode")),
            "ErrMsg": str(body.get("ErrMsg") or "").strip() or None,
        }
        if isinstance(resp, dict):
            summary["respKeys"] = sorted(resp.keys())
            if "video_id" in resp:
                summary["videoId"] = _coerce_int(resp.get("video_id"))
            if "id" in resp:
                summary["resultId"] = _coerce_int(resp.get("id"))
            if "status" in resp:
                summary["providerStatus"] = _coerce_int(resp.get("status"))
            if "url" in resp:
                summary["hasUrl"] = bool(str(resp.get("url") or "").strip())
        return summary

    return {"rawTextPreview": str(raw_text or "")[:200]}


def _coerce_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _clean(value: str | None) -> str | None:
    text = str(value or "").strip()
    return text or None


def _parse_bool(raw: str | None, default: bool) -> bool:
    text = str(raw or "").strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


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


def _now_ms() -> int:
    return int(time.time() * 1000)
