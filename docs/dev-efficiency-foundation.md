# Dev Efficiency Foundation

This document records the current project baseline and the lowest-risk follow-up path for faster iteration.

## 1. Mechanic Refactor Analysis

### Current resistance chain

Text flow:

1. Frontend spell cards are loaded from `frontend/js/storage.js`, normalized by `frontend/js/spellDefs.js`, and read into battle loadout by `frontend/js/battle.js`.
2. During battle, `buildEffectSpellData()` in `frontend/js/battle.js` builds `{ generation, baseAtk, mainAttr, subAttr }`.
3. When an effect lands, `Combat.calcHitResult()` in `frontend/js/combat.js` compares `spellData.mainAttr` against `monsterData.immuneAttrs`.
4. Monster resistance profiles come from `frontend/js/monsterDefs.js`, then are applied in `applyMonsterProfile()` inside `frontend/js/battle.js`.
5. If immune, battle reuses `applyResistanceAbsorb()` in `frontend/js/battle.js` to grow the monster, add HP, and show the "吸收" feedback.

### Current impact points

| Module | Current role | Impact if migrated to attribute-set hit |
|---|---|---|
| `frontend/js/combat.js` | Single main-attr vs `immuneAttrs` judgment | Core hit logic must move to set-match judgment |
| `frontend/js/monsterDefs.js` | Stores per-species `immuneAttrs` | Needs new monster-side attribute-set schema |
| `frontend/js/battle.js` | Builds spell data, applies absorb growth, renders battle feedback | Needs new spell/monster payload fields and clearer hit/mismatch feedback |
| `frontend/js/spellDefs.js` | Normalizes `element/mainAttr/subAttr` | Needs future-facing `attrSet` normalization and legacy compatibility |
| `frontend/js/storage.js` | Persists card schema | Needs to store `attrSet` for generated/template skills |
| `frontend/js/loadout.js` / `frontend/js/collection.js` | Shows spell badges | Needs UI for 1-3 attribute badges instead of main/sub only |
| `backend/app/models.py` | Forge result schema | Needs future `attrSet` field while keeping current compatibility fields |
| `backend/app/services/forge_service.py` | Generates `mainAttr/subAttr` | Needs future merge rule that outputs `attrSet` |
| `backend/app/services/llm_client.py` | Prompt + validation | Needs prompt/schema update if forge begins outputting `attrSet` directly |

### Recommended target model

Use a single attribute set on both sides.

- Spell side: `attrSet: string[]`
- Monster side: `attrSet: string[]`
- Effective hit rule: a spell is effective if `spell.attrSet` intersects `monster.attrSet`
- Mismatch rule: if no intersection, reuse current absorb chain instead of pure zero-effect

This preserves your preferred direction:

- Not "default can hit, resistance is exception"
- Instead "only matching sets can hit"
- Still keeps dramatic mixed outcomes when one cast damages some monsters and feeds others

### Minimal mismatch-absorb implementation

Reuse the current absorb pipeline instead of inventing a new subsystem.

- Keep `absorbed`, `absorbHpRatio`, `absorbScaleDelta`, `maxAbsorbStacks`
- Replace the reason for `absorbed` from "immune" to "attribute mismatch"
- Keep the same monster growth, HP increase, reward increase, flash, and floating text
- Rename internals later if needed, but phase 1 can keep function names for speed

That means the cheapest first implementation is:

1. Add `spell.attrSet` and `monster.attrSet`
2. Update `Combat.calcHitResult()` to return `matched` or `absorbed`
3. Keep `applyResistanceAbsorb()` behavior unchanged in battle

### Attribute cap = 3 merge rule

For the simple version, use frequency ranking over the union of both parent sets.

Recommended deterministic rule:

1. Flatten all parent attributes into one list.
2. Count frequency by attribute.
3. Sort by frequency descending.
4. Break ties by first appearance order.
5. Take top 3.

Example:

- Parent A: `[fire, ice]`
- Parent B: `[fire, thunder, poison]`
- Counts: `fire=2`, `ice=1`, `thunder=1`, `poison=1`
- Result with cap 3: `[fire, ice, thunder]`

This is the simplest rule that matches your "no main/sub" preference and avoids combinatorial complexity.

### UI communication recommendation

Players need to understand "what this spell can currently hit" without reading a rules page.

Lowest-risk path:

- Loadout and collection cards: show 1-3 attribute badges directly on the card
- Battle bottom HUD: show the active spell's 1-3 badges next to or inside the slot UI
- Monster readability: show 1-3 small attribute pips above HP bar or beside spawn/wave intro
- Mismatch feedback: keep the absorb grow effect and use the same attribute color in the absorb flash

Do not rely on text-only explanation during combat. The current visual absorb payoff is already the best teaching tool you have.

### Recommended rollout path

1. Phase A: add `attrSet` as a compatibility field without deleting `mainAttr/subAttr`
2. Phase B: move combat judgment from single-attr immunity to set intersection
3. Phase C: replace monster-side `immuneAttrs` with explicit `attrSet`
4. Phase D: update loadout/collection/battle HUD to display sets clearly
5. Phase E: only after the above is stable, tune wave goals and difficulty

### Conclusion

This refactor is suitable for a staged implementation, not a one-shot rewrite. The current codebase already has a reusable "mismatch becomes absorb growth" hook, so the cheapest safe path is to migrate judgment first and visuals second, rather than touching all battle rules at once.

## 2. Trial Quota And Template Skill Reward Draft

### Backend ownership recommendation

Quota and template reward logic should live on the backend, not in frontend local storage.

Reasons:

- Daily limits must survive refresh and restart
- Frontend-only limits are trivial to bypass
- Template reward pools belong to backend-controlled content

### Recommended minimal data structures

Prefer SQLite for the first real version.

`player_daily_quota`

| Field | Type | Notes |
|---|---|---|
| `player_id` | text | Stored in frontend local storage and sent on every request |
| `quota_date` | text | `YYYY-MM-DD` in server timezone |
| `forge_count` | integer | Number of AI forge/video requests used today |
| `daily_limit` | integer | Default from config, can be overridden |
| `updated_at` | text | Audit/debug |

`template_skills`

| Field | Type | Notes |
|---|---|---|
| `id` | text | Skill id |
| `name` | text | Display name |
| `main_attr` | text | Current compatibility field |
| `sub_attr` | text nullable | Current compatibility field |
| `attr_set_json` | text nullable | Future-facing set payload |
| `generation` | integer | Card strength |
| `base_atk` | real | Card strength |
| `video_url` | text nullable | Optional |
| `thumbnail_url` | text nullable | Optional |
| `weight` | integer | Weighted random reward |
| `enabled` | integer | Admin toggle |

`template_reward_log`

| Field | Type | Notes |
|---|---|---|
| `id` | text | Grant id |
| `player_id` | text | Owner |
| `quota_date` | text | For daily analysis |
| `template_skill_id` | text | Granted skill |
| `battle_id` | text nullable | Optional battle trace |
| `created_at` | text | Audit/debug |

### Frontend/backend interaction

Recommended API shape:

- `GET /api/player/quota`
  - returns `{ playerId, dailyLimit, used, remaining, resetAt }`
- `POST /api/forge`
  - request adds `playerId`
  - backend rejects with `quota_exhausted` once remaining is `0`
- `POST /api/rewards/battle-victory`
  - request includes `{ playerId, usedForgeThisRun, rewardMode }`
  - backend can return a template skill when player skipped forge, ran out of quota, or chose not to forge
- `POST /api/admin/quota/reset`
  - manual clear for one player or all players
- `POST /api/admin/quota/adjust`
  - manual set or increment remaining count

### Daily refresh

Do not run a cron job first.

Use lazy refresh:

- Every quota read checks `quota_date`
- If stored date is not today, reset `forge_count` to `0` and move row to today

That is the smallest reliable implementation.

### Minimal implementation path

1. Add `playerId` generation/storage in frontend local storage
2. Add backend SQLite file under `backend/data/`
3. Add `quota_service.py` with `get_quota()`, `consume_forge()`, `reset_if_new_day()`, `admin_adjust()`
4. Extend `POST /api/forge` to require or infer `playerId`
5. Add `template_skill_service.py` and `battle reward` endpoint
6. Frontend victory flow consumes returned template skill and stores it as a spell card

### Best module placement

- `backend/app/services/quota_service.py`
- `backend/app/services/template_skill_service.py`
- `backend/app/routes/forge.py` for forge quota gate
- `backend/app/routes/rewards.py` for battle reward grant
- `backend/app/models.py` for quota/reward payloads

## 3. Current Information Flow And Prompt Distribution

### Frontend to backend

Current frontend submission is minimal JSON.

Actual payload shape from `frontend/js/forgeAPI.js`:

```json
{
  "spellA": { "id": "...", "name": "...", "mainAttr": "fire", "generation": 1 },
  "spellB": { "id": "...", "name": "...", "mainAttr": "ice", "generation": 1 }
}
```

Current answer to your questions:

- Attribute keywords: yes, but only `mainAttr`
- Player raw input text: indirectly yes, because text cards become `name`, but raw prompt text is not sent separately
- Prompt: no frontend prompt is sent to backend
- Structured JSON: yes

### Backend internal flow

Text flow:

1. `frontend/js/forgeAPI.js` posts JSON to `POST /api/forge`
2. `backend/app/routes/forge.py` extracts only `name/mainAttr/generation`
3. `backend/app/services/forge_service.py` creates async task and passes scalar spell fields into the LLM layer
4. `backend/app/services/llm_client.py` builds the user prompt from template + scalar fields
5. `llm_client.py` sends `SYSTEM_PROMPT + user_prompt`
6. Provider JSON is validated and normalized
7. `forge_service.py` adds backend-owned fields such as `generation`, `baseAtk`, `status`, `source`
8. Frontend polls `GET /api/forge/status/{taskId}`
9. `frontend/js/alchemy.js` writes result back into local storage as a spell card

### Current hardcoded prompts and copy

Backend AI prompts:

- `backend/app/prompts/forge/system_prompt.txt`
- `backend/app/prompts/forge/user_prompt.txt`

Frontend UI/static copy:

- `frontend/index.html`
  - placeholders, button alt text, preview hints, victory/defeat copy
- `frontend/js/battle.js`
  - wave labels, control hints, absorb text, result overlay text
- `frontend/js/collection.js`
  - delete confirm copy
- `frontend/js/spellDefs.js`
  - element labels

Gameplay rules mixed with copy/config:

- `frontend/js/spellDefs.js`
  - element aliases, labels, colors, glows
- `frontend/js/monsterDefs.js`
  - monster resistance/profile data
- `backend/app/models.py`
  - forge response schema
- `backend/app/services/forge_service.py`
  - fallback naming rules and element pool

### Current issues

- Prompt, schema, UI copy, and gameplay rules are still mixed across JS/Python modules
- Backend uses `blight`, frontend display layer normalizes to `poison`
- Battle UI copy is embedded directly in draw/update logic
- Card schema is already stretching past `mainAttr/subAttr`, but storage and UI are still centered on that old shape

## 4. Centralized Prompt / Template / Copy Management Plan

### What should be extracted

Battle rules:

- element canonical list
- element aliases
- attribute cap
- monster attribute-set/profile data
- template skill pool metadata

Video generation prompts:

- forge system prompt
- forge user prompt template
- future video-generation prompt templates

UI copy:

- button labels
- preview hints
- victory/defeat/tutorial text
- battle HUD tips

### Recommended directories

Implemented this round:

- `backend/app/prompts/forge/`

Recommended next step:

- `frontend/assets/data/copy/`
  - `ui.json`
  - `battle.json`
  - `tutorial.json`
- `frontend/assets/data/config/`
  - `elements.json`
  - `monster_profiles.json`
  - `template_skills.json`

If backend later needs the exact same rules, promote shared gameplay config into a repo-level shared directory. Do not duplicate canonical element rules in Python and JS long term.

### Naming suggestion

- Prompt files: `<domain>/<purpose>_prompt.txt`
- UI copy files: `<surface>.json`
- Gameplay config files: `<system>.json`

Examples:

- `backend/app/prompts/forge/system_prompt.txt`
- `backend/app/prompts/forge/user_prompt.txt`
- `frontend/assets/data/copy/battle.json`
- `frontend/assets/data/config/elements.json`

### Anti-scatter rules

1. New long prompt bodies must live in `backend/app/prompts/`
2. New frontend user-facing copy must live in `frontend/assets/data/copy/`
3. JS and Python should reference keys or loaders, not embed long strings inline
4. Canonical gameplay lists such as attributes and caps should have exactly one owner file

## 5. Monster Asset Replacement SOP

### Current asset chain

- Asset folders live under `frontend/assets/monsters/<category>/<species>/`
- Frames are loaded by `frontend/js/battle.js` from `MOB_SPECIES`
- Combat profile is defined separately in `frontend/js/monsterDefs.js`
- Spawn pools are defined in `frontend/js/battle.js`

### What actually matters today

Current renderer depends on:

- path
- frame count
- frame prefix
- scale
- horizontal flip default
- natural image aspect ratio
- transparent bottom margin, because the shadow/feet anchor is inferred from the bottom opaque pixel row

There is currently no explicit per-monster config for:

- anchor offset
- sprite offset
- hitbox rectangle

So if a monster looks like it floats or sinks, the first thing to check is not a config file. It is usually the sprite canvas padding and only then the scale.

### SOP

1. Put the new frames under `frontend/assets/monsters/<category>/<species>/`
2. Use sequential names like `frame_01.png`, `frame_02.png`, ... unless you also update `framePrefix`
3. If you are replacing an existing monster with the same species id, keep folder name stable to avoid extra code edits
4. Check `frontend/js/battle.js` `MOB_SPECIES` entry for:
   - `assetBase`
   - `frames`
   - `framePrefix`
   - `scale`
   - `flipDefault`
5. If this is a new monster species, also update:
   - `frontend/js/monsterDefs.js`
   - `frontend/js/battle.js` small monster pools or boss roster
6. If the new sprite looks wrong in battle, inspect in this order:
   - bottom transparent padding
   - total frame count
   - aspect ratio change
   - `scale`
   - `flipDefault`
   - whether the monster should join a different spawn/category pool

### Quick import path for a batch

If you later hand over a full replacement batch, the cheapest import pattern is:

- keep existing species ids
- keep existing folder names
- keep the same `frame_XX.png` sequence
- only retune `scale` where visuals obviously drift

That avoids touching combat profiles and spawn mapping.

### Reusable import instruction template

```text
请为当前项目导入/替换怪物资源。

输入信息：
- 替换方式：替换现有物种 / 新增物种
- 资源目录：<我提供的素材目录>
- category：fire / ice / thunder / eclipse / boss
- species id：<slug>
- frame prefix：frame_
- frame count：<N>
- 是否沿用原 species id：是 / 否
- 是否需要加入刷怪池：是 / 否
- 目标刷怪池：small pool / boss roster / 不加入

请按以下顺序处理：
1. 把素材放到 `frontend/assets/monsters/<category>/<species>/`
2. 检查并更新 `frontend/js/battle.js` 中该物种的 `assetBase / frames / framePrefix / scale / flipDefault`
3. 如为新增物种，再更新 `frontend/js/monsterDefs.js` 的战斗 profile
4. 如需出现在战斗中，再更新 `frontend/js/battle.js` 的 spawn pool 映射
5. 最后说明是否需要额外手调 scale，或是否发现底部透明边距导致站位异常
```

## 6. Audio Planning And Integration SOP

### Current status

Current project has video assets, but no real audio system yet.

- No `audio.js` or audio manager exists
- Battle-created spell videos are explicitly `muted = true`
- Preview and loadout videos are also muted
- Repository currently stores `.mp4` assets, not BGM/SFX files

### Recommended resource checklist

BGM:

- menu / alchemy room BGM
- battle BGM

SFX:

- button click
- confirm / cancel
- forge success
- victory
- defeat
- player hurt
- monster hit
- monster kill
- dash

Special handling:

- ultimate should prefer the AI video's own audio track instead of a universal canned cast SFX

### Is direct playback of video audio feasible?

Yes, technically.

Because battle already spawns `HTMLVideoElement` objects, the frontend can play embedded video audio directly as long as:

- the chosen video element is not muted
- playback begins after user interaction
- you avoid overlapping many effect videos with audio at once

### Recommended ultimate audio chain

Use a dedicated audio source for ultimate, separate from the many visual effect videos.

Recommended path:

1. When ultimate starts, choose the winning skill video
2. Create or reuse a dedicated `ultimateAudioVideo`
3. Set `src` to the skill's `videoUrl`
4. Set `muted = false`, `volume = 1`
5. Keep the many battle sub-effect videos muted
6. When playback ends, restore BGM volume

This avoids layered chaos from multiple simultaneous effect instances sharing the same soundtrack.

### Ducking recommendation

Yes, duck BGM during ultimate video audio.

Suggested values:

- BGM normal: `1.0`
- During ultimate video audio: `0.2` to `0.35`
- Restore fade: `200ms` to `400ms`

### Fallback if the video has no usable audio

Do not try to infer this only at runtime from browser quirks.

The cheapest reliable approach is to store metadata alongside each skill:

- `hasEmbeddedAudio: true | false`
- optional `fallbackSfx`

Fallback order:

1. embedded video audio
2. per-skill fallback SFX if provided
3. one generic but softer "ultimate resonance" fallback

### Minimal audio SOP

1. Put BGM under `frontend/assets/audio/bgm/`
2. Put SFX under `frontend/assets/audio/sfx/`
3. Maintain one manifest file such as `frontend/assets/data/audio_manifest.json`
4. Add a lightweight audio manager later with logical buses:
   - `bgm`
   - `sfx`
   - `voice_or_video`
5. Route ultimate embedded audio through the `voice_or_video` bus and duck `bgm`

## 7. UI Tuner Tool

### What was implemented this round

Implemented:

- `frontend/js/uiTuner.js`
- CSS variable hooks in `frontend/css/style.css`
- script entry in `frontend/index.html`

### Current coverage

Alchemy page:

- slot width
- slot top
- slot A left
- slot B left
- slot scale
- slot opacity
- slot brightness
- slot saturation

Collection page:

- preview width
- layout gap
- card grid gap
- card grid columns

Loadout page:

- slot width
- slot gap
- slot bottom gap
- slot scale
- slot opacity
- slot brightness
- slot saturation
- card grid gap
- card grid columns

### How to open it

- Press `Ctrl + Shift + U`
- Or open the page with `?uiTuner=1`

### How to use it

1. Open the panel
2. Move sliders while viewing the relevant page
3. Use `Copy JSON` to capture the current values
4. When a value set is confirmed, move the chosen numbers into CSS defaults later

### Why this version is intentionally small

This tool is meant to reduce iteration cost right now, not become a permanent editor. It focuses on the most communication-heavy layout knobs and avoids touching gameplay code.
