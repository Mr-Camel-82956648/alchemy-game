/**
 * alchemy.js — 页面A：炼金室逻辑
 */
const Alchemy = (() => {
    const els = {};
    let pendingResultRetryTimer = null;
    const PENDING_RESULT_RETRY_MS = 1000;
    const MAX_PENDING_RESULT_RETRIES = 180;

    function init() {
        els.page = document.getElementById('page-alchemy');
        els.slotA = document.getElementById('slot-a');
        els.slotB = document.getElementById('slot-b');
        els.startBtn = document.getElementById('btn-start');
        els.loadoutBtn = document.getElementById('btn-loadout');
        els.forgeReturnBtn = document.getElementById('btn-forge-return');
        els.cauldronResult = document.getElementById('cauldron-result');

        els.slotA.addEventListener('click', () => Collection.open('A'));
        els.slotB.addEventListener('click', () => Collection.open('B'));
        els.startBtn.addEventListener('click', onStart);
        els.loadoutBtn.addEventListener('click', () => Loadout.open());
        if (els.forgeReturnBtn) els.forgeReturnBtn.addEventListener('click', onForgeReturn);


        refreshSlots();
    }

    function refreshSlots() {
        updateSlotUI('A');
        updateSlotUI('B');
        updateStartButton();
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
        const ready = GameStorage.areBothSlotsFilled();
        els.startBtn.classList.toggle('disabled', !ready);
        els.startBtn.classList.toggle('ready', ready);
        els.startBtn.disabled = !ready;
    }

    function onStart() {
        if (!GameStorage.areBothSlotsFilled()) return;

        const cardA = GameStorage.getSlot('A');
        const cardB = GameStorage.getSlot('B');

        animateCardsToCenter(() => {
            ForgeAPI.startForge(cardA, cardB);
            if (cardA && cardA.type === 'text') GameStorage.removeCard(cardA.id);
            if (cardB && cardB.type === 'text') GameStorage.removeCard(cardB.id);
            showForgePopup();
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
            els.slotA.style.cssText = '';
            els.slotB.style.cssText = '';
            callback();
        }, 700);
    }

    function showForgePopup() {
        const popup = document.getElementById('forge-popup');
        const confirmBtn = document.getElementById('btn-forge-confirm');
        popup.style.display = 'flex';
        confirmBtn.onclick = () => {
            popup.style.display = 'none';
            App.switchPage('battle');
        };
    }

    function onForgeReturn() {
        stopPendingResultRetry();
        const popup = document.getElementById('forge-popup');
        if (popup) popup.style.display = 'none';
        ForgeAPI.stopPolling();
        GameStorage.clearPending();
        refreshSlots();
    }

    let revealedCard = null;

    function showReveal(card) {
        revealedCard = card;
        const overlay = document.getElementById('page-reveal');
        const cardEl = document.getElementById('reveal-card');
        const thumb = document.getElementById('reveal-thumb');
        const title = document.getElementById('reveal-title');
        const collectBtn = document.getElementById('btn-reveal-collect');
        const discardBtn = document.getElementById('btn-reveal-discard');
        const actions = document.querySelector('.reveal-actions');

        thumb.src = GameStorage.getCardThumb(card) || '';

        // Reset all animation states
        cardEl.classList.remove('animate', 'settle');
        title.classList.remove('show');
        actions.classList.remove('show');

        overlay.style.display = 'flex';
        overlay.classList.add('active');
        requestAnimationFrame(() => {
            cardEl.classList.add('animate');
        });

        // Sequenced reveals
        setTimeout(() => cardEl.classList.add('settle'), 3900);
        setTimeout(() => title.classList.add('show'), 4300);
        setTimeout(() => actions.classList.add('show'), 5200);

        collectBtn.onclick = () => dismissReveal(false);
        discardBtn.onclick = () => dismissReveal(true);
    }

    function dismissReveal(discard) {
        stopPendingResultRetry();
        const overlay = document.getElementById('page-reveal');
        const cardEl = document.getElementById('reveal-card');
        const title = document.getElementById('reveal-title');
        const actions = document.querySelector('.reveal-actions');

        if (discard && revealedCard && revealedCard.id !== '__debug__') {
            GameStorage.removeCard(revealedCard.id);
        }
        revealedCard = null;

        overlay.classList.remove('active');
        overlay.style.display = 'none';
        cardEl.classList.remove('animate', 'settle');
        title.classList.remove('show');
        actions.classList.remove('show');
        refreshSlots();
    }

    function stopPendingResultRetry() {
        if (!pendingResultRetryTimer) return;
        clearTimeout(pendingResultRetryTimer);
        pendingResultRetryTimer = null;
    }

    function finalizePendingResult(pending) {
        if (!pending?.result) return false;
        stopPendingResultRetry();
        const r = pending.result;
        const thumbnail = GameStorage.generateTextThumbnail(r.name);
        const newCard = GameStorage.addCard({
            name: r.name,
            type: 'spell',
            status: r.status || 'complete',
            videoUrl: r.videoUrl,
            thumbnail,
            attrSet: r.attrSet || [],
            element: r.element || r.mainAttr,
            mainAttr: r.mainAttr || r.element,
            subAttr: r.subAttr || null,
            generation: r.generation || 1,
            baseAtk: r.baseAtk || SpellDefs.calcBaseAtk(r.generation || 1),
            parentA: pending.cardAId,
            parentB: pending.cardBId
        });
        GameStorage.clearPending();
        GameStorage.clearSlots();
        showReveal(newCard);
        return true;
    }

    function writePendingResult(taskId, result) {
        const data = GameStorage.load();
        if (!data.pendingGeneration || data.pendingGeneration.taskId !== taskId) return null;
        data.pendingGeneration.status = 'done';
        data.pendingGeneration.result = result;
        GameStorage.save(data);
        return data.pendingGeneration;
    }

    async function syncPendingResult(taskId) {
        const pending = GameStorage.getPending();
        if (!pending || pending.taskId !== taskId) return null;
        if (pending.status === 'done' && pending.result) return pending;

        const status = await ForgeAPI.checkStatus(taskId);
        if (!status) return GameStorage.getPending();
        if (status.status === 'completed' && status.result) {
            return writePendingResult(taskId, status.result);
        }
        if (status.status === 'failed') {
            GameStorage.clearPending();
            return null;
        }
        return GameStorage.getPending();
    }

    function schedulePendingResultRetry(taskId, attempt = 0) {
        stopPendingResultRetry();
        if (!taskId || attempt >= MAX_PENDING_RESULT_RETRIES) return;
        pendingResultRetryTimer = setTimeout(async () => {
            const resolved = await syncPendingResult(taskId);
            if (resolved && resolved.status === 'done' && resolved.result) {
                finalizePendingResult(resolved);
                return;
            }
            schedulePendingResultRetry(taskId, attempt + 1);
        }, PENDING_RESULT_RETRY_MS);
    }

    async function onReturnFromBattle() {
        stopPendingResultRetry();
        const pending = GameStorage.getPending();
        if (!pending) {
            refreshSlots();
            return;
        }

        const resolved = await syncPendingResult(pending.taskId);
        if (resolved && resolved.status === 'done' && resolved.result) {
            finalizePendingResult(resolved);
            return;
        }

        refreshSlots();
        schedulePendingResultRetry(pending.taskId);
    }

    return { init, refreshSlots, onReturnFromBattle };
})();
