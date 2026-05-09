/**
 * forgeAPI.js - 合成 API 封装（mock / real 切换）
 */
const ForgeAPI = (() => {
    const USE_MOCK = false;
    console.log('[ForgeAPI] loaded, USE_MOCK=' + USE_MOCK + ', API_BASE=' + AlchemyRuntime.getApiBase());

    let pollTimer = null;
    let pollCount = 0;
    const MAX_POLLS = 60;
    const PENDING_REWARD_POLL_MS = 3000;
    let pendingRewardPollTimer = null;
    let activePendingRewardTaskId = null;

    function buildApiUrl(path) {
        return AlchemyRuntime.buildApiUrl(path);
    }

    function normalizeMediaPayload(payload) {
        return AlchemyRuntime.normalizeMediaPayload(payload);
    }

    function clearPendingTask(taskId) {
        if (!taskId || activePendingRewardTaskId === taskId) {
            stopPendingRewardPolling();
        }
        const data = GameStorage.load();
        if (!data.pendingGeneration) return false;
        if (taskId && data.pendingGeneration.taskId !== taskId) return false;
        data.pendingGeneration = null;
        GameStorage.save(data);
        return true;
    }

    function logPromptRoutingAudit(taskId, result, source) {
        if (!result) return;
        console.log('[ForgeAPI] prompt routing audit:', {
            source,
            taskId,
            inputState: result.inputState || null,
            inputSummary: result.inputSummary || null,
            promptRoute: result.promptRoute || null,
            promptRouteReason: result.promptRouteReason || null,
            promptFallbackApplied: Boolean(result.promptFallbackApplied),
            promptTemplate: result.promptTemplate || null,
            promptModel: result.promptModel || null,
            themeText: result.themeText || null
        });
    }

    function buildInputState(cardA, cardB) {
        const inputs = [cardA, cardB].filter(Boolean);
        return inputs.length === 0 ? 'empty' : (inputs.length === 1 ? 'single' : 'dual');
    }

    function describeInputCard(card) {
        if (!card) return null;
        const normalized = SpellDefs.normalizeCard(card);
        const name = String(normalized?.name || '').trim();
        if (name) return name;
        const attrs = SpellDefs.getCardAttrSet(normalized)
            .map(attr => SpellDefs.getElementLabel ? SpellDefs.getElementLabel(attr) : attr)
            .filter(Boolean);
        return attrs.join('/') || '未命名输入';
    }

    function buildInputSummary(cardA, cardB) {
        const left = describeInputCard(cardA);
        const right = describeInputCard(cardB);
        if (!left && !right) return '空输入';
        if (left && right) return `${left} + ${right}`;
        return left || right || '未知输入';
    }

    function buildPendingMetadata(taskId, cardA, cardB) {
        return {
            taskId,
            runId: `run_${GameStorage.generateId()}`,
            cardAId: cardA?.id || null,
            cardBId: cardB?.id || null,
            inputState: buildInputState(cardA, cardB),
            inputSummary: buildInputSummary(cardA, cardB),
            source: null,
            requestedAt: Date.now(),
            rewardCardId: `reward_${GameStorage.generateId()}`,
            grantStatus: 'pending'
        };
    }

    function buildCardVideoRegistrationItem(card) {
        if (!card?.id) return null;
        const normalized = SpellDefs.normalizeCard(card);
        return {
            cardId: normalized.id,
            forgeTaskId: normalized.taskId || null,
            name: normalized.name || null,
            attrSet: SpellDefs.getCardAttrSet(normalized),
            generation: normalized.generation || 1,
            themeText: normalized.themeText || null,
            videoPrompt: normalized.videoPrompt || null,
            thumbnailUrl: GameStorage.getCardThumb(normalized) || null,
            sourceType: normalized.assetSourceType || (normalized.taskId ? 'player_generated' : 'built_in'),
            status: normalized.videoStatus || null,
            videoTaskId: normalized.videoTaskId || null,
            pixverseVideoId: normalized.pixverseVideoId || null,
            providerStatus: normalized.videoProviderStatus ?? null,
            submitAttempts: normalized.submitAttempts || 0,
            pollCount: normalized.pollCount || 0,
            resultUrl: normalized.videoResultUrl || normalized.videoUrl || null,
            videoUrl: normalized.videoUrl || null,
            error: normalized.videoError || null,
            updatedAt: normalized.videoUpdatedAt || null
        };
    }

    function getPending(taskId = null) {
        const pending = GameStorage.getPending();
        if (!pending) return null;
        if (taskId && pending.taskId !== taskId) return null;
        return pending;
    }

    function buildPendingRewardDraft(pending) {
        if (!pending?.result) return null;
        const result = pending.result;
        const existing = GameStorage.getPendingRewardCard(pending.taskId) || pending.rewardDraft || null;
        const fallbackThumb = existing?.thumbnailUrl
            || existing?.thumbnail
            || GameStorage.generateTextThumbnail(result.name || '新法阵');
        const fallbackStatus = existing?.videoStatus
            || (result.videoUrl ? 'completed' : 'not_generated');
        return {
            id: existing?.id || pending.rewardCardId || `reward_${GameStorage.generateId()}`,
            name: result.name,
            type: 'spell',
            status: result.status || 'partial',
            videoUrl: existing?.videoUrl || result.videoUrl || null,
            spellImgUrl: null,
            thumbnailUrl: existing?.thumbnailUrl || existing?.thumbnail || fallbackThumb,
            thumbnail: null,
            thumbnailKind: existing?.thumbnailKind || 'text_fallback',
            attrSet: result.attrSet || [],
            themeText: result.themeText || result.visualDesc || null,
            videoPrompt: result.videoPrompt || result.fusionPrompt || null,
            promptRoute: result.promptRoute || null,
            promptRouteReason: result.promptRouteReason || null,
            promptFallbackApplied: Boolean(result.promptFallbackApplied),
            promptTemplate: result.promptTemplate || null,
            promptModel: result.promptModel || null,
            promptRouteElapsedMs: result.promptRouteElapsedMs ?? null,
            promptGenerationElapsedMs: result.promptGenerationElapsedMs ?? null,
            promptTotalElapsedMs: result.promptTotalElapsedMs ?? null,
            taskId: result.taskId || pending.taskId,
            assetId: existing?.assetId || null,
            assetSourceType: 'player_generated',
            videoStatus: fallbackStatus,
            videoTaskId: existing?.videoTaskId || null,
            pixverseVideoId: existing?.pixverseVideoId || null,
            videoProviderStatus: existing?.videoProviderStatus ?? null,
            videoError: existing?.videoError || null,
            videoResultUrl: existing?.videoResultUrl || existing?.videoUrl || result.videoUrl || null,
            videoUpdatedAt: existing?.videoUpdatedAt || Date.now(),
            element: result.element || result.mainAttr,
            mainAttr: result.mainAttr || result.element,
            subAttr: result.subAttr || null,
            generation: result.generation || 1,
            baseAtk: result.baseAtk || SpellDefs.calcBaseAtk(result.generation || 1),
            inputState: result.inputState || pending.inputState || null,
            inputSummary: result.inputSummary || pending.inputSummary || null,
            source: result.source || pending.source || null,
            parentA: pending.cardAId || null,
            parentB: pending.cardBId || null,
            createdAt: existing?.createdAt || pending.requestedAt || Date.now()
        };
    }

    function persistPendingRewardDraft(taskId, draft) {
        if (!draft) return null;
        GameStorage.setPendingRewardDraft(taskId, draft);
        return GameStorage.getPendingRewardCard(taskId);
    }

    async function ensurePendingRewardDraft(taskId) {
        const pending = getPending(taskId);
        if (!pending?.result) return pending;
        const draft = buildPendingRewardDraft(pending);
        persistPendingRewardDraft(taskId, draft);
        return getPending(taskId);
    }

    function stopPendingRewardPolling() {
        activePendingRewardTaskId = null;
        if (!pendingRewardPollTimer) return;
        clearTimeout(pendingRewardPollTimer);
        pendingRewardPollTimer = null;
    }

    function startPendingRewardPolling(taskId, cardId) {
        if (!taskId || !cardId) return;
        stopPendingRewardPolling();
        activePendingRewardTaskId = taskId;
        const tick = async () => {
            const pending = getPending(taskId);
            if (!pending?.rewardDraft || pending.rewardDraft.id !== cardId) {
                stopPendingRewardPolling();
                return;
            }
            const asset = await getCardVideoStatus(cardId);
            if (!asset) {
                pendingRewardPollTimer = setTimeout(tick, PENDING_REWARD_POLL_MS);
                return;
            }
            await ensurePendingRewardThumbnail(taskId);
            const latest = getPending(taskId);
            const status = latest?.rewardDraft?.videoStatus || asset.status || 'not_generated';
            if (status === 'completed' || status === 'failed') {
                stopPendingRewardPolling();
                return;
            }
            pendingRewardPollTimer = setTimeout(tick, PENDING_REWARD_POLL_MS);
        };
        pendingRewardPollTimer = setTimeout(tick, PENDING_REWARD_POLL_MS);
    }

    async function registerPendingReward(taskId) {
        const pending = await ensurePendingRewardDraft(taskId);
        const draft = pending?.rewardDraft;
        if (!draft?.id) return pending;
        const resp = await registerGeneratedCards([draft]);
        const asset = resp?.cards?.find(item => item.cardId === draft.id);
        if (asset) {
            GameStorage.applyPendingVideoAssetState(draft.id, asset);
        }
        return getPending(taskId);
    }

    async function ensurePendingRewardVideoStarted(taskId) {
        const pending = await registerPendingReward(taskId);
        const draft = pending?.rewardDraft;
        if (!draft?.id || !draft.videoPrompt) return pending;
        const status = draft.videoStatus || 'not_generated';
        if (status === 'completed' || status === 'generating') {
            return pending;
        }
        if (status === 'failed') {
            return pending;
        }
        const resp = await startPixVerseFromCard(draft.id);
        if (!resp?.ok || !resp.asset) {
            persistPendingRewardDraft(taskId, {
                ...draft,
                videoStatus: 'failed',
                videoError: resp?.error || 'PixVerse 任务启动失败',
                videoUpdatedAt: Date.now()
            });
            return getPending(taskId);
        }
        GameStorage.applyPendingVideoAssetState(draft.id, resp.asset);
        return getPending(taskId);
    }

    async function captureVideoThumbnail(videoUrl) {
        if (!videoUrl) return null;
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let done = false;

            const cleanup = () => {
                video.pause();
                video.removeAttribute('src');
                video.load();
            };

            const fail = (error) => {
                if (done) return;
                done = true;
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error || 'thumbnail capture failed')));
            };

            const succeed = (value) => {
                if (done) return;
                done = true;
                cleanup();
                resolve(value);
            };

            const renderFrame = () => {
                const width = video.videoWidth || 0;
                const height = video.videoHeight || 0;
                if (!ctx || !width || !height) {
                    fail(new Error('video frame is not ready'));
                    return;
                }
                canvas.width = 180;
                canvas.height = 250;
                ctx.fillStyle = '#060505';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                const scale = Math.min(canvas.width / width, canvas.height / height);
                const drawW = Math.max(1, Math.round(width * scale));
                const drawH = Math.max(1, Math.round(height * scale));
                const dx = Math.round((canvas.width - drawW) / 2);
                const dy = Math.round((canvas.height - drawH) / 2);
                try {
                    ctx.drawImage(video, dx, dy, drawW, drawH);
                    succeed(canvas.toDataURL('image/webp', 0.82));
                } catch (error) {
                    fail(error);
                }
            };

            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            video.crossOrigin = 'anonymous';
            video.onerror = () => fail(new Error('video load failed'));
            video.onloadeddata = () => {
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                const captureAt = duration > 0.2
                    ? Math.min(duration * 0.5, Math.max(duration - 0.05, 0.05))
                    : 0;
                if (captureAt > 0) {
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        renderFrame();
                    };
                    video.addEventListener('seeked', onSeeked, { once: true });
                    try {
                        video.currentTime = captureAt;
                    } catch (error) {
                        video.removeEventListener('seeked', onSeeked);
                        renderFrame();
                    }
                    return;
                }
                renderFrame();
            };
            video.src = videoUrl;
            video.load();
        });
    }

    async function ensurePendingRewardThumbnail(taskId) {
        const pending = getPending(taskId);
        const draft = pending?.rewardDraft;
        if (!draft?.id || draft.videoStatus !== 'completed' || !draft.videoUrl) {
            return pending;
        }
        if (draft.thumbnailKind === 'video_frame' && draft.thumbnailUrl) {
            return pending;
        }
        try {
            const thumbnailUrl = await captureVideoThumbnail(draft.videoUrl);
            if (!thumbnailUrl) return getPending(taskId);
            const nextDraft = {
                ...draft,
                thumbnailUrl,
                thumbnail: null,
                thumbnailKind: 'video_frame',
                videoUpdatedAt: Date.now()
            };
            persistPendingRewardDraft(taskId, nextDraft);
            await registerGeneratedCards([nextDraft]);
        } catch (error) {
            console.warn('[ForgeAPI] captureVideoThumbnail failed:', error);
        }
        return getPending(taskId);
    }

    async function primePendingRewardRun(taskId, { refreshStatus = false } = {}) {
        let pending = getPending(taskId);
        if (!pending) return null;
        if (!(pending.status === 'done' && pending.result)) {
            return pending;
        }

        pending = await ensurePendingRewardDraft(taskId);
        pending = await registerPendingReward(taskId);

        const draft = pending?.rewardDraft;
        if (!draft?.id) return pending;

        if (refreshStatus || draft.videoStatus === 'generating' || draft.videoStatus === 'completed') {
            await getCardVideoStatus(draft.id);
            pending = getPending(taskId);
        }

        if ((pending?.rewardDraft?.videoStatus || 'not_generated') === 'not_generated') {
            pending = await ensurePendingRewardVideoStarted(taskId);
        }

        if (pending?.rewardDraft?.videoStatus === 'completed') {
            pending = await ensurePendingRewardThumbnail(taskId);
        }

        const latest = getPending(taskId);
        if (latest?.rewardDraft?.id && latest.rewardDraft.videoStatus === 'generating') {
            startPendingRewardPolling(taskId, latest.rewardDraft.id);
        }
        return latest;
    }

    function startForge(cardA, cardB) {
        const a = cardA ? SpellDefs.normalizeCard(cardA) : null;
        const b = cardB ? SpellDefs.normalizeCard(cardB) : null;

        if (USE_MOCK) return mockForge(a, b);
        return realForge(a, b);
    }

    function buildRequestSpell(card) {
        if (!card) return null;
        const normalized = SpellDefs.normalizeCard(card);
        return {
            id: normalized.id,
            type: normalized.type,
            name: normalized.name,
            attrSet: SpellDefs.getCardAttrSet(normalized),
            mainAttr: normalized.mainAttr,
            themeText: normalized.themeText || null,
            generation: normalized.generation || 1
        };
    }

    function buildMockResult(cardA, cardB) {
        const inputs = [cardA, cardB].filter(Boolean);
        const inputState = inputs.length === 0 ? 'empty' : (inputs.length === 1 ? 'single' : 'dual');

        if (inputState === 'empty') {
            return {
                name: '熔岩法阵',
                attrSet: ['fire'],
                themeText: '一枚熔岩主题的炼金法阵贴地展开，中心像被压缩的熔火核心般稳定脉动。',
                mainAttr: 'fire',
                subAttr: null,
                element: 'fire',
                generation: 1,
                baseAtk: SpellDefs.calcBaseAtk(1),
                videoPrompt: '标准等距2.5D游戏俯视视角，纯黑背景，仅展示一个独立技能特效资产。熔岩主题法阵贴地展开，中心熔火核心稳定脉动。',
                promptRoute: 'local_fallback',
                promptRouteReason: 'mock fallback',
                promptFallbackApplied: true,
                promptTemplate: null,
                promptModel: null,
                promptRouteElapsedMs: null,
                promptGenerationElapsedMs: null,
                promptTotalElapsedMs: 0,
                videoUrl: null,
                status: 'partial',
                source: 'opening_pool',
                inputState
            };
        }

        const generation = Math.max(...inputs.map(card => card.generation || 1)) + 1;
        const attrSet = SpellDefs.mergeAttrSets(...inputs.map(card => SpellDefs.getCardAttrSet(card)));
        const mainAttr = attrSet[0] || SpellDefs.ELEMENTS[0];
        const subAttr = attrSet[1] || null;
        const names = inputs.map(card => card.name).join(' / ');

        return {
            name: names.replace(/\s*\/\s*/g, '').slice(0, 6) || '新法阵',
            attrSet,
            themeText: `${names} 的语义被重铸为一枚新法阵，边界清晰，中心主体凝聚，能量在技能范围内受控流动。`,
            mainAttr,
            subAttr,
            element: mainAttr,
            generation,
            baseAtk: SpellDefs.calcBaseAtk(generation),
            videoPrompt: `标准等距2.5D游戏俯视视角，纯黑背景，仅展示一个独立技能特效资产。${names} 的语义被重铸为一枚新法阵。`,
            promptRoute: 'local_fallback',
            promptRouteReason: 'mock fallback',
            promptFallbackApplied: true,
            promptTemplate: null,
            promptModel: null,
            promptRouteElapsedMs: null,
            promptGenerationElapsedMs: null,
            promptTotalElapsedMs: 0,
            videoUrl: null,
            status: 'partial',
            source: 'fallback',
            inputState
        };
    }

    function mockForge(cardA, cardB) {
        const taskId = 'task_' + Date.now();
        GameStorage.setPending(taskId, buildPendingMetadata(taskId, cardA, cardB));

        setTimeout(() => {
            const pending = GameStorage.writePendingResult(taskId, buildMockResult(cardA, cardB));
            if (pending?.result) {
                console.log('[ForgeAPI] mock result written:', pending.result.name);
                logPromptRoutingAudit(taskId, pending.result, 'mock');
                void primePendingRewardRun(taskId);
            }
        }, 1500);

        return Promise.resolve({ ok: true, taskId });
    }

    function realForge(cardA, cardB) {
        const playerId = GameStorage.getPlayerId();
        console.log('[ForgeAPI] creating forge task:', {
            playerId,
            inputState: buildInputState(cardA, cardB),
            inputSummary: buildInputSummary(cardA, cardB)
        });
        return fetch(buildApiUrl('/api/forge'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerId,
                spellA: buildRequestSpell(cardA),
                spellB: buildRequestSpell(cardB)
            })
        })
            .then(async res => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message = data?.detail?.message || data?.detail || `HTTP ${res.status}`;
                    throw new Error(message);
                }
                return data;
            })
            .then(resp => {
                const realTaskId = resp.taskId;
                const pendingMeta = buildPendingMetadata(realTaskId, cardA, cardB);
                GameStorage.setPending(realTaskId, pendingMeta);
                console.log('[ForgeAPI] task created:', {
                    taskId: realTaskId,
                    inputState: pendingMeta.inputState,
                    inputSummary: pendingMeta.inputSummary
                });
                startPolling(realTaskId);
                return { ok: true, taskId: realTaskId };
            })
            .catch(err => {
                console.error('[ForgeAPI] POST /api/forge failed:', err);
                return {
                    ok: false,
                    error: err?.message || '炼金请求失败'
                };
            });
    }

    function startPolling(taskId) {
        stopPolling();
        pollCount = 0;
        pollTimer = setInterval(() => {
            pollCount += 1;
            if (pollCount > MAX_POLLS) {
                console.warn('[ForgeAPI] polling timed out');
                stopPolling();
                clearPendingTask(taskId);
                return;
            }
            fetch(buildApiUrl(`/api/forge/status/${taskId}`))
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    const normalizedStatus = normalizeMediaPayload(data);
                    if (normalizedStatus.status === 'completed' && normalizedStatus.result) {
                        stopPolling();
                        const pending = GameStorage.writePendingResult(taskId, normalizedStatus.result);
                        if (pending?.result) {
                            console.log('[ForgeAPI] forge completed:', pending.result.name, '(source=' + (pending.result.source || '?') + ')');
                            console.log('[ForgeAPI] forge result payload:', pending.result);
                            logPromptRoutingAudit(taskId, pending.result, 'poll');
                            void primePendingRewardRun(taskId);
                        }
                    } else if (normalizedStatus.status === 'failed') {
                        stopPolling();
                        clearPendingTask(taskId);
                        console.error('[ForgeAPI] forge task failed:', normalizedStatus.error);
                    }
                })
                .catch(err => {
                    console.warn('[ForgeAPI] poll error:', err.message);
                });
        }, 3000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function checkStatus(taskId) {
        if (USE_MOCK) return null;
        try {
            const res = await fetch(buildApiUrl(`/api/forge/status/${taskId}`));
            if (!res.ok) return null;
            return normalizeMediaPayload(await res.json());
        } catch (e) {
            console.warn('[ForgeAPI] checkStatus failed:', e);
            return null;
        }
    }

    async function startPixVerseFromForge(forgeTaskId) {
        if (USE_MOCK) {
            return {
                ok: true,
                task: {
                    videoTaskId: 'vtask_mock',
                    forgeTaskId,
                    pixverseVideoId: 123456,
                    status: 'succeeded',
                    providerStatus: 1,
                    resultUrl: 'https://example.com/mock.mp4',
                    error: null,
                    submitAttempts: 1,
                    pollCount: 1
                }
            };
        }

        try {
            const res = await fetch(buildApiUrl(`/api/video/pixverse/from-forge/${encodeURIComponent(forgeTaskId)}`), {
                method: 'POST'
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const message = data?.detail || `HTTP ${res.status}`;
                throw new Error(message);
            }
            const normalizedTask = normalizeMediaPayload(data);
            console.log('[ForgeAPI] PixVerse task started:', normalizedTask);
            return { ok: true, task: normalizedTask };
        } catch (err) {
            console.error('[ForgeAPI] startPixVerseFromForge failed:', err);
            return {
                ok: false,
                error: err?.message || 'PixVerse 任务启动失败'
            };
        }
    }

    async function registerGeneratedCards(cards) {
        const items = (cards || [])
            .map(buildCardVideoRegistrationItem)
            .filter(Boolean)
            .filter(item => item.forgeTaskId || item.videoTaskId || item.sourceType === 'player_generated');
        if (items.length === 0) {
            return { ok: true, cards: [] };
        }

        try {
            const res = await fetch(buildApiUrl('/api/video/pixverse/cards/register'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cards: items })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const message = data?.detail || `HTTP ${res.status}`;
                throw new Error(message);
            }
            const normalizedCards = normalizeMediaPayload(data?.cards || []);
            GameStorage.applyCardVideoAssetStates(normalizedCards);
            normalizedCards.forEach(asset => {
                if (asset?.cardId) GameStorage.applyPendingVideoAssetState(asset.cardId, asset);
            });
            return { ok: true, cards: normalizedCards };
        } catch (err) {
            console.warn('[ForgeAPI] registerGeneratedCards failed:', err);
            return { ok: false, error: err?.message || '卡牌视频状态注册失败', cards: [] };
        }
    }

    async function bootstrapCardVideoAssets() {
        const cards = GameStorage.getSpellCards().filter(card => (card.taskId || card.assetSourceType === 'player_generated'));
        const resp = cards.length === 0 ? { ok: true, cards: [] } : await registerGeneratedCards(cards);
        await resumePendingRun();
        return resp;
    }

    async function getCardVideoStatus(cardId) {
        try {
            const res = await fetch(buildApiUrl(`/api/video/pixverse/card/${encodeURIComponent(cardId)}`));
            if (!res.ok) return null;
            const data = normalizeMediaPayload(await res.json());
            GameStorage.applyCardVideoAssetState(cardId, data);
            GameStorage.applyPendingVideoAssetState(cardId, data);
            return data;
        } catch (err) {
            console.warn('[ForgeAPI] getCardVideoStatus failed:', err);
            return null;
        }
    }

    async function startPixVerseFromCard(cardId) {
        if (USE_MOCK) {
            return {
                ok: true,
                asset: {
                    assetId: `player_generated:${cardId}`,
                    cardId,
                    sourceType: 'player_generated',
                    status: 'completed',
                    videoTaskId: 'vtask_mock',
                    pixverseVideoId: 123456,
                    providerStatus: 1,
                    resultUrl: 'https://example.com/mock.mp4',
                    videoUrl: 'https://example.com/mock.mp4',
                    error: null,
                    submitAttempts: 1,
                    pollCount: 1
                }
            };
        }

        try {
            const res = await fetch(buildApiUrl(`/api/video/pixverse/from-card/${encodeURIComponent(cardId)}`), {
                method: 'POST'
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const message = data?.detail || `HTTP ${res.status}`;
                throw new Error(message);
            }
            const normalizedAsset = normalizeMediaPayload(data);
            GameStorage.applyCardVideoAssetState(cardId, normalizedAsset);
            GameStorage.applyPendingVideoAssetState(cardId, normalizedAsset);
            return { ok: true, asset: normalizedAsset };
        } catch (err) {
            console.error('[ForgeAPI] startPixVerseFromCard failed:', err);
            return {
                ok: false,
                error: err?.message || 'PixVerse 任务启动失败'
            };
        }
    }

    async function checkPixVerseStatus(videoTaskId) {
        if (USE_MOCK) {
            return {
                videoTaskId,
                forgeTaskId: 'task_mock',
                pixverseVideoId: 123456,
                status: 'succeeded',
                providerStatus: 1,
                resultUrl: 'https://example.com/mock.mp4',
                error: null
            };
        }

        try {
            const res = await fetch(buildApiUrl(`/api/video/pixverse/status/${encodeURIComponent(videoTaskId)}`));
            if (!res.ok) return null;
            return normalizeMediaPayload(await res.json());
        } catch (e) {
            console.warn('[ForgeAPI] checkPixVerseStatus failed:', e);
            return null;
        }
    }

    async function resumePendingRun() {
        const pending = GameStorage.getPending();
        if (!pending?.taskId) return null;
        if (pending.status === 'done' && pending.result) {
            return primePendingRewardRun(pending.taskId, { refreshStatus: true });
        }
        startPolling(pending.taskId);
        return pending;
    }

    return {
        startForge,
        checkStatus,
        stopPolling,
        startPixVerseFromForge,
        checkPixVerseStatus,
        registerGeneratedCards,
        bootstrapCardVideoAssets,
        getCardVideoStatus,
        startPixVerseFromCard,
        primePendingRewardRun,
        resumePendingRun,
        USE_MOCK
    };
})();
