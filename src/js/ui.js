'use strict';
/* Drobne narzędzia wspólne dla wszystkich widoków:
   zabezpieczenie tekstu, powiadomienia, potwierdzenia i rozwijane menu. */

window.UI = (function () {
  'use strict';

  const layer = () => document.getElementById('layer');

  /* ---------- Historia nakładek ----------
     Każde otwarte menu lub potwierdzenie dodaje wpis w historii.
     Dzięki temu przycisk Wstecz zamyka tylko tę nakładkę, a nie całą
     aplikację (i nie zamyka karty ani szuflady pod nią). */

  let activeConfirm = null;
  let overlayBackTimer = null;
  let ignoreNextPop = false;

  function openOverlayHistory(kind) {
    if (overlayBackTimer) {
      clearTimeout(overlayBackTimer);
      overlayBackTimer = null;
    }
    ignoreNextPop = false;

    const onOverlay = !!(history.state && history.state.ogOverlay);
    try {
      if (onOverlay) history.replaceState({ ogOverlay: kind }, '');
      else history.pushState({ ogOverlay: kind }, '');
    } catch { /* brak historii - nakładka nadal działa */ }
  }

  function scheduleOverlayHistoryBack() {
    if (overlayBackTimer) clearTimeout(overlayBackTimer);
    if (!history.state || !history.state.ogOverlay) {
      ignoreNextPop = false;
      overlayBackTimer = null;
      return;
    }

    ignoreNextPop = true;
    overlayBackTimer = setTimeout(() => {
      overlayBackTimer = null;
      if (history.state && history.state.ogOverlay) {
        try { history.back(); } catch { ignoreNextPop = false; }
      } else {
        ignoreNextPop = false;
      }
    }, 0);
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- Powiadomienie ---------- */

  let toastTimer = null;
  function toast(message) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  /* ---------- Potwierdzenie ---------- */

  function confirmBox(options) {
    const { title, text, okText = 'Tak', cancelText = 'Anuluj', danger = true } = options;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'overlay no-anim confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-box">
          <h3>${esc(title)}</h3>
          <p>${esc(text)}</p>
          <div class="confirm-actions">
            <button class="btn" data-role="cancel">${esc(cancelText)}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-role="ok">${esc(okText)}</button>
          </div>
        </div>`;

      let done = false;

      function finish(result, fromHistory) {
        if (done) return;
        done = true;
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        activeConfirm = null;
        if (!fromHistory) scheduleOverlayHistoryBack();
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      }

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) return finish(false);
        const role = e.target.closest('[data-role]');
        if (!role) return;
        finish(role.dataset.role === 'ok');
      });

      activeConfirm = { finish: (result) => finish(result, true) };
      openOverlayHistory('confirm');
      document.addEventListener('keydown', onKey);
      layer().appendChild(overlay);
      overlay.querySelector('[data-role="ok"]').focus();
    });
  }

  /* ---------- Rozwijane menu ---------- */

  let openPopover = null;
  let sheetBackdrop = null;

  function closePopover(fromHistory) {
    const hadPopover = !!openPopover;
    if (openPopover) {
      openPopover.remove();
      openPopover = null;
    }
    if (sheetBackdrop) {
      sheetBackdrop.remove();
      sheetBackdrop = null;
    }
    if (hadPopover && !fromHistory) scheduleOverlayHistoryBack();
  }

  /* anchor - przycisk lub punkt, w którym kliknięto prawym przyciskiem myszy
     items  - { label, icon, danger, onClick } | { sep: true } | { heading } | { emojis: [], onPick } */
  function popover(anchor, items, position) {
    /* Zamiana jednego arkusza na drugi (np. „Przenieś do…”) korzysta
       z tego samego wpisu historii - bez cofania i migotania. */
    closePopover(true);

    const menu = document.createElement('div');
    menu.className = 'popover';

    items.forEach((item) => {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'sep';
        menu.appendChild(sep);
        return;
      }

      if (item.heading) {
        const head = document.createElement('div');
        head.className = 'pop-label';
        head.textContent = item.heading;
        menu.appendChild(head);
        return;
      }

      if (item.emojis) {
        const grid = document.createElement('div');
        grid.className = 'emoji-grid';
        item.emojis.forEach((emoji) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = emoji;
          button.title = 'Użyj tej emotki jako punktacji';
          button.addEventListener('click', () => {
            closePopover();
            item.onPick && item.onPick(emoji);
          });
          grid.appendChild(button);
        });
        menu.appendChild(grid);
        return;
      }

      /* rząd przycisków z jednym zaznaczonym - np. poziom przygaszenia */
      if (item.segmented) {
        const row = document.createElement('div');
        row.className = 'segmented';
        item.segmented.options.forEach((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = option.label;
          if (option.value === item.segmented.value) button.classList.add('on');
          button.addEventListener('click', () => {
            closePopover();
            item.segmented.onPick(option.value);
          });
          row.appendChild(button);
        });
        menu.appendChild(row);
        return;
      }

      const button = document.createElement('button');
      button.type = 'button';
      if (item.danger) button.classList.add('danger');
      button.innerHTML = `<span>${item.icon || ''}</span><span>${esc(item.label)}</span>`;
      button.addEventListener('click', () => {
        closePopover();
        item.onClick && item.onClick();
      });
      menu.appendChild(button);
    });

    const isSheet = window.matchMedia('(max-width: 900px)').matches;

    if (isSheet) {
      menu.classList.add('sheet');
      sheetBackdrop = document.createElement('div');
      sheetBackdrop.className = 'popover-backdrop';
      sheetBackdrop.addEventListener('click', () => closePopover());
      document.body.appendChild(sheetBackdrop);
    }

    document.body.appendChild(menu);

    /* Na telefonie menu jest dolnym arkuszem - pozycję ustala CSS. */
    if (!isSheet) {
      /* pozycja: pod przyciskiem albo w miejscu kliknięcia prawym przyciskiem */
      const menuRect = menu.getBoundingClientRect();
      let left;
      let top;

      if (position) {
        left = position.x;
        top = position.y;
      } else {
        const rect = anchor.getBoundingClientRect();
        left = rect.left;
        top = rect.bottom + 6;
      }

      if (left + menuRect.width > window.innerWidth - 10) left = window.innerWidth - menuRect.width - 10;
      if (top + menuRect.height > window.innerHeight - 10) top = Math.max(8, top - menuRect.height - 12);

      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, top)}px`;
    }

    openPopover = menu;
    openOverlayHistory('popover');
    return menu;
  }

  document.addEventListener('pointerdown', (e) => {
    if (openPopover && !openPopover.contains(e.target)) closePopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPopover) {
      e.preventDefault();
      e.stopPropagation();
      closePopover();
    }
  });

  window.addEventListener('resize', () => closePopover());

  /* własne menu zamiast systemowego (ważne przy prawym kliknięciu) */
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Przygaszenie ekranu ---------- */

const DIM_LEVELS = [0, 0.14, 0.27, 0.40];
let dimmer = null;

  function setDim(level) {
    const value = DIM_LEVELS[Math.max(0, Math.min(3, level | 0))];
    if (!dimmer) {
      dimmer = document.createElement('div');
      dimmer.className = 'dimmer';
      document.body.appendChild(dimmer);
    }
    dimmer.style.opacity = value;
  }

  /* ---------- Autowzrost textarea ---------- */

  function autoGrow(textarea, max = 420) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
  }

  /* ---------- Data w czytelnej formie ---------- */

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------- Liczba rzeczowana po polsku ---------- */

  function plural(count, one, few, many) {
    if (count === 1) return one;
    const last = count % 10;
    const lastTwo = count % 100;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
    return many;
  }

  /* ---------- Współpraca z przyciskiem Wstecz ---------- */

  /* Wywoływane przez Mobile przed zamykaniem karty lub szuflady.
     Zwraca true, jeśli Wstecz zostało już obsłużone przez nakładkę. */
  function handleBack() {
    if (overlayBackTimer) {
      clearTimeout(overlayBackTimer);
      overlayBackTimer = null;
    }

    if (openPopover) {
      closePopover(true);
      ignoreNextPop = false;
      return true;
    }

    if (activeConfirm) {
      const current = activeConfirm;
      activeConfirm = null;
      current.finish(false);
      ignoreNextPop = false;
      return true;
    }

    if (ignoreNextPop) {
      ignoreNextPop = false;
      return true;
    }

    return false;
  }

  /* Zamknięcie karty lub szuflady, nad którą zdążyło otworzyć się
     potwierdzenie (np. „Usuń kartę” → Tak). Wtedy trzeba cofnąć
     dwa wpisy historii: potwierdzenie i warstwę pod nim. */
  function prepareLayerClose() {
    if (overlayBackTimer) {
      clearTimeout(overlayBackTimer);
      overlayBackTimer = null;
    }
    const onOverlay = !!(history.state && history.state.ogOverlay);
    ignoreNextPop = onOverlay;
    return onOverlay;
  }

  /* Otwarcie karty lub szuflady w miejsce właśnie zamykanego menu
     (np. „Otwórz kartę”) nie dodaje drugiego wpisu do historii. */
  function claimHistoryForLayer(name) {
    const onOverlay = !!(history.state && history.state.ogOverlay);
    if (overlayBackTimer) {
      clearTimeout(overlayBackTimer);
      overlayBackTimer = null;
    }
    ignoreNextPop = false;
    if (openPopover) closePopover(true);
    if (!onOverlay) return false;

    try {
      history.replaceState({ ogLayer: name }, '');
      return true;
    } catch {
      return false;
    }
  }

  return {
    esc, toast, confirm: confirmBox, popover, closePopover,
    handleBack, claimHistoryForLayer, prepareLayerClose,
    autoGrow, formatDate, plural, setDim
  };
})();