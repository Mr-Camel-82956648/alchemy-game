/**
 * collection.js — 页面B：收藏夹逻辑
 */
const Collection = (() => {
    let activeSlot = null;
    let selectedCardId = null;
    let previewVideoPollTimer = null;
    let activePreviewVideoCardId = null;
    const els = {};

    function init() {
        els.page = document.getElementById('page-collection');
        els.closeBtn = document.getElementById('btn-close-collection');
        els.grid = document.getElementById('card-grid');
        els.previewEmpty = document.getElementById('preview-empty');
        els.previewContent = document.getElementById('preview-content');
        els.previewVideo = document.getElementById('preview-video');
        els.previewText = document.getElementById('preview-text');
        els.previewName = document.getElementById('preview-name');
        els.previewHint = document.getElementById('preview-hint');
        els.previewVideoStatusPanel = document.getElementById('preview-video-status-panel');
        els.previewVideoStatusText = document.getElementById('preview-video-status-text');
        els.previewVideoTask = document.getElementById('preview-video-task');
        els.previewVideoUrl = document.getElementById('preview-video-url');
        els.previewVideoStartBtn = document.getElementById('btn-preview-video-start');
        els.previewVideoOpenBtn = document.getElementById('btn-preview-video-open');
        els.previewActions = document.getElementById('preview-actions');
        els.selectBtn = document.getElementById('btn-select-card');
        els.deleteBtn = document.getElementById('btn-delete-card');
        els.clearSlotBtn = document.getElementById('btn-clear-slot');
        els.textModal = document.getElementById('text-input-modal');
        els.spellInput = document.getElementById('spell-input');
        els.spellConfirm = document.getElementById('btn-spell-confirm');
        els.spellCancel = document.getElementById('btn-spell-cancel');

        els.closeBtn.addEventListener('click', close);
        els.selectBtn.addEventListener('click', onSelectCard);
        els.deleteBtn.addEventListener('click', onDeleteCard);
        if (els.clearSlotBtn) els.clearSlotBtn.addEventListener('click', onClearSlot);
        if (els.previewVideoOpenBtn) {
            els.previewVideoOpenBtn.addEventListener('click', () => {
                const url = els.previewVideoOpenBtn.dataset.url || '';
                if (url) window.open(url, '_blank', 'noopener');
            });
        }
        els.spellConfirm.addEventListener('click', onSpellConfirm);
        els.spellCancel.addEventListener('click', onSpellCancel);
    }

    function open(slot) {
        activeSlot = slot;
        selectedCardId = GameStorage.getSlot(slot)?.id || null;
        renderGrid();
        const currentCard = GameStorage.getSlot(slot);
        if (currentCard) {
            renderPreview(currentCard, { selected: true });
            updateGridSelection(selectedCardId);
        } else {
            resetPreview();
        }
        els.page.style.display = 'block';
        requestAnimationFrame(() => els.page.classList.add('active'));
    }

    function close() {
        stopPreviewVideoStatusPolling();
        resetPreview();
        selectedCardId = null;
        els.page.classList.remove('active');
        setTimeout(() => { els.page.style.display = 'none'; }, 500);
    }

    function stopPreviewVideo() {
        els.previewVideo.pause();
        els.previewVideo.removeAttribute('src');
        els.previewVideo.load();
    }

    function renderGrid() {
        els.grid.innerHTML = '';
        const cards = GameStorage.getCards().filter(c => c.type !== 'basic' && c.type !== 'text');

        cards.forEach(card => {
            const item = createCardElement(card);
            item.addEventListener('click', () => selectCard(card.id));
            els.grid.appendChild(item);
        });

        // 首位：空白石板
        const slate = document.createElement('div');
        slate.className = 'card-item blank-slate';
        slate.innerHTML = `
            <img class="card-item-frame" src="assets/ui/card-frame.webp" alt="">
            <div class="card-item-inner">
                <div class="blank-slate-icon">&#x270D;</div>
                <div class="blank-slate-label">刻写新咒语</div>
            </div>
        `;
        slate.addEventListener('click', openTextModal);
        els.grid.insertBefore(slate, els.grid.firstChild);
    }

    function selectCard(id) {
        selectedCardId = id;
        const card = GameStorage.getCard(id);
        if (!card) return;
        updateGridSelection(id);
        renderPreview(card, { selected: true });
    }

    function resetPreview() {
        stopPreviewVideoStatusPolling();
        els.previewEmpty.style.display = 'flex';
        els.previewContent.style.display = 'none';
        stopPreviewVideo();
        els.previewText.textContent = '';
        els.previewName.textContent = '';
        if (els.previewVideoStatusPanel) els.previewVideoStatusPanel.style.display = 'none';
        if (els.previewVideoOpenBtn) {
            els.previewVideoOpenBtn.dataset.url = '';
            els.previewVideoOpenBtn.disabled = true;
        }
        els.previewActions.style.display = 'none';
        if (els.previewHint) els.previewHint.style.display = 'block';
    }

    function renderPreview(card, { selected = false, skipSync = false } = {}) {
        if (!card) {
            resetPreview();
            return;
        }

        stopPreviewVideoStatusPolling();
        els.previewEmpty.style.display = 'none';
        els.previewContent.style.display = 'block';
        stopPreviewVideo();

        const previewVideoUrl = GameStorage.getCardVideoUrl(card);
        if (card.type === 'spell' && previewVideoUrl) {
            els.previewVideo.src = previewVideoUrl;
            els.previewVideo.style.display = 'block';
            els.previewText.style.display = 'none';
            els.previewVideo.play().catch(() => {});
        } else {
            els.previewVideo.style.display = 'none';
            els.previewText.style.display = 'flex';
            els.previewText.textContent = card.name;
        }

        els.previewName.textContent = card.name;
        els.previewActions.style.display = 'flex';
        if (els.previewHint) els.previewHint.style.display = 'none';
        updatePreviewVideoStatus(card, buildPreviewVideoState(card));

        if (els.selectBtn) {
            els.selectBtn.disabled = !selected;
            els.selectBtn.style.opacity = selected ? '1' : '0.55';
        }
        if (els.clearSlotBtn) {
            const hasCurrentSlotCard = Boolean(activeSlot && GameStorage.getSlot(activeSlot));
            els.clearSlotBtn.style.display = hasCurrentSlotCard ? 'inline-flex' : 'none';
        }
        if (!skipSync) syncPreviewVideoState(card);
    }

    function updateGridSelection(id) {
        els.grid.querySelectorAll('.card-item').forEach(el => {
            el.classList.toggle('selected', !!id && el.dataset.id === id);
        });
    }

    function onSelectCard() {
        if (!selectedCardId || !activeSlot) return;
        GameStorage.setSlot(activeSlot, selectedCardId);
        close();
        setTimeout(() => Alchemy.refreshSlots(), 300);
    }

    function onDeleteCard() {
        if (!selectedCardId) return;
        const card = GameStorage.getCard(selectedCardId);
        if (!card) return;
        if (!confirm(`确定要销毁「${card.name}」吗？此操作不可撤销。`)) return;
        GameStorage.deleteCard(selectedCardId);
        selectedCardId = null;
        renderGrid();
        const slotCard = activeSlot ? GameStorage.getSlot(activeSlot) : null;
        if (slotCard) {
            renderPreview(slotCard);
        } else {
            resetPreview();
        }
        updateGridSelection(selectedCardId);
        Alchemy.refreshSlots();
    }

    function onClearSlot() {
        if (!activeSlot) return;
        const currentCard = GameStorage.getSlot(activeSlot);
        if (!currentCard) return;
        GameStorage.clearSlot(activeSlot);
        if (selectedCardId === currentCard.id) selectedCardId = null;
        const nextCard = selectedCardId ? GameStorage.getCard(selectedCardId) : null;
        updateGridSelection(selectedCardId);
        if (nextCard) {
            renderPreview(nextCard, { selected: true });
        } else {
            resetPreview();
        }
        Alchemy.refreshSlots();
    }

    function openTextModal() {
        els.spellInput.value = '';
        els.textModal.style.display = 'flex';
        els.spellInput.focus();
    }

    function onSpellConfirm() {
        const text = els.spellInput.value.trim();
        if (!text) return;
        const thumbnail = GameStorage.generateTextThumbnail(text);
        const newCard = GameStorage.addCard({ name: text, type: 'text', thumbnail });
        els.textModal.style.display = 'none';
        if (activeSlot) {
            GameStorage.setSlot(activeSlot, newCard.id);
        }
        selectedCardId = newCard.id;
        close();
        setTimeout(() => Alchemy.refreshSlots(), 300);
    }

    function onSpellCancel() {
        els.textModal.style.display = 'none';
    }

    function normalizeDisplayCard(card) {
        if (typeof SpellDefs !== 'undefined' && SpellDefs.normalizeCard) {
            return SpellDefs.normalizeCard(card);
        }
        return card;
    }

    function buildPreviewVideoState(card) {
        if (!card) return null;
        return {
            status: card.videoStatus || (GameStorage.getCardVideoUrl(card) ? 'completed' : 'not_generated'),
            sourceType: card.assetSourceType || (card.taskId ? 'player_generated' : 'built_in'),
            videoTaskId: card.videoTaskId || null,
            providerStatus: card.videoProviderStatus ?? null,
            resultUrl: GameStorage.getCardResultUrl(card),
            error: card.videoError || null
        };
    }

    function describeVideoStatus(state) {
        const status = state?.status || 'not_generated';
        const labels = {
            not_generated: '未生成',
            generating: '生成中',
            completed: '已完成',
            failed: '失败'
        };
        const provider = state?.providerStatus != null ? ` / provider=${state.providerStatus}` : '';
        return `${labels[status] || status}${provider}`;
    }

    function updatePreviewVideoStatus(card, state) {
        if (!els.previewVideoStatusPanel) return;
        els.previewVideoStatusPanel.style.display = 'block';
        const videoUrl = state?.resultUrl || GameStorage.getCardResultUrl(card);
        if (els.previewVideoStatusText) {
            els.previewVideoStatusText.textContent = describeVideoStatus(state);
        }
        if (els.previewVideoTask) {
            els.previewVideoTask.textContent = state?.videoTaskId || '无';
        }
        if (els.previewVideoUrl) {
            els.previewVideoUrl.textContent = videoUrl || '无';
            els.previewVideoUrl.title = videoUrl || '';
        }
        if (els.previewVideoOpenBtn) {
            els.previewVideoOpenBtn.dataset.url = videoUrl || '';
            els.previewVideoOpenBtn.disabled = !videoUrl;
        }
        if (els.previewVideoStartBtn) {
            const status = state?.status || 'not_generated';
            const isPlayerGenerated = (state?.sourceType || card?.assetSourceType) === 'player_generated' || Boolean(card?.taskId);
            const hasPrompt = Boolean(card?.videoPrompt);
            if (!isPlayerGenerated) {
                els.previewVideoStartBtn.disabled = true;
                els.previewVideoStartBtn.textContent = videoUrl ? '当前资产可直接使用' : '当前资产无需生成';
            } else if (!hasPrompt) {
                els.previewVideoStartBtn.disabled = true;
                els.previewVideoStartBtn.textContent = '当前卡无可提交 videoPrompt';
            } else if (status === 'generating') {
                els.previewVideoStartBtn.disabled = true;
                els.previewVideoStartBtn.textContent = 'PixVerse 生成中...';
            } else if (status === 'completed') {
                els.previewVideoStartBtn.disabled = true;
                els.previewVideoStartBtn.textContent = '当前 MP4 已就绪';
            } else if (status === 'failed') {
                els.previewVideoStartBtn.disabled = false;
                els.previewVideoStartBtn.textContent = '重试视频生成';
            } else {
                els.previewVideoStartBtn.disabled = false;
                els.previewVideoStartBtn.textContent = '生成视频';
            }

            els.previewVideoStartBtn.onclick = async () => {
                const current = selectedCardId ? GameStorage.getCard(selectedCardId) : null;
                if (!current?.id) return;
                const currentState = buildPreviewVideoState(current);
                const canStart = ['not_generated', 'failed'].includes(currentState?.status || 'not_generated');
                if (!canStart || !current.videoPrompt) return;
                els.previewVideoStartBtn.disabled = true;
                const registerResp = await ForgeAPI.registerGeneratedCards([current]);
                if (!registerResp?.ok) {
                    updatePreviewVideoStatus(current, { ...currentState, status: 'failed', error: registerResp?.error || '注册失败' });
                    return;
                }
                const resp = await ForgeAPI.startPixVerseFromCard(current.id);
                if (!resp?.ok || !resp.asset) {
                    updatePreviewVideoStatus(current, { ...currentState, status: 'failed', error: resp?.error || '启动失败' });
                    return;
                }
                const latestCard = GameStorage.getCard(current.id) || current;
                renderPreview(latestCard, { selected: true, skipSync: true });
                if (resp.asset.status === 'generating') {
                    startPreviewVideoStatusPolling(current.id);
                }
            };
        }
    }

    async function syncPreviewVideoState(card) {
        if (!card?.id) return;
        const isPlayerGenerated = card.assetSourceType === 'player_generated' || Boolean(card.taskId) || Boolean(card.videoTaskId);
        if (!isPlayerGenerated) return;
        const asset = await ForgeAPI.getCardVideoStatus(card.id);
        if (!asset || selectedCardId !== card.id) return;
        const latestCard = GameStorage.getCard(card.id) || card;
        renderPreview(latestCard, { selected: true, skipSync: true });
        if (asset.status === 'generating') {
            startPreviewVideoStatusPolling(card.id);
        }
    }

    function stopPreviewVideoStatusPolling() {
        activePreviewVideoCardId = null;
        if (!previewVideoPollTimer) return;
        clearTimeout(previewVideoPollTimer);
        previewVideoPollTimer = null;
    }

    function startPreviewVideoStatusPolling(cardId) {
        stopPreviewVideoStatusPolling();
        activePreviewVideoCardId = cardId;
        const tick = async () => {
            if (!activePreviewVideoCardId || activePreviewVideoCardId !== cardId) return;
            const asset = await ForgeAPI.getCardVideoStatus(cardId);
            if (!asset || selectedCardId !== cardId) {
                previewVideoPollTimer = setTimeout(tick, 3000);
                return;
            }
            const latestCard = GameStorage.getCard(cardId);
            if (latestCard) renderPreview(latestCard, { selected: true, skipSync: true });
            if (asset.status === 'completed' || asset.status === 'failed') {
                stopPreviewVideoStatusPolling();
                return;
            }
            previewVideoPollTimer = setTimeout(tick, 3000);
        };
        previewVideoPollTimer = setTimeout(tick, 3000);
    }

    function formatGeneration(generation) {
        const gen = Math.max(1, Number(generation) || 1);
        return `Gen${String(gen).padStart(2, '0')}`;
    }

    function createAttrBadge(attr) {
        const normalized = SpellDefs.normalizeElement ? SpellDefs.normalizeElement(attr) : attr;
        if (!normalized) return null;

        const badge = document.createElement('span');
        badge.textContent = SpellDefs.getElementLabel ? SpellDefs.getElementLabel(normalized) : String(normalized).charAt(0).toUpperCase();
        badge.title = normalized;
        badge.style.cssText = `
            width: 22px;
            height: 22px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font: 700 12px/1 "Noto Serif SC", serif;
            color: #fff7db;
            background: ${SpellDefs.getElementColor ? SpellDefs.getElementColor(normalized) : '#666'};
            box-shadow: 0 0 8px rgba(0,0,0,0.45);
            border: 1px solid rgba(255,255,255,0.28);
        `;
        return badge;
    }

    function decorateCardItem(item, rawCard) {
        const card = normalizeDisplayCard(rawCard);

        const genBadge = document.createElement('div');
        genBadge.textContent = formatGeneration(card.generation);
        genBadge.style.cssText = `
            position: absolute;
            top: 9%;
            left: 13%;
            z-index: 4;
            padding: 2px 6px;
            border-radius: 999px;
            background: rgba(18, 14, 10, 0.82);
            border: 1px solid rgba(214, 196, 160, 0.45);
            color: #f1e2b8;
            font: 700 11px/1 "Consolas", monospace;
            letter-spacing: 0.5px;
            pointer-events: none;
        `;
        item.appendChild(genBadge);

        const attrs = document.createElement('div');
        attrs.style.cssText = `
            position: absolute;
            top: 9%;
            right: 13%;
            z-index: 4;
            display: flex;
            gap: 4px;
            pointer-events: none;
        `;

        const attrSet = SpellDefs.getCardAttrSet ? SpellDefs.getCardAttrSet(card) : [card.mainAttr, card.subAttr].filter(Boolean);
        attrSet.forEach((attr, index) => {
            const badge = createAttrBadge(attr);
            if (!badge) return;
            if (index > 0) {
                badge.style.opacity = '0.82';
                badge.style.transform = 'scale(0.9)';
            }
            attrs.appendChild(badge);
        });

        if (attrs.childNodes.length > 0) item.appendChild(attrs);
    }

    return { init, open, close, createCardElement };

    /**
     * 创建一个卡牌 DOM 元素（共用于收藏夹和装备页）
     */
    function createCardElement(card) {
        const displayCard = normalizeDisplayCard(card);
        const item = document.createElement('div');
        item.className = 'card-item';
        item.dataset.id = card.id;

        const frame = document.createElement('img');
        frame.className = 'card-item-frame';
        frame.src = 'assets/ui/card-frame.webp';
        frame.alt = '';
        item.appendChild(frame);

        const inner = document.createElement('div');
        inner.className = 'card-item-inner';

        const thumbSrc = GameStorage.getCardThumb(card);
        if (thumbSrc) {
            const img = document.createElement('img');
            img.className = 'card-item-thumb';
            img.src = thumbSrc;
            img.alt = displayCard.name;
            inner.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'card-item-thumb';
            placeholder.style.cssText = 'background:#3a3530;display:flex;align-items:center;justify-content:center;font-size:14px;color:#776;';
            placeholder.textContent = card.type === 'text' ? displayCard.name : '?';
            inner.appendChild(placeholder);
        }

        item.appendChild(inner);

        const name = document.createElement('div');
        name.className = 'card-item-name';
        name.textContent = displayCard.name;
        item.appendChild(name);
        decorateCardItem(item, displayCard);

        return item;
    }
})();
