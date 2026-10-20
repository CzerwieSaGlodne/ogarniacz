'use strict';
/* Start aplikacji: motyw, skróty, kopie tablic, menu na telefonie. */

window.App = (function () {
  'use strict';

  /* Kolor paska stanu w PWA - dopasowany do ciemnego nagłówka tablicy. */
  const STATUS_COLOR = {
    pastel: '#4a4460',
    dark: '#1b1f29',
    cozy: '#6f5c48'
  };

  const WEEK = 7 * 24 * 60 * 60 * 1000;

  /* ---------- Telefon: szuflada, karta i przycisk „wstecz” ---------- */

  const Mobile = (function () {
    const media = window.matchMedia('(max-width: 900px)');
    let layer = null;
    let suppressPop = false;

    const isMobile = () => media.matches;

    /* Warstwa to otwarta karta albo szuflada. Historia Androida zamyka ją
       zamiast od razu wychodzić z aplikacji. */
    function openLayer(name, closeFn) {
      if (!isMobile()) return;
      if (layer) return;                  // nie dokładamy drugiej warstwy
      layer = { name, closeFn };

      /* Jeśli właśnie zamknięto menu i otwieramy kartę, przejmujemy
         jego wpis w historii zamiast dokładać kolejny. */
      const claimed = window.UI.claimHistoryForLayer(name);
      if (!claimed) {
        try { history.pushState({ ogLayer: name }, ''); } catch { /* brak historii */ }
      }
    }

    function closeLayer(fromHistory) {
      if (!layer) return;
      const hadOverlay = window.UI.prepareLayerClose();
      const current = layer;
      layer = null;
      window.UI.closePopover(true);
      try { current.closeFn(true); } catch { /* widok już zamknięty */ }

      if (fromHistory) return;

      if (hadOverlay) {
        /* Nad warstwą było potwierdzenie - cofamy oba wpisy naraz. */
        try { history.go(-2); } catch { /* brak historii */ }
      } else if (history.state && history.state.ogLayer) {
        suppressPop = true;
        history.back();
      }
    }

    window.addEventListener('popstate', () => {
      /* Najpierw menu lub potwierdzenie - dopiero drugie Wstecz
         zamyka kartę albo szufladę pod nimi. */
      if (window.UI.handleBack()) return;

      if (suppressPop) {
        suppressPop = false;
        return;
      }
      if (layer) {
        const current = layer;
        layer = null;
        try { current.closeFn(true); } catch { /* widok już zamknięty */ }
      }
    });

    function openDrawer() {
      if (!isMobile() || document.body.classList.contains('drawer-open')) return;
      if (layer) return;
      document.body.classList.add('drawer-open');
      openLayer('drawer', () => document.body.classList.remove('drawer-open'));
    }

    function closeDrawer() {
      document.body.classList.remove('drawer-open');
      if (layer && layer.name === 'drawer') closeLayer();
    }

    return { isMobile, openLayer, closeLayer, openDrawer, closeDrawer };
  })();

  window.Mobile = Mobile;

  /* ---------- Motyw ---------- */

  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    document.documentElement.style.colorScheme = id === 'dark' ? 'dark' : 'light';

    const meta = document.getElementById('themeColor');
    if (meta) meta.setAttribute('content', STATUS_COLOR[id] || STATUS_COLOR.pastel);

    if (window.api && window.api.setTitleBar) window.api.setTitleBar(id);
  }

  window.Store.on((reason) => {
    if (reason === 'theme' || reason === 'replace') applyTheme(window.Store.get().theme);
    if (reason === 'dim' || reason === 'replace') window.UI.setDim(window.Store.get().dim);
  });

  /* ---------- Kopie tablic ---------- */

  function updateBackupStatus() {
    const el = document.getElementById('backupStatus');
    if (!el) return;

    if (window.StoreIO.isDesktop) {
      el.textContent = '';
      return;
    }

    const last = window.StoreIO.lastBackup();
    if (!last) {
      el.textContent = 'Kopia zapasowa: jeszcze nie zrobiona';
      return;
    }

    const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
    if (days <= 0) el.textContent = 'Kopia zapasowa: dzisiaj';
    else if (days === 1) el.textContent = 'Kopia zapasowa: wczoraj';
    else el.textContent = `Kopia zapasowa: ${days} dni temu`;
  }

  async function exportData() {
    const state = window.Store.get();
    const name = `ogarniacz-${new Date().toISOString().slice(0, 10)}.json`;

    let result;
    try {
      result = await window.StoreIO.exportData(state, name);
    } catch (err) {
      result = { ok: false, error: String(err) };
    }

    if (result && result.ok) {
      window.StoreIO.markBackup();
      updateBackupStatus();
      window.UI.toast(window.StoreIO.isDesktop
        ? 'Kopia zapisana.'
        : 'Kopia zapisana w Pobraniach telefonu.');
    } else if (!result || !result.canceled) {
      window.UI.toast('Nie udało się zapisać kopii.');
    }
  }

  async function importData() {
    let result;
    try {
      result = await window.StoreIO.importData();
    } catch (err) {
      result = { ok: false, error: String(err) };
    }

    if (!result || !result.ok) {
      if (result && result.error) window.UI.toast(result.error);
      return false;
    }

    if (!result.data || !Array.isArray(result.data.boards) || !result.data.boards.length) {
      window.UI.toast('To nie jest poprawna kopia OGARNIACZA.');
      return false;
    }

    const count = result.data.boards.length;
    const ok = await window.UI.confirm({
      title: 'Wczytać kopię?',
      text: `Z pliku wczytam ${count} ${window.UI.plural(count, 'tablicę', 'tablice', 'tablic')}.\nObecne tablice zostaną zastąpione.`,
      okText: 'Wczytaj kopię'
    });
    if (!ok) return false;

    if (window.Card.isOpen) window.Card.close();
    await window.Store.replaceAll(result.data);
    window.UI.toast('Kopia wczytana.');
    return true;
  }

  /* ---------- Pierwsze uruchomienie na telefonie ---------- */

  function emptyState() {
    const state = window.Store.get();
    return {
      version: 1,
      theme: state.theme,
      dim: state.dim,
      selectedBoardId: null,
      boards: [{ id: window.Seed.uid('b'), name: 'Moje zadania', lists: [] }]
    };
  }

  function showWelcome() {
    if (!Mobile.isMobile()) return;

    const overlay = document.createElement('div');
    overlay.className = 'overlay welcome-overlay';
    overlay.innerHTML = `
      <div class="welcome-box">
        <img src="assets/logo.png" alt="">
        <h2>OGARNIACZ na telefonie</h2>
        <p>Tablice zapisują się tylko na tym telefonie. Zrób kopię zapasową,
           żeby ich nie stracić przy czyszczeniu danych Chrome.</p>
        <div class="welcome-actions">
          <button class="btn btn-primary" data-role="welcome-import">📂 Wczytaj kopię z komputera</button>
          <button class="btn" data-role="welcome-empty">Zacznij od pustej tablicy</button>
          <button class="btn btn-ghost" data-role="welcome-demo">Zostaw przykładowe tablice</button>
        </div>
      </div>`;

    function close() { overlay.remove(); }

    overlay.addEventListener('click', async (e) => {
      const role = e.target.closest('[data-role]');
      if (!role) return;

      if (role.dataset.role === 'welcome-import') {
        const ok = await importData();
        if (ok) close();
        return;
      }

      if (role.dataset.role === 'welcome-empty') {
        await window.Store.replaceAll(emptyState());
        window.UI.toast('Możesz zacząć dodawać listy i karty.');
        close();
        return;
      }

      if (role.dataset.role === 'welcome-demo') close();
    });

    document.getElementById('layer').appendChild(overlay);
  }

  function maybeBackupReminder() {
    if (window.StoreIO.isDesktop || !Mobile.isMobile()) return;

    const last = window.StoreIO.lastBackup();
    if (last && Date.now() - last < WEEK) return;

    /* Nie pokazuj przypomnienia częściej niż raz dziennie. */
    const key = 'ogarniacz.backupReminder';
    let previous = 0;
    try { previous = Number(localStorage.getItem(key)) || 0; } catch { /* brak dostępu */ }
    if (previous && Date.now() - previous < 24 * 60 * 60 * 1000) return;
    try { localStorage.setItem(key, String(Date.now())); } catch { /* brak miejsca */ }

    setTimeout(() => {
      window.UI.toast('Zrób kopię tablic: menu ☰ → Zapisz kopię tablic.');
    }, 2600);
  }

  /* ---------- Skróty klawiszowe ---------- */

  function shortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exportData(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); importData(); }
    });
  }

  /* ---------- Szuflada na telefonie ---------- */

  function mobileMenu() {
    const menuBtn = document.getElementById('menuBtn');
    const backdrop = document.getElementById('drawerBackdrop');
    const closeBtn = document.getElementById('drawerClose');

    if (menuBtn) menuBtn.addEventListener('click', () => Mobile.openDrawer());
    if (backdrop) backdrop.addEventListener('click', () => Mobile.closeDrawer());
    if (closeBtn) closeBtn.addEventListener('click', () => Mobile.closeDrawer());

    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) {
        Mobile.closeDrawer();
      }
    });

    if (Mobile.isMobile()) {
      try { history.replaceState({ ogRoot: true }, ''); } catch { /* brak historii */ }
    }
  }

  /* ---------- Start ---------- */

  async function start() {
    const firstRun = !window.StoreIO.isDesktop && !window.StoreIO.hasSavedData();
    const state = await window.Store.init();

    applyTheme(state.theme);
    window.UI.setDim(state.dim);
    window.Sidebar.init();
    window.Board.init();
    window.Card.init();
    shortcuts();
    mobileMenu();

    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', importData);

    if (window.api && window.api.onMenu) {
      window.api.onMenu('menu:export', exportData);
      window.api.onMenu('menu:import', importData);
    }

    window.StoreIO.requestPersistence();
    updateBackupStatus();

    if (firstRun) {
      setTimeout(showWelcome, 350);
    } else {
      maybeBackupReminder();
    }
  }

  document.addEventListener('DOMContentLoaded', start);

  return { exportData, importData, applyTheme };
})();
