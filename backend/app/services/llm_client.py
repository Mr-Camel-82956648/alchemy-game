import json
import logging
import os
from pathlib import Path

import httpx

logger = logging.getLogger("forge.llm")

VALID_ELEMENTS = {"fire", "ice", "thunder", "blight"}
ELEMENT_ALIASES = {
    "fire": "fire",
    "flame": "fire",
    "blaze": "fire",
    "inferno": "fire",
    "ember": "fire",
    "火": "fire",
    "炎": "fire",
    "烈焰": "fire",
    "ice": "ice",
    "frost": "ice",
    "snow": "ice",
    "cold": "ice",
    "冰": "ice",
    "霜": "ice",
    "寒": "ice",
    "寒冰": "ice",
    "冰霜": "ice",
    "thunder": "thunder",
    "lightning": "thunder",
    "electric": "thunder",
    "electricity": "thunder",
    "雷": "thunder",
    "电": "thunder",
    "雷电": "thunder",
    "blight": "blight",
    "poison": "blight",
    "toxic": "blight",
    "venom": "blight",
    "decay": "blight",
    "腐蚀": "blight",
    "侵蚀": "blight",
    "枯萎": "blight",
    "瘴": "blight",
    "瘴毒": "blight",
    "毒": "blight",
    "蛊": "blight",
}

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts" / "forge"


def _load_prompt_text(filename, fallback):
    path = PROMPTS_DIR / filename
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        logger.warning("prompt file missing, using fallback: %s", path)
        return fallback


SYSTEM_PROMPT = _load_prompt_text(
    "system_prompt.txt",
    (
        "你是法阵融合引擎。请严格输出 JSON，字段包含 "
        "name/mainAttr/subAttr/visualDesc/fusionPrompt，元素只允许 fire/ice/thunder/blight。"
    ),
)

USER_PROMPT_TEMPLATE = _load_prompt_text(
    "user_prompt.txt",
    (
        "请融合以下两个父法阵，输出严格 JSON：\n"
        "父法阵 A：{spell_a_name} / {spell_a_attr} / Gen {spell_a_gen}\n"
        "父法阵 B：{spell_b_name} / {spell_b_attr} / Gen {spell_b_gen}"
    ),
)


def _build_user_prompt(spell_a_name, spell_a_attr, spell_a_gen,
                       spell_b_name, spell_b_attr, spell_b_gen):
    return USER_PROMPT_TEMPLATE.format(
        spell_a_name=spell_a_name,
        spell_a_attr=spell_a_attr or "未知",
        spell_a_gen=spell_a_gen,
        spell_b_name=spell_b_name,
        spell_b_attr=spell_b_attr or "未知",
        spell_b_gen=spell_b_gen,
    )


def _normalize_element(value):
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    compact = text.replace(" ", "").replace("_", "").replace("-", "").lower()
    if compact.endswith("属性"):
        compact = compact[:-2]

    return ELEMENT_ALIASES.get(compact, compact)


def _extract_json_text(text):
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
        return text[start:end + 1]

    return text


def _extract_openai_message_text(message):
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


def _validate(raw):
    """校验并规范化 LLM 返回的 JSON，返回 dict 或 None。"""
    if not isinstance(raw, dict):
        return None

    name = raw.get("name")
    main_attr = raw.get("mainAttr") or raw.get("element")
    sub_attr = raw.get("subAttr")
    visual_desc = raw.get("visualDesc", "")
    fusion_prompt = raw.get("fusionPrompt", "")

    if not name or not main_attr:
        print(f"  [LLM] VALIDATE FAIL: missing name={name} or mainAttr={main_attr}")
        return None

    main_attr = _normalize_element(main_attr)
    if sub_attr:
        sub_attr = _normalize_element(sub_attr)

    if main_attr not in VALID_ELEMENTS:
        print(f"  [LLM] VALIDATE FAIL: invalid mainAttr={main_attr}")
        return None
    if sub_attr and sub_attr not in VALID_ELEMENTS:
        sub_attr = None
    if sub_attr == main_attr:
        sub_attr = None

    name = str(name).strip()
    if len(name) > 20:
        name = name[:20]

    return {
        "name": name,
        "mainAttr": main_attr,
        "subAttr": sub_attr,
        "visualDesc": str(visual_desc).strip()[:200] if visual_desc else "",
        "fusionPrompt": str(fusion_prompt).strip()[:300] if fusion_prompt else "",
    }


def _log_location_restriction(provider_name, error_text):
    text = str(error_text or "")
    lowered = text.lower()
    if "user location is not supported for the api use" in lowered or "location is not supported" in lowered:
        print(f"  [LLM] {provider_name} availability issue: request appears blocked by network/region restrictions")


def _call_gemini_rest(user_prompt, timeout, max_retries):
    api_key = os.getenv("GEMINI_API_KEY", "")
    model = os.getenv("LLM_MODEL", "gemini-2.0-flash")

    if not api_key:
        print("  [LLM] Gemini skipped: GEMINI_API_KEY not set")
        return None

    url = (
        f"https://generativelanguage.googleapis.com"
        f"/v1beta/models/{model}:generateContent?key={api_key}"
    )

    payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": [{
            "role": "user",
            "parts": [{"text": user_prompt}]
        }],
        "generationConfig": {
            "temperature": 0.85,
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
                print(f"  [LLM] Gemini validation OK: name={validated['name']}, mainAttr={validated['mainAttr']}")
                return validated

            print("  [LLM] Gemini validation FAILED for parsed JSON")

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:200]
            print(f"  [LLM] Gemini HTTP error (attempt {attempt + 1}): {e.response.status_code} - {error_text}")
            _log_location_restriction("Gemini", error_text)
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"  [LLM] Gemini parse error (attempt {attempt + 1}): {e}")
        except Exception as e:
            print(f"  [LLM] Gemini call error (attempt {attempt + 1}): {e}")

    return None


def _call_openai_compat(user_prompt, timeout, max_retries):
    base_url = os.getenv("LLM_BASE_URL", "").rstrip("/")
    api_key = os.getenv("LLM_API_KEY", "")
    model = os.getenv("OPENAI_COMPAT_MODEL", "")

    if not base_url or not api_key or not model:
        print("  [LLM] OpenAI-compatible backup skipped: missing LLM_BASE_URL / LLM_API_KEY / OPENAI_COMPAT_MODEL")
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
        "temperature": 0.85,
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
                print(f"  [LLM] OpenAI-compatible validation OK: name={validated['name']}, mainAttr={validated['mainAttr']}")
                return validated

            print("  [LLM] OpenAI-compatible validation FAILED for parsed JSON")

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:200]
            print(f"  [LLM] OpenAI-compatible HTTP error (attempt {attempt + 1}): {e.response.status_code} - {error_text}")
            _log_location_restriction("OpenAI-compatible", error_text)
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"  [LLM] OpenAI-compatible parse error (attempt {attempt + 1}): {e}")
        except Exception as e:
            print(f"  [LLM] OpenAI-compatible call error (attempt {attempt + 1}): {e}")

    return None


def call_gemini_rest(spell_a_name, spell_a_attr, spell_a_gen,
                     spell_b_name, spell_b_attr, spell_b_gen):
    """按主 provider 优先、OpenAI-compatible 备援的策略生成融合法阵。"""
    timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
    max_retries = int(os.getenv("LLM_MAX_RETRIES", "1"))
    primary_provider = os.getenv("LLM_PROVIDER", "gemini_rest").strip().lower() or "gemini_rest"

    user_prompt = _build_user_prompt(
        spell_a_name, spell_a_attr, spell_a_gen,
        spell_b_name, spell_b_attr, spell_b_gen,
    )

    print(f"  [LLM] Primary provider selected: {primary_provider}")

    if primary_provider == "openai_compat":
        result = _call_openai_compat(user_prompt, timeout, max_retries)
        if result:
            print("  [LLM] Primary provider success: openai_compat")
        else:
            print("  [LLM] Primary provider failed: openai_compat")
        return result

    if primary_provider != "gemini_rest":
        print(f"  [LLM] Unknown primary provider '{primary_provider}', falling back to gemini_rest as primary")

    result = _call_gemini_rest(user_prompt, timeout, max_retries)
    if result:
        print("  [LLM] Primary provider success: gemini_rest")
        return result

    print("  [LLM] Primary provider failed: gemini_rest")
    print("  [LLM] Switching to backup provider: openai_compat")

    backup_result = _call_openai_compat(user_prompt, timeout, max_retries)
    if backup_result:
        print("  [LLM] Backup provider success: openai_compat")
        return backup_result

    print("  [LLM] Backup provider failed: openai_compat")
    return None
