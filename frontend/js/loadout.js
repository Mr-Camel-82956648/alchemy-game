/**
 * loadout.js — 装备法阵覆盖层逻辑
 */
const Loadout = (() => {
    let activeSlotIndex = 0;
    const els = {};

    function init() {
        els.page = document.getElementById('page-loadout');
        els.closeBtn = document.getElementById('btn-close-loadout');
        els.grid = document.getElementById('loadout-grid');
        els.confirmBtn = document.getElementById('btn-loadout-confirm');
        els.slots = els.page.querySelectorAll('.loadout-slot');

        els.closeBtn.addEventListener('click', close);
        els.confirmBtn.addEventListener('click', close);

        els.slots.forEach((slot, i) => {
            slot.addEventListener('click', () => selectSlot(i));
        });
    }

    function open() {
        activeSlotIndex = 0;
        renderSlots();
        renderGrid();
        highlightSlot(0);
        els.page.style.display = 'block';
        requestAnimationFrame(() => els.page.classList.add('active'));
    }

    function close() {
        els.page.classList.remove('active');
        els.slots.forEach(slotEl => {
            const video = slotEl.querySelector('.loadout-slot-video');
            if (video) { video.pause(); video.src = ''; }
        });
        setTimeout(() => { els.page.style.display = 'none'; }, 500);
    }

    function selectSlot(index) {
        activeSlotIndex = index;
        highlightSlot(index);
    }

    function highlightSlot(index) {
        els.slots.forEach((s, i) => s.classList.toggle('active', i === index));
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

    function createAttrBadge(attr, compact) {
        const normalized = SpellDefs.normalizeElement ? SpellDefs.normalizeElement(attr) : attr;
        if (!normalized) return null;

        const badge = document.createElement('span');
        badge.textContent = SpellDefs.getElementLabel ? SpellDefs.getElementLabel(normalized) : String(normalized).charAt(0).toUpperCase();
        badge.title = normalized;
        badge.style.cssText = `
            width: ${compact ? 20 : 22}px;
            height: ${compact ? 20 : 22}px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font: 700 ${compact ? 11 : 12}px/1 "Noto Serif SC", serif;
            color: #fff7db;
            background: ${SpellDefs.getElementColor ? SpellDefs.getElementColor(normalized) : '#666'};
            box-shadow: 0 0 8px rgba(0,0,0,0.45);
            border: 1px solid rgba(255,255,255,0.28);
        `;
        return badge;
    }

    function applyLoadoutSlotMeta(slotEl, rawCard) {
        slotEl.querySelectorAll('.loadout-slot-meta').forEach(el => el.remove());
        if (!rawCard) return;

        const card = normalizeDisplayCard(rawCard);
        const meta = document.createElement('div');
        meta.className = 'loadout-slot-meta';
        meta.style.cssText = `
            position: absolute;
            top: 7%;
            left: 12%;
            right: 12%;
            z-index: 4;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            pointer-events: none;
        `;

        const genBadge = document.createElement('div');
        genBadge.textContent = formatGeneration(card.generation);
        genBadge.style.cssText = `
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(18, 14, 10, 0.82);
            border: 1px solid rgba(214, 196, 160, 0.45);
            color: #f1e2b8;
            font: 700 12px/1 "Consolas", monospace;
            letter-spacing: 0.5px;
        `;
        meta.appendChild(genBadge);

        const attrs = document.createElement('div');
        attrs.style.cssText = 'display:flex;gap:4px;';
        const mainBadge = createAttrBadge(card.mainAttr, false);
        if (mainBadge) attrs.appendChild(mainBadge);
        const subBadge = createAttrBadge(card.subAttr, false);
        if (subBadge) {
            subBadge.style.opacity = '0.82';
            subBadge.style.transform = 'scale(0.9)';
            attrs.appendChild(subBadge);
        }
        meta.appendChild(attrs);

        slotEl.appendChild(meta);
    }

    function decorateGridItem(item, rawCard) {
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
        const mainBadge = createAttrBadge(card.mainAttr, true);
        if (mainBadge) attrs.appendChild(mainBadge);
        const subBadge = createAttrBadge(card.subAttr, true);
        if (subBadge) {
            subBadge.style.opacity = '0.82';
            subBadge.style.transform = 'scale(0.9)';
            attrs.appendChild(subBadge);
        }
        if (attrs.childNodes.length > 0) item.appendChild(attrs);
    }

    function renderSlots() {
        const loadout = GameStorage.getLoadout();
        els.slots.forEach((slotEl, i) => {
            const card = loadout[i];
            const displayCard = card ? normalizeDisplayCard(card) : null;
            const inner = slotEl.querySelector('.loadout-slot-inner');
            const keyEl = inner.querySelector('.loadout-slot-key');
            const thumbEl = inner.querySelector('.loadout-slot-thumb');
            const videoEl = inner.querySelector('.loadout-slot-video');
            const nameEl = slotEl.querySelector('.loadout-slot-name');

            if (card) {
                keyEl.style.display = 'none';

                if (card.videoUrl && videoEl) {
                    videoEl.src = card.videoUrl;
                    videoEl.style.display = 'block';
                    videoEl.play().catch(() => {});
                    thumbEl.style.display = 'none';
                } else {
                    if (videoEl) { videoEl.style.display = 'none'; videoEl.src = ''; }
                    const src = GameStorage.getCardThumb(card);
                    if (src) {
                        thumbEl.src = src;
                        thumbEl.style.display = 'block';
                    } else {
                        thumbEl.style.display = 'none';
                    }
                }
                nameEl.textContent = displayCard.name;
                applyLoadoutSlotMeta(slotEl, displayCard);
            } else {
                if (videoEl) { videoEl.style.display = 'none'; videoEl.src = ''; }
                thumbEl.style.display = 'none';
                keyEl.style.display = 'block';
                nameEl.textContent = '';
                applyLoadoutSlotMeta(slotEl, null);
            }
        });
    }

    function renderGrid() {
        els.grid.innerHTML = '';
        const spells = GameStorage.getSpellCards();

        spells.forEach(card => {
            const item = createLoadoutGridItem(card);
            item.addEventListener('click', () => assignCard(card.id));
            els.grid.appendChild(item);
        });
    }

    function createLoadoutGridItem(card) {
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
            placeholder.textContent = '?';
            inner.appendChild(placeholder);
        }

        item.appendChild(inner);

        const name = document.createElement('div');
        name.className = 'card-item-name';
        name.textContent = displayCard.name;
        item.appendChild(name);
        decorateGridItem(item, displayCard);

        return item;
    }

    function assignCard(cardId) {
        GameStorage.setLoadoutSlot(activeSlotIndex, cardId);
        renderSlots();

        const loadoutIds = GameStorage.getLoadoutIds();
        for (let i = 0; i < 4; i++) {
            const next = (activeSlotIndex + 1 + i) % 4;
            if (!loadoutIds[next]) {
                selectSlot(next);
                return;
            }
        }
    }

    return { init, open, close };
})();
