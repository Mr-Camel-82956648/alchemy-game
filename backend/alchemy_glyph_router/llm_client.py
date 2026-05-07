from __future__ import annotations

import logging
from typing import Any

import requests

from config import Settings

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        url = f"{self.settings.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self.settings.model,
            "messages": messages,
            "temperature": temperature,
        }

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=self.settings.timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
            return _extract_content(data)
        except requests.Timeout as exc:
            logger.error(
                "llm_request_timeout model=%s timeout_seconds=%s error=%s",
                self.settings.model,
                self.settings.timeout_seconds,
                exc,
            )
            raise RuntimeError(f"llm_timeout:{exc}") from exc
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else "unknown"
            body_snippet = ""
            if exc.response is not None and exc.response.text:
                body_snippet = exc.response.text.strip().replace("\n", " ")[:200]
            logger.error(
                "llm_request_http_error model=%s status=%s body=%s",
                self.settings.model,
                status_code,
                body_snippet,
            )
            raise RuntimeError(f"llm_http_error status={status_code} body={body_snippet}") from exc
        except requests.RequestException as exc:
            logger.error("llm_request_error model=%s error=%s", self.settings.model, exc)
            raise RuntimeError(f"llm_request_error:{exc}") from exc
        except ValueError as exc:
            logger.error("llm_response_error model=%s error=%s", self.settings.model, exc)
            raise RuntimeError(f"llm_response_error:{exc}") from exc


def _extract_content(data: dict[str, Any]) -> str:
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("invalid_llm_response") from exc

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(item.get("text", ""))
        joined = "".join(text_parts).strip()
        if joined:
            return joined

    raise ValueError("empty_llm_content")
