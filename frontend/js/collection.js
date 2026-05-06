/**
 * collection.js — 页面B：收藏夹逻辑
 */
const Collection = (() => {
    let activeSlot = null;
    let selectedCardId = null;
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
        els.previewActions = document.getElementById('preview-actions');
        els.selectBtn = document.getElementById('btn-select-card');
        els.deleteBtn = document.getElementById('btn-delete-card');
        els.textModal = document.getElementById('text-input-modal');
        els.spellInput = document.getElementById('spell-input');
        els.spellConfirm = document.getElementById('btn-spell-confirm');
        els.spellCancel = document.getElementById('btn-spell-cancel');

        els.closeBtn.addEventListener('click', close);
        els.selectBtn.addEventListener('click', onSelectCard);
        els.deleteBtn.addEventListener('click', onDeleteCard);
        els.spellConfirm.addEventListener('click', onSpellConfirm);
        els.spellCancel.addEventListener('click', onSpellCancel);
    }

    function open(slot) {
        activeSlot = slot;
        selectedCardId = null;
        renderGrid();
        resetPreview();
        els.page.style.display = 'block';
        requestAnimationFrame(() => els.page.classList.add('active'));
    }

    function close() {
        resetPreview();
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

        els.grid.querySelectorAll('.card-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === id);
        });

        els.previewEmpty.style.display = 'none';
        els.previewContent.style.display = 'block';
        stopPreviewVideo();

        if (card.type === 'spell' && card.videoUrl) {
            els.previewVideo.src = card.videoUrl;
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
    }

    function resetPreview() {
        els.previewEmpty.style.display = 'flex';
        els.previewContent.style.display = 'none';
        stopPreviewVideo();
        els.previewText.textContent = '';
        els.previewName.textContent = '';
        els.previewActions.style.display = 'none';
        if (els.previewHint) els.previewHint.style.display = 'block';
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
        resetPreview();
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
