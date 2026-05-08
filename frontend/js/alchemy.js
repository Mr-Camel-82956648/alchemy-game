/**
 * alchemy.js — 页面A：炼金室逻辑
 */
const Alchemy = (() => {
    const els = {};
    let pendingResultRetryTimer = null;
    let pixVerseDebugPollTimer = null;
    let activePixVerseDebugTaskId = null;
    const PENDING_RESULT_RETRY_MS = 1000;
    const MAX_PENDING_RESULT_RETRIES = 180;
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
        els.revealPixVerseStartBtn = document.getElementById('btn-reveal-pixverse-start');
        els.revealPixVerseOpenBtn = document.getElementById('btn-reveal-pixverse-open');

        els.slotA.addEventListener('click', () => Collection.open('A'));
        els.slotB.addEventListener('click', () => Collection.open('B'));
        els.startBtn.addEventListener('click', onStart);
        els.loadoutBtn.addEventListener('click', () => Loadout.open());
        if (els.forgeReturnBtn) els.forgeReturnBtn.addEventListener('click', onForgeReturn);
        if (els.revealPixVerseOpenBtn) {
            els.revealPixVerseOpenBtn.addEventListener('click', () => {
                const url = els.revealPixVerseOpenBtn.dataset.url || '';
                if (url) window.open(url, '_blank', 'noopener');
            });
        }


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
            if (card.videoUrl) {
                videoEl.src = card.videoUrl;
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

    function showReveal(card) {
        stopPixVerseDebugPolling();
        activePixVerseDebugTaskId = null;
        revealedCard = card;
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

        if (discard && revealedCard && revealedCard.id !== '__debug__') {
            GameStorage.removeCard(revealedCard.id);
        }
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
        updatePixVerseDebug(null);
        const canStart = Boolean(card?.taskId && card?.videoPrompt);
        if (els.revealPixVerseStartBtn) {
            els.revealPixVerseStartBtn.disabled = !canStart;
            els.revealPixVerseStartBtn.textContent = canStart ? '生成 PixVerse MP4' : '当前卡无可提交 videoPrompt';
            els.revealPixVerseStartBtn.onclick = async () => {
                if (!canStart || !revealedCard?.taskId) return;
                els.revealPixVerseStartBtn.disabled = true;
                const resp = await ForgeAPI.startPixVerseFromForge(revealedCard.taskId);
                if (!resp?.ok || !resp.task) {
                    updatePixVerseDebug({
                        videoTaskId: null,
                        status: 'failed',
                        error: resp?.error || 'PixVerse 任务启动失败'
                    });
                    els.revealPixVerseStartBtn.disabled = false;
                    els.revealPixVerseStartBtn.textContent = '重新生成 PixVerse MP4';
                    return;
                }
                activePixVerseDebugTaskId = resp.task.videoTaskId;
                updatePixVerseDebug(resp.task);
                if (resp.task.status === 'succeeded' || resp.task.status === 'failed') {
                    els.revealPixVerseStartBtn.disabled = false;
                    els.revealPixVerseStartBtn.textContent = '重新生成 PixVerse MP4';
                    return;
                }
                els.revealPixVerseStartBtn.textContent = 'PixVerse 生成中...';
                startPixVerseDebugPolling(resp.task.videoTaskId);
            };
        }
    }

    function describePixVerseStatus(task) {
        if (!task) return '未开始';

        const localStatusLabels = {
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
            els.revealPixVerseUrl.textContent = task?.resultUrl || '无';
            els.revealPixVerseUrl.title = task?.resultUrl || '';
        }
        if (els.revealPixVerseError) {
            els.revealPixVerseError.textContent = errorText;
        }
        if (els.revealPixVerseOpenBtn) {
            const url = task?.resultUrl || '';
            els.revealPixVerseOpenBtn.dataset.url = url;
            els.revealPixVerseOpenBtn.disabled = !url;
            els.revealPixVerseOpenBtn.textContent = url ? '打开 MP4' : 'MP4 未就绪';
        }
    }

    function stopPixVerseDebugPolling() {
        activePixVerseDebugTaskId = null;
        if (!pixVerseDebugPollTimer) return;
        clearTimeout(pixVerseDebugPollTimer);
        pixVerseDebugPollTimer = null;
    }

    function startPixVerseDebugPolling(videoTaskId) {
        stopPixVerseDebugPolling();
        activePixVerseDebugTaskId = videoTaskId;
        const tick = async () => {
            if (!activePixVerseDebugTaskId || activePixVerseDebugTaskId !== videoTaskId) return;
            const task = await ForgeAPI.checkPixVerseStatus(videoTaskId);
            if (!task) {
                if (els.revealPixVerseStatus) {
                    els.revealPixVerseStatus.textContent = '状态查询失败，等待下次轮询';
                }
                pixVerseDebugPollTimer = setTimeout(tick, PIXVERSE_DEBUG_POLL_MS);
                return;
            }
            updatePixVerseDebug(task);
            const terminal = task.status === 'succeeded' || task.status === 'failed';
            if (els.revealPixVerseStartBtn) {
                els.revealPixVerseStartBtn.disabled = false;
                els.revealPixVerseStartBtn.textContent = terminal ? '重新生成 PixVerse MP4' : 'PixVerse 生成中...';
                if (!terminal) {
                    els.revealPixVerseStartBtn.disabled = true;
                }
            }
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

    function finalizePendingResult(pending, trigger = 'unknown') {
        if (!pending?.result) return false;
        if (activeSettlementTaskId && pending.taskId !== activeSettlementTaskId) {
            console.warn('[Alchemy] finalize skipped for stale task:', {
                activeSettlementTaskId,
                pendingTaskId: pending.taskId,
                trigger
            });
            return false;
        }
        stopPendingResultRetry();
        hideSettlementWaiting();
        const r = pending.result;
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
        const thumbnail = GameStorage.generateTextThumbnail(r.name);
        const newCard = GameStorage.addCard({
            name: r.name,
            type: 'spell',
            status: r.status || 'complete',
            videoUrl: r.videoUrl,
            thumbnail,
            attrSet: r.attrSet || [],
            themeText: r.themeText || r.visualDesc || null,
            videoPrompt: r.videoPrompt || r.fusionPrompt || null,
            promptRoute: r.promptRoute || null,
            promptRouteReason: r.promptRouteReason || null,
            promptFallbackApplied: Boolean(r.promptFallbackApplied),
            promptTemplate: r.promptTemplate || null,
            promptModel: r.promptModel || null,
            promptRouteElapsedMs: r.promptRouteElapsedMs ?? null,
            promptGenerationElapsedMs: r.promptGenerationElapsedMs ?? null,
            promptTotalElapsedMs: r.promptTotalElapsedMs ?? null,
            taskId: r.taskId || pending.taskId,
            element: r.element || r.mainAttr,
            mainAttr: r.mainAttr || r.element,
            subAttr: r.subAttr || null,
            generation: r.generation || 1,
            baseAtk: r.baseAtk || SpellDefs.calcBaseAtk(r.generation || 1),
            inputState: r.inputState || null,
            inputSummary: r.inputSummary || pending.inputSummary || null,
            source: r.source || null,
            parentA: pending.cardAId,
            parentB: pending.cardBId
        });
        GameStorage.clearPending();
        GameStorage.clearSlots();
        showReveal(newCard);
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
            const resolved = await syncPendingResult(taskId);
            if (resolved && resolved.status === 'done' && resolved.result) {
                finalizePendingResult(resolved, trigger);
                return;
            }
            if (activeSettlementTaskId === taskId) {
                showSettlementWaiting(
                    GameStorage.getPending(),
                    '本次 battle 已胜利，正在等待当前 forge task 完成后进入 reveal。'
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
            finalizePendingResult(pending, 'battle_return_storage_ready');
            return;
        }
        refreshSlots();
        showSettlementWaiting(
            pending,
            '本次 battle 已胜利，正在检查当前 forge task 是否已经完成。'
        );

        const resolved = await syncPendingResult(pending.taskId);
        if (resolved && resolved.status === 'done' && resolved.result) {
            finalizePendingResult(resolved, 'battle_return_ready');
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
            '本次 battle 已胜利，但 forge 结果尚未完成。正在等待当前任务完成后进入 reveal。'
        );
        console.log('[Alchemy] battle returned before forge result ready; waiting for same task:', {
            taskId: latestPending.taskId,
            inputState: latestPending.inputState || null,
            inputSummary: latestPending.inputSummary || null
        });
        schedulePendingResultRetry(latestPending.taskId, 0, 'battle_return_wait');
    }

    return { init, refreshSlots, onReturnFromBattle };
})();
