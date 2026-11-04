'use strict';
/* Serwer synchronizacji OGARNIACZA.
   Działa wyłącznie na 127.0.0.1. Na telefon jest wystawiany przez
   Tailscale Serve jako HTTPS, więc router nie wymaga otwierania portów. */

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SyncCore = require('../src/js/sync-core.js');

const PROTOCOL = 1;
const PAIR_TTL = 60 * 60 * 1000;
const MAX_BODY = 16 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  'https://czerwiesaglodne.github.io'
]);

function createSyncHub(options) {
  return new SyncHub(options || {});
}

class SyncHub {
  constructor(options) {
    this.dataDir = options.dataDir;
    this.dataFile = options.dataFile || path.join(this.dataDir, 'data.json');
    this.appVersion = options.appVersion || '';
    this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    this.onState = typeof options.onState === 'function' ? options.onState : () => {};

    this.settingsFile = path.join(this.dataDir, 'sync-settings.json');
    this.settings = {
      enabled: false,
      runInTray: true,
      startAtLogin: true,
      token: '',
      serverId: '',
      deviceId: '',
      revision: 0,
      pairCode: '',
      pairCodeExpires: 0,
      pairedDevice: '',
      lastSyncAt: 0,
      port: 47823
    };
    this.state = null;
    this.server = null;
    this.port = 0;
    this.started = false;
    this.queue = Promise.resolve();
    this.pairAttempts = [];
    this.tailscale = { ready: false, dnsName: '', error: '', cli: '' };
    this.lastBackupDay = '';
    this.lastStatusAt = 0;
    this._statusTimer = null;
  }

  async init() {
    await this.loadSettings();
    /* Przed pierwszym uruchomieniem nowej wersji zachowaj plik w stanie
       sprzed dodania metadanych synchronizacji. */
    try {
      const raw = JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
      if (raw && !raw.sync) await this.backupBeforeChange('aktualizacja', true);
    } catch { /* plik pojawi się po starcie okna */ }
    await this.loadState();
    if (this.settings.enabled) {
      await this.start();
    } else {
      this.emitStatus();
    }
    return this.getStatus();
  }

  /* ---------- Ustawienia ---------- */

  async loadSettings() {
    let saved = null;
    try {
      saved = JSON.parse(await fs.readFile(this.settingsFile, 'utf8'));
    } catch { /* pierwsze uruchomienie */ }

    if (saved && typeof saved === 'object') {
      this.settings = Object.assign({}, this.settings, saved);
    }
    if (!this.settings.serverId) this.settings.serverId = SyncCore.makeId('srv');
    if (!this.settings.deviceId) this.settings.deviceId = SyncCore.makeId('desktop');
    if (!this.settings.token) this.settings.token = crypto.randomBytes(32).toString('base64url');
    if (!Number.isFinite(Number(this.settings.port)) || Number(this.settings.port) < 1024) {
      this.settings.port = 47823;
    }
    this.settings.enabled = !!this.settings.enabled;
    this.settings.runInTray = this.settings.runInTray !== false;
    this.settings.startAtLogin = !!this.settings.startAtLogin;
    await this.saveSettings();
  }

  async saveSettings() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const temp = this.settingsFile + '.tmp';
      await fs.writeFile(temp, JSON.stringify(this.settings, null, 2), 'utf8');
      await fs.rename(temp, this.settingsFile);
    } catch (err) {
      console.error('Nie udało się zapisać ustawień synchronizacji:', err.message);
    }
  }

  async loadState() {
    if (this.state) return this.state;
    try {
      const raw = JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
      if (SyncCore.looksLikeState(raw)) {
        this.state = SyncCore.ensure(SyncCore.clone(raw), {
          deviceId: this.settings.deviceId,
          time: 0
        });
      }
    } catch { /* brak pliku - czekamy na pierwszy zapis okna */ }
    return this.state;
  }

  /* ---------- Włączanie / wyłączanie ---------- */

  async enable() {
    this.settings.enabled = true;
    if (!this.settings.pairedDevice &&
        (!this.settings.pairCode || this.settings.pairCodeExpires < Date.now())) {
      this.makePairCode();
    }
    await this.saveSettings();
    await this.start();
    this.emitStatus();
    return this.getStatus();
  }

  async start() {
    if (this.started) {
      /* Serwer już działa, ale Tailscale mógł zostać uruchomiony później.
         Kliknięcie „Spróbuj ponownie” ponawia tylko konfigurację Serve. */
      if (!this.tailscale.ready) await this.startTailscale();
      this.emitStatus();
      return this.getStatus();
    }
    this.tailscale = { ready: false, dnsName: '', error: '', cli: '' };
    try {
      await this.startHttp();
      this.started = true;
    } catch (err) {
      this.tailscale.error = 'Nie udało się uruchomić serwera: ' + err.message;
      this.emitStatus();
      return this.getStatus();
    }
    await this.startTailscale();
    this.started = true;
    this.emitStatus();
    return this.getStatus();
  }

  async disable() {
    this.settings.enabled = false;
    this.settings.pairCode = '';
    this.settings.pairCodeExpires = 0;
    await this.saveSettings();
    await this.stopHttp();
    this.started = false;
    this.emitStatus();
    return this.getStatus();
  }

  makePairCode() {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    this.settings.pairCode = code;
    this.settings.pairCodeExpires = Date.now() + PAIR_TTL;
    return code;
  }

  async newPairCode() {
    this.makePairCode();
    await this.saveSettings();
    this.emitStatus();
    return this.getStatus();
  }

  async unpair() {
    this.settings.token = crypto.randomBytes(32).toString('base64url');
    this.settings.pairedDevice = '';
    this.settings.pairCode = '';
    this.settings.pairCodeExpires = 0;
    await this.saveSettings();
    this.emitStatus();
    return this.getStatus();
  }

  async setOptions(options) {
    if (!options || typeof options !== 'object') return this.getStatus();
    if (typeof options.runInTray === 'boolean') this.settings.runInTray = options.runInTray;
    if (typeof options.startAtLogin === 'boolean') this.settings.startAtLogin = options.startAtLogin;
    await this.saveSettings();
    this.emitStatus();
    return this.getStatus();
  }

  /* ---------- Serwer HTTP ---------- */

  async startHttp() {
    if (this.server) return;
    const startPort = Number(this.settings.port) || 47823;
    let lastError = null;
    for (let port = startPort; port < startPort + 12; port += 1) {
      try {
        await this.listenOn(port);
        this.port = port;
        this.settings.port = port;
        await this.saveSettings();
        return;
      } catch (err) {
        lastError = err;
        if (err && err.code !== 'EADDRINUSE') break;
      }
    }
    throw lastError || new Error('Brak wolnego portu.');
  }

  listenOn(port) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error('Błąd serwera synchronizacji:', err.message);
          try { this.sendJson(res, 500, { ok: false, error: 'Błąd serwera.' }); } catch { /* odpowiedź już wysłana */ }
        });
      });
      server.once('error', (err) => {
        server.close(() => {});
        reject(err);
      });
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        server.on('error', (err) => console.error('Błąd serwera synchronizacji:', err.message));
        this.server = server;
        resolve();
      });
    });
  }

  async stopHttp() {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise((resolve) => {
      try { server.close(() => resolve()); } catch { resolve(); }
      setTimeout(resolve, 1500);
    });
  }

  async handleRequest(req, res) {
    const origin = this.corsOrigin(req);
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') {
      this.setCors(res, origin);
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/api/health')) {
      this.sendJson(res, 200, {
        ok: true,
        app: 'OGARNIACZ',
        protocol: PROTOCOL,
        version: this.appVersion,
        serverId: this.settings.serverId,
        paired: !!this.settings.pairedDevice,
        revision: this.settings.revision
      }, origin);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/pair') {
      const body = await this.readJson(req);
      if (!body) return this.sendJson(res, 400, { ok: false, error: 'Brak danych.' }, origin);
      const result = await this.handlePair(body);
      this.sendJson(res, result.status, result.body, origin);
      return;
    }

    if (pathname === '/api/sync' && req.method === 'POST') {
      if (!this.authorized(req)) {
        this.sendJson(res, 401, { ok: false, error: 'Brak dostępu. Połącz telefon ponownie.' }, origin);
        return;
      }
      const body = await this.readJson(req);
      if (!body) return this.sendJson(res, 400, { ok: false, error: 'Brak danych.' }, origin);
      const result = await this.syncFromDevice(body);
      this.sendJson(res, result.status, result.body, origin);
      return;
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      if (!this.authorized(req)) {
        this.sendJson(res, 401, { ok: false, error: 'Brak dostępu. Połącz telefon ponownie.' }, origin);
        return;
      }
      await this.loadState();
      if (!this.state) {
        this.sendJson(res, 409, { ok: false, error: 'Komputer nie ma jeszcze danych.' }, origin);
        return;
      }
      this.sendJson(res, 200, {
        ok: true,
        serverId: this.settings.serverId,
        revision: this.settings.revision,
        state: this.state
      }, origin);
      return;
    }

    this.sendJson(res, 404, { ok: false, error: 'Nie znaleziono.' }, origin);
  }

  corsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return '';
    if (ALLOWED_ORIGINS.has(origin)) return origin;
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
    return '';
  }

  setCors(res, origin) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
  }

  sendJson(res, status, body, origin) {
    if (!res || res.writableEnded) return;
    this.setCors(res, origin || '');
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }

  readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error('Za duże dane.'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          if (!chunks.length) { resolve(null); return; }
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    }).catch(() => null);
  }

  authorized(req) {
    if (!this.settings.token) return false;
    const header = String(req.headers.authorization || '');
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) return false;
    return safeEqual(token, this.settings.token);
  }

  /* ---------- Parowanie i scalanie ---------- */

  async handlePair(body) {
    if (!this.settings.pairCode || this.settings.pairCodeExpires < Date.now()) {
      return { status: 403, body: { ok: false, error: 'Kod wygasł. Kliknij „Nowy kod” na komputerze.' } };
    }

    const now = Date.now();
    this.pairAttempts = this.pairAttempts.filter((time) => now - time < 10 * 60 * 1000);
    if (this.pairAttempts.length >= 25) {
      return { status: 429, body: { ok: false, error: 'Za dużo prób. Spróbuj później.' } };
    }
    this.pairAttempts.push(now);

    const code = String(body.code == null ? '' : body.code).replace(/\s+/g, '');
    if (!safeEqual(code, this.settings.pairCode)) {
      return { status: 403, body: { ok: false, error: 'Nieprawidłowy kod. Sprawdź go na komputerze.' } };
    }

    await this.loadState();
    const mode = body.mode === 'merge' ? 'merge' : 'replace';
    const phoneState = (mode === 'merge' && body.state) ? body.state : null;

    if (phoneState && !SyncCore.looksLikeState(phoneState)) {
      return { status: 400, body: { ok: false, error: 'Nieprawidłowe dane telefonu.' } };
    }

    if (!this.state && !phoneState) {
      return { status: 409, body: { ok: false, error: 'Komputer nie ma jeszcze danych do wysłania.' } };
    }

    if (mode === 'merge' && phoneState) {
      await this.backupBeforeChange('parowanie');
      const base = this.state || SyncCore.ensure(SyncCore.clone(phoneState), {
        deviceId: this.settings.deviceId,
        time: 0
      });
      const merged = SyncCore.merge(base, phoneState, {
        deviceId: this.settings.deviceId,
        settingsFrom: 'local'
      });
      const changed = !this.state || SyncCore.fingerprint(this.state) !== SyncCore.fingerprint(merged);
      this.state = merged;
      if (changed) {
        this.settings.revision += 1;
        await this.writeState();
        this.sendStateToWindow();
      }
    } else if (!this.state) {
      this.state = SyncCore.ensure(SyncCore.clone(phoneState), {
        deviceId: this.settings.deviceId,
        time: 0
      });
    }

    this.settings.pairedDevice = String(body.deviceName || 'Telefon').slice(0, 80);
    this.settings.lastSyncAt = Date.now();
    this.settings.pairCode = '';
    this.settings.pairCodeExpires = 0;
    await this.saveSettings();

    return {
      status: 200,
      body: {
        ok: true,
        token: this.settings.token,
        serverId: this.settings.serverId,
        revision: this.settings.revision,
        state: this.state,
        mode
      }
    };
  }

  async syncFromDevice(body) {
    if (!body.state || !SyncCore.looksLikeState(body.state)) {
      return { status: 400, body: { ok: false, error: 'Nieprawidłowe dane.' } };
    }
    await this.loadState();
    if (!this.state) {
      this.state = SyncCore.ensure(SyncCore.clone(body.state), {
        deviceId: this.settings.deviceId,
        time: 0
      });
      this.settings.revision += 1;
      await this.writeState();
      await this.saveSettings();
      return {
        status: 200,
        body: {
          ok: true,
          serverId: this.settings.serverId,
          revision: this.settings.revision,
          state: this.state
        }
      };
    }

    const before = this.state;
    const merged = SyncCore.merge(before, body.state, {
      deviceId: this.settings.deviceId,
      settingsFrom: 'local'
    });
    const changed = SyncCore.fingerprint(before) !== SyncCore.fingerprint(merged);

    if (changed) {
      await this.backupBeforeChange('synchronizacja');
      this.state = merged;
      this.settings.revision += 1;
      await this.writeState();
      this.sendStateToWindow();
    } else {
      this.state = before;
    }

    const previousName = this.settings.pairedDevice;
    if (body.deviceName) this.settings.pairedDevice = String(body.deviceName).slice(0, 80);
    const previousSyncAt = this.settings.lastSyncAt;
    this.settings.lastSyncAt = Date.now();
    if (this.settings.pairedDevice !== previousName || Date.now() - previousSyncAt > 30000) {
      await this.saveSettings();
    }
    this.throttledStatus();

    return {
      status: 200,
      body: {
        ok: true,
        serverId: this.settings.serverId,
        revision: this.settings.revision,
        state: this.state
      }
    };
  }

  /* Odbiera zapis z okna desktopowego. Nie nadpisuje zmian z telefonu,
     tylko scala je tak samo jak zmiany z telefonu. */
  async absorbDesktop(incoming) {
    if (!SyncCore.looksLikeState(incoming)) {
      return { ok: false, error: 'Nieprawidłowe dane.' };
    }
    const run = async () => {
      const clean = SyncCore.ensure(SyncCore.clone(incoming), {
        deviceId: incoming.sync && incoming.sync.deviceId,
        time: 0
      });
      await this.loadState();
      if (!this.state) {
        this.state = SyncCore.ensure(SyncCore.clone(clean), {
          deviceId: this.settings.deviceId,
          time: 0
        });
        this.settings.revision += 1;
        await this.writeState();
        await this.saveSettings();
        return { ok: true, state: this.state };
      }

      const merged = SyncCore.merge(this.state, clean, {
        deviceId: this.settings.deviceId,
        settingsFrom: 'remote'
      });
      const changed = SyncCore.fingerprint(this.state) !== SyncCore.fingerprint(merged);
      if (changed) {
        await this.backupBeforeChange('synchronizacja');
        this.state = merged;
        this.settings.revision += 1;
        await this.writeState();
        await this.saveSettings();
      }

      if (SyncCore.fingerprint(clean) !== SyncCore.fingerprint(merged)) {
        this.sendStateToWindow(merged);
      }
      return { ok: true, state: this.state };
    };

    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  sendStateToWindow(state) {
    const value = state || this.state;
    if (!value) return;
    try { this.onState(value); } catch (err) { console.error('Nie udało się przekazać stanu do okna:', err.message); }
  }

  /* ---------- Tailscale ---------- */

  async findTailscale() {
    const candidates = [];
    if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'Tailscale', 'tailscale.exe'));
    if (process.env['ProgramFiles(x86)']) candidates.push(path.join(process.env['ProgramFiles(x86)'], 'Tailscale', 'tailscale.exe'));
    candidates.push('tailscale');

    for (const candidate of candidates) {
      try {
        const result = await runCommand(candidate, ['version'], 10000);
        if (result && result.code === 0) return candidate;
      } catch { /* następna ścieżka */ }
    }
    return '';
  }

  async startTailscale() {
    this.tailscale = { ready: false, dnsName: '', error: '', cli: '' };
    const cli = await this.findTailscale();
    if (!cli) {
      this.tailscale.error = 'Nie znaleziono Tailscale. Zainstaluj Tailscale na komputerze i telefonie.';
      return;
    }
    this.tailscale.cli = cli;

    let status = null;
    try {
      const output = await runCommand(cli, ['status', '--json'], 20000);
      if (output.code !== 0) throw new Error((output.stderr || output.stdout || '').trim());
      status = JSON.parse(output.stdout);
    } catch (err) {
      this.tailscale.error = 'Tailscale nie odpowiada. Sprawdź, czy jest włączony i zalogowany.';
      return;
    }

    if (!status || !status.Self || status.Self.Online === false || status.BackendState !== 'Running') {
      this.tailscale.error = 'Tailscale nie jest połączony. Włącz go na komputerze.';
      return;
    }

    const dnsName = String(status.Self.DNSName || '').replace(/\.$/, '');
    if (!dnsName) {
      this.tailscale.error = 'Tailscale nie ma nazwy DNS (MagicDNS). Włącz MagicDNS w panelu Tailscale.';
      return;
    }
    this.tailscale.dnsName = dnsName;

    try {
      /* Serwujemy tylko lokalny port. --bg zapisuje ustawienie w Tailscale,
         --yes pozwala zaktualizować istniejące ustawienie bez pytania. */
      const result = await runCommand(cli, ['serve', '--bg', '--yes', `http://127.0.0.1:${this.port}`], 30000);
      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout || '').trim();
        this.tailscale.error = detail || 'Nie udało się włączyć Tailscale Serve.';
        return;
      }
    } catch (err) {
      this.tailscale.error = 'Nie udało się włączyć Tailscale Serve: ' + err.message;
      return;
    }

    this.tailscale.ready = true;
    this.tailscale.error = '';
  }

  /* ---------- Status ---------- */

  getStatus() {
    const url = this.tailscale.dnsName ? `https://${this.tailscale.dnsName}` : '';
    return {
      enabled: !!this.settings.enabled,
      running: !!this.server,
      started: !!this.started,
      ready: !!this.tailscale.ready,
      tailscaleReady: !!this.tailscale.ready,
      url,
      dnsName: this.tailscale.dnsName,
      code: this.settings.enabled && this.settings.pairCodeExpires > Date.now()
        ? this.settings.pairCode
        : '',
      codeExpires: this.settings.pairCodeExpires,
      paired: !!this.settings.pairedDevice,
      pairedDevice: this.settings.pairedDevice,
      lastSyncAt: this.settings.lastSyncAt,
      revision: this.settings.revision,
      error: this.tailscale.error || '',
      runInTray: this.settings.runInTray,
      startAtLogin: this.settings.startAtLogin,
      version: this.appVersion
    };
  }

  emitStatus() {
    this.lastStatusAt = Date.now();
    try { this.onStatus(this.getStatus()); } catch (err) { console.error('Nie udało się wysłać statusu synchronizacji:', err.message); }
  }

  throttledStatus() {
    if (Date.now() - this.lastStatusAt < 1500) return;
    this.emitStatus();
  }

  /* ---------- Pliki i kopie ---------- */

  async writeState() {
    if (!this.state) return;
    await fs.mkdir(this.dataDir, { recursive: true });
    const temp = this.dataFile + '.sync-tmp';
    await fs.writeFile(temp, JSON.stringify(this.state, null, 2), 'utf8');
    await fs.rename(temp, this.dataFile);
  }

  async backupBeforeChange(reason, force) {
    const day = new Date().toISOString().slice(0, 10);
    /* Kopia przed migracją jest osobna od codziennej kopii przed
       synchronizacją, żeby pierwsza synchronizacja nie została pominięta. */
    if (!force && reason !== 'aktualizacja' && this.lastBackupDay === day) return;
    let raw = '';
    try {
      raw = await fs.readFile(this.dataFile, 'utf8');
    } catch { /* jeszcze nie ma pliku */ }
    if (!raw && this.state) raw = JSON.stringify(this.state, null, 2);
    if (!raw) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(this.dataDir, `kopia-przed-${reason}-${stamp}.json`);
    try {
      await fs.writeFile(file, raw, 'utf8');
      if (reason !== 'aktualizacja') this.lastBackupDay = day;
      await this.pruneBackups();
    } catch (err) {
      console.error('Nie udało się zrobić kopii przed synchronizacją:', err.message);
    }
  }

  async pruneBackups() {
    try {
      const files = await fs.readdir(this.dataDir);
      const backups = files
        .filter((name) => /^kopia-przed-.*\.json$/i.test(name))
        .sort()
        .reverse();
      for (const name of backups.slice(8)) {
        await fs.unlink(path.join(this.dataDir, name)).catch(() => {});
      }
    } catch { /* brak katalogu */ }
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left == null ? '' : left));
  const b = Buffer.from(String(right == null ? '' : right));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function runCommand(file, args, timeout) {
  return new Promise((resolve) => {
    const child = execFile(file, args, {
      timeout: timeout || 20000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || (error && error.message) || '')
      });
    });
    child.on('error', (error) => {
      resolve({ code: 1, stdout: '', stderr: String(error && error.message || error) });
    });
  });
}

module.exports = { createSyncHub, SyncHub, PROTOCOL };
