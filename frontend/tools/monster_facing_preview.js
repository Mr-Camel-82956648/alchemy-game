// Local-only monster facing preview tool, kept for ongoing formal monster facing checks and not wired into the homepage.
(function () {
    const CARD_W = 420;
    const CARD_H = 260;
    const GROUND_Y = 220;
    const MOVE_MIN_X = 108;
    const MOVE_MAX_X = 312;
    const MOVE_SPEED = 54;

    const previewGrid = document.getElementById('preview-grid');
    const incomingOnlyCheckbox = document.getElementById('incoming-only');
    const resetButton = document.getElementById('reset-toggles');
    const exportOutput = document.getElementById('export-output');
    const copyButton = document.getElementById('copy-export');
    const battleApi = typeof Battle !== 'undefined' ? Battle : window.Battle;

    if (!battleApi || !battleApi.getMonsterPreviewCatalog || !battleApi.renderMonsterPreviewFrame) {
        previewGrid.innerHTML = '<div class="card"><div class="card-head"><h2>Battle preview API unavailable</h2></div></div>';
        return;
    }

    const cardStates = new Map();
    let lastFrameAt = performance.now();

    function getCatalog() {
        return battleApi.getMonsterPreviewCatalog({
            incomingOnly: incomingOnlyCheckbox.checked
        });
    }

    function createCardState(item, previous) {
        return {
            item,
            invertPreview: previous ? previous.invertPreview : false,
            x: previous ? previous.x : MOVE_MIN_X + Math.random() * (MOVE_MAX_X - MOVE_MIN_X),
            dir: previous ? previous.dir : (Math.random() > 0.5 ? 1 : -1),
            bobOffset: previous ? previous.bobOffset : Math.random() * Math.PI * 2,
            frameInfo: null,
            canvas: null,
            ctx: null,
            currentFlipEl: null,
            previewFlipEl: null,
            facingEl: null,
            modeEl: null,
            toggleButton: null
        };
    }

    function updateExport() {
        const lines = [];
        const visibleStates = [...cardStates.values()].sort((a, b) => a.item.key.localeCompare(b.item.key));
        visibleStates.forEach(state => {
            const currentFlip = !!state.item.flipDefault;
            const previewFlip = state.invertPreview ? !currentFlip : currentFlip;
            const decision = state.invertPreview ? 'invert' : 'keep';
            lines.push(`${state.item.key}: ${decision} (current ${currentFlip} -> preview ${previewFlip})`);
        });
        exportOutput.value = lines.join('\n');
    }

    function refreshCardMeta(state) {
        const currentFlip = !!state.item.flipDefault;
        const previewFlip = state.invertPreview ? !currentFlip : currentFlip;
        state.currentFlipEl.textContent = String(currentFlip);
        state.previewFlipEl.textContent = String(previewFlip);
        state.modeEl.textContent = state.invertPreview ? '取反预览中' : '使用当前 flipDefault';
        state.toggleButton.textContent = state.invertPreview ? '切回当前 flipDefault' : '预览取反后的 flipDefault';
    }

    function buildCard(state) {
        const card = document.createElement('section');
        card.className = 'card';

        const head = document.createElement('div');
        head.className = 'card-head';
        head.innerHTML = `
            <h2>${state.item.key}</h2>
            <div class="sub">${state.item.assetBase}</div>
            <div class="meta">
                <div><strong>frames:</strong> ${state.item.frames}</div>
                <div><strong>category:</strong> ${state.item.category}</div>
                <div><strong>current flipDefault:</strong> <span data-role="current-flip"></span></div>
                <div><strong>preview flipDefault:</strong> <span data-role="preview-flip"></span></div>
            </div>
        `;
        card.appendChild(head);

        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'canvas-wrap';
        const canvas = document.createElement('canvas');
        canvas.className = 'preview-canvas';
        canvas.width = CARD_W;
        canvas.height = CARD_H;
        canvasWrap.appendChild(canvas);
        card.appendChild(canvasWrap);

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const status = document.createElement('div');
        status.className = 'status';
        status.innerHTML = 'mode: <code data-role="mode"></code> | facing: <code data-role="facing">loading</code>';
        actions.appendChild(status);

        const toggleButton = document.createElement('button');
        toggleButton.className = 'btn';
        toggleButton.type = 'button';
        toggleButton.addEventListener('click', () => {
            state.invertPreview = !state.invertPreview;
            refreshCardMeta(state);
            updateExport();
        });
        actions.appendChild(toggleButton);
        card.appendChild(actions);

        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');
        state.currentFlipEl = head.querySelector('[data-role="current-flip"]');
        state.previewFlipEl = head.querySelector('[data-role="preview-flip"]');
        state.facingEl = status.querySelector('[data-role="facing"]');
        state.modeEl = status.querySelector('[data-role="mode"]');
        state.toggleButton = toggleButton;

        refreshCardMeta(state);
        return card;
    }

    function rebuildGrid() {
        const previousStates = new Map(cardStates);
        cardStates.clear();
        previewGrid.innerHTML = '';

        getCatalog().forEach(item => {
            const previous = previousStates.get(item.key);
            const state = createCardState(item, previous);
            cardStates.set(item.key, state);
            previewGrid.appendChild(buildCard(state));
        });

        updateExport();
    }

    function drawGround(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
        grad.addColorStop(0, '#151a20');
        grad.addColorStop(1, '#0e1116');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CARD_W, CARD_H);

        ctx.fillStyle = 'rgba(72, 82, 94, 0.16)';
        ctx.fillRect(28, GROUND_Y - 8, CARD_W - 56, 34);

        ctx.strokeStyle = 'rgba(210, 198, 174, 0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(24, GROUND_Y + 18);
        ctx.lineTo(CARD_W - 24, GROUND_Y + 18);
        ctx.stroke();
    }

    function drawCardFrame(state, now, dtSeconds) {
        const ctx = state.ctx;
        ctx.clearRect(0, 0, CARD_W, CARD_H);
        drawGround(ctx);

        state.x += state.dir * MOVE_SPEED * dtSeconds;
        if (state.x <= MOVE_MIN_X) {
            state.x = MOVE_MIN_X;
            state.dir = 1;
        } else if (state.x >= MOVE_MAX_X) {
            state.x = MOVE_MAX_X;
            state.dir = -1;
        }

        const movingLeft = state.dir < 0;
        const flipOverride = state.invertPreview ? !state.item.flipDefault : state.item.flipDefault;
        const frameInfo = battleApi.renderMonsterPreviewFrame(ctx, {
            species: state.item.key,
            now,
            x: state.x,
            y: GROUND_Y,
            renderWidth: 150 * state.item.scale,
            movingLeft,
            bobOffset: state.bobOffset,
            flipDefaultOverride: flipOverride
        });
        state.frameInfo = frameInfo;

        ctx.fillStyle = 'rgba(220, 210, 192, 0.72)';
        ctx.font = '12px "Consolas", "Microsoft YaHei", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(movingLeft ? 'moving: left' : 'moving: right', 12, 20);
        ctx.fillText(frameInfo.ready ? `frame: ${frameInfo.frameIndex + 1}/${state.item.frames}` : 'frame: loading', 12, 38);
        ctx.textAlign = 'right';
        ctx.fillText(`effective flip: ${String(flipOverride)}`, CARD_W - 12, 20);
        ctx.fillText(`battle facing: ${frameInfo.facing ? 'left' : 'right'}`, CARD_W - 12, 38);

        if (state.facingEl) {
            state.facingEl.textContent = frameInfo.facing ? 'left' : 'right';
        }

        if (!frameInfo.ready) {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 241, 200, 0.72)';
            ctx.fillText('loading sprite frames...', CARD_W / 2, GROUND_Y - 48);
        }
    }

    function animate(now) {
        const dtSeconds = Math.max(0, Math.min(0.05, (now - lastFrameAt) / 1000));
        lastFrameAt = now;
        cardStates.forEach(state => drawCardFrame(state, now, dtSeconds));
        requestAnimationFrame(animate);
    }

    incomingOnlyCheckbox.addEventListener('change', rebuildGrid);
    resetButton.addEventListener('click', () => {
        cardStates.forEach(state => {
            state.invertPreview = false;
            refreshCardMeta(state);
        });
        updateExport();
    });
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(exportOutput.value);
            copyButton.textContent = '已复制';
            setTimeout(() => { copyButton.textContent = '复制当前结论'; }, 1200);
        } catch {
            copyButton.textContent = '复制失败';
            setTimeout(() => { copyButton.textContent = '复制当前结论'; }, 1200);
        }
    });

    rebuildGrid();
    requestAnimationFrame(animate);
})();
