'use strict';
/* Start aplikacji: motyw, skróty, kopiowanie tablic. */

window.App = (function () {
  'use strict';

  /* Kolor paska tytułu okna dopasowany do motywu */
  const TITLE_BAR = {
    pastel: { color: '#e4d2de', symbol: '#4a4460' },
    dark: { color: '#0f1118', symbol: '#c9cfdc' },
    cozy: { color: '#c9d8cf', symbol: '#33302f' }
  };

  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    if (window.api && window.api.setTitleBar) window.api.setTitleBar(id);
  }

  window.Store.on((reason) => {
    if (reason === 'theme') applyTheme(window.Store.get().theme);
    if (reason === 'dim') window.UI.setDim(window.Store.get().dim);
  });

  /* ---------- Kopiowanie tablic ---------- */

  async function exportData() {
    const state = window.Store.get();
    const name = `ogarniacz-${new Date().toISOString().slice(0, 10)}.json`;
    const result = await window.api.exportData(state, name);
    if (result.ok) window.UI.toast('Kopia zapisana.');
  }

  async function importData() {
    const result = await window.api.importData();
    if (!result.ok) return;

    const count = (result.data.boards || []).length;
    const ok = await window.UI.confirm({
      title: 'Wczytać kopię?',
      text: `Z pliku wczytam ${count} ${window.UI.plural(count, 'tablicę', 'tablice', 'tablic')}.\nObecne tablice zostaną zastąpione.`,
      okText: 'Wczytaj kopię'
    });
    if (!ok) return;

    await window.Store.replaceAll(result.data);
    window.UI.toast('Kopia wczytana.');
  }

  /* ---------- Skróty klawiszowe ---------- */

  function shortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exportData(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'i') { e.preventDefault(); importData(); }
    });
  }

  /* ---------- Start ---------- */

  async function start() {
    const state = await window.Store.init();

    applyTheme(state.theme);
    window.UI.setDim(state.dim);
    window.Sidebar.init();
    window.Board.init();
    window.Card.init();
    shortcuts();

    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', importData);

    if (window.api && window.api.onMenu) {
      window.api.onMenu('menu:export', exportData);
      window.api.onMenu('menu:import', importData);
    }
  }

  document.addEventListener('DOMContentLoaded', start);

  return { exportData, importData, applyTheme };
})();