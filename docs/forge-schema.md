# Forge 鍗忚涓庡瓧娈佃鏄?
鏈枃鏄綋鍓嶆湁鏁堢殑 forge / quota / prompt-router 鍗忚璇存槑銆傛棫鏂囨。閲岃嫢浠嶅啓鈥淟LM 鍙骇鍑?`visualDesc / fusionPrompt`鈥濓紝浠ユ湰鏂囦负鍑嗐€?
## 1. 杈撳叆鎬?
褰撳墠 A/B 鍙屾Ы缁熶竴鏀寔鍥涚杈撳叆鎬侊細

- A 绌猴紝B 绌?- A 鏈夛紝B 绌?- A 绌猴紝B 鏈?- A 鏈夛紝B 鏈?
琛屼负绾﹀畾锛?
- 鍙岀┖锛氫笉杩涘叆 forge 璇箟 LLM锛岀洿鎺ヨ蛋鍚庣鍥哄畾寮€灞€缁撴灉姹犮€?- 鍗曡緭鍏ワ細杩涘叆 forge 璇箟閾捐矾锛岀敱 forge LLM 浜у嚭 `name / attrSet / themeText`銆?- 鍙岃緭鍏ワ細杩涘叆鍚屼竴鏉?forge 璇箟閾捐矾锛岀敱 forge LLM 浜у嚭 `name / attrSet / themeText`銆?- 鏈€缁?`videoPrompt` 缁熶竴鐢辨ā鍧桞 `runPromptRouter(themeText)` 鍩轰簬 `themeText` 鐢熸垚銆?
## 2. 璇锋眰鍗忚

### POST /api/forge

```json
{
  "playerId": "player_xxx",
  "spellA": {
    "id": "spell_a",
    "type": "spell",
    "name": "璧ょ劙鍗?,
    "attrSet": ["fire"],
    "mainAttr": "fire",
    "themeText": "鐏劙涓婚鐨勭偧閲戞硶闃碉紝涓績鍍忚鍘嬬缉鐨勭啍鐏牳蹇冭埇绋冲畾鑴夊姩銆?,
    "generation": 1
  },
  "spellB": null
}
```

璇存槑锛?
- `playerId` 浠嶇敤浜?quota 缁熻銆?- `spellA / spellB` 鐜板湪閮藉厑璁镐负 `null`銆?- `attrSet` 浠嶆槸涓诲彛寰勶紱鑻ユ湭鎻愪緵锛屼細鍥為€€鍒?`[mainAttr]`銆?- `themeText` 鏄彲閫変笂娓歌涔夎ˉ鍏咃紱鏃у崱娌℃湁涔熶笉浼氭姤閿欍€?
鎴愬姛鍝嶅簲锛?
```json
{
  "taskId": "task_xxx",
  "status": "pending"
}
```

## 3. 鐘舵€佸崗璁?
### GET /api/forge/status/{taskId}

```json
{
  "taskId": "task_xxx",
  "status": "completed",
  "result": {
    "name": "鐒氶湝瑁傜幆",
    "attrSet": ["fire", "ice"],
    "themeText": "鐏劙涓庡瘨闇滃湪杈圭晫娓呮櫚鐨勭偧閲戦樀鍐呯浉浜掓挄鎵紝涓ぎ瑁傜幆鍚戜笂鎶崌骞跺畬鎴愪竴娆″彈鎺ч噴鏀俱€?,
    "mainAttr": "fire",
    "subAttr": "ice",
    "element": "fire",
    "generation": 2,
    "baseAtk": 130.0,
    "videoPrompt": "鏈€缁堜腑鏂囪棰?prompt",
    "promptRoute": "C",
    "promptRouteReason": "涓婚鏍稿績鏄湴闈㈠唴閮ㄥ悜涓婄牬鍦熺敓鎴愪簨浠?,
    "promptFallbackApplied": false,
    "promptTemplate": "C_eruption_full",
    "promptModel": "gpt-5.4",
    "promptRouteElapsedMs": 3280,
    "promptGenerationElapsedMs": 12425,
    "promptTotalElapsedMs": 15707,
    "videoUrl": null,
    "status": "partial",
    "source": "llm",
    "inputState": "dual"
  },
  "error": null
}
```

## 4. 瀛楁鏉ユ簮

| 瀛楁 | 鏉ユ簮 | 璇存槑 |
|------|------|------|
| `name` | forge LLM / fallback / opening pool | 鏂版硶闃靛悕绉?|
| `attrSet` | forge LLM 浼樺厛锛宺ulebase 鏍￠獙涓?fallback | 褰撳墠鏍稿績璇箟瀛楁 |
| `themeText` | forge LLM / fallback / opening pool | 鎻愪緵缁欐ā鍧桞鐨勪笂娓镐富棰樻枃鏈?|
| `mainAttr` | rulebase | `attrSet[0]` 鐨勫吋瀹瑰瓧娈?|
| `subAttr` | rulebase | `attrSet[1]` 鐨勫吋瀹瑰瓧娈?|
| `element` | rulebase | 绛変簬 `mainAttr` |
| `generation` | rulebase | 鍗?鍙岃緭鍏ュ彇 `max(parent.gen) + 1`锛涘弻绌哄浐瀹氬紑灞€鍊欓€変负 Gen1 |
| `baseAtk` | rulebase | 鎸夌幇鏈変笘浠ｅ叕寮忔帹瀵?|
| `videoPrompt` | 妯″潡B / 鏈湴鍥為€€ | 鏈€缁堜腑鏂囪棰?prompt |
| `promptRoute* / promptTemplate / promptModel` | 妯″潡B | 璺敱銆佹ā鏉裤€佹ā鍨嬨€佽€楁椂瀹¤瀛楁 |
| `videoUrl` | rulebase | 褰撳墠浠嶅浐瀹氫负 `null` |
| `status` | rulebase | 褰撳墠鍥哄畾涓?`"partial"` |
| `source` | rulebase | `opening_pool / llm / fallback` |
| `inputState` | rulebase | `empty / single / dual` |

琛ュ厖璇存槑锛?
- `source` 琛ㄧず杩欏紶缁撴灉鍗℃渶鍒濇槸浠庡摢涓€灞備骇鍑虹殑锛屼緥濡傚弻绌鸿緭鍏ユ椂甯歌 `source=opening_pool`
- `promptRoute` 琛ㄧず妯″潡B鍚庣画涓?`themeText -> videoPrompt` 閫夋嫨浜嗗摢涓€涓ā鏉胯矾鐢憋紝渚嬪 `E`
- 杩欎袱涓瓧娈典笉鏄悓涓€灞傛蹇碉紝鎵€浠?`source=opening_pool`銆乣promptRoute=E`銆乣promptFallbackApplied=false` 鍚屾椂鍑虹幇骞朵笉鍐茬獊锛涘畠琛ㄧず鈥滃崱鐨勬潵婧愭槸寮€灞€姹狅紝浣嗗畠鐨勫悗缁棰?prompt 浠嶆甯哥粡杩囦簡妯℃澘璺敱闃舵鈥?
## 5. Forge LLM 杈撳嚭鍗忚

褰撳墠 forge 璇箟 LLM 鍙厑璁歌緭鍑猴細

```json
{
  "name": "鏂版硶闃靛悕绉?,
  "attrSet": ["fire", "ice"],
  "themeText": "1鍒?鍙ヤ腑鏂囦富棰樻弿杩?
}
```

娉ㄦ剰锛?
- `attrSet` 鍙兘浣跨敤 `fire / ice / thunder / blight`銆?- `text` 杈撳叆蹇呴』鍙備笌 `attrSet` 鎺ㄦ柇锛屼笉鑳借瑙嗕负绌哄３銆?- `themeText` 鏄粰妯″潡B缁х画璺敱鍜屾墿鍐欑殑瑙嗛涓婚鏂囨湰锛屼笉鏄渶缁堝巶鍟?prompt銆?- 鍚庣涓嶄細鍐嶆帴鍙?`visualDesc / fusionPrompt` 浣滀负姝ｅ紡杈撳嚭瀛楁銆?
## 6. 灞炴€?fallback 瑙勫垯

- 绗竴姝ワ細浼樺厛閲囩敤 forge LLM 杩斿洖鐨勫悎娉?`attrSet`銆?- 绗簩姝ワ細鑻?LLM 缂哄け鎴栬繑鍥為潪娉?`attrSet`锛屽皾璇曡交閲忓叧閿瘝 rulebase 鍏滃簳銆?- 绗笁姝ワ細鑻ュ叧閿瘝浠嶆棤娉曞垽瀹氾紝鍐嶅洖閫€鍒板凡鏈?spell 杈撳叆鐨勫悎骞跺睘鎬с€?- 绗洓姝ワ細闅忔満浠呬綔涓烘渶鍚庢墜娈点€?
## 7. 鍙岀┖鍥哄畾寮€灞€缁撴灉鏉ユ簮

褰撳墠鍙岀┖杈撳叆澶嶇敤椤圭洰鐜版湁鍥涗釜鍗曞睘鎬ц捣濮嬫硶闃垫蹇典綔涓哄浐瀹氬紑灞€缁撴灉姹狅細

- `鐔斿博娉曢樀`
- `鍐板噷娉曢樀`
- `鏄熺幆娉曢樀`
- `鍓ф瘨娉曢樀`

杩欐牱鍙互鐩存帴澶嶇敤褰撳墠椤圭洰宸茬粡瀛樺湪鐨勫崟灞炴€ц捣濮嬭涔夛紝涓嶅紩鍏ユ柊 UI銆佹柊绱犳潗鎴栭澶栫郴缁熴€?
## 8. Quota 鍗忚

### GET /api/player/quota

```text
GET /api/player/quota?playerId=player_xxx
```

### POST /api/admin/quota/reset

```json
{
  "playerId": "player_xxx",
  "applyToAll": false,
  "usedCount": 0,
  "dailyLimit": 50
}
```

## 9. 鍗＄墝瑙嗛璧勪骇鍗忚

### POST /api/video/pixverse/cards/register

鐢ㄤ簬鎶婂墠绔凡鏈夌殑 player-generated 鍗＄櫥璁板埌鍚庣杞婚噺鐘舵€佷粨搴撱€傛渶灏忚姹備綋绀轰緥锛?
```json
{
  "cards": [
    {
      "cardId": "card_xxx",
      "forgeTaskId": "task_xxx",
      "name": "鐒氶湝瑁傜幆",
      "attrSet": ["fire", "ice"],
      "generation": 2,
      "themeText": "鐏劙涓庡瘨闇滃湪杈圭晫娓呮櫚鐨勭偧閲戦樀鍐呯浉浜掓挄鎵€?,
      "videoPrompt": "鏈€缁堜腑鏂囪棰?prompt",
      "thumbnailUrl": "data:image/webp;base64,...",
      "sourceType": "player_generated",
      "status": "not_generated"
    }
  ]
}
```

### POST /api/video/pixverse/from-card/{cardId}

- 浠庡崱鐗岀淮搴﹀惎鍔?PixVerse 鐢熸垚
- 鑻ュ綋鍓?`cardId` 宸叉湁 `queued / submitting / polling` 浠诲姟锛屽垯鐩存帴澶嶇敤
- 鑻ュ綋鍓?`cardId` 宸叉湁瀹屾垚缁撴灉锛屽垯鐩存帴杩斿洖宸插畬鎴愯祫浜х姸鎬?- 鑻ヤ笂涓€杞け璐ワ紝鍒欏厑璁稿啀娆¤皟鐢ㄩ噸鏂版彁浜?
### GET /api/video/pixverse/card/{cardId}

杩斿洖鍗＄墝瑙嗚鐨勮祫浜х姸鎬侊紝鏍稿績瀛楁鍖呮嫭锛?
- `assetId`
- `cardId`
- `forgeTaskId`
- `sourceType`
- `status`
- `videoTaskId`
- `pixverseVideoId`
- `providerStatus`
- `resultUrl`
- `videoUrl`
- `error`

鐘舵€佸彛寰勶細

- `not_generated`
- `generating`
- `completed`
- `failed`

### GET /api/assets/cards

缁熶竴鍗＄墝璧勪骇搴撳叆鍙ｃ€傚綋鍓嶄細姹囨€伙細

- `built_in`
- `player_generated`
- `curated`

闈欐€佽祫浜х洰褰曞崗璁細

```text
backend/resources/assets/cards/<assetId>/
  metadata.json
  video.mp4
  thumbnail.webp
```

褰撳墠姝ｅ紡瀛楁鍙ｅ緞锛?
```json
{
  "id": "flame-ring-builtin",
  "name": "鐔旂幆璧峰紡",
  "sourceType": "built_in",
  "category": "starter",
  "attrSet": ["fire"],
  "generation": 1,
  "inputPhrase": "鐏劙鍦嗙幆",
  "videoPrompt": "25D 娓告垙瑙嗚涓嬶紝涓€鏋氱伀绯昏捣濮嬫硶闃靛湪鍦伴潰绋冲畾灞曞紑銆?,
  "description": "鏂版墜鍒濆璧勪骇姹犱腑鐨勭伀绯诲唴缃硶闃垫牱渚嬨€?,
  "videoPath": "video.mp4",
  "thumbnailPath": "thumbnail.webp",
  "origin": "handcrafted",
  "originCardId": null,
  "curationNote": null
}
```

璇存槑锛?
- metadata 鍐呴儴姝ｅ紡浣跨敤 `videoPath / thumbnailPath`锛岃矾寰勭浉瀵逛簬褰撳墠璧勪骇鐩綍銆?- `/api/assets/cards` 瀵瑰浠嶈繑鍥炲墠绔彲鐩存帴浣跨敤鐨?`videoUrl / thumbnailUrl`锛岀敱鍚庣鏍规嵁鐩稿璺緞瑙ｆ瀽鐢熸垚銆?- 鍓嶇 reveal / collection / battle / loadout 浼氱粺涓€閫氳繃 `AlchemyRuntime.resolveMediaUrl()` 鎸夊綋鍓?`apiBase` 琛ュ叏杩欎簺濯掍綋 URL銆?- 鏃?`videoUrl / thumbnailUrl` 鐩墠浠嶅吋瀹硅鍙栵紝浣嗕粎鐢ㄤ簬杩佺Щ杩囨浮锛屼笉鍐嶄綔涓烘柊璧勪骇鍒朵綔鏍囧噯銆?- 璇︾粏鍒朵綔瑙勮寖瑙?`docs/builtin-asset-spec-v1.md`銆?
## 10. 鏂囨。浣跨敤寤鸿

濡傛灉浣犳槸鏂颁細璇濓細

1. 鍏堣 `README.md`
2. 鍐嶈 `docs/attrset-quota-walkthrough.md`
3. 鏈€鍚庣敤鏈枃纭鎺ュ彛銆佸瓧娈靛拰杈撳叆鎬佺粏鑺?
`docs/archive/` 涓殑鏃?handover銆乸hase銆乺oadmap 鏂囨。涓嶅簲鍐嶄綔涓哄綋鍓嶄富鍙傝€冦€?
