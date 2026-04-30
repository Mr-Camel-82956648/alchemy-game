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
        els.page.classList.remove('active');
        setTimeout(() => { els.page.style.display = 'none'; }, 500);
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

        if (card.type === 'spell' && card.videoUrl) {
            els.previewVideo.src = card.videoUrl;
            els.previewVideo.style.display = 'block';
            els.previewText.style.display = 'none';
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
        els.previewVideo.pause();
        els.previewVideo.src = '';
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

    return { init, open, close, createCardElement };

    /**
     * 创建一个卡牌 DOM 元素（共用于收藏夹和装备页）
     */
    function createCardElement(card) {
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
            img.alt = card.name;
            inner.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'card-item-thumb';
            placeholder.style.cssText = 'background:#3a3530;display:flex;align-items:center;justify-content:center;font-size:14px;color:#776;';
            placeholder.textContent = card.type === 'text' ? card.name : '?';
            inner.appendChild(placeholder);
        }

        item.appendChild(inner);

        const name = document.createElement('div');
        name.className = 'card-item-name';
        name.textContent = card.name;
        item.appendChild(name);

        return item;
    }
})();
