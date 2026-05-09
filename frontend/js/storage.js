/**
 * storage.js - localStorage 数据管理
 */
const GameStorage = (() => {
    const STORAGE_KEY = 'alchemy-forge-data';
    const SEED_VERSION = 4;
    const PLAYER_ID_PARAM = 'playerId';
    const MANAGED_BUILTIN_ASSET_IDS = [
        'fire-starter',
        'ice-starter',
        'thunder-starter',
        'blight-starter',
        'fire-basic-01',
        'fire-basic-02',
        'ice-basic-01',
        'ice-basic-02',
        'thunder-basic-01',
        'thunder-basic-02',
        'blight-basic-01',
        'blight-basic-02'
    ];
    const MANAGED_BUILTIN_ASSET_ID_SET = new Set(MANAGED_BUILTIN_ASSET_IDS);
    const DEFAULT_BUILTIN_LOADOUT = ['fire-starter', 'ice-starter', 'thunder-starter', 'blight-starter'];

    const DEFAULT_DATA = {
        playerId: null,
        cards: [],
        currentSlotA: null,
        currentSlotB: null,
        loadout: [null, null, null, null],
        pendingGeneration: null,
        tutorialDone: false,
        seedVersion: 0
    };

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return structuredClone(DEFAULT_DATA);
            return { ...structuredClone(DEFAULT_DATA), ...JSON.parse(raw) };
        } catch {
            return structuredClone(DEFAULT_DATA);
        }
    }

    function save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function normalizeMediaPayload(payload) {
        return typeof AlchemyRuntime !== 'undefined' && AlchemyRuntime.normalizeMediaPayload
            ? AlchemyRuntime.normalizeMediaPayload(payload)
            : payload;
    }

    function resolveMediaUrl(value) {
        if (typeof AlchemyRuntime !== 'undefined' && AlchemyRuntime.resolveMediaUrl) {
            return AlchemyRuntime.resolveMediaUrl(value);
        }
        return value || null;
    }

    function normalizeCardMediaFields(card) {
        if (!card || typeof card !== 'object') return card;
        return {
            ...card,
            thumbnailUrl: resolveMediaUrl(card.thumbnailUrl),
            videoUrl: resolveMediaUrl(card.videoUrl),
            videoResultUrl: resolveMediaUrl(card.videoResultUrl || card.resultUrl || card.videoUrl),
            sfxUrl: resolveMediaUrl(card.sfxUrl)
        };
    }

    function getCardVideoUrl(card) {
        return resolveMediaUrl(card?.videoUrl) || null;
    }

    function getCardResultUrl(card) {
        return resolveMediaUrl(card?.videoResultUrl || card?.resultUrl || card?.videoUrl) || null;
    }

    function getCardSfxUrl(card) {
        return resolveMediaUrl(card?.sfxUrl) || getCardVideoUrl(card) || null;
    }

    function isManagedBuiltinAssetId(value) {
        const assetId = String(value || '').trim();
        return MANAGED_BUILTIN_ASSET_ID_SET.has(assetId);
    }

    function getManagedBuiltinSortIndex(value) {
        const assetId = String(value || '').trim();
        const index = MANAGED_BUILTIN_ASSET_IDS.indexOf(assetId);
        return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    }

    function buildStoredBuiltinCard(asset, existingCard = null) {
        const normalizedAsset = normalizeMediaPayload(asset) || asset || {};
        const previous = existingCard || {};
        const attrSet = normalizeStoredAttrSet(normalizedAsset);
        const generation = Math.max(1, Number(normalizedAsset?.generation) || 1);
        const fallbackBaseAtk = (typeof SpellDefs !== 'undefined' && SpellDefs.calcBaseAtk)
            ? SpellDefs.calcBaseAtk(generation)
            : null;
        const completedVideoUrl = normalizedAsset?.videoUrl || normalizedAsset?.resultUrl || null;
        return normalizeCardMediaFields({
            ...previous,
            id: normalizedAsset.assetId,
            name: normalizedAsset.name || normalizedAsset.assetId,
            type: 'spell',
            status: normalizedAsset.status || (completedVideoUrl ? 'partial' : 'legacy'),
            videoUrl: completedVideoUrl,
            spellImgUrl: null,
            thumbnailUrl: normalizedAsset.thumbnailUrl || null,
            thumbnail: null,
            thumbnailKind: null,
            attrSet,
            element: attrSet[0] || null,
            mainAttr: attrSet[0] || null,
            subAttr: attrSet[1] || null,
            generation,
            baseAtk: Number(normalizedAsset?.baseAtk) || fallbackBaseAtk,
            themeText: normalizedAsset.themeText || normalizedAsset.description || null,
            videoPrompt: normalizedAsset.videoPrompt || null,
            promptRoute: previous.promptRoute || null,
            promptRouteReason: previous.promptRouteReason || null,
            promptFallbackApplied: Boolean(previous.promptFallbackApplied),
            promptTemplate: previous.promptTemplate || null,
            promptModel: previous.promptModel || null,
            promptRouteElapsedMs: previous.promptRouteElapsedMs || null,
            promptGenerationElapsedMs: previous.promptGenerationElapsedMs || null,
            promptTotalElapsedMs: previous.promptTotalElapsedMs || null,
            taskId: null,
            inputState: null,
            inputSummary: null,
            source: normalizedAsset.origin || 'built_in',
            assetId: normalizedAsset.assetId,
            assetSourceType: normalizedAsset.sourceType || 'built_in',
            videoStatus: normalizedAsset.status || (completedVideoUrl ? 'completed' : 'not_generated'),
            videoTaskId: null,
            pixverseVideoId: null,
            videoProviderStatus: normalizedAsset.providerStatus || (completedVideoUrl ? 1 : null),
            videoError: normalizedAsset.error || null,
            videoResultUrl: normalizedAsset.resultUrl || completedVideoUrl,
            videoUpdatedAt: Number(normalizedAsset.updatedAt) || Date.now(),
            sfxPath: normalizedAsset.sfxPath || null,
            sfxUrl: normalizedAsset.sfxUrl || null,
            parentA: null,
            parentB: null,
            createdAt: previous.createdAt || Number(normalizedAsset.createdAt) || Date.now()
        });
    }

    function remapCardId(nextId, previousCardsById, validIds) {
        if (nextId && validIds.has(nextId)) return nextId;
        const previous = previousCardsById.get(nextId);
        const assetId = previous?.assetId || null;
        if (assetId && validIds.has(assetId)) return assetId;
        return null;
    }

    function fillMissingLoadoutSlots(loadout, validIds) {
        const nextLoadout = Array.isArray(loadout) ? loadout.slice(0, 4) : [null, null, null, null];
        while (nextLoadout.length < 4) nextLoadout.push(null);
        const used = new Set(nextLoadout.filter(Boolean));
        DEFAULT_BUILTIN_LOADOUT.forEach(assetId => {
            if (!validIds.has(assetId) || used.has(assetId)) return;
            const emptyIndex = nextLoadout.findIndex(value => !value);
            if (emptyIndex === -1) return;
            nextLoadout[emptyIndex] = assetId;
            used.add(assetId);
        });
        return nextLoadout;
    }

    async function syncBuiltinCardsFromBackend() {
        try {
            const res = await fetch(AlchemyRuntime.buildApiUrl('/api/assets/cards?sourceType=built_in'), { cache: 'no-store' });
            const payload = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(payload?.detail || `HTTP ${res.status}`);
            }

            const normalizedPayload = normalizeMediaPayload(payload) || payload;
            const assets = (normalizedPayload?.assets || [])
                .filter(asset => isManagedBuiltinAssetId(asset?.assetId))
                .sort((a, b) => getManagedBuiltinSortIndex(a?.assetId) - getManagedBuiltinSortIndex(b?.assetId));

            if (assets.length === 0) {
                console.warn('[Storage] backend returned no managed built-in assets, keeping current local built-ins');
                return { ok: false, assets: [] };
            }
            if (assets.length !== MANAGED_BUILTIN_ASSET_IDS.length) {
                console.warn('[Storage] managed built-in asset count mismatch:', assets.length, assets.map(asset => asset.assetId));
            }

            const data = load();
            const previousCardsById = new Map((data.cards || []).map(card => [card.id, card]));
            const managedBuiltinCards = assets.map(asset => {
                const previousCard = previousCardsById.get(asset.assetId) || null;
                return buildStoredBuiltinCard(asset, previousCard);
            });
            const preservedCards = (data.cards || []).filter(card => {
                const normalizedSource = inferAssetSourceType(card);
                if (normalizedSource === 'player_generated') return true;
                if (card?.type === 'text') return true;
                return !isManagedBuiltinAssetId(card?.assetId || card?.id);
            }).filter(card => {
                const normalizedSource = inferAssetSourceType(card);
                return normalizedSource === 'player_generated' || card?.type === 'text';
            });

            data.cards = [...preservedCards, ...managedBuiltinCards];
            const validIds = new Set(data.cards.map(card => card.id));
            const currentLoadout = Array.isArray(data.loadout) ? data.loadout : [null, null, null, null];
            const remappedLoadout = currentLoadout.map(id => remapCardId(id, previousCardsById, validIds));
            data.loadout = fillMissingLoadoutSlots(remappedLoadout, validIds);
            data.currentSlotA = remapCardId(data.currentSlotA, previousCardsById, validIds);
            data.currentSlotB = remapCardId(data.currentSlotB, previousCardsById, validIds);
            save(data);
            console.log('[Storage] synced managed built-in assets from backend:', assets.map(asset => asset.assetId));
            return { ok: true, assets };
        } catch (err) {
            console.warn('[Storage] built-in asset sync failed, keeping local fallback cards:', err);
            return { ok: false, assets: [], error: err?.message || String(err) };
        }
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function sanitizePlayerId(value) {
        const text = String(value || '').trim();
        if (!text) return null;
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(text)) return null;
        return text;
    }

    function getUrlPlayerIdOverride() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            return sanitizePlayerId(params.get(PLAYER_ID_PARAM));
        } catch {
            return null;
        }
    }

    function setPlayerId(playerId) {
        const normalized = sanitizePlayerId(playerId);
        if (!normalized) {
            throw new Error('playerId must be 6-64 chars and only use letters, numbers, _ or -');
        }
        const data = load();
        data.playerId = normalized;
        save(data);
        console.log('[Storage] playerId set:', normalized);
        return normalized;
    }

    function resetPlayerId() {
        const nextId = `player_${generateId()}`;
        return setPlayerId(nextId);
    }

    function getPlayerId() {
        const data = load();
        const urlOverride = getUrlPlayerIdOverride();
        if (urlOverride && data.playerId !== urlOverride) {
            data.playerId = urlOverride;
            save(data);
            console.log('[Storage] playerId overridden from URL:', urlOverride);
        }
        if (data.playerId) return data.playerId;
        data.playerId = `player_${generateId()}`;
        save(data);
        return data.playerId;
    }

    function getPlayerIdInfo() {
        const currentPlayerId = getPlayerId();
        const data = load();
        return {
            playerId: currentPlayerId,
            storedPlayerId: sanitizePlayerId(data.playerId),
            urlOverride: getUrlPlayerIdOverride(),
            storageKey: STORAGE_KEY
        };
    }

    function normalizeStoredAttrSet(cardLike) {
        if (typeof SpellDefs !== 'undefined' && SpellDefs.normalizeAttrSet) {
            return SpellDefs.normalizeAttrSet(cardLike.attrSet, cardLike.mainAttr, cardLike.subAttr, cardLike.element);
        }
        return Array.isArray(cardLike.attrSet) ? [...cardLike.attrSet] : [];
    }

    function normalizeVideoStatus(status, fallback = null) {
        const raw = String(status || '').trim().toLowerCase();
        if (!raw) return fallback;
        if (['not_generated', 'none', 'idle'].includes(raw)) return 'not_generated';
        if (['generating', 'queued', 'submitting', 'polling', 'running', 'in_progress'].includes(raw)) return 'generating';
        if (['completed', 'ready', 'succeeded', 'success'].includes(raw)) return 'completed';
        if (['failed', 'error'].includes(raw)) return 'failed';
        return fallback;
    }

    function inferAssetSourceType(card) {
        if (card?.assetSourceType) return card.assetSourceType;
        if (card?.taskId) return 'player_generated';
        if (card?.type === 'spell' || card?.type === 'basic') return 'built_in';
        return null;
    }

    function inferVideoStatus(card) {
        const explicit = normalizeVideoStatus(card?.videoStatus, null);
        if (explicit) return explicit;
        if (card?.videoTaskId && !card?.videoUrl) return 'generating';
        if (card?.videoUrl) return 'completed';
        if (inferAssetSourceType(card) === 'player_generated') return 'not_generated';
        return null;
    }

    function normalizeCardForRead(card) {
        if (!card) return null;
        const normalized = typeof SpellDefs !== 'undefined' && SpellDefs.normalizeCard
            ? SpellDefs.normalizeCard(card)
            : { ...card };

        normalized.assetId = normalized.assetId || null;
        normalized.assetSourceType = inferAssetSourceType(normalized);
        normalized.videoStatus = inferVideoStatus(normalized);
        normalized.videoTaskId = normalized.videoTaskId || null;
        normalized.pixverseVideoId = Number.isFinite(Number(normalized.pixverseVideoId))
            ? Number(normalized.pixverseVideoId)
            : null;
        normalized.videoProviderStatus = Number.isFinite(Number(normalized.videoProviderStatus))
            ? Number(normalized.videoProviderStatus)
            : null;
        normalized.videoError = normalized.videoError || null;
        normalized.videoResultUrl = normalized.videoResultUrl || normalized.videoUrl || null;
        normalized.videoUpdatedAt = Number.isFinite(Number(normalized.videoUpdatedAt))
            ? Number(normalized.videoUpdatedAt)
            : null;
        return normalizeCardMediaFields(normalized);
    }

    function normalizePendingRewardDraft(card) {
        if (!card) return null;
        return normalizeCardForRead(card);
    }

    async function seedIfNeeded() {
        const data = load();
        if (data.seedVersion < SEED_VERSION) {
            try {
                const res = await fetch('assets/data/seed_cards.json');
                const seeds = await res.json();

                data.cards = data.cards.filter(c => c.type === 'text');

                seeds.forEach(seed => {
                    const normalizedSeed = normalizeMediaPayload(seed) || seed;
                    const attrSet = normalizeStoredAttrSet(normalizedSeed);
                    data.cards.push(normalizeCardMediaFields({
                        id: generateId(),
                        name: normalizedSeed.name,
                        type: normalizedSeed.type,
                        status: normalizedSeed.status || null,
                        videoUrl: normalizedSeed.videoUrl || null,
                        spellImgUrl: normalizedSeed.spellImgUrl || null,
                        thumbnailUrl: normalizedSeed.thumbnailUrl || null,
                        thumbnail: null,
                        thumbnailKind: null,
                        attrSet,
                        element: attrSet[0] || normalizedSeed.element || normalizedSeed.mainAttr || null,
                        mainAttr: attrSet[0] || normalizedSeed.mainAttr || normalizedSeed.element || null,
                        subAttr: attrSet[1] || normalizedSeed.subAttr || null,
                        generation: normalizedSeed.generation || null,
                        baseAtk: normalizedSeed.baseAtk || null,
                        themeText: normalizedSeed.themeText || normalizedSeed.visualDesc || null,
                        videoPrompt: normalizedSeed.videoPrompt || normalizedSeed.fusionPrompt || null,
                        promptRoute: normalizedSeed.promptRoute || null,
                        promptRouteReason: normalizedSeed.promptRouteReason || null,
                        promptFallbackApplied: Boolean(normalizedSeed.promptFallbackApplied),
                        promptTemplate: normalizedSeed.promptTemplate || null,
                        promptModel: normalizedSeed.promptModel || null,
                        promptRouteElapsedMs: normalizedSeed.promptRouteElapsedMs || null,
                        promptGenerationElapsedMs: normalizedSeed.promptGenerationElapsedMs || null,
                        promptTotalElapsedMs: normalizedSeed.promptTotalElapsedMs || null,
                        taskId: normalizedSeed.taskId || null,
                        inputState: normalizedSeed.inputState || null,
                        inputSummary: normalizedSeed.inputSummary || null,
                        source: normalizedSeed.source || null,
                        assetId: normalizedSeed.assetId || null,
                        assetSourceType: normalizedSeed.assetSourceType || (normalizedSeed.type === 'spell' || normalizedSeed.type === 'basic' ? 'built_in' : null),
                        videoStatus: normalizedSeed.videoStatus || (normalizedSeed.videoUrl ? 'completed' : 'not_generated'),
                        videoTaskId: normalizedSeed.videoTaskId || null,
                        pixverseVideoId: normalizedSeed.pixverseVideoId || null,
                        videoProviderStatus: normalizedSeed.videoProviderStatus || (normalizedSeed.videoUrl ? 1 : null),
                        videoError: normalizedSeed.videoError || null,
                        videoResultUrl: normalizedSeed.videoResultUrl || normalizedSeed.videoUrl || null,
                        videoUpdatedAt: Date.now(),
                        sfxPath: normalizedSeed.sfxPath || null,
                        sfxUrl: normalizedSeed.sfxUrl || null,
                        parentA: null,
                        parentB: null,
                        createdAt: Date.now()
                    }));
                });

                const spells = data.cards.filter(c => c.type === 'spell');
                data.loadout = [
                    spells[0]?.id || null,
                    spells[1]?.id || null,
                    spells[2]?.id || null,
                    spells[3]?.id || null
                ];

                if (!data.playerId) data.playerId = `player_${generateId()}`;
                data.seedVersion = SEED_VERSION;
                save(data);
                console.log(`[Storage] Seeded ${seeds.length} fallback cards`);
            } catch (e) {
                console.warn('[Storage] Seed failed:', e);
            }
        }
        await syncBuiltinCardsFromBackend();
    }

    function getCards() {
        return load().cards.map(normalizeCardForRead);
    }

    function getSpellCards() {
        return getCards().filter(c => c.type === 'spell');
    }

    function getCard(id) {
        return getCards().find(c => c.id === id) || null;
    }

    function addCard(card) {
        const data = load();
        const attrSet = normalizeStoredAttrSet(card);
        const assetSourceType = card.assetSourceType || (card.taskId ? 'player_generated' : (card.type === 'spell' && card.videoUrl ? 'built_in' : null));
        const videoStatus = normalizeVideoStatus(card.videoStatus, card.videoUrl ? 'completed' : (assetSourceType === 'player_generated' ? 'not_generated' : null));
        const incomingId = card.id || generateId();
        const newCard = normalizeCardMediaFields({
            id: incomingId,
            name: card.name || '未命名',
            type: card.type || 'text',
            status: card.status || null,
            videoUrl: card.videoUrl || null,
            spellImgUrl: card.spellImgUrl || null,
            thumbnailUrl: card.thumbnailUrl || null,
            thumbnail: card.thumbnail || null,
            thumbnailKind: card.thumbnailKind || null,
            attrSet,
            element: attrSet[0] || card.element || card.mainAttr || null,
            mainAttr: attrSet[0] || card.mainAttr || card.element || null,
            subAttr: attrSet[1] || card.subAttr || null,
            generation: card.generation || null,
            baseAtk: card.baseAtk || null,
            themeText: card.themeText || card.visualDesc || null,
            videoPrompt: card.videoPrompt || card.fusionPrompt || null,
            promptRoute: card.promptRoute || null,
            promptRouteReason: card.promptRouteReason || null,
            promptFallbackApplied: Boolean(card.promptFallbackApplied),
            promptTemplate: card.promptTemplate || null,
            promptModel: card.promptModel || null,
            promptRouteElapsedMs: card.promptRouteElapsedMs || null,
            promptGenerationElapsedMs: card.promptGenerationElapsedMs || null,
            promptTotalElapsedMs: card.promptTotalElapsedMs || null,
            taskId: card.taskId || null,
            inputState: card.inputState || null,
            inputSummary: card.inputSummary || null,
            source: card.source || null,
            assetId: card.assetId || null,
            assetSourceType,
            videoStatus,
            videoTaskId: card.videoTaskId || null,
            pixverseVideoId: card.pixverseVideoId || null,
            videoProviderStatus: card.videoProviderStatus || null,
            videoError: card.videoError || null,
            videoResultUrl: card.videoResultUrl || card.resultUrl || card.videoUrl || null,
            videoUpdatedAt: card.videoUpdatedAt || Date.now(),
            sfxPath: card.sfxPath || null,
            sfxUrl: card.sfxUrl || null,
            parentA: card.parentA || null,
            parentB: card.parentB || null,
            createdAt: Date.now()
        });
        const existingIndex = data.cards.findIndex(item => item.id === incomingId);
        if (existingIndex >= 0) {
            data.cards[existingIndex] = normalizeCardMediaFields({
                ...data.cards[existingIndex],
                ...newCard,
                createdAt: data.cards[existingIndex].createdAt || newCard.createdAt
            });
        } else {
            data.cards.push(newCard);
        }
        save(data);
        return normalizeCardForRead(existingIndex >= 0 ? data.cards[existingIndex] : newCard);
    }

    function updateCard(id, updates) {
        const data = load();
        const index = data.cards.findIndex(card => card.id === id);
        if (index === -1) return null;
        data.cards[index] = normalizeCardMediaFields({ ...data.cards[index], ...updates });
        save(data);
        return normalizeCardForRead(data.cards[index]);
    }

    function removeCard(id) {
        const data = load();
        data.cards = data.cards.filter(c => c.id !== id);
        if (data.currentSlotA === id) data.currentSlotA = null;
        if (data.currentSlotB === id) data.currentSlotB = null;
        data.loadout = data.loadout.map(slotId => slotId === id ? null : slotId);
        save(data);
    }

    function getSlot(slot) {
        const data = load();
        const id = slot === 'A' ? data.currentSlotA : data.currentSlotB;
        return id ? getCard(id) : null;
    }

    function setSlot(slot, cardId) {
        const data = load();
        if (slot === 'A') data.currentSlotA = cardId;
        else data.currentSlotB = cardId;
        save(data);
    }

    function clearSlot(slot) {
        const data = load();
        if (slot === 'A') data.currentSlotA = null;
        else data.currentSlotB = null;
        save(data);
    }

    function clearSlots() {
        const data = load();
        data.currentSlotA = null;
        data.currentSlotB = null;
        save(data);
    }

    function areBothSlotsFilled() {
        const data = load();
        return data.currentSlotA !== null && data.currentSlotB !== null;
    }

    function getLoadout() {
        const data = load();
        return (data.loadout || [null, null, null, null]).map(id => id ? getCard(id) : null);
    }

    function setLoadoutSlot(index, cardId) {
        const data = load();
        if (!data.loadout) data.loadout = [null, null, null, null];
        data.loadout[index] = cardId;
        save(data);
    }

    function getLoadoutIds() {
        return load().loadout || [null, null, null, null];
    }

    function setPending(taskId, cardAIdOrMeta, cardBId) {
        const data = load();
        const meta = (cardAIdOrMeta && typeof cardAIdOrMeta === 'object' && !Array.isArray(cardAIdOrMeta))
            ? cardAIdOrMeta
            : { cardAId: cardAIdOrMeta ?? null, cardBId: cardBId ?? null };
        data.pendingGeneration = {
            taskId,
            runId: meta.runId || `run_${generateId()}`,
            cardAId: meta.cardAId ?? null,
            cardBId: meta.cardBId ?? null,
            inputState: meta.inputState ?? null,
            inputSummary: meta.inputSummary ?? null,
            source: meta.source ?? null,
            requestedAt: meta.requestedAt ?? Date.now(),
            status: meta.status || 'generating',
            result: meta.result || null,
            rewardCardId: meta.rewardCardId || `reward_${generateId()}`,
            rewardDraft: normalizePendingRewardDraft(meta.rewardDraft || null),
            battleOutcome: meta.battleOutcome || null,
            grantStatus: meta.grantStatus || 'pending',
            grantedCardId: meta.grantedCardId || null
        };
        save(data);
    }

    function updatePending(taskId, updates = {}) {
        const data = load();
        const pending = data.pendingGeneration;
        if (!pending) return null;
        if (taskId && pending.taskId !== taskId) return null;

        const nextPending = {
            ...pending,
            ...updates
        };
        if (Object.prototype.hasOwnProperty.call(updates, 'rewardDraft')) {
            nextPending.rewardDraft = normalizePendingRewardDraft(updates.rewardDraft || null);
        } else if (pending.rewardDraft) {
            nextPending.rewardDraft = normalizePendingRewardDraft(pending.rewardDraft);
        }
        data.pendingGeneration = nextPending;
        save(data);
        return data.pendingGeneration;
    }

    function setPendingRewardDraft(taskId, card) {
        return updatePending(taskId, { rewardDraft: card || null });
    }

    function writePendingResult(taskId, result) {
        const data = load();
        if (!data.pendingGeneration || data.pendingGeneration.taskId !== taskId) return null;

        const pending = data.pendingGeneration;
        data.pendingGeneration.status = 'done';
        data.pendingGeneration.result = normalizeMediaPayload({
            ...(result || {}),
            taskId,
            inputState: result?.inputState || pending.inputState || null,
            inputSummary: result?.inputSummary || pending.inputSummary || null,
            source: result?.source || pending.source || null
        });
        save(data);
        return data.pendingGeneration;
    }

    function getPending() {
        return load().pendingGeneration;
    }

    function getPendingRewardCard(taskId = null) {
        const pending = load().pendingGeneration;
        if (!pending) return null;
        if (taskId && pending.taskId !== taskId) return null;
        return normalizePendingRewardDraft(pending.rewardDraft || null);
    }

    function clearPending() {
        const data = load();
        data.pendingGeneration = null;
        save(data);
    }

    function isTutorialDone() {
        return load().tutorialDone;
    }

    function markTutorialDone() {
        const data = load();
        data.tutorialDone = true;
        save(data);
    }

    function getCardThumb(card) {
        return resolveMediaUrl(card?.thumbnailUrl) || card?.thumbnail || null;
    }

    function applyVideoAssetStateToCardRecord(card, asset) {
        if (!card || !asset) return card;
        const normalizedAsset = normalizeMediaPayload(asset) || asset;
        const completedUrl = normalizedAsset.videoUrl || normalizedAsset.resultUrl || null;
        const normalizedStatus = normalizeVideoStatus(normalizedAsset.status, inferVideoStatus(card));
        const nextPlayableUrl = normalizedStatus === 'completed'
            ? (completedUrl || card.videoUrl || null)
            : (card.videoUrl || null);

        card.assetId = normalizedAsset.assetId || card.assetId || null;
        card.assetSourceType = normalizedAsset.sourceType || card.assetSourceType || inferAssetSourceType(card);
        if (normalizedAsset.thumbnailUrl) {
            card.thumbnailUrl = normalizedAsset.thumbnailUrl;
            card.thumbnail = null;
        }
        card.videoStatus = normalizedStatus;
        card.videoTaskId = normalizedAsset.videoTaskId || card.videoTaskId || null;
        card.pixverseVideoId = normalizedAsset.pixverseVideoId ?? card.pixverseVideoId ?? null;
        card.videoProviderStatus = normalizedAsset.providerStatus ?? card.videoProviderStatus ?? null;
        card.videoError = normalizedStatus === 'failed'
            ? (normalizedAsset.error || card.videoError || null)
            : null;
        card.videoResultUrl = completedUrl || card.videoResultUrl || null;
        card.videoUpdatedAt = normalizedAsset.updatedAt || Date.now();
        card.videoUrl = nextPlayableUrl;
        card.sfxPath = normalizedAsset.sfxPath || card.sfxPath || null;
        card.sfxUrl = normalizedAsset.sfxUrl || card.sfxUrl || null;
        if (normalizedAsset.forgeTaskId) card.taskId = normalizedAsset.forgeTaskId;
        return Object.assign(card, normalizeCardMediaFields(card));
    }

    function applyCardVideoAssetState(cardId, asset) {
        const data = load();
        const card = data.cards.find(item => item.id === cardId);
        if (!card) return null;
        applyVideoAssetStateToCardRecord(card, asset);
        save(data);
        return normalizeCardForRead(card);
    }

    function applyPendingVideoAssetState(cardId, asset) {
        const data = load();
        const pending = data.pendingGeneration;
        if (!pending?.rewardDraft || pending.rewardDraft.id !== cardId) return null;
        applyVideoAssetStateToCardRecord(pending.rewardDraft, asset);
        save(data);
        return normalizePendingRewardDraft(pending.rewardDraft);
    }

    function applyCardVideoAssetStates(assets) {
        const data = load();
        let changed = 0;
        (assets || []).forEach(asset => {
            const cardId = asset?.cardId;
            if (!cardId) return;
            const card = data.cards.find(item => item.id === cardId);
            if (!card) return;
            applyVideoAssetStateToCardRecord(card, asset);
            changed += 1;
        });
        if (changed > 0) save(data);
        return changed;
    }

    function generateTextThumbnail(text) {
        const c = document.createElement('canvas');
        c.width = 180;
        c.height = 250;
        const ctx = c.getContext('2d');

        ctx.fillStyle = '#3a3530';
        ctx.fillRect(0, 0, 180, 250);

        ctx.fillStyle = '#e0d8c8';
        ctx.font = 'bold 22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxWidth = 150;
        const words = text.split('');
        let line = '';
        const lines = [];
        for (const ch of words) {
            const test = line + ch;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = ch;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);

        const lineHeight = 28;
        const startY = 125 - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((value, index) => {
            ctx.fillText(value, 90, startY + index * lineHeight);
        });

        return c.toDataURL('image/png');
    }

    return {
        load,
        save,
        generateId,
        getPlayerId,
        setPlayerId,
        resetPlayerId,
        getPlayerIdInfo,
        seedIfNeeded,
        getCards,
        getSpellCards,
        getCard,
        addCard,
        updateCard,
        removeCard,
        deleteCard: removeCard,
        getSlot,
        setSlot,
        clearSlot,
        clearSlots,
        areBothSlotsFilled,
        getLoadout,
        setLoadoutSlot,
        getLoadoutIds,
        setPending,
        updatePending,
        setPendingRewardDraft,
        writePendingResult,
        getPending,
        getPendingRewardCard,
        clearPending,
        isTutorialDone,
        markTutorialDone,
        getCardThumb,
        getCardVideoUrl,
        getCardResultUrl,
        getCardSfxUrl,
        generateTextThumbnail,
        applyCardVideoAssetState,
        applyCardVideoAssetStates,
        applyPendingVideoAssetState
    };
})();
