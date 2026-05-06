# Prompt Layout

- `forge/system_prompt.txt`: forge system prompt used by the backend LLM call.
- `forge/user_prompt.txt`: forge user prompt template with `str.format(...)` placeholders.

Conventions:
- Keep long AI prompts here instead of embedding them in Python modules.
- Keep UI copy and battle tips outside this directory.
- Use explicit placeholder names such as `{spell_a_name}`.
