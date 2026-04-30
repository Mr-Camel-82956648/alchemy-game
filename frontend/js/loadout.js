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

    function renderSlots() {
        const loadout = GameStorage.getLoadout();
        els.slots.forEach((slotEl, i) => {
            const card = loadout[i];
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
                nameEl.textContent = card.name;
            } else {
                if (videoEl) { videoEl.style.display = 'none'; videoEl.src = ''; }
                thumbEl.style.display = 'none';
                keyEl.style.display = 'block';
                nameEl.textContent = '';
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
            placeholder.textContent = '?';
            inner.appendChild(placeholder);
        }

        item.appendChild(inner);

        const name = document.createElement('div');
        name.className = 'card-item-name';
        name.textContent = card.name;
        item.appendChild(name);

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
