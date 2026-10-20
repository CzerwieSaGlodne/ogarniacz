'use strict';
/* Okno karty: tytuł, opis, kategorie kolorowe, checklista z punktacją i postępem.
   Treść aktualizowana jest na miejscu (bez przerysowywania całego okna),
   żeby okno nie migotało podczas edycji. */

window.Card = (function () {
  'use strict';

  const layer = document.getElementById('layer');

  let ctx = null;      // { cardId, boardId, listId }
  let overlay = null;

  /* ---------- Otwieranie i zamykanie ---------- */

  function open(cardId) {
    const found = window.Store.locate(cardId);
    if (!found) return;
    ctx = { cardId: found.card.id, boardId: found.board.id, listId: found.list.id };
    paint(true);
    document.addEventListener('keydown', onKeydown, true);
  }

  function close() {
    document.removeEventListener('keydown', onKeydown, true);
    if (overlay) overlay.remove();
    overlay = null;
    ctx = null;
  }

  function current() {
    if (!ctx) return null;
    return window.Store.getCard(ctx.boardId, ctx.listId, ctx.cardId);
  }

  /* ---------- Rysowanie ---------- */

  function paint(animate) {
    const card = current();
    if (!card) { close(); return; }

    const oldBody = overlay && overlay.querySelector('.modal-body');
    const scroll = oldBody ? oldBody.scrollTop : 0;
    const focusKey = focusTarget();
    if (overlay) overlay.remove();

    const done = card.checklist.filter((i) => i.done).length;
    const total = card.checklist.length;
    const state = window.Store.get();
    const board = window.Store.getBoard(ctx.boardId);

    const items = card.checklist.map((item, index) => `
      <div class="check-item ${item.done ? 'done' : ''}" data-item="${item.id}">
        <input type="checkbox" data-role="item-check" data-item="${item.id}" data-key="chk:${item.id}"
               ${item.done ? 'checked' : ''}>
        <span class="marker">${markerText(card, index)}</span>
        <input class="item-text" data-role="item-text" data-item="${item.id}" data-key="item:${item.id}"
               value="${window.UI.esc(item.text)}" placeholder="Zadanie do zrobienia">
        <button class="icon-btn danger" data-role="item-del" data-item="${item.id}" title="Usuń punkt">✕</button>
      </div>`).join('');

    overlay = document.createElement('div');
    overlay.className = 'overlay' + (animate ? '' : ' no-anim');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div class="modal-tools">
            <button class="icon-btn" data-role="close" title="Zamknij (Esc)">✕</button>
            <button class="icon-btn danger" data-role="delete" title="Usuń kartę">🗑</button>
          </div>
          <textarea class="modal-title" data-role="title" data-key="title"
                    placeholder="Tytuł karty">${window.UI.esc(card.title)}</textarea>
        </div>

        <div class="modal-body">
          <aside class="modal-side">
            <div class="side-block">
              <h4>Kategorie</h4>
              <div class="label-grid">
                ${window.Store.LABELS.map((l) => `
                  <button class="label-chip ${card.labels.includes(l.id) ? 'on' : ''}"
                          data-role="label" data-label="${l.id}" title="${l.name}"
                          style="background:${l.color}"></button>`).join('')}
              </div>
            </div>

            <div class="side-block">
              <h4>Szczegóły</h4>
              <div class="side-row">
                <select data-role="board" title="Tablica">
                  ${state.boards.map((b) => `<option value="${b.id}" ${b.id === board.id ? 'selected' : ''}>${window.UI.esc(b.name)}</option>`).join('')}
                </select>
              </div>
              <div class="side-row">
                <select data-role="list" title="Lista">
                  ${board.lists.length
                    ? board.lists.map((l) => `<option value="${l.id}" ${l.id === ctx.listId ? 'selected' : ''}>${window.UI.esc(l.name)}</option>`).join('')
                    : '<option value="">—</option>'}
                </select>
              </div>
              <label class="check-toggle">
                <input type="checkbox" data-role="done" ${card.done ? 'checked' : ''}> Zadanie wykonane
              </label>
            </div>

            <div class="side-block">
              <button class="btn" data-role="duplicate">📋 Duplikuj kartę</button>
            </div>
          </aside>

          <div class="modal-main">
            <h3 class="section-title">Opis</h3>
            <textarea class="note-input" data-role="note" data-key="note"
                      placeholder="Dodatkowe informacje, linki, daty…">${window.UI.esc(card.note)}</textarea>

            <div class="check-head">
              <h3 class="section-title">Checklista</h3>
              <div class="progress-wrap">
                <span data-role="progress-text">${done}/${total}</span>
                <div class="progress-bar"><i style="width:${percent(done, total)}%"></i></div>
              </div>
              <select class="marker-select" data-role="marker" title="Sposób punktacji">
                ${window.Store.MARKERS.map((m) => `
                  <option value="${m.id}" ${card.marker === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
              </select>
              <select class="marker-select" data-role="emoji" title="Emotka"
                      style="${card.marker === 'emoji' ? '' : 'display:none'}">
                ${window.Store.EMOJIS.map((e) => `<option value="${e}" ${card.emoji === e ? 'selected' : ''}>${e}</option>`).join('')}
              </select>
              <button class="marker-select emoji-pick" data-role="pick-emoji"
                      title="Prawy przycisk myszy albo kliknięcie — wybierz emotkę">${card.marker === 'emoji' ? card.emoji : '😊'}</button>
            </div>

            <div data-role="items">
              ${items || '<div class="list-empty">Na razie bez punktów — dodaj pierwszy poniżej.</div>'}
            </div>

            <button class="btn btn-ghost add-item-btn" data-role="add-item">+ Dodaj punkt</button>
          </div>
        </div>

        <div class="modal-foot">
          <span>Utworzono: ${window.UI.formatDate(card.createdAt)}</span>
          <span>Enter — zapisz i zamknij · Esc — anuluj</span>
        </div>
      </div>`;

    layer.appendChild(overlay);

    const body = overlay.querySelector('.modal-body');
    if (body) body.scrollTop = scroll;
    window.UI.autoGrow(overlay.querySelector('[data-role="title"]'), 140);

    if (focusKey) restoreFocus(focusKey);
  }

  function percent(done, total) {
    return total ? Math.round((done / total) * 100) : 0;
  }

  /* zapamiętanie i przywrócenie kursora w edytowanym polu */
  function focusTarget() {
    const active = document.activeElement;
    if (!active || !active.dataset || !active.dataset.key) return null;
    return {
      key: active.dataset.key,
      start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }

  function restoreFocus(saved) {
    const next = overlay.querySelector(`[data-key="${CSS.escape(saved.key)}"]`);
    if (!next) return;
    next.focus();
    if (saved.start !== null && typeof next.setSelectionRange === 'function') {
      try { next.setSelectionRange(saved.start, saved.end); } catch (e) { /* pole bez zaznaczania */ }
    }
  }

  /* ---------- Drobne aktualizacje bez przerysowywania ---------- */

  function updateProgress() {
    const card = current();
    if (!card || !overlay) return;

    const done = card.checklist.filter((i) => i.done).length;
    const total = card.checklist.length;
    const text = overlay.querySelector('[data-role="progress-text"]');
    const bar = overlay.querySelector('.progress-bar i');
    if (text) text.textContent = `${done}/${total}`;
    if (bar) bar.style.width = `${percent(done, total)}%`;
  }

  function updateMarkers() {
    const card = current();
    if (!card || !overlay) return;

    overlay.querySelectorAll('[data-role="item-text"]').forEach((input, index) => {
      const marker = input.parentElement.querySelector('.marker');
      if (marker) marker.textContent = markerText(card, index);
    });
  }

  function updateEmojiSelect() {
    const card = current();
    const select = overlay && overlay.querySelector('[data-role="emoji"]');
    if (!select || !card) return;
    select.style.display = card.marker === 'emoji' ? '' : 'none';
  }

  /* ---------- Punktacja ---------- */

  function markerText(card, index) {
    switch (card.marker) {
      case 'numeric': return `${index + 1}.`;
      case 'dot': return '•';
      case 'emoji': return card.emoji || '✅';
      default: return '–';
    }
  }

  function setEmoji(emoji) {
    const card = current();
    if (!card) return;
    window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { marker: 'emoji', emoji });
    window.UI.toast(`Punktacja: ${emoji}`);

    /* aktualizacja widoku bez przerysowywania całego okna */
    const button = overlay && overlay.querySelector('[data-role="pick-emoji"]');
    if (button) button.textContent = emoji;
    const select = overlay && overlay.querySelector('[data-role="marker"]');
    if (select) select.value = 'emoji';
    updateMarkers();
    updateEmojiSelect();
  }

  /* siatka emotikon - z przycisku albo z prawego kliknięcia */
  function openEmojiPicker(anchor, position) {
    window.UI.popover(anchor, [
      { heading: 'Emotka punktacji' },
      { emojis: window.Store.EMOJIS, onPick: setEmoji }
    ], position);
  }

  /* ---------- Obsługa zdarzeń ---------- */

  function onClick(e) {
    if (e.target === overlay) { close(); return; }

    const role = (sel) => e.target.closest(sel);
    const card = current();
    if (!card) return;

    if (role('[data-role="close"]')) { close(); return; }

    if (role('[data-role="delete"]')) {
      window.UI.confirm({
        title: 'Usunąć kartę?',
        text: `Karta „${card.title}” zostanie usunięta razem z punktami checklisty.`,
        okText: 'Usuń kartę'
      }).then((ok) => {
        if (!ok) return;
        window.Store.deleteCard(ctx.boardId, ctx.listId, ctx.cardId);
        close();
        window.UI.toast('Karta usunięta.');
      });
      return;
    }

    if (role('[data-role="duplicate"]')) {
      window.Store.duplicateCard(ctx.boardId, ctx.listId, ctx.cardId);
      window.UI.toast('Karta skopiowana.');
      return;
    }

    const labelChip = role('[data-role="label"]');
    if (labelChip) {
      const id = labelChip.dataset.label;
      const on = card.labels.includes(id);
      const labels = on ? card.labels.filter((l) => l !== id) : card.labels.concat(id);
      window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { labels });
      labelChip.classList.toggle('on', !on);
      return;
    }

    if (role('[data-role="pick-emoji"]')) {
      openEmojiPicker(e.target.closest('[data-role="pick-emoji"]'));
      return;
    }

    const itemDel = role('[data-role="item-del"]');
    if (itemDel) {
      window.Store.deleteItem(ctx.boardId, ctx.listId, ctx.cardId, itemDel.dataset.item);
      paint(false);
      return;
    }

    if (role('[data-role="add-item"]')) { addItem(); return; }
  }

  function onInput(e) {
    const card = current();
    if (!card) return;
    const target = e.target;

    if (target.dataset.role === 'title') {
      window.UI.autoGrow(target, 140);
      window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { title: target.value });
      return;
    }

    if (target.dataset.role === 'note') {
      window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { note: target.value });
      return;
    }

    if (target.dataset.role === 'item-text') {
      /* wpisujesz "1." albo "-" na początku - punktacja sama się dostosowuje */
      const auto = target.value.match(/^\s*(\d+[.)]|[-•*])\s+/);
      if (auto) {
        const marker = /\d/.test(auto[1]) ? 'numeric' : 'dot';
        if (marker !== card.marker) {
          target.value = target.value.slice(auto[0].length);
          window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { marker });
          updateMarkers();
          updateEmojiSelect();
          const select = overlay.querySelector('[data-role="marker"]');
          if (select) select.value = marker;
        }
      }
      window.Store.updateItem(ctx.boardId, ctx.listId, ctx.cardId, target.dataset.item, { text: target.value });
      window.Store.save();
    }
  }

  function onChange(e) {
    const card = current();
    if (!card) return;
    const target = e.target;

    if (target.dataset.role === 'item-check') {
      window.Store.updateItem(ctx.boardId, ctx.listId, ctx.cardId, target.dataset.item, { done: target.checked });
      target.closest('.check-item').classList.toggle('done', target.checked);
      updateProgress();
      return;
    }

    if (target.dataset.role === 'done') {
      window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { done: target.checked });
      return;
    }

    if (target.dataset.role === 'marker') {
      window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { marker: target.value });
      updateMarkers();
      updateEmojiSelect();
      return;
    }

    if (target.dataset.role === 'emoji') {
      window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { emoji: target.value });
      updateMarkers();
      return;
    }

    if (target.dataset.role === 'board') {
      const board = window.Store.getBoard(target.value);
      if (!board) return;
      if (!board.lists.length) window.Store.addList(board.id, 'Do zrobienia');
      const fresh = window.Store.getBoard(target.value);
      ctx.boardId = board.id;
      ctx.listId = fresh.lists[0].id;
      window.Store.moveCard(ctx.cardId, ctx.boardId, ctx.listId, null);
      paint(false);
      return;
    }

    if (target.dataset.role === 'list') {
      window.Store.moveCard(ctx.cardId, ctx.boardId, target.value, null);
      paint(false);
    }
  }

  function onKeydown(e) {
    const target = e.target;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }

    /* Enter w tytule karty zapisuje zmianę i zamyka okno,
       Shift+Enter zostawia możliwość wpisania drugiej linii */
    if (target.dataset.role === 'title') {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.Store.updateCard(ctx.boardId, ctx.listId, ctx.cardId, { title: target.value.trim() });
        close();
      }
      return;
    }

    if (e.ctrlKey && e.key === 'Delete') {
      e.preventDefault();
      overlay.querySelector('[data-role="delete"]').click();
      return;
    }

    if (target.dataset.role !== 'item-text') return;

    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(target.dataset.item);
      return;
    }

    if (e.key === 'Backspace' && target.value === '') {
      const id = target.dataset.item;
      const card = current();
      const index = card.checklist.findIndex((i) => i.id === id);
      const previous = index > 0 ? card.checklist[index - 1] : null;
      window.Store.deleteItem(ctx.boardId, ctx.listId, ctx.cardId, id);
      paint(false);
      if (previous) setTimeout(() => focusItem(previous.id), 0);
    }
  }

  /* prawy przycisk myszy - lista emotikon */
  function onContextMenu(e) {
    if (!ctx) return;
    const card = current();
    if (!card) return;
    openEmojiPicker(null, { x: e.clientX, y: e.clientY });
  }

  function focusItem(itemId) {
    const input = overlay && overlay.querySelector(`[data-key="item:${CSS.escape(itemId)}"]`);
    if (input) input.focus();
  }

  function addItem(afterId) {
    const card = current();
    if (!card) return;
    const index = afterId ? card.checklist.findIndex((i) => i.id === afterId) : card.checklist.length - 1;
    const item = window.Store.addItem(ctx.boardId, ctx.listId, ctx.cardId, '', index);
    paint(false);
    if (item) setTimeout(() => focusItem(item.id), 0);
  }

  function init() {
    layer.addEventListener('click', onClick);
    layer.addEventListener('input', onInput);
    layer.addEventListener('change', onChange);
    layer.addEventListener('keydown', onKeydown);
    layer.addEventListener('contextmenu', onContextMenu);
  }

  return { init, open, close, markerText, get isOpen() { return !!ctx; } };
})();