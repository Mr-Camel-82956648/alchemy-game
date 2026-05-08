import json
import logging
from pathlib import Path
from typing import Any, Iterable, Optional

import httpx
from alchemy_glyph_router.env_config import (
    resolve_forge_fallback_llm_config,
    resolve_forge_llm_config,
    resolve_glyph_router_llm_config,
)

logger = logging.getLogger("forge.llm")

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts" / "forge"


def _load_prompt_text(filename: str, fallback: str) -> str:
    path = PROMPTS_DIR / filename
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        logger.warning("prompt file missing, using fallback: %s", path)
        return fallback


SYSTEM_PROMPT = _load_prompt_text(
    "system_prompt.txt",
    (
        "你是炼金炉语义解释器。"
        "请严格输出 JSON，字段只包含 name、attrSet、themeText。"
    ),
)

USER_PROMPT_TEMPLATE = _load_prompt_text(
    "user_prompt.txt",
    (
        "输入状态：{input_state}\n"
        "允许属性：{allowed_attrs}\n"
        "输入 JSON：\n{inputs_json}"
    ),
)


def call_forge_semantic_llm(
    *,
    input_state: str,
    spell_a: Optional[dict],
    spell_b: Optional[dict],
) -> Optional[dict]:
    primary_config = resolve_forge_llm_config()
    backup_config = resolve_forge_fallback_llm_config()
    timeout = int(primary_config.timeout_seconds)
    max_retries = int(primary_config.max_retries or 1)
    primary_provider = primary_config.provider
    user_prompt = _build_user_prompt(input_state=input_state, spell_a=spell_a, spell_b=spell_b)

    print(f"  [LLM] Primary provider selected: {primary_provider}")
    print(
        "  [LLM] Runtime config: "
        f"family={primary_config.source_family}, "
        f"model={primary_config.model}, "
        f"base_url={primary_config.base_url or '-'}, "
        f"api_key={primary_config.api_key_hint() or '-'}, "
        f"sources={primary_config.field_sources}, "
        f"env_files={list(primary_config.env_files_loaded) or ['process_env_only']}"
    )
    print(
        "  [LLM] Fallback config: "
        f"provider={backup_config.provider}, "
        f"family={backup_config.source_family}, "
        f"model={backup_config.model}, "
        f"base_url={backup_config.base_url or '-'}, "
        f"api_key={backup_config.api_key_hint() or '-'}"
    )

    if primary_provider == "openai_compat":
        result = _call_openai_compat(user_prompt, timeout, max_retries, primary_config)
        if result:
            print("  [LLM] Primary provider success: openai_compat")
            return result

        print("  [LLM] Primary provider failed: openai_compat")
        print("  [LLM] Switching to backup provider: gemini_rest")
        backup_result = _call_gemini_rest(user_prompt, timeout, max_retries, backup_config)
        if backup_result:
            print("  [LLM] Backup provider success: gemini_rest")
            return backup_result
        print("  [LLM] Backup provider failed: gemini_rest")
        return None

    if primary_provider != "gemini_rest":
        print(f"  [LLM] Unknown primary provider '{primary_provider}', falling back to gemini_rest as primary")

    result = _call_gemini_rest(user_prompt, timeout, max_retries, primary_config)
    if result:
        print("  [LLM] Primary provider success: gemini_rest")
        return result

    print("  [LLM] Primary provider failed: gemini_rest")
    print("  [LLM] Switching to backup provider: openai_compat")

    backup_result = _call_openai_compat(
        user_prompt,
        timeout,
        max_retries,
        backup_config,
    )
    if backup_result:
        print("  [LLM] Backup provider success: openai_compat")
        return backup_result

    print("  [LLM] Backup provider failed: openai_compat")
    return None


def _build_user_prompt(*, input_state: str, spell_a: Optional[dict], spell_b: Optional[dict]) -> str:
    return USER_PROMPT_TEMPLATE.format(
        input_state=input_state,
        allowed_attrs="fire, ice, thunder, blight",
        inputs_json=json.dumps(
            {
                "inputState": input_state,
                "slotA": _serialize_spell_input(spell_a),
                "slotB": _serialize_spell_input(spell_b),
            },
            ensure_ascii=False,
            indent=2,
        ),
    )


def _serialize_spell_input(spell: Optional[dict]) -> Optional[dict[str, Any]]:
    if spell is None:
        return None
    return {
        "slot": spell.get("slot"),
        "type": spell.get("type") or "spell",
        "name": spell.get("name") or "",
        "attrSet": list(spell.get("attr_set") or []),
        "themeText": spell.get("theme_text") or "",
        "generation": spell.get("generation") or 1,
    }


def _extract_json_text(text: str) -> str:
    text = str(text or "").strip()
    if not text:
        raise json.JSONDecodeError("empty response", text, 0)

    if text.startswith("```"):
        lines = text.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]

    return text


def _extract_openai_message_text(message: Any) -> str:
    if isinstance(message, str):
        return message

    if isinstance(message, list):
        parts = []
        for item in message:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts).strip()

    return str(message or "").strip()


def _validate(raw: Any) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None

    name = str(raw.get("name") or "").strip()
    theme_text = str(raw.get("themeText") or "").strip()
    attr_set = _coerce_attr_set(raw.get("attrSet"))

    if not name:
        print("  [LLM] VALIDATE FAIL: missing name")
        return None

    return {
        "name": name[:20],
        "attrSet": attr_set[:3],
        "themeText": theme_text[:400] if theme_text else "",
    }


def _coerce_attr_set(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        return [
            token.strip()
            for token in text.replace("，", ",").replace("、", ",").split(",")
            if token.strip()
        ]
    if isinstance(value, Iterable):
        result = []
        for item in value:
            token = str(item or "").strip()
            if token:
                result.append(token)
        return result
    return []


def _log_location_restriction(provider_name: str, error_text: str):
    text = str(error_text or "")
    lowered = text.lower()
    if "user location is not supported for the api use" in lowered or "location is not supported" in lowered:
        print(f"  [LLM] {provider_name} availability issue: request appears blocked by network/region restrictions")


def _call_gemini_rest(user_prompt: str, timeout: int, max_retries: int, config):
    api_key = config.api_key or ""
    model = config.model or "gemini-2.0-flash"

    if not api_key:
        print("  [LLM] Gemini skipped: GEMINI_API_KEY not set")
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": [{
            "role": "user",
            "parts": [{"text": user_prompt}]
        }],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
        },
    }

    total_attempts = 1 + max_retries
    for attempt in range(total_attempts):
        try:
            print(f"  [LLM] Gemini request attempt {attempt + 1}/{total_attempts}  model={model}")
            resp = httpx.post(url, json=payload, timeout=timeout)
            resp.raise_for_status()

            body = resp.json()
            text = body["candidates"][0]["content"]["parts"][0]["text"]
            print(f"  [LLM] Gemini raw response: {text[:300]}")

            raw = json.loads(_extract_json_text(text))
            validated = _validate(raw)
            if validated:
                print(f"  [LLM] Gemini validation OK: name={validated['name']}")
                return validated

            print("  [LLM] Gemini validation FAILED for parsed JSON")
        except httpx.HTTPStatusError as exc:
            error_text = exc.response.text[:200]
            print(f"  [LLM] Gemini HTTP error (attempt {attempt + 1}): {exc.response.status_code} - {error_text}")
            _log_location_restriction("Gemini", error_text)
        except (json.JSONDecodeError, KeyError, IndexError) as exc:
            print(f"  [LLM] Gemini parse error (attempt {attempt + 1}): {exc}")
        except Exception as exc:
            print(f"  [LLM] Gemini call error (attempt {attempt + 1}): {exc}")

    return None


def _call_openai_compat(user_prompt: str, timeout: int, max_retries: int, config):
    if config.provider != "openai_compat":
        config = resolve_glyph_router_llm_config()

    base_url = (config.base_url or "").rstrip("/")
    api_key = config.api_key or ""
    model = config.model or ""

    if not base_url or not api_key or not model:
        print(
            "  [LLM] OpenAI-compatible backup skipped: "
            f"missing {', '.join(config.missing or ('LLM_BASE_URL', 'LLM_API_KEY', 'OPENAI_COMPAT_MODEL'))}"
        )
        return None

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.4,
    }

    total_attempts = 1 + max_retries
    for attempt in range(total_attempts):
        try:
            print(f"  [LLM] OpenAI-compatible request attempt {attempt + 1}/{total_attempts}  model={model}")
            resp = httpx.post(url, headers=headers, json=payload, timeout=timeout)
            resp.raise_for_status()

            body = resp.json()
            message = body["choices"][0]["message"]["content"]
            text = _extract_openai_message_text(message)
            print(f"  [LLM] OpenAI-compatible raw response: {text[:300]}")

            raw = json.loads(_extract_json_text(text))
            validated = _validate(raw)
            if validated:
                print(f"  [LLM] OpenAI-compatible validation OK: name={validated['name']}")
                return validated

            print("  [LLM] OpenAI-compatible validation FAILED for parsed JSON")
        except httpx.HTTPStatusError as exc:
            error_text = exc.response.text[:200]
            print(f"  [LLM] OpenAI-compatible HTTP error (attempt {attempt + 1}): {exc.response.status_code} - {error_text}")
            _log_location_restriction("OpenAI-compatible", error_text)
        except (json.JSONDecodeError, KeyError, IndexError) as exc:
            print(f"  [LLM] OpenAI-compatible parse error (attempt {attempt + 1}): {exc}")
        except Exception as exc:
            print(f"  [LLM] OpenAI-compatible call error (attempt {attempt + 1}): {exc}")

    return None
