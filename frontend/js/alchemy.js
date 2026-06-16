/**
 * alchemy.js — 页面A：炼金室逻辑
 */
const Alchemy = (() => {
    const els = {};
    let pendingResultRetryTimer = null;
    let pixVerseDebugPollTimer = null;
    let activePixVerseDebugTaskId = null;
    let activePixVerseDebugCardId = null;
    const PENDING_RESULT_RETRY_MS = 1000;
    const MAX_PENDING_RESULT_RETRIES = 180;
    const MAX_REVEAL_VIDEO_WAIT_RETRIES = 12;
    const PIXVERSE_DEBUG_POLL_MS = 3000;
    let activeSettlementTaskId = null;

    function init() {
        els.page = document.getElementById('page-alchemy');
        els.slotA = document.getElementById('slot-a');
        els.slotB = document.getElementById('slot-b');
        els.startBtn = document.getElementById('btn-start');
        els.loadoutBtn = document.getElementById('btn-loadout');
        els.forgeReturnBtn = document.getElementById('btn-forge-return');
        els.cauldronResult = document.getElementById('cauldron-result');
        els.settlementOverlay = document.getElementById('settlement-wait-overlay');
        els.settlementTitle = document.getElementById('settlement-wait-title');
        els.settlementCopy = document.getElementById('settlement-wait-copy');
        els.settlementTask = document.getElementById('settlement-wait-task');
        els.settlementInput = document.getElementById('settlement-wait-input');
        els.revealPixVerseTask = document.getElementById('reveal-debug-pixverse-task');
        els.revealPixVerseStatus = document.getElementById('reveal-debug-pixverse-status');
        els.revealPixVerseUrl = document.getElementById('reveal-debug-pixverse-url');
        els.revealPixVerseError = document.getElementById('reveal-debug-pixverse-error');
        els.revealDebugPanel = document.getElementById('reveal-debug-panel');
        els.revealDebugToggleBtn = document.getElementById('btn-reveal-debug-toggle');
        els.revealPixVerseStartBtn = document.getElementById('btn-reveal-pixverse-start');

        els.slotA.addEventListener('click', () => Collection.open('A'));
        els.slotB.addEventListener('click', () => Collection.open('B'));
        els.startBtn.addEventListener('click', onStart);
        els.loadoutBtn.addEventListener('click', () => Loadout.open());
        if (els.forgeReturnBtn) els.forgeReturnBtn.addEventListener('click', onForgeReturn);
        if (els.revealDebugToggleBtn) {
            els.revealDebugToggleBtn.addEventListener('click', () => {
                const isHidden = Boolean(els.revealDebugPanel?.hidden);
                setRevealDebugOpen(isHidden);
            });
        }

        setRevealDebugOpen(false);

        refreshSlots();
    }

    function refreshSlots() {
        resetSlotFlightState();
        updateSlotUI('A');
        updateSlotUI('B');
        updateStartButton();
    }

    function resetSlotFlightState() {
        [els.slotA, els.slotB].forEach(slotEl => {
            if (!slotEl) return;
            slotEl.style.transition = '';
            slotEl.style.transform = '';
            slotEl.style.opacity = '';
        });
    }

    function updateSlotUI(slot) {
        const el = slot === 'A' ? els.slotA : els.slotB;
        const card = GameStorage.getSlot(slot);
        const emptyEl = el.querySelector('.slot-empty');
        const filledEl = el.querySelector('.slot-filled');
        const videoEl = filledEl.querySelector('.slot-video');
        const thumb = filledEl.querySelector('.slot-thumb');

        const nameEl = el.querySelector('.slot-name');
        if (card) {
            emptyEl.style.display = 'none';
            filledEl.style.display = 'flex';
            const videoUrl = GameStorage.getCardVideoUrl(card);
            if (videoUrl) {
                videoEl.src = videoUrl;
                videoEl.style.display = 'block';
                videoEl.play().catch(() => {});
                thumb.style.display = 'none';
            } else {
                videoEl.style.display = 'none';
                videoEl.src = '';
                thumb.style.display = 'block';
                thumb.src = GameStorage.getCardThumb(card) || '';
            }
            nameEl.textContent = card.name;
        } else {
            emptyEl.style.display = 'flex';
            filledEl.style.display = 'none';
            videoEl.style.display = 'none';
            videoEl.src = '';
            nameEl.textContent = '';
        }
    }

    function updateStartButton() {
        const ready = true;
        els.startBtn.classList.toggle('disabled', !ready);
        els.startBtn.classList.toggle('ready', ready);
        els.startBtn.disabled = !ready;
    }

    async function onStart() {
        if (typeof AIConfig !== 'undefined' && AIConfig.ensureReadyForAction && !AIConfig.ensureReadyForAction()) {
            return;
        }
        stopPendingResultRetry();
        hideSettlementWaiting();
        const cardA = GameStorage.getSlot('A');
        const cardB = GameStorage.getSlot('B');

        animateCardsToCenter(async () => {
            const forgeStart = await ForgeAPI.startForge(cardA, cardB);
            if (!forgeStart?.ok) {
                console.warn('[Alchemy] forge start aborted:', forgeStart?.error || 'unknown error');
                refreshSlots();
                window.alert(forgeStart?.error || '炼金请求失败，未进入战斗。');
                return;
            }
            showForgePopup(cardA, cardB);
        });
    }

    function animateCardsToCenter(callback) {
        els.slotA.style.transition = 'all 0.6s ease-in';
        els.slotB.style.transition = 'all 0.6s ease-in';
        els.slotA.style.transform = 'translate(60%, 100%) scale(0.3)';
        els.slotB.style.transform = 'translate(-60%, 100%) scale(0.3)';
        els.slotA.style.opacity = '0';
        els.slotB.style.opacity = '0';

        setTimeout(() => {
            els.slotA.style.transition = '';
            els.slotB.style.transition = '';
            callback();
        }, 700);
    }

    function showForgePopup(cardA, cardB) {
        const popup = document.getElementById('forge-popup');
        const confirmBtn = document.getElementById('btn-forge-confirm');
        popup.style.display = 'flex';
        confirmBtn.onclick = () => {
            if (cardA && cardA.type === 'text') GameStorage.removeCard(cardA.id);
            if (cardB && cardB.type === 'text') GameStorage.removeCard(cardB.id);
            popup.style.display = 'none';
            App.switchPage('battle');
        };
    }

    function onForgeReturn() {
        stopPendingResultRetry();
        hideSettlementWaiting();
        const popup = document.getElementById('forge-popup');
        if (popup) popup.style.display = 'none';
        ForgeAPI.stopPolling();
        GameStorage.clearPending();
        refreshSlots();
    }

    let revealedCard = null;

    function showSettlementWaiting(pending, copyText) {
        if (!els.settlementOverlay) return;
        const summary = pending?.inputSummary || '未知输入';
        els.settlementOverlay.hidden = false;
        if (els.settlementTitle) els.settlementTitle.textContent = '炼金结果生成中';
        if (els.settlementCopy) {
            els.settlementCopy.textContent = copyText || '本次 battle 已胜利，正在等待当前 forge task 完成后进入 reveal。';
        }
        if (els.settlementTask) els.settlementTask.textContent = pending?.taskId || '无';
        if (els.settlementInput) els.settlementInput.textContent = `${summary} (${pending?.inputState || 'unknown'})`;
    }

    function hideSettlementWaiting() {
        activeSettlementTaskId = null;
        if (!els.settlementOverlay) return;
        els.settlementOverlay.hidden = true;
    }

    function setRevealDebugOpen(open) {
        if (els.revealDebugPanel) {
            els.revealDebugPanel.hidden = !open;
        }
        if (els.revealDebugToggleBtn) {
            els.revealDebugToggleBtn.textContent = open ? '收起调试' : '展开调试';
        }
    }

    function getPendingRewardCard(taskId = null) {
        const pending = GameStorage.getPending();
        if (!pending) return null;
        if (taskId && pending.taskId !== taskId) return null;
        return GameStorage.getPendingRewardCard(pending.taskId);
    }

    function getRevealCardSnapshot(cardId = null) {
        const targetId = cardId || revealedCard?.id || null;
        const pendingCard = getPendingRewardCard();
        if (targetId && pendingCard?.id === targetId) return pendingCard;
        if (targetId) return GameStorage.getCard(targetId) || pendingCard || revealedCard;
        return pendingCard || revealedCard;
    }

    function isPendingRewardReadyForReveal(pending, { allowGenerating = false } = {}) {
        if (!pending?.result) return false;
        const rewardCard = getPendingRewardCard(pending.taskId) || pending.rewardDraft || null;
        if (!rewardCard) return false;
        const status = rewardCard.videoStatus || 'not_generated';
        if (!rewardCard.videoPrompt) return true;
        if (status === 'completed' || status === 'failed') return true;
        return allowGenerating && (status === 'generating' || status === 'not_generated');
    }

    function buildSettlementCopy(pending, attempt = 0) {
        if (!pending?.result) {
            return '本次 battle 已胜利，正在等待当前 forge task 完成。';
        }
        const rewardCard = getPendingRewardCard(pending.taskId) || pending.rewardDraft || null;
        if (!rewardCard) {
            return '本次 battle 已胜利，正在整理本轮奖励与视频任务。';
        }
        const status = rewardCard.videoStatus || 'not_generated';
        if (status === 'completed') {
            return '本次奖励已完成收尾，正在进入 reveal。';
        }
        if (status === 'failed') {
            return '影像整理暂未完成，将先展示本轮法阵。';
        }
        if (attempt >= MAX_REVEAL_VIDEO_WAIT_RETRIES) {
            return '视频收尾超出预期，先进入 reveal，并继续保留轻量状态提示。';
        }
        return '本次 battle 已胜利，后台视频正在最后收尾，马上进入 reveal。';
    }

    function showReveal(card) {
        stopPixVerseDebugPolling();
        activePixVerseDebugTaskId = null;
        activePixVerseDebugCardId = null;
        revealedCard = card;
        setRevealDebugOpen(false);
        const overlay = document.getElementById('page-reveal');
        const cardEl = document.getElementById('reveal-card');
        const thumb = document.getElementById('reveal-thumb');
        const title = document.getElementById('reveal-title');
        const nameplate = document.getElementById('reveal-name');
        const debugTheme = document.getElementById('reveal-debug-theme');
        const debugVideo = document.getElementById('reveal-debug-video');
        const debugRoute = document.getElementById('reveal-debug-route');
        const debugRouteReason = document.getElementById('reveal-debug-route-reason');
        const debugFallback = document.getElementById('reveal-debug-fallback');
        const debugTask = document.getElementById('reveal-debug-task');
        const debugInputState = document.getElementById('reveal-debug-input-state');
        const debugSource = document.getElementById('reveal-debug-source');
        const debugInputSummary = document.getElementById('reveal-debug-input-summary');
        const collectBtn = document.getElementById('btn-reveal-collect');
        const discardBtn = document.getElementById('btn-reveal-discard');
        const actions = document.querySelector('.reveal-actions');

        thumb.src = GameStorage.getCardThumb(card) || '';
        thumb.alt = card.name || '炼成法阵';
        if (nameplate) nameplate.textContent = card.name || '未命名法阵';
        if (title) title.textContent = '炼成';
        if (debugTheme) debugTheme.textContent = truncateText(card.themeText || '无', 140);
        if (debugVideo) debugVideo.textContent = truncateText(card.videoPrompt || '无', 200);
        if (debugRoute) debugRoute.textContent = card.promptRoute || '无';
        if (debugRouteReason) debugRouteReason.textContent = truncateText(card.promptRouteReason || '无', 180);
        if (debugFallback) debugFallback.textContent = card.promptFallbackApplied ? 'true' : 'false';
        if (debugTask) debugTask.textContent = card.taskId || '无';
        if (debugInputState) debugInputState.textContent = card.inputState || '无';
        if (debugSource) debugSource.textContent = card.source || '无';
        if (debugInputSummary) debugInputSummary.textContent = card.inputSummary || '无';
        resetPixVerseDebug(card);
        hydrateRevealPixVerseState(card);

        console.log('[Reveal] finalized card:', {
            taskId: card.taskId || null,
            id: card.id,
            name: card.name,
            inputState: card.inputState || null,
            inputSummary: card.inputSummary || null,
            source: card.source || null,
            themeText: card.themeText || null,
            hasVideoPrompt: Boolean(card.videoPrompt),
            promptRoute: card.promptRoute || null,
            promptTemplate: card.promptTemplate || null
        });
        console.log('[Reveal] prompt routing audit:', {
            promptRoute: card.promptRoute || null,
            promptRouteReason: card.promptRouteReason || null,
            promptFallbackApplied: Boolean(card.promptFallbackApplied),
            promptTemplate: card.promptTemplate || null,
            promptModel: card.promptModel || null,
            taskId: card.taskId || null,
            inputState: card.inputState || null,
            inputSummary: card.inputSummary || null,
            source: card.source || null,
            themeText: card.themeText || null
        });

        // Reset all animation states
        cardEl.classList.remove('animate', 'settle');
        title.classList.remove('show');
        if (nameplate) nameplate.classList.remove('show');
        actions.classList.remove('show');

        overlay.style.display = 'flex';
        overlay.classList.add('active');
        if (typeof GameAudio !== 'undefined' && GameAudio.playRevealRise) {
            GameAudio.playRevealRise();
        }
        requestAnimationFrame(() => {
            cardEl.classList.add('animate');
        });

        // Sequenced reveals
        setTimeout(() => cardEl.classList.add('settle'), 3900);
        setTimeout(() => title.classList.add('show'), 4300);
        setTimeout(() => nameplate?.classList.add('show'), 4300);
        setTimeout(() => actions.classList.add('show'), 5200);

        collectBtn.onclick = () => dismissReveal(false);
        discardBtn.onclick = () => dismissReveal(true);
    }

    function dismissReveal(discard) {
        stopPendingResultRetry();
        hideSettlementWaiting();
        stopPixVerseDebugPolling();
        const overlay = document.getElementById('page-reveal');
        const cardEl = document.getElementById('reveal-card');
        const title = document.getElementById('reveal-title');
        const nameplate = document.getElementById('reveal-name');
        const actions = document.querySelector('.reveal-actions');
        const currentCard = getRevealCardSnapshot();

        if (!discard && currentCard && currentCard.id !== '__debug__') {
            GameStorage.addCard({
                ...currentCard,
                assetSourceType: 'player_generated'
            });
        }
        GameStorage.clearPending();
        revealedCard = null;

        overlay.classList.remove('active');
        overlay.style.display = 'none';
        cardEl.classList.remove('animate', 'settle');
        title.classList.remove('show');
        if (nameplate) nameplate.classList.remove('show');
        actions.classList.remove('show');
        refreshSlots();
    }

    function resetPixVerseDebug(card) {
        const assetState = buildLocalPixVerseState(card);
        updatePixVerseDebug(assetState);
        if (els.revealPixVerseStartBtn) {
            refreshRevealPixVerseAction(card, assetState);
            els.revealPixVerseStartBtn.onclick = async () => {
                const currentCard = getRevealCardSnapshot();
                const currentState = buildLocalPixVerseState(currentCard);
                const canStart = Boolean(currentCard?.id && currentCard?.videoPrompt && ['not_generated', 'failed'].includes(currentState.status));
                if (!canStart || !currentCard?.id) return;
                els.revealPixVerseStartBtn.disabled = true;
                const resp = await ForgeAPI.startPixVerseFromCard(currentCard.id);
                if (!resp?.ok || !resp.asset) {
                    updatePixVerseDebug({
                        cardId: currentCard.id,
                        assetId: currentCard.assetId || null,
                        status: 'failed',
                        error: resp?.error || 'PixVerse 任务启动失败'
                    });
                    refreshRevealPixVerseAction(currentCard, { status: 'failed' });
                    return;
                }
                activePixVerseDebugTaskId = resp.asset.videoTaskId || null;
                activePixVerseDebugCardId = currentCard.id;
                updatePixVerseDebug(resp.asset);
                refreshRevealPixVerseAction(currentCard, resp.asset);
                if (resp.asset.status === 'completed' || resp.asset.status === 'failed') return;
                startPixVerseDebugPolling(currentCard.id);
            };
        }
    }

    function describePixVerseStatus(task) {
        if (!task) return '未开始';

        const localStatusLabels = {
            not_generated: 'not_generated(尚未提交)',
            generating: 'generating(正在等待 PixVerse 完成)',
            completed: 'completed(MP4 已就绪)',
            queued: 'queued(已创建本地任务)',
            submitting: 'submitting(正在提交 PixVerse)',
            polling: 'polling(正在等待 PixVerse 完成)',
            succeeded: 'succeeded(MP4 已就绪)',
            failed: 'failed(任务失败)'
        };
        const providerStatusLabels = {
            1: 'success',
            5: 'generating',
            7: 'moderation_failed',
            8: 'generation_failed'
        };

        const statusLabel = localStatusLabels[task.status] || task.status || 'unknown';
        const providerLabel = task.providerStatus != null
            ? `provider=${task.providerStatus}${providerStatusLabels[task.providerStatus] ? `(${providerStatusLabels[task.providerStatus]})` : ''}`
            : null;
        const urlLabel = task.resultUrl ? 'url=ready' : null;

        return [
            statusLabel,
            providerLabel,
            task.pixverseVideoId != null ? `video_id=${task.pixverseVideoId}` : null,
            task.submitAttempts ? `submit=${task.submitAttempts}` : null,
            task.pollCount ? `poll=${task.pollCount}` : null,
            urlLabel
        ].filter(Boolean).join(' | ');
    }

    function updatePixVerseDebug(task) {
        const resultUrl = (typeof AlchemyRuntime !== 'undefined' && AlchemyRuntime.resolveMediaUrl)
            ? AlchemyRuntime.resolveMediaUrl(task?.resultUrl || task?.videoUrl || '')
            : (task?.resultUrl || task?.videoUrl || '');
        const statusText = describePixVerseStatus(task);
        const errorText = task
            ? (task.error || (task.status === 'failed' ? (task.providerErrMsg || '未知失败') : '无'))
            : '无';
        if (els.revealPixVerseTask) {
            els.revealPixVerseTask.textContent = task?.videoTaskId || '未提交';
        }
        if (els.revealPixVerseStatus) {
            els.revealPixVerseStatus.textContent = statusText;
        }
        if (els.revealPixVerseUrl) {
            els.revealPixVerseUrl.textContent = resultUrl || '无';
            els.revealPixVerseUrl.title = resultUrl || '';
        }
        if (els.revealPixVerseError) {
            els.revealPixVerseError.textContent = errorText;
        }
    }

    function buildLocalPixVerseState(card) {
        if (!card) return null;
        return {
            assetId: card.assetId || null,
            cardId: card.id || null,
            sourceType: card.assetSourceType || (card.taskId ? 'player_generated' : 'built_in'),
            status: card.videoStatus || (GameStorage.getCardVideoUrl(card) ? 'completed' : 'not_generated'),
            videoTaskId: card.videoTaskId || null,
            pixverseVideoId: card.pixverseVideoId || null,
            providerStatus: card.videoProviderStatus ?? null,
            submitAttempts: card.submitAttempts || 0,
            pollCount: card.pollCount || 0,
            resultUrl: GameStorage.getCardResultUrl(card),
            videoUrl: GameStorage.getCardVideoUrl(card),
            error: card.videoError || null
        };
    }

    function refreshRevealPixVerseAction(card, assetState) {
        if (!els.revealPixVerseStartBtn) return;
        const status = assetState?.status || 'not_generated';
        const hasPrompt = Boolean(card?.videoPrompt);
        if (!hasPrompt) {
            els.revealPixVerseStartBtn.disabled = true;
            els.revealPixVerseStartBtn.textContent = '当前卡无可提交 videoPrompt';
            return;
        }
        if (status === 'generating') {
            els.revealPixVerseStartBtn.disabled = true;
            els.revealPixVerseStartBtn.textContent = '后台视频生成中...';
            return;
        }
        if (status === 'completed') {
            els.revealPixVerseStartBtn.disabled = true;
            els.revealPixVerseStartBtn.textContent = '视频已就绪';
            return;
        }
        if (status === 'failed') {
            els.revealPixVerseStartBtn.disabled = false;
            els.revealPixVerseStartBtn.textContent = '重试 PixVerse MP4';
            return;
        }
        els.revealPixVerseStartBtn.disabled = false;
        els.revealPixVerseStartBtn.textContent = '手动补起视频任务';
    }

    async function hydrateRevealPixVerseState(card) {
        if (!card?.id) return;
        const registerResp = await ForgeAPI.registerGeneratedCards([card]);
        const registeredAsset = registerResp?.cards?.find(item => item.cardId === card.id) || null;
        if (revealedCard?.id !== card.id && getRevealCardSnapshot(card.id)?.id !== card.id) return;

        const asset = ((registeredAsset && registeredAsset.status !== 'not_generated')
            ? registeredAsset
            : null)
            || await ForgeAPI.getCardVideoStatus(card.id)
            || registeredAsset
            || buildLocalPixVerseState(GameStorage.getCard(card.id) || card);

        revealedCard = getRevealCardSnapshot(card.id) || card;
        activePixVerseDebugTaskId = asset?.videoTaskId || null;
        activePixVerseDebugCardId = card.id;
        updatePixVerseDebug(asset);
        refreshRevealPixVerseAction(revealedCard, asset);
        if (asset?.status === 'generating') {
            startPixVerseDebugPolling(card.id);
        }
    }

    function stopPixVerseDebugPolling() {
        activePixVerseDebugTaskId = null;
        activePixVerseDebugCardId = null;
        if (!pixVerseDebugPollTimer) return;
        clearTimeout(pixVerseDebugPollTimer);
        pixVerseDebugPollTimer = null;
    }

    function startPixVerseDebugPolling(cardId) {
        stopPixVerseDebugPolling();
        activePixVerseDebugCardId = cardId;
        const tick = async () => {
            if (!activePixVerseDebugCardId || activePixVerseDebugCardId !== cardId) return;
            const task = await ForgeAPI.getCardVideoStatus(cardId);
            if (!task) {
                if (els.revealPixVerseStatus) {
                    els.revealPixVerseStatus.textContent = '状态查询失败，等待下次轮询';
                }
                pixVerseDebugPollTimer = setTimeout(tick, PIXVERSE_DEBUG_POLL_MS);
                return;
            }
            activePixVerseDebugTaskId = task.videoTaskId || null;
            revealedCard = getRevealCardSnapshot(cardId) || revealedCard;
            updatePixVerseDebug(task);
            refreshRevealPixVerseAction(revealedCard, task);
            const terminal = task.status === 'completed' || task.status === 'failed';
            if (terminal) {
                stopPixVerseDebugPolling();
                return;
            }
            pixVerseDebugPollTimer = setTimeout(tick, PIXVERSE_DEBUG_POLL_MS);
        };
        pixVerseDebugPollTimer = setTimeout(tick, PIXVERSE_DEBUG_POLL_MS);
    }

    function stopPendingResultRetry() {
        activeSettlementTaskId = null;
        if (!pendingResultRetryTimer) return;
        clearTimeout(pendingResultRetryTimer);
        pendingResultRetryTimer = null;
    }

    function truncateText(text, maxLength) {
        const value = String(text || '').trim();
        if (!value) return '无';
        return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
    }

    function finalizePendingResult(pending, trigger = 'unknown', { forceReveal = false } = {}) {
        if (!pending?.result) return false;
        if (activeSettlementTaskId && pending.taskId !== activeSettlementTaskId) {
            console.warn('[Alchemy] finalize skipped for stale task:', {
                activeSettlementTaskId,
                pendingTaskId: pending.taskId,
                trigger
            });
            return false;
        }
        if (!isPendingRewardReadyForReveal(pending, { allowGenerating: forceReveal })) {
            return false;
        }
        stopPendingResultRetry();
        hideSettlementWaiting();
        const r = pending.result;
        const rewardCard = getPendingRewardCard(pending.taskId) || pending.rewardDraft || null;
        if (!rewardCard) {
            console.warn('[Alchemy] finalize aborted: reward draft missing', { taskId: pending.taskId, trigger });
            return false;
        }
        console.log('[Alchemy] finalizePendingResult:', { trigger, ...r });
        console.log('[Alchemy] forge audit:', {
            trigger,
            taskId: pending.taskId,
            inputState: r.inputState || null,
            inputSummary: r.inputSummary || null,
            source: r.source || null,
            promptRoute: r.promptRoute || null,
            promptRouteReason: r.promptRouteReason || null,
            promptFallbackApplied: Boolean(r.promptFallbackApplied),
            promptTemplate: r.promptTemplate || null,
            promptModel: r.promptModel || null,
            themeText: r.themeText || null
        });
        console.log('[Alchemy] reward draft ready for reveal:', {
            taskId: pending.taskId,
            cardId: rewardCard.id,
            videoStatus: rewardCard.videoStatus || null,
            videoTaskId: rewardCard.videoTaskId || null,
            hasVideoUrl: Boolean(rewardCard.videoUrl),
            thumbnailKind: rewardCard.thumbnailKind || null,
            forceReveal
        });
        GameStorage.updatePending(pending.taskId, {
            battleOutcome: 'victory',
            grantStatus: 'awaiting_decision',
            rewardDraft: rewardCard
        });
        GameStorage.clearSlots();
        showReveal(getPendingRewardCard(pending.taskId) || rewardCard);
        return true;
    }

    function writePendingResult(taskId, result) {
        return GameStorage.writePendingResult(taskId, result);
    }

    async function syncPendingResult(taskId) {
        const pending = GameStorage.getPending();
        if (!pending || pending.taskId !== taskId) return null;
        if (pending.status === 'done' && pending.result) {
            console.log('[Alchemy] syncPendingResult: already ready in storage', {
                taskId,
                inputState: pending.inputState || null,
                inputSummary: pending.inputSummary || null
            });
            return pending;
        }

        const status = await ForgeAPI.checkStatus(taskId);
        if (!status) {
            console.log('[Alchemy] syncPendingResult: status not available yet', { taskId });
            return GameStorage.getPending();
        }
        if (status.status === 'completed' && status.result) {
            console.log('[Alchemy] syncPendingResult: backend completed', {
                taskId,
                inputState: status.result.inputState || pending.inputState || null,
                source: status.result.source || null
            });
            return writePendingResult(taskId, status.result);
        }
        if (status.status === 'failed') {
            console.error('[Alchemy] syncPendingResult: backend failed', { taskId, error: status.error });
            GameStorage.clearPending();
            return null;
        }
        return GameStorage.getPending();
    }

    async function syncPendingRun(taskId) {
        const pending = await syncPendingResult(taskId);
        if (!pending || pending.taskId !== taskId) return pending;
        if (pending.status === 'done' && pending.result) {
            await ForgeAPI.primePendingRewardRun(taskId, { refreshStatus: true });
            return GameStorage.getPending();
        }
        return pending;
    }

    function schedulePendingResultRetry(taskId, attempt = 0, trigger = 'retry_wait') {
        stopPendingResultRetry();
        activeSettlementTaskId = taskId;
        if (!taskId || attempt >= MAX_PENDING_RESULT_RETRIES) {
            console.error('[Alchemy] pending result wait timed out:', { taskId, trigger, attempt });
            showSettlementWaiting(GameStorage.getPending(), '本次结算等待超时，请查看控制台日志。');
            return;
        }
        pendingResultRetryTimer = setTimeout(async () => {
            const currentPending = GameStorage.getPending();
            if (!currentPending || currentPending.taskId !== taskId) {
                console.warn('[Alchemy] pending result retry aborted: task changed or cleared', { taskId, trigger });
                hideSettlementWaiting();
                return;
            }
            const resolved = await syncPendingRun(taskId);
            if (resolved && finalizePendingResult(resolved, trigger)) {
                return;
            }
            if (resolved?.result && getPendingRewardCard(taskId) && attempt >= MAX_REVEAL_VIDEO_WAIT_RETRIES) {
                finalizePendingResult(resolved, `${trigger}_force_reveal`, { forceReveal: true });
                return;
            }
            if (activeSettlementTaskId === taskId) {
                showSettlementWaiting(
                    GameStorage.getPending(),
                    buildSettlementCopy(GameStorage.getPending(), attempt)
                );
            }
            schedulePendingResultRetry(taskId, attempt + 1, trigger);
        }, PENDING_RESULT_RETRY_MS);
    }

    async function onReturnFromBattle() {
        stopPendingResultRetry();
        const pending = GameStorage.getPending();
        if (!pending) {
            hideSettlementWaiting();
            refreshSlots();
            return;
        }

        activeSettlementTaskId = pending.taskId;
        console.log('[Alchemy] onReturnFromBattle:', {
            taskId: pending.taskId,
            pendingStatus: pending.status || null,
            hasResult: Boolean(pending.result),
            inputState: pending.inputState || null,
            inputSummary: pending.inputSummary || null
        });
        if (pending.status === 'done' && pending.result) {
            await ForgeAPI.primePendingRewardRun(pending.taskId, { refreshStatus: true });
            const latestReadyPending = GameStorage.getPending();
            if (latestReadyPending && finalizePendingResult(latestReadyPending, 'battle_return_storage_ready')) {
                return;
            }
        }
        refreshSlots();
        showSettlementWaiting(
            pending,
            buildSettlementCopy(pending, 0)
        );

        const resolved = await syncPendingRun(pending.taskId);
        if (resolved && finalizePendingResult(resolved, 'battle_return_ready')) {
            return;
        }
        const latestPending = GameStorage.getPending();
        if (!latestPending || latestPending.taskId !== pending.taskId) {
            console.warn('[Alchemy] pending forge task disappeared before reveal handoff:', {
                taskId: pending.taskId
            });
            hideSettlementWaiting();
            return;
        }

        showSettlementWaiting(
            latestPending,
            buildSettlementCopy(latestPending, 0)
        );
        console.log('[Alchemy] battle returned before forge result ready; waiting for same task:', {
            taskId: latestPending.taskId,
            inputState: latestPending.inputState || null,
            inputSummary: latestPending.inputSummary || null,
            hasRewardDraft: Boolean(getPendingRewardCard(latestPending.taskId))
        });
        schedulePendingResultRetry(latestPending.taskId, 0, 'battle_return_wait');
    }

    return { init, refreshSlots, onReturnFromBattle };
})();
