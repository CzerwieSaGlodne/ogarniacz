'use strict';
/* Instalacja PWA i aktualizacje w tle. Na komputerze (file://) wszystko
   jest pomijane, więc wersja Electron działa bez zmian. */

(function () {
  'use strict';

  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('standalone');

  const installBtn = document.getElementById('installBtn');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn && !standalone && window.matchMedia('(max-width: 900px)').matches) installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
    if (window.UI) window.UI.toast('OGARNIACZ zainstalowany na ekranie głównym.');
  });

  async function install() {
    if (!deferredPrompt) {
      if (window.UI) {
        window.UI.toast('Otwórz menu Chrome ⋮ i wybierz „Dodaj do ekranu głównego”.');
      }
      return 'unavailable';
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
    return choice ? choice.outcome : 'dismissed';
  }

  if (installBtn) {
    installBtn.addEventListener('click', install);
    if (standalone) installBtn.hidden = true;
  }

  /* Service worker tylko na HTTPS i lokalnym podglądzie. Electron ładuje
     pliki przez file://, gdzie service worker nie jest potrzebny. */
  const canRegister = 'serviceWorker' in navigator && (
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  );

  if (canRegister) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* Brak service workera nie blokuje aplikacji - tylko offline. */
      });
    });
  }

  window.PWA = {
    install,
    get standalone() { return standalone; },
    get canInstall() { return !!deferredPrompt; }
  };
})();
