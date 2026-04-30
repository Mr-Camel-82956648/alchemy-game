/**
 * main.js — 主控制器：初始化 & 页面切换
 */
const App = (() => {
    const REF_W = 1920;
    const REF_H = 1080;
    let currentPage = 'alchemy';
    const pages = {};

    function resizeApp() {
        const app = document.getElementById('app');
        const sw = window.innerWidth;
        const sh = window.innerHeight;
        const scale = Math.min(sw / REF_W, sh / REF_H);
        app.style.transform = `scale(${scale})`;
        app.style.left = `${(sw - REF_W * scale) / 2}px`;
        app.style.top = `${(sh - REF_H * scale) / 2}px`;
    }

    async function init() {
        pages.alchemy = document.getElementById('page-alchemy');
        pages.collection = document.getElementById('page-collection');
        pages.loadout = document.getElementById('page-loadout');
        pages.battle = document.getElementById('page-battle');

        resizeApp();
        window.addEventListener('resize', resizeApp);

        await GameStorage.seedIfNeeded();

        Collection.init();
        Loadout.init();
        Alchemy.init();
        Battle.init();

        showPage('alchemy', false);
        console.log('[炼金法阵] 初始化完成');
    }

    function switchPage(target) {
        if (target === currentPage) return;

        const fadeMask = document.getElementById('fade-mask');
        fadeMask.classList.add('active');

        setTimeout(() => {
            if (currentPage === 'battle') Battle.stop();
            showPage(target, false);

            setTimeout(() => {
                fadeMask.classList.remove('active');
                if (target === 'battle') Battle.start();
            }, 100);
        }, 500);
    }

    function showPage(name) {
        Object.entries(pages).forEach(([key, el]) => {
            if (key === name) {
                el.style.display = 'block';
                el.classList.add('active');
            } else if (key !== 'collection' && key !== 'loadout') {
                el.classList.remove('active');
                el.style.display = 'none';
            }
        });
        currentPage = name;
    }

    return { init, switchPage };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
