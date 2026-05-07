from __future__ import annotations

from pathlib import Path

from llm_client import LLMClient


def load_full_template(full_templates_dir: Path, template_stem: str) -> str:
    path = full_templates_dir / f"{template_stem}.md"
    if not path.exists():
        raise FileNotFoundError(f"missing_full_template={template_stem}")
    return path.read_text(encoding="utf-8").strip()


def generate_prompt(theme: str, template_markdown: str, llm_client: LLMClient) -> str:
    messages = [
        {
            "role": "system",
            "content": (
                "你是中文视频生成提示词写作器。"
                "请严格根据给定模板生成一条完整中文提示词。"
                "只输出最终提示词文本，不要标题，不要解释，不要编号。"
            ),
        },
        {
            "role": "user",
            "content": f"主题：{theme}\n\n完整模板：\n{template_markdown}",
        },
    ]
    return _clean_generated_prompt(llm_client.chat(messages, temperature=0.7))


def _clean_generated_prompt(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = [line for line in cleaned.splitlines() if not line.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    return cleaned.strip().strip('"')
