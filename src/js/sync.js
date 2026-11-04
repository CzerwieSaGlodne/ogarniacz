'use strict';
/* Synchronizacja z komputerem.
   Desktop: panel steruje serwerem w Electronie (Tailscale Serve).
   Telefon/PWA: łączy się z komputerem przez HTTPS i wysyła pełny,
   scalony stan. Ustawienia wyglądu pozostają lokalne. */

window.SyncApp = (function () {
  'use strict';

  const isDesktop = !!(window.StoreIO && window.StoreIO.isDesktop);
  const CONFIG_KEY = 'ogarniacz.sync.v1';
  const BACKUP_KEY = 'ogarniacz.backup.przedParowaniem';
  const POLL_MS = 5000;

  let desktopStatus = null;
  let phoneConfig = loadPhoneConfig();
  let phoneBusy = false;
  let syncing = false;
  let phoneError = '';
  let phoneNotice = '';
  let panel = null;
  let panelKind = '';
  let pollTimer = null;
  let pushTimer = null;
  let panelBusy = false;

  /* ---------- Telefon: konfiguracja ---------- */

  function loadPhoneConfig() {
    if (isDesktop) return null;
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || !value.url || !value.token) return null;
      return {
        url: normalizeUrl(value.url, false),
        token: String(value.token),
        serverId: String(value.serverId || ''),
        revision: Number(value.revision) || 0,
        lastSyncAt: Number(value.lastSyncAt) || 0,
        deviceName: String(value.deviceName || 'Telefon')
      };
    } catch {
      return null;
    }
  }

  function savePhoneConfig() {
    if (isDesktop) return;
    try {
      if (!phoneConfig) localStorage.removeItem(CONFIG_KEY);
      else localStorage.setItem(CONFIG_KEY, JSON.stringify(phoneConfig));
    } catch { /* brak miejsca - synchronizacja nadal działa w pamięci */ }
  }

  function phoneDeviceName() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone';
    if (/Android/i.test(ua)) return 'Telefon Android';
    return 'Telefon';
  }

  function normalizeUrl(value, strict) {
    let text = String(value == null ? '' : value).trim();
    if (!text) {
      if (strict) throw new Error('Wpisz adres z komputera.');
      return '';
    }
    if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
    let url;
    try { url = new URL(text); } catch { throw new Error('Ten adres jest nieprawidłowy.'); }
    if (url.pathname && url.pathname !== '/') {
      /* Adres komputera jest zwykle bez ścieżki - obcinamy końcowe ukośniki. */
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    if (strict) {
      const local = /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
      if (url.protocol !== 'https:' && !local) {
        throw new Error('Adres musi zaczynać się od https:// (taki adres pokazuje OGARNIACZ na komputerze).');
      }
    }
    return url.origin + (url.pathname && url.pathname !== '/' ? url.pathname : '');
  }

  /* ---------- Panel ---------- */

  function init() {
    const button = document.getElementById('syncBtn');
    if (button) button.addEventListener('click', open);

    if (isDesktop) {
      if (window.api && window.api.syncStatus) {
        window.api.syncStatus().then((status) => {
          desktopStatus = status;
          updateIndicator();
          if (panel && panelKind === 'desktop') renderPanel();
        }).catch(() => {});
      }
      if (window.api && window.api.onSyncStatus) {
        window.api.onSyncStatus((status) => {
          desktopStatus = status;
          updateIndicator();
          if (panel && panelKind === 'desktop' && !panelBusy) renderPanel();
        });
      }
      if (window.api && window.api.onSyncState) {
        window.api.onSyncState(applyDesktopRemote);
      }
    } else {
      updateIndicator();
      if (phoneConfig) startAutoSync();
      window.Store.on((reason) => {
        if (reason === 'remote' || reason === 'replace') return;
        if (!phoneConfig) return;
        schedulePush(900);
      });
      window.addEventListener('online', () => {
        if (phoneConfig) syncNow(false);
      });
      document.addEventListener('visibilitychange', () => {
        if (!phoneConfig) return;
        if (document.visibilityState === 'visible') {
          syncNow(false);
          startAutoSync();
        } else {
          window.Store.flush();
        }
      });
      window.addEventListener('pagehide', () => { window.Store.flush(); });
      if (phoneConfig) setTimeout(() => syncNow(false), 900);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel) {
        /* Najpierw zamykane jest potwierdzenie leżące nad panelem. */
        if (document.querySelector('.confirm-overlay')) return;
        e.preventDefault();
        close();
      }
    });
  }

  function open() {
    if (panel) return;
    panelBusy = false;
    phoneError = '';
    phoneNotice = '';
    panelKind = isDesktop ? 'desktop' : 'phone';
    panel = document.createElement('div');
    panel.className = 'overlay sync-overlay';
    panel.setAttribute('data-sync-panel', '');
    panel.innerHTML = `
      <div class="sync-box" role="dialog" aria-modal="true" aria-label="Synchronizacja">
        <div class="sync-head">
          <div>
            <h3>Synchronizacja z telefonem</h3>
            <p class="sync-sub">${isDesktop
              ? 'Telefon łączy się bezpośrednio z tym komputerem przez Tailscale.'
              : 'Połącz ten telefon z OGARNIACZEM na komputerze.'}</p>
          </div>
          <button class="icon-btn sync-close" data-role="close" aria-label="Zamknij" title="Zamknij">✕</button>
        </div>
        <div class="sync-body" data-sync-body></div>
      </div>`;

    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('change', onPanelChange);
    document.getElementById('layer').appendChild(panel);

    if (!isDesktop && window.Mobile) {
      window.Mobile.openPanel('sync', () => removePanel());
    }

    if (isDesktop) {
      renderPanel();
      refreshDesktopStatus();
    } else {
      renderPanel();
    }
  }

  function removePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    panelKind = '';
  }

  function close() {
    if (!panel) return;
    if (!isDesktop && window.Mobile) {
      window.Mobile.closeLayer();
      return;
    }
    removePanel();
  }

  function refreshDesktopStatus() {
    if (!isDesktop || !window.api || !window.api.syncStatus) return;
    window.api.syncStatus().then((status) => {
      desktopStatus = status;
      updateIndicator();
      if (panel && panelKind === 'desktop' && !panelBusy) renderPanel();
    }).catch(() => {});
  }

  function renderPanel() {
    if (!panel) return;
    const body = panel.querySelector('[data-sync-body]');
    if (!body) return;
    body.innerHTML = isDesktop ? desktopBody() : phoneBody();
    updateIndicator();
  }

  function desktopBody() {
    const status = desktopStatus;
    if (!status) {
      return '<div class="sync-loading">Sprawdzam stan synchronizacji…</div>';
    }

    let html = '';
    if (status.error) {
      html += `<div class="sync-error"><strong>Uwaga:</strong> ${window.UI.esc(status.error)}</div>`;
    }

    if (!status.enabled) {
      html += `
        <div class="sync-intro">
          <p>Dzięki synchronizacji zmiany z telefonu trafią na komputer, a zmiany z komputera na telefon.</p>
          <ul class="sync-list">
            <li>Tailscale musi być włączony na komputerze i telefonie.</li>
            <li>Dane pozostają na tym komputerze — nie są wysyłane do chmury.</li>
            <li>Telefon łączy się tylko wtedy, gdy oba urządzenia są dostępne.</li>
          </ul>
        </div>
        <div class="sync-warning">
          Zanim włączysz synchronizację, upewnij się, że w Tailscale włączone są
          <strong>MagicDNS</strong> i <strong>HTTPS Certificates</strong>.
        </div>
        <div class="sync-actions">
          <button class="btn btn-primary" data-role="enable" ${panelBusy ? 'disabled' : ''}>
            ${panelBusy ? 'Włączam…' : 'Włącz synchronizację'}
          </button>
        </div>`;
      return html;
    }

    html += `<div class="sync-state ${status.ready ? 'ok' : 'warn'}">
      <span class="sync-state-dot"></span>
      ${status.ready
        ? (status.paired ? `Połączono z: ${window.UI.esc(status.pairedDevice || 'telefon')}` : 'Serwer gotowy. Wpisz kod na telefonie.')
        : 'Serwer działa lokalnie, ale Tailscale wymaga uwagi.'}
    </div>`;

    if (!status.ready) {
      html += `
        <div class="sync-actions">
          <button class="btn btn-small" data-role="enable" ${panelBusy ? 'disabled' : ''}>
            ${panelBusy ? 'Sprawdzam…' : 'Spróbuj ponownie'}
          </button>
        </div>`;
    }

    if (status.url) {
      html += `
        <div class="sync-field">
          <label>Adres komputera</label>
          <div class="sync-copy-row">
            <code class="sync-url" data-copy-text="${window.UI.esc(status.url)}">${window.UI.esc(status.url)}</code>
            <button class="btn btn-small" data-role="copy-url">Kopiuj</button>
          </div>
        </div>`;
    }

    if (status.code) {
      const expires = status.codeExpires
        ? new Date(status.codeExpires).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
        : '';
      html += `
        <div class="sync-field sync-code-field">
          <label>Kod jednorazowy</label>
          <div class="sync-code" data-copy-text="${window.UI.esc(status.code)}">${window.UI.esc(status.code)}</div>
          <div class="sync-hint">Wpisz ten kod w telefonie. ${expires ? `Ważny do ${expires}.` : ''}</div>
        </div>
        <div class="sync-actions">
          <button class="btn btn-small" data-role="copy-code">Kopiuj kod</button>
          <button class="btn btn-small" data-role="new-code">Nowy kod</button>
        </div>`;
    } else if (!status.paired) {
      html += `
        <div class="sync-warning">
          Kod jest jednorazowy i wygasł. Kliknij „Nowy kod”, żeby połączyć telefon.
        </div>
        <div class="sync-actions">
          <button class="btn btn-primary" data-role="new-code">Nowy kod</button>
        </div>`;
    } else {
      html += `
        <div class="sync-hint">Ostatnia synchronizacja: ${formatWhen(status.lastSyncAt)}</div>
        <div class="sync-actions">
          <button class="btn btn-small" data-role="new-code">Połącz kolejny telefon</button>
          <button class="btn btn-small btn-danger" data-role="unpair">Odłącz telefon</button>
        </div>`;
    }

    html += `
      <div class="sync-options">
        <label class="sync-check">
          <input type="checkbox" data-option="runInTray" ${status.runInTray ? 'checked' : ''}>
          <span>Zostaw OGARNIACZ w zasobniku po zamknięciu okna</span>
        </label>
        <label class="sync-check">
          <input type="checkbox" data-option="startAtLogin" ${status.startAtLogin ? 'checked' : ''}>
          <span>Uruchamiaj przy starcie Windows</span>
        </label>
      </div>
      <div class="sync-actions sync-actions-bottom">
        <button class="btn btn-ghost" data-role="disable" ${panelBusy ? 'disabled' : ''}>Wyłącz synchronizację</button>
      </div>
      <div class="sync-version">OGARNIACZ ${window.UI.esc(status.version || '')}</div>`;

    return html;
  }

  function phoneBody() {
    if (!phoneConfig) {
      return `
        <div class="sync-intro">
          <p>Na komputerze otwórz OGARNIACZ, kliknij <strong>Synchronizacja</strong> i przepisz tutaj
             adres oraz jednorazowy kod.</p>
          <p class="sync-hint">Telefon i komputer muszą mieć włączony Tailscale.</p>
        </div>
        <div class="sync-field">
          <label for="syncServerUrl">Adres komputera</label>
          <input id="syncServerUrl" class="sync-input" type="url" inputmode="url"
                 placeholder="https://ogarniacz-desktop.tail…ts.net" autocomplete="off" spellcheck="false">
        </div>
        <div class="sync-field">
          <label for="syncCode">Kod jednorazowy</label>
          <input id="syncCode" class="sync-input sync-code-input" type="text" inputmode="numeric"
                 maxlength="6" placeholder="000000" autocomplete="one-time-code" spellcheck="false">
        </div>
        <label class="sync-check">
          <input type="checkbox" id="syncReplace" checked>
          <span>Zastąp dane tego telefonu danymi z komputera <em>(zalecane przy pierwszym połączeniu)</em></span>
        </label>
        <div class="sync-error" data-sync-error ${phoneError ? '' : 'hidden'}>${window.UI.esc(phoneError)}</div>
        <div class="sync-actions">
          <button class="btn btn-primary" data-role="pair" ${phoneBusy ? 'disabled' : ''}>
            ${phoneBusy ? 'Łączę…' : 'Połącz z komputerem'}
          </button>
        </div>
        <div class="sync-hint sync-bottom-hint">
          Adres i kod są widoczne na komputerze w panelu synchronizacji.
        </div>`;
    }

    const last = phoneConfig.lastSyncAt ? formatWhen(phoneConfig.lastSyncAt) : 'jeszcze nie było';
    return `
      <div class="sync-state ${phoneError ? 'warn' : 'ok'}">
        <span class="sync-state-dot"></span>
        ${phoneError ? 'Brak połączenia z komputerem' : 'Połączono z komputerem'}
      </div>
      <div class="sync-field">
        <label>Komputer</label>
        <code class="sync-url">${window.UI.esc(phoneConfig.url)}</code>
      </div>
      <div class="sync-hint">Ostatnia synchronizacja: ${last}</div>
      ${phoneError ? `<div class="sync-error">${window.UI.esc(phoneError)}</div>` : ''}
      ${phoneNotice ? `<div class="sync-notice">${window.UI.esc(phoneNotice)}</div>` : ''}
      <div class="sync-actions">
        <button class="btn btn-primary" data-role="sync-now" ${syncing ? 'disabled' : ''}>
          ${syncing ? 'Synchronizuję…' : 'Synchronizuj teraz'}
        </button>
      </div>
      <div class="sync-actions">
        <button class="btn btn-small" data-role="download-backup">Pobierz kopię sprzed połączenia</button>
      </div>
      <div class="sync-actions sync-actions-bottom">
        <button class="btn btn-ghost" data-role="disconnect">Odłącz telefon</button>
      </div>
      <div class="sync-hint sync-bottom-hint">
        Telefon synchronizuje się automatycznie, gdy aplikacja jest otwarta. Po dłuższej przerwie
        zmiany dogonią przy następnym uruchomieniu.
      </div>
      <div class="sync-version">OGARNIACZ ${window.UI.esc(window.PWA && window.PWA.version ? window.PWA.version : '')}</div>`;
  }

  function onPanelClick(event) {
    if (event.target === panel) { close(); return; }
    const role = event.target.closest('[data-role]');
    if (!role) return;
    const name = role.dataset.role;
    if (name === 'close') { close(); return; }
    if (name === 'enable') { enableDesktop(); return; }
    if (name === 'disable') { disableDesktop(); return; }
    if (name === 'new-code') { newCode(); return; }
    if (name === 'unpair') { unpairDesktop(); return; }
    if (name === 'copy-url' || name === 'copy-code') {
      const source = name === 'copy-url'
        ? panel.querySelector('.sync-url')
        : panel.querySelector('.sync-code');
      const text = source && (source.dataset.copyText || source.textContent);
      copyText(text);
      return;
    }
    if (name === 'pair') { pairPhone(); return; }
    if (name === 'sync-now') { syncNow(true); return; }
    if (name === 'download-backup') { downloadPhoneBackup(); return; }
    if (name === 'disconnect') { disconnectPhone(); }
  }

  async function onPanelChange(event) {
    const option = event.target.closest('[data-option]');
    if (!option || !isDesktop || !window.api || !window.api.syncSetOptions) return;
    const value = {};
    value[option.dataset.option] = !!option.checked;
    panelBusy = true;
    try {
      desktopStatus = await window.api.syncSetOptions(value) || desktopStatus;
      updateIndicator();
    } catch { /* panel pokaże poprzedni stan */ }
    panelBusy = false;
    renderPanel();
  }

  /* ---------- Desktop: akcje ---------- */

  async function enableDesktop() {
    if (!window.api || !window.api.syncEnable) return;
    panelBusy = true;
    renderPanel();
    try {
      desktopStatus = await window.api.syncEnable() || desktopStatus;
      if (desktopStatus && desktopStatus.ready) {
        window.UI.toast('Synchronizacja włączona. Przepisz kod na telefonie.');
      }
    } catch {
      window.UI.toast('Nie udało się włączyć synchronizacji.');
    }
    panelBusy = false;
    updateIndicator();
    renderPanel();
  }

  async function disableDesktop() {
    const ok = await window.UI.confirm({
      title: 'Wyłączyć synchronizację?',
      text: 'Telefon nie będzie już łączył się z komputerem. Dane na obu urządzeniach pozostaną bez zmian.',
      okText: 'Wyłącz'
    });
    if (!ok) return;
    panelBusy = true;
    renderPanel();
    try {
      desktopStatus = await window.api.syncDisable() || desktopStatus;
      window.UI.toast('Synchronizacja wyłączona.');
    } catch {
      window.UI.toast('Nie udało się wyłączyć synchronizacji.');
    }
    panelBusy = false;
    updateIndicator();
    renderPanel();
  }

  async function newCode() {
    if (!window.api || !window.api.syncNewCode) return;
    panelBusy = true;
    renderPanel();
    try {
      desktopStatus = await window.api.syncNewCode() || desktopStatus;
    } catch {
      window.UI.toast('Nie udało się utworzyć nowego kodu.');
    }
    panelBusy = false;
    updateIndicator();
    renderPanel();
  }

  async function unpairDesktop() {
    const ok = await window.UI.confirm({
      title: 'Odłączyć telefon?',
      text: 'Telefon straci dostęp do synchronizacji. Dane pozostaną na obu urządzeniach. Aby połączyć go ponownie, wygeneruj nowy kod.',
      okText: 'Odłącz'
    });
    if (!ok) return;
    try {
      desktopStatus = await window.api.syncUnpair() || desktopStatus;
      window.UI.toast('Telefon odłączony.');
    } catch {
      window.UI.toast('Nie udało się odłączyć telefonu.');
    }
    updateIndicator();
    renderPanel();
  }

  /* ---------- Desktop: odbiór zmian z telefonu ---------- */

  async function applyDesktopRemote(remote) {
    if (!remote || !window.Store || !window.SyncCore) return;
    const local = window.Store.get();
    const merged = window.SyncCore.merge(local, remote, {
      deviceId: local.sync && local.sync.deviceId,
      settingsFrom: 'local'
    });
    if (window.SyncCore.fingerprint(merged) === window.SyncCore.fingerprint(local)) return;
    await window.Store.applyRemote(merged);
    window.UI.toast('Zaktualizowano z telefonu.');
  }

  /* ---------- Telefon: łączenie i synchronizacja ---------- */

  async function pairPhone() {
    if (!panel || phoneBusy) return;
    const urlInput = panel.querySelector('#syncServerUrl');
    const codeInput = panel.querySelector('#syncCode');
    const replaceInput = panel.querySelector('#syncReplace');
    const error = panel.querySelector('[data-sync-error]');

    let url = '';
    let code = '';
    try {
      url = normalizeUrl(urlInput ? urlInput.value : '', true);
      code = String(codeInput ? codeInput.value : '').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(code)) throw new Error('Wpisz 6-cyfrowy kod z komputera.');
    } catch (err) {
      phoneError = err.message;
      if (error) { error.textContent = phoneError; error.hidden = false; }
      return;
    }

    phoneBusy = true;
    phoneError = '';
    if (error) error.hidden = true;
    const pairButton = panel.querySelector('[data-role="pair"]');
    if (pairButton) {
      pairButton.disabled = true;
      pairButton.textContent = 'Łączę…';
    }

    const replace = !!(replaceInput && replaceInput.checked);
    const body = {
      code,
      deviceName: phoneDeviceName(),
      mode: replace ? 'replace' : 'merge'
    };
    if (!replace) body.state = window.Store.get();

    try {
      const response = await request(url + '/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.token || !data.state) {
        throw new Error(data.error || 'Nie udało się połączyć. Sprawdź adres, kod i Tailscale.');
      }

      if (replace) savePhoneBackup();
      const local = window.Store.get();
      let nextState = data.state;
      if (!replace) {
        nextState = window.SyncCore.merge(local, data.state, {
          deviceId: local.sync && local.sync.deviceId,
          settingsFrom: 'local'
        });
      }
      await window.Store.applyRemote(nextState);

      phoneConfig = {
        url,
        token: String(data.token),
        serverId: String(data.serverId || ''),
        revision: Number(data.revision) || 0,
        lastSyncAt: Date.now(),
        deviceName: phoneDeviceName()
      };
      savePhoneConfig();
      startAutoSync();
      phoneBusy = false;
      phoneError = '';
      phoneNotice = replace
        ? 'Połączono. Dane telefonu zostały zastąpione danymi z komputera, a poprzednia wersja jest zapisana lokalnie.'
        : 'Połączono. Dane z obu urządzeń zostały połączone.';
      window.UI.toast('Połączono z komputerem.');
      renderPanel();
      schedulePush(250);
      if (window.SyncApp && window.SyncApp.updateIndicator) updateIndicator();
    } catch (err) {
      phoneBusy = false;
      phoneError = friendlyNetworkError(err);
      if (panel && panelKind === 'phone') {
        const box = panel.querySelector('[data-sync-error]');
        if (box) { box.textContent = phoneError; box.hidden = false; }
        if (pairButton) {
          pairButton.disabled = false;
          pairButton.textContent = 'Połącz z komputerem';
        }
      }
      updateIndicator();
    }
  }

  function savePhoneBackup() {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        at: Date.now(),
        state: window.Store.get()
      }));
    } catch { /* brak miejsca - kopia na komputerze nadal istnieje */ }
  }

  function downloadPhoneBackup() {
    let backup = null;
    try { backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch { /* brak */ }
    if (!backup || !backup.state) {
      window.UI.toast('Brak kopii sprzed pierwszego połączenia.');
      return;
    }
    const blob = new Blob([JSON.stringify(backup.state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ogarniacz-przed-synchronizacja-${new Date(backup.at).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 15000);
    window.UI.toast('Kopia zapisana w Pobraniach telefonu.');
  }

  async function disconnectPhone() {
    if (!phoneConfig) return;
    const ok = await window.UI.confirm({
      title: 'Odłączyć telefon?',
      text: 'Synchronizacja z komputerem zostanie wyłączona na tym telefonie. Twoje tablice pozostaną na telefonie.',
      okText: 'Odłącz'
    });
    if (!ok) return;
    phoneConfig = null;
    savePhoneConfig();
    stopAutoSync();
    phoneError = '';
    phoneNotice = '';
    updateIndicator();
    renderPanel();
    window.UI.toast('Telefon odłączony od komputera.');
  }

  async function syncNow(manual) {
    if (!phoneConfig || syncing) {
      if (manual && !phoneConfig) open();
      return;
    }
    if (navigator.onLine === false) {
      phoneError = 'Telefon jest offline. Zmiany poczekają do połączenia z internetem.';
      updateIndicator();
      if (panel && panelKind === 'phone') renderPanel();
      return;
    }

    syncing = true;
    phoneError = '';
    if (manual) {
      phoneNotice = '';
      if (panel && panelKind === 'phone') renderPanel();
    }

    try {
      const base = phoneConfig.url.replace(/\/+$/, '');
      const response = await request(base + '/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + phoneConfig.token
        },
        body: JSON.stringify({
          deviceName: phoneConfig.deviceName || phoneDeviceName(),
          state: window.Store.get()
        })
      });

      if (response.status === 401) {
        throw new Error('Połączenie wygasło. Na komputerze wygeneruj nowy kod i połącz telefon ponownie.');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.state) {
        throw new Error(data.error || 'Komputer nie odpowiedział poprawnie.');
      }

      const local = window.Store.get();
      const merged = window.SyncCore.merge(local, data.state, {
        deviceId: local.sync && local.sync.deviceId,
        settingsFrom: 'local'
      });
      const localPrint = window.SyncCore.fingerprint(local);
      const mergedPrint = window.SyncCore.fingerprint(merged);
      const serverPrint = window.SyncCore.fingerprint(data.state);

      if (mergedPrint !== localPrint) {
        await window.Store.applyRemote(merged);
      }
      if (mergedPrint !== serverPrint) {
        schedulePush(700);
      }

      phoneConfig.serverId = String(data.serverId || phoneConfig.serverId || '');
      phoneConfig.revision = Number(data.revision) || 0;
      phoneConfig.lastSyncAt = Date.now();
      savePhoneConfig();
      phoneError = '';
      updateIndicator();
      if (manual && panel && panelKind === 'phone') {
        phoneNotice = 'Synchronizacja zakończona.';
        renderPanel();
      }
    } catch (err) {
      phoneError = friendlyNetworkError(err);
      updateIndicator();
      if (manual && panel && panelKind === 'phone') renderPanel();
    } finally {
      syncing = false;
      if (phoneConfig) startAutoSync();
    }
  }

  function schedulePush(delay) {
    if (!phoneConfig) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(false), delay || 900);
  }

  function startAutoSync() {
    if (!phoneConfig) return;
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false && !syncing) {
        syncNow(false);
      }
    }, POLL_MS);
  }

  function stopAutoSync() {
    clearInterval(pollTimer);
    pollTimer = null;
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  function friendlyNetworkError(err) {
    const message = String(err && err.message ? err.message : err || '');
    if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(message)) {
      return 'Nie mogę połączyć się z komputerem. Sprawdź Tailscale, adres i czy OGARNIACZ działa na komputerze.';
    }
    if (/abor/i.test(message)) {
      return 'Komputer nie odpowiedział na czas. Spróbuj ponownie.';
    }
    return message || 'Nie udało się połączyć z komputerem.';
  }

  function request(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(() => clearTimeout(timer));
  }

  /* ---------- Wskaźnik przy przycisku ---------- */

  function updateIndicator() {
    const dot = document.getElementById('syncDot');
    const mini = document.getElementById('syncMini');
    if (!dot) return;

    let state = 'off';
    let text = 'Nie połączono';

    if (isDesktop) {
      if (!desktopStatus) {
        state = 'off';
        text = '';
      } else if (!desktopStatus.enabled) {
        state = 'off';
        text = 'Nie połączono';
      } else if (!desktopStatus.ready) {
        state = 'warn';
        text = 'Sprawdź Tailscale';
      } else if (desktopStatus.paired) {
        state = 'on';
        text = 'Telefon połączony';
      } else {
        state = 'warn';
        text = 'Czeka na telefon';
      }
    } else if (phoneConfig) {
      if (phoneError) {
        state = 'warn';
        text = 'Brak połączenia';
      } else {
        state = 'on';
        text = 'Połączono z komputerem';
      }
    } else {
      state = 'off';
      text = 'Nie połączono';
    }

    dot.className = 'sync-dot ' + state;
    if (mini) {
      mini.textContent = text;
      mini.hidden = !text;
    }
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      window.UI.toast('Skopiowano.');
      return;
    } catch { /* starsza przeglądarka */ }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); window.UI.toast('Skopiowano.'); }
    catch { window.UI.toast('Zaznacz i skopiuj ręcznie.'); }
    area.remove();
  }

  function formatWhen(timestamp) {
    if (!timestamp) return 'jeszcze nie było';
    try {
      return new Date(timestamp).toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return 'dawno temu';
    }
  }

  return {
    init,
    open,
    close,
    updateIndicator,
    syncNow
  };
})();
