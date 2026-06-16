# AttrSet 涓?Quota 鎺ョ璇存槑

鏈枃鏄綋鍓嶆満鍒朵笌閾捐矾璇存槑锛岄潰鍚戝悗缁柊浼氳瘽鎺ユ墜鏃跺揩閫熷缓绔嬩笂涓嬫枃銆?
## 1. 褰撳墠涓诲彛寰?
- 鍗＄墝涓?forge 缁撴灉鐨勬牳蹇冨瓧娈靛凡缁忔敹鍙ｄ负 `attrSet`
- `mainAttr / subAttr / element` 缁х画淇濈暀锛屼絾浠呬綔涓烘棫 UI銆佹棫鏁版嵁鍜屾棫鎺ュ彛鍏煎瀛楁
- 鏂板鎴栭噸鏋?forge 閫昏緫鏃讹紝浼樺厛鍥寸粫 `attrSet + themeText + videoPrompt` 鎬濊€冿紝鑰屼笉鏄洖鍒版棫鐨?`visualDesc / fusionPrompt`

## 2. 鎴樻枟瑙勫垯

- `frontend/js/combat.js` 浠嶇劧鎸夋妧鑳?`attrSet` 涓庢€墿 `attrSet` 鏄惁鏈変氦闆嗘潵鍒ゅ畾鍛戒腑
- 鏃犱氦闆嗘椂锛屼笉鏄櫘閫?miss锛岃€屾槸缁х画娌跨敤褰撳墠鐨勫惛鏀舵垚闀块摼璺?- `frontend/js/battle.js` 褰撳墠鎬绘椂闀挎槸 `120s`
- 娉㈡褰撳墠鍥哄畾涓?`30s * 4 wave`
- 榄傛暟杈炬爣鍚庝笉鍐嶇珛鍒昏儨鍒╅€€鍑猴紝鑰屾槸瑕佸潥鎸佸埌浠紡缁撴潫鍐嶇粺涓€鍒ゅ畾
- HUD 浼氬湪榄傛暟杈炬爣鍚庢彁绀衡€滈瓊鏁板凡榻愶紝鍧氭寔鍒颁华寮忕粨鏉熲€?
## 3. 鐐奸噾鐐夎緭鍏ユ€?
褰撳墠 A/B 鍙屾Ы鏀寔鍥涚鐘舵€侊細

- A 绌猴紝B 绌?- A 鏈夛紝B 绌?- A 绌猴紝B 鏈?- A 鏈夛紝B 鏈?
钀藉湴鏂瑰紡锛?
1. 鍓嶇鍏佽浠讳綍妲戒綅鐘舵€佷笅鐐瑰嚮寮€濮嬭繘鍏?battle銆?2. 鍚庣 `POST /api/forge` 鎺ュ彈 `spellA / spellB` 涓?`null`銆?3. 鍙岀┖涓嶈皟鐢?forge 璇箟 LLM锛岃€屾槸鐩存帴浠庡浐瀹氬紑灞€缁撴灉姹犺繑鍥炰竴涓槑纭粨鏋溿€?4. 鍗曡緭鍏ヤ笌鍙岃緭鍏ヨ繘鍏ュ悓涓€鏉?forge 璇箟閾捐矾銆?
## 4. Forge 閾捐矾

鍓嶇 `frontend/js/forgeAPI.js` 鐜板湪浼氭彁浜わ細

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

鍚庣澶勭悊椤哄簭锛?
1. 瑙ｆ瀽褰撳墠杈撳叆鎬?2. 鍙岀┖鏃剁洿鎺ヨ蛋鍥哄畾寮€灞€缁撴灉姹?3. 鍗曡緭鍏?/ 鍙岃緭鍏ユ椂璋冪敤 forge 璇箟 LLM锛岃鍏惰繑鍥?`name / attrSet / themeText`
4. rulebase 璐熻矗鏍￠獙 `attrSet`銆佸喅瀹?`generation / baseAtk / mainAttr / subAttr / element`
5. 妯″潡B `runPromptRouter(themeText)` 鎶?`themeText` 缁х画杞崲涓烘渶缁?`videoPrompt`
6. 妯″潡B澶辫触鏃讹紝鍚庣鍥為€€鍒版湰鍦?`videoPrompt` 鏂囨湰锛屼笉闃绘柇 forge 涓绘祦绋?
## 5. LLM 鑱岃矗杈圭晫

### forge 璇箟 LLM 璐熻矗

- `name`
- `attrSet`
- `themeText`

### rulebase 璐熻矗

- 杈撳叆鎬佸垽瀹?- `generation`
- `baseAtk`
- 鍏煎瀛楁娲剧敓
- `attrSet` 鍚堟硶鎬ф牎楠?- 鍏抽敭璇?fallback 涓庨殢鏈哄厹搴?- 鍙岀┖鍥哄畾缁撴灉姹?
### 妯″潡B 璐熻矗

- 璇诲彇 `themeText`
- 鐢熸垚鏈€缁?`videoPrompt`
- 杩斿洖 `route_selected / route_reason / fallback_applied / final_template / model / elapsed_ms`

## 6. text 杈撳叆澶勭悊

- text 涓嶈兘鍐嶈褰撴垚鈥滄棤灞炴€х┖澹斥€?- forge LLM prompt 宸叉槑纭姹?text 蹇呴』鍙備笌 `attrSet` 鎺ㄦ柇
- 鑻?forge LLM 娌¤繑鍥炲悎娉?`attrSet`锛屽悗绔細鍏堝仛鍏抽敭璇?rulebase 鍏滃簳
- 鍏抽敭璇嶄粛鏃犳硶鍒ゅ畾鏃讹紝鍐嶉€€鍒板凡鏈?spell 杈撳叆鐨勫睘鎬у悎骞?- 闅忔満鍙綔涓烘渶鍚庢墜娈?
## 7. 鍥哄畾寮€灞€缁撴灉姹?
鍙岀┖杈撳叆褰撳墠澶嶇敤椤圭洰鐜版湁鍥涗釜鍗曞睘鎬ц捣濮嬫硶闃垫蹇碉細

- `鐔斿博娉曢樀`
- `鍐板噷娉曢樀`
- `鏄熺幆娉曢樀`
- `鍓ф瘨娉曢樀`

杩欐牱鍋氱殑鍘熷洜锛?
- 瀹冧滑宸茬粡鏄綋鍓嶉」鐩腑鏈€绋冲畾銆佹渶灏忛棴鐜殑璧峰璇箟瀵硅薄
- 涓庣幇鏈?`attrSet` 鎴樻枟瑙勫垯澶╃劧鍏煎
- 涓嶉渶瑕侀澶栧紩鍏ユ柊绱犳潗銆佹柊鍗℃睜绯荤粺鎴栨柊 UI

## 8. 鍓嶇鎸佷箙鍖栦笌鍏煎

- forge 瀹屾垚鍚庣殑鍗″璞＄幇鍦ㄤ細淇濈暀 `themeText / videoPrompt / promptRoute / promptTemplate / promptModel / elapsed_ms`
- 鏃у崱鑻ヤ粛鍙甫 `visualDesc / fusionPrompt`锛屽墠绔鍙栨椂浼氬吋瀹规槧灏勫埌 `themeText / videoPrompt`
- 鏂板崱缁х画淇濈暀 `mainAttr / subAttr / element`锛屼絾杩欎簺鍙槸鍏煎娲剧敓瀛楁
- player-generated 鍗＄幇鍦ㄨ繕浼氫繚鐣?`assetId / assetSourceType / videoStatus / videoTaskId / pixverseVideoId / videoUrl`
- 搴旂敤鍚姩鏃讹紝鍓嶇浼氭壒閲忔妸鏈湴 player-generated 鍗″洖琛ュ埌 `POST /api/video/pixverse/cards/register`
- reveal 涓?collection 閮戒紭鍏堟寜 `GET /api/video/pixverse/card/{cardId}` 鍚屾瑙嗛璧勪骇鐘舵€?
## 9. 褰撳墠鐪熺浉婧?
鍚庣画鏂颁細璇濆簲浼樺厛鍙傝€冿細

1. `README.md`
2. 鏈枃妗?3. `docs/forge-schema.md`
4. `backend/README.md`

`docs/archive/` 涓殑 handover銆乸hase銆乺oadmap銆佹棫鍒嗘瀽绋块兘鍙綔涓哄巻鍙插弬鑰冿紝涓嶅啀浠ｈ〃褰撳墠鍗忚涓庡綋鍓嶆満鍒躲€?
