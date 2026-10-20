'use strict';
/* Warstwa zapisu danych.
   Na komputerze (Electron) korzysta z pliku data.json przez window.api.
   W przeglądarce i w wersji PWA zapisuje tablice w pamięci przeglądarki. */

window.StoreIO = (function () {
  'use strict';

  const KEY = 'ogarniacz.data.v1';
  const BACKUP_KEY = 'ogarniacz.lastBackup';
  const BROKEN_KEY = 'ogarniacz.data.uszkodzone';
  const isDesktop = !!(window.api && window.api.save);

  /* ---------- Odczyt i zapis ---------- */

  async function load() {
    if (isDesktop) {
      try { return await window.api.load(); } catch { return null; }
    }

    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      /* Uszkodzony zapis zostawiamy w osobnym miejscu - nigdy nie kasujemy
         danych bez śladu. Aplikacja zacznie od nowa, ale stara treść zostanie. */
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) localStorage.setItem(BROKEN_KEY, raw);
      } catch { /* brak miejsca */ }
      return null;
    }
  }

  async function save(data) {
    if (isDesktop) {
      try { return await window.api.save(data); } catch (err) { return { ok: false, error: String(err) }; }
    }

    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  function hasSavedData() {
    if (isDesktop) return true;
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  }

  /* ---------- Kopie zapasowe ---------- */

  async function exportData(data, name) {
    if (isDesktop) return window.api.exportData(data, name);

    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name || 'ogarniacz-kopia.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      markBackup();
      return { ok: true, path: link.download };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  function importData() {
    if (isDesktop) return window.api.importData();

    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.opacity = '0';
      document.body.appendChild(input);

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onFocus);
        input.remove();
        resolve(result);
      };

      /* Nowe Chrome wysyła zdarzenie "cancel". Starsze wersje go nie mają,
         więc dodatkowo patrzymy na powrót do karty po zamknięciu okna. */
      const onFocus = () => {
        setTimeout(() => {
          if (!settled && (!input.files || !input.files.length)) finish({ ok: false, canceled: true });
        }, 700);
      };

      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return finish({ ok: false, canceled: true });
        try {
          const text = await file.text();
          finish({ ok: true, data: JSON.parse(text), path: file.name });
        } catch {
          finish({ ok: false, error: 'Nie udało się odczytać tego pliku.' });
        }
      });

      input.addEventListener('cancel', () => finish({ ok: false, canceled: true }));

      window.addEventListener('focus', onFocus, { once: true });
      input.click();
    });
  }

  function markBackup() {
    try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch { /* brak miejsca */ }
  }

  function lastBackup() {
    try { return Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch { return 0; }
  }

  /* Prosi przeglądarkę, żeby nie usuwała danych przy braku miejsca.
     To nie jest gwarancja - dlatego kopie zapasowe nadal są ważne. */
  async function requestPersistence() {
    if (isDesktop || !navigator.storage || !navigator.storage.persist) return false;
    try { return await navigator.storage.persist(); } catch { return false; }
  }

  return {
    isDesktop,
    load,
    save,
    hasSavedData,
    exportData,
    importData,
    markBackup,
    lastBackup,
    requestPersistence
  };
})();
