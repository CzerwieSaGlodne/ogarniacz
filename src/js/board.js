'use strict';
/* Widok tablicy: nagłówek, listy, karty i pola dodawania. */

window.Board = (function () {
  'use strict';

  const titleEl = document.getElementById('boardTitle');
  const statsEl = document.getElementById('boardStats');
  const listsEl = document.getElementById('boardLists');
  const scroller = document.getElementById('boardScroll');
  const addListBtn = document.getElementById('addListBtn');
  const themeBtn = document.getElementById('themeBtn');
  const themeNameEl = document.getElementById('themeName');
  const boardMenuBtn = document.getElementById('boardMenuBtn');

  /* ile punktów checklisty mieści się w karcie bez rozwijania */
  const MAX_INLINE = 5;

  /* kolor paska nad listami - kolejno dla każdej listy, pełne kolory */
  const LIST_ACCENTS = ['var(--accent-2)', 'var(--accent-3)', 'var(--accent-4)', 'var(--accent-5)', 'var(--accent)'];

  /* otwarte pola wpisywania - trzymamy je poza HTML-em, żeby przerysowanie nic nie kasowało */
  let cardDraft = { listId: null, text: '' };
  let listDraft = { open: false, text: '' };
  let checkDraft = { cardId: null, text: '' };
  let renderedBoardId = null;

  const THEME_PREVIEW = {
    pastel: ['#e4d2de', '#b184d4', '#7cc0e8', '#8ad4a0'],
    dark: ['#0f1118', '#7f9cf0', '#b98ce0', '#55d0b2'],
    cozy: ['#c9d8cf', '#bba89c', '#8fa39b', '#a19b8b']
  };

  /* ---------- Rysowanie ---------- */

  function render() {
    const state = window.Store.get();
    const board = window.Store.getBoard(state.selectedBoardId);
    if (!board) return;

    titleEl.textContent = board.name;

    const cards = window.Store.cardCount(board);
    statsEl.textContent = `${board.lists.length} ${window.UI.plural(board.lists.length, 'lista', 'listy', 'list')} · ${
      cards} ${window.UI.plural(cards, 'karta', 'karty', 'kart')}`;

    const scrollLeft = renderedBoardId === board.id ? scroller.scrollLeft : 0;
    const cardsHtml = board.lists.map((list, i) => renderList(board, list, i)).join('');
    const addListHtml = listDraft.open ? renderListComposer() : '';
    listsEl.innerHTML = cardsHtml + addListHtml;
    scroller.scrollLeft = scrollLeft;
    renderedBoardId = board.id;

    renderTheme(state.theme);
    restoreFocus();
  }

  function renderList(board, list, index) {
    const cards = list.cards.length
      ? list.cards.map((card) => renderCard(board, list, card)).join('')
      : '<div class="list-empty">Ta lista jest jeszcze pusta</div>';

    const composer = cardDraft.listId === list.id ? renderCardComposer() : '';
    const bar = LIST_ACCENTS[(index || 0) % LIST_ACCENTS.length];

    return `
      <section class="list" data-drag="list" data-id="${list.id}" data-list="${list.id}" data-board="${board.id}"
               style="--list-accent:${bar}">
        <header class="list-head">
          <h2 class="list-title" data-role="list-title" title="Kliknij, aby zmienić nazwę">${window.UI.esc(list.name)}</h2>
          <span class="list-count">${list.cards.length}</span>
          <button class="icon-btn" data-role="list-menu" title="Menu listy"
                  aria-label="Menu listy: ${window.UI.esc(list.name)}">⋯</button>
          <button class="mini-del" data-role="delete-list" data-id="${list.id}" title="Usuń listę"
                  aria-label="Usuń listę: ${window.UI.esc(list.name)}">✕</button>
        </header>
        <div class="cards">${cards}</div>
        ${composer || `<button class="btn btn-ghost" data-role="add-card" style="margin:0 9px 9px;text-align:left">+ Dodaj kartę</button>`}
      </section>`;
  }

  function renderCard(board, list, card) {
    const done = card.checklist.filter((i) => i.done).length;
    const total = card.checklist.length;
    const percent = total ? Math.round((done / total) * 100) : 0;

    const labels = card.labels
      .map((id) => `<span class="card-label" style="background:${window.Store.LABEL_COLORS[id] || '#999'}"></span>`)
      .join('');

    const meta = [];
    if (card.note.trim()) meta.push('<span class="badge">📝 Opis</span>');
    if (total) meta.push(`<span class="badge ${done === total ? 'all-done' : ''}">☑ ${done}/${total}</span>`);
    if (card.done) meta.push('<span class="badge all-done">✓ Wykonane</span>');

    return `
      <article class="card ${card.done ? 'done' : ''}" data-drag="card" data-id="${card.id}"
               data-list="${list.id}" data-board="${board.id}">
        <div class="card-tools">
          <button class="mini-menu" data-role="card-menu" data-id="${card.id}" title="Menu karty"
                  aria-label="Menu karty: ${window.UI.esc(card.title)}">⋯</button>
          <button class="mini-done" data-role="toggle-done" data-id="${card.id}"
                  title="${card.done ? 'Cofnij oznaczenie wykonania' : 'Oznacz jako wykonane'}"
                  aria-label="${card.done ? 'Cofnij oznaczenie wykonania' : 'Oznacz jako wykonane'}: ${window.UI.esc(card.title)}">✓</button>
          <button class="mini-del" data-role="delete-card" data-id="${card.id}" title="Usuń kartę"
                  aria-label="Usuń kartę: ${window.UI.esc(card.title)}">✕</button>
        </div>
        ${labels ? `<div class="card-labels">${labels}</div>` : ''}
        <div class="card-title">${window.UI.esc(card.title)}</div>
        ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
        ${total ? `<div class="card-progress"><i style="width:${percent}%"></i></div>` : ''}
        ${renderChecklist(card)}
      </article>`;
  }

  /* Checklista widoczna wprost na karcie.
     Gdy użytkownik właśnie dodaje punkt, pokazujemy wszystkie - nowy od razu widać. */
  function renderChecklist(card) {
    const items = card.checklist;
    const rozwinieta = checkDraft.cardId === card.id;
    const limit = rozwinieta ? items.length : MAX_INLINE;
    const shown = items.slice(0, limit);
    const rest = items.length - shown.length;

    const rows = shown.map((item, index) => `
      <label class="card-check-row ${item.done ? 'done' : ''}">
        <input type="checkbox" data-role="check-item" data-card="${card.id}" data-item="${item.id}"
               ${item.done ? 'checked' : ''}>
        <span class="marker">${window.Card.markerText(card, index)}</span>
        <span class="txt">${item.text ? window.UI.esc(item.text) : '<i>nowy punkt</i>'}</span>
      </label>`).join('');

    const more = rest > 0
      ? `<button class="card-check-more" data-role="open-card" data-id="${card.id}">… i ${rest} ${window.UI.plural(rest, 'więcej', 'więcej', 'więcej')}</button>`
      : '';

    const add = checkDraft.cardId === card.id
      ? `<input class="card-check-input" data-role="check-input" data-card="${card.id}"
                placeholder="Nowy punkt…" value="${window.UI.esc(checkDraft.text)}">`
      : `<button class="card-check-add" data-role="check-add" data-id="${card.id}">+ Dodaj punkt</button>`;

    return `<div class="card-check ${items.length ? '' : 'pusty'}">${rows}${more}${add}</div>`;
  }

  function renderCardComposer() {
    return `
      <div class="composer">
        <textarea data-role="card-text" placeholder="Co trzeba zrobić?">${window.UI.esc(cardDraft.text)}</textarea>
        <div class="composer-hint">Enter — dodaj kartę · Esc — anuluj</div>
        <div class="composer-actions">
          <button class="btn btn-primary" data-role="card-save">Dodaj kartę</button>
          <button class="btn btn-ghost" data-role="card-cancel">Anuluj</button>
        </div>
      </div>`;
  }

  function renderListComposer() {
    return `
      <div class="add-tile" style="width:290px;padding:10px">
        <textarea data-role="list-text" placeholder="Nazwa listy…" style="width:100%;min-height:52px;resize:none;
          padding:8px;border:1px solid var(--accent);border-radius:8px;background:var(--surface-2);outline:none">${window.UI.esc(listDraft.text)}</textarea>
        <div class="composer-actions">
          <button class="btn btn-primary" data-role="list-save">Dodaj listę</button>
          <button class="btn btn-ghost" data-role="list-cancel">Anuluj</button>
        </div>
      </div>`;
  }

  function renderTheme(themeId) {
    const theme = window.Store.THEMES.find((t) => t.id === themeId);
    themeNameEl.textContent = theme ? theme.name : 'Pastelowy';
  }

  function restoreFocus() {
    if (checkDraft.cardId) {
      const input = listsEl.querySelector('[data-role="check-input"]');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    } else if (cardDraft.listId) {
      const area = listsEl.querySelector('[data-role="card-text"]');
      if (area) {
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
      }
    } else if (listDraft.open) {
      const area = listsEl.querySelector('[data-role="list-text"]');
      if (area) area.focus();
    }
  }

  /* ---------- Usuwanie ---------- */

  async function deleteCard(boardId, listId, cardId) {
    const card = window.Store.getCard(boardId, listId, cardId);
    if (!card) return;

    const points = card.checklist.length;
    const text = points
      ? `Karta „${card.title}” zniknie razem z ${points} ${window.UI.plural(points, 'punktem', 'punktami', 'punktami')} checklisty.`
      : `Karta „${card.title}” zostanie usunięta.`;

    const ok = await window.UI.confirm({
      title: 'Usunąć kartę?',
      text,
      okText: 'Usuń kartę'
    });
    if (!ok) return;

    window.Store.deleteCard(boardId, listId, cardId);
    window.UI.toast('Karta usunięta.');
  }

  async function deleteList(boardId, listId) {
    const list = window.Store.getList(boardId, listId);
    if (!list) return;

    const cards = list.cards.length;
    const text = cards
      ? `Lista „${list.name}” zniknie razem z ${cards} ${window.UI.plural(cards, 'kartą', 'kartami', 'kartami')}.`
      : `Lista „${list.name}” zostanie usunięta.`;

    const ok = await window.UI.confirm({
      title: 'Usunąć listę?',
      text,
      okText: 'Usuń listę'
    });
    if (!ok) return;

    window.Store.deleteList(boardId, listId);
    window.UI.toast('Lista usunięta.');
  }

  /* ---------- Checklista na karcie ---------- */

  function startCheck(cardId) {
    checkDraft = { cardId, text: '' };
    render();
  }

  function saveCheck() {
    const text = checkDraft.text.trim();

    /* puste pole zamyka dodawanie */
    if (!text) { checkDraft = { cardId: null, text: '' }; render(); return; }

    const found = window.Store.locate(checkDraft.cardId);
    if (found) window.Store.addItem(found.board.id, found.list.id, found.card.id, text);

    checkDraft.text = '';   // pole zostaje otwarte, żeby dopisywać kolejne punkty
    render();
  }

  function toggleCheck(cardId, itemId, checked) {
    const found = window.Store.locate(cardId);
    if (found) window.Store.updateItem(found.board.id, found.list.id, found.card.id, itemId, { done: checked });
  }

  /* ---------- Klawiatura w polach ---------- */

  function onComposerKey(e, isList) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      isList ? saveList() : saveCard();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (isList) {
        listDraft = { open: false, text: '' };
      } else {
        cardDraft = { listId: null, text: '' };
      }
      render();
    }
  }

  function saveCard() {
    const text = cardDraft.text.trim();
    if (!text) { cardDraft = { listId: null, text: '' }; render(); return; }
    window.Store.addCard(window.Store.get().selectedBoardId, cardDraft.listId, text);
    cardDraft.text = '';            // pole zostaje otwarte, żeby dodać kolejne
    render();
  }

  function saveList() {
    const text = listDraft.text.trim();
    if (!text) { listDraft = { open: false, text: '' }; render(); return; }
    window.Store.addList(window.Store.get().selectedBoardId, text);
    listDraft = { open: false, text: '' };
    render();
  }

  /* ---------- Edycja nazw ---------- */

  function editTitle() {
    const board = window.Store.getBoard(window.Store.get().selectedBoardId);
    if (!board) return;

    /* nazwa w nagłówku jest jedynym elementem, którego render nie odtwarza,
       więc po edycji trzeba wstawić z powrotem oryginalny nagłówek */
    const original = titleEl;
    const input = document.createElement('input');
    input.className = 'title-input';
    input.value = board.name;
    original.replaceWith(input);
    input.focus();
    input.select();

    const finish = (save) => {
      const value = input.value.trim();
      if (input.isConnected) input.replaceWith(original);
      if (save && value) window.Store.renameBoard(board.id, value);
      render();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function editListTitle(listEl) {
    const boardId = listEl.dataset.board;
    const listId = listEl.dataset.id;
    const list = window.Store.getList(boardId, listId);
    if (!list) return;

    const titleElInList = listEl.querySelector('[data-role="list-title"]');
    const input = document.createElement('input');
    input.className = 'list-title-input';
    input.value = list.name;
    titleElInList.replaceWith(input);
    input.focus();
    input.select();

    const finish = (save) => {
      const value = input.value.trim();
      if (save && value) window.Store.renameList(boardId, listId, value);
      render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* ---------- Menu ---------- */

  function cardMenu(anchor, cardEl, position) {
    const cardId = cardEl.dataset.id;
    const boardId = cardEl.dataset.board;
    const listId = cardEl.dataset.list;
    const card = window.Store.getCard(boardId, listId, cardId);
    if (!card) return;

    const menu = window.UI.popover(anchor, [
      { heading: card.title.length > 28 ? card.title.slice(0, 28) + '…' : card.title },
      { emojis: window.Store.EMOJIS, onPick: (emoji) => {
        window.Store.updateCard(boardId, listId, cardId, { marker: 'emoji', emoji });
        window.UI.toast(`Punktacja: ${emoji}`);
      } },
      { sep: true },
      { label: 'Otwórz kartę', icon: '✏️', onClick: () => window.Card.open(cardId) },
      { label: 'Przenieś do…', icon: '📦', onClick: () => moveCardMenu(cardEl) },
      { label: 'Duplikuj kartę', icon: '📋', onClick: () => {
        window.Store.duplicateCard(boardId, listId, cardId);
        window.UI.toast('Karta skopiowana.');
      } },
      { label: card.done ? 'Oznacz jako niewykonane' : 'Oznacz jako wykonane', icon: '✓', onClick: () =>
        window.Store.updateCard(boardId, listId, cardId, { done: !card.done }) },
      { sep: true },
      { label: 'Usuń kartę', icon: '🗑️', danger: true, onClick: () => deleteCard(boardId, listId, cardId) }
    ], position);

    menu.style.minWidth = '210px';
  }

  function moveCardMenu(cardEl) {
    const cardId = cardEl.dataset.id;
    const boardId = cardEl.dataset.board;
    const listId = cardEl.dataset.list;
    const state = window.Store.get();

    const items = [{ heading: 'Przenieś kartę do tablicy' }];
    state.boards.forEach((board) => {
      items.push({
        label: board.name,
        icon: board.id === boardId ? '📍' : '📂',
        onClick: () => chooseTargetList(cardEl, board)
      });
    });
    window.UI.popover(cardEl, items);
  }

  function chooseTargetList(cardEl, board) {
    const cardId = cardEl.dataset.id;
    const fromBoard = cardEl.dataset.board;
    const fromList = cardEl.dataset.list;

    if (!board.lists.length) {
      const list = window.Store.addList(board.id, 'Do zrobienia');
      window.Store.moveCard(cardId, board.id, list.id, null);
      window.UI.toast(`Karta przeniesiona do: ${board.name}`);
      return;
    }

    const items = [{ heading: board.name }];
    board.lists.forEach((list) => {
      items.push({
        label: list.name,
        icon: list.id === fromList && board.id === fromBoard ? '📍' : '📋',
        onClick: () => {
          window.Store.moveCard(cardId, board.id, list.id, null);
          window.UI.toast(`Karta przeniesiona do: ${board.name} / ${list.name}`);
        }
      });
    });
    window.UI.popover(cardEl, items);
  }

  function listMenu(anchor, listEl, position) {
    const boardId = listEl.dataset.board;
    const listId = listEl.dataset.id;
    const list = window.Store.getList(boardId, listId);
    if (!list) return;
    const board = window.Store.getBoard(boardId);
    const index = board ? board.lists.findIndex((l) => l.id === listId) : -1;

    const moveItems = [];
    if (board && index > 0) {
      moveItems.push({ label: 'Przesuń listę w lewo', icon: '←', onClick: () =>
        window.Store.reorderLists(boardId, listId, index - 1) });
    }
    if (board && index !== -1 && index < board.lists.length - 1) {
      moveItems.push({ label: 'Przesuń listę w prawo', icon: '→', onClick: () =>
        window.Store.reorderLists(boardId, listId, index + 2) });
    }

    window.UI.popover(anchor, [
      { heading: list.name },
      { label: 'Zmień nazwę', icon: '✏️', onClick: () => editListTitle(listEl) },
      { label: 'Wyczyść karty', icon: '🧹', onClick: async () => {
        const cards = list.cards.length;
        const ok = await window.UI.confirm({
          title: 'Wyczyścić listę?',
          text: `Wszystkie ${cards} ${window.UI.plural(cards, 'karta', 'karty', 'kart')} z listy „${list.name}” zniknie.`,
          okText: 'Wyczyść'
        });
        if (ok) {
          window.Store.clearList(boardId, listId);
          window.UI.toast('Lista wyczyszczona.');
        }
      } },
      ...moveItems,
      { sep: true },
      { label: 'Usuń listę', icon: '🗑️', danger: true, onClick: () => deleteList(boardId, listId) }
    ], position);
  }

  function boardMenu(anchor, position) {
    const board = window.Store.getBoard(window.Store.get().selectedBoardId);
    if (!board) return;

    window.UI.popover(anchor, [
      { heading: board.name },
      { label: 'Zmień nazwę tablicy', icon: '✏️', onClick: editTitle },
      { label: 'Duplikuj tablicę', icon: '📋', onClick: () => {
        window.Store.duplicateBoard(board.id);
        window.UI.toast('Tablica skopiowana.');
      } },
      { label: 'Wyczyść tablicę', icon: '🧹', onClick: async () => {
        const cards = window.Store.cardCount(board);
        const ok = await window.UI.confirm({
          title: 'Wyczyścić tablicę?',
          text: `Wszystkie ${cards} ${window.UI.plural(cards, 'karta', 'karty', 'kart')} z tablicy „${board.name}” zniknie.`,
          okText: 'Wyczyść'
        });
        if (ok) {
          window.Store.clearBoard(board.id);
          window.UI.toast('Tablica wyczyszczona.');
        }
      } },
      { sep: true },
      { label: 'Zapisz kopię tablic', icon: '💾', onClick: () => window.App.exportData() },
      { label: 'Wczytaj kopię', icon: '📂', onClick: () => window.App.importData() },
      { sep: true },
      { label: 'Usuń tablicę', icon: '🗑️', danger: true, onClick: () => window.Sidebar.deleteBoard(board.id) }
    ], position);
  }

  function themeMenu(anchor) {
    const state = window.Store.get();
    const menu = window.UI.popover(anchor, window.Store.THEMES.map((t) => ({
      label: t.name,
      onClick: () => window.Store.setTheme(t.id)
    })).concat([
      { sep: true },
      { heading: 'Przygaszenie ekranu' },
      {
        segmented: {
          value: state.dim,
          options: [
            { label: 'Wyłączone', value: 0 },
            { label: 'Lekkie', value: 1 },
            { label: 'Średnie', value: 2 },
            { label: 'Mocne', value: 3 }
          ],
          onPick: (level) => window.Store.setDim(level)
        }
      }
    ]));

    /* podmieniamy przyciski motywów na kolorowe podglądy */
    const buttons = menu.querySelectorAll('button');
    window.Store.THEMES.forEach((t, i) => {
      const colors = THEME_PREVIEW[t.id];
      buttons[i].innerHTML = `
        <span class="theme-preview">
          ${colors.map((c) => `<i style="background:${c}"></i>`).join('')}
        </span>
        <span>${t.name}</span>`;
    });
  }

  /* ---------- Obsługa kliknięć ---------- */

  function onClick(e) {
    /* podczas pisania nie otwieramy okna karty */
    if (e.target.closest('[data-role="card-text"], [data-role="list-text"], .card-check-input')) return;

    const cardMenuBtn = e.target.closest('[data-role="card-menu"]');
    if (cardMenuBtn) {
      e.stopPropagation();
      cardMenu(cardMenuBtn, cardMenuBtn.closest('.card'));
      return;
    }

    const delCard = e.target.closest('[data-role="delete-card"]');
    if (delCard) {
      e.stopPropagation();
      const cardEl = delCard.closest('.card');
      deleteCard(cardEl.dataset.board, cardEl.dataset.list, delCard.dataset.id);
      return;
    }

    const toggleDone = e.target.closest('[data-role="toggle-done"]');
    if (toggleDone) {
      e.stopPropagation();
      const cardEl = toggleDone.closest('.card');
      const card = window.Store.getCard(cardEl.dataset.board, cardEl.dataset.list, toggleDone.dataset.id);
      if (!card) return;
      window.Store.updateCard(cardEl.dataset.board, cardEl.dataset.list, toggleDone.dataset.id, { done: !card.done });
      window.UI.toast(card.done ? 'Karta oznaczona jako wykonana.' : 'Karta wraca do zadań.');
      return;
    }

    const checkBox = e.target.closest('[data-role="check-item"]');
    if (checkBox) {
      e.stopPropagation();
      toggleCheck(checkBox.dataset.card, checkBox.dataset.item, checkBox.checked);
      return;
    }

    const checkAdd = e.target.closest('[data-role="check-add"]');
    if (checkAdd) { startCheck(checkAdd.dataset.id); return; }

    const openCard = e.target.closest('[data-role="open-card"]');
    if (openCard) { window.Card.open(openCard.dataset.id); return; }

    const delList = e.target.closest('[data-role="delete-list"]');
    if (delList) {
      e.stopPropagation();
      deleteList(delList.closest('.list').dataset.board, delList.dataset.id);
      return;
    }

    const cardEl = e.target.closest('.card');
    if (cardEl) {
      window.Card.open(cardEl.dataset.id);
      return;
    }

    const addCardBtn = e.target.closest('[data-role="add-card"]');
    if (addCardBtn) {
      cardDraft = { listId: addCardBtn.closest('.list').dataset.id, text: '' };
      render();
      return;
    }

    if (e.target.closest('[data-role="card-save"]')) { saveCard(); return; }
    if (e.target.closest('[data-role="card-cancel"]')) { cardDraft = { listId: null, text: '' }; render(); return; }
    if (e.target.closest('[data-role="list-save"]')) { saveList(); return; }
    if (e.target.closest('[data-role="list-cancel"]')) { listDraft = { open: false, text: '' }; render(); return; }

    const listTitle = e.target.closest('[data-role="list-title"]');
    if (listTitle) { editListTitle(listTitle.closest('.list')); return; }

    const listMenuBtn = e.target.closest('[data-role="list-menu"]');
    if (listMenuBtn) { listMenu(listMenuBtn, listMenuBtn.closest('.list')); return; }
  }

  function onInput(e) {
    if (e.target.matches('[data-role="card-text"]')) cardDraft.text = e.target.value;
    if (e.target.matches('[data-role="list-text"]')) listDraft.text = e.target.value;
    if (e.target.matches('[data-role="check-input"]')) checkDraft.text = e.target.value;
  }

  function onKeydown(e) {
    if (e.target.matches('.card-check-input')) {
      if (e.key === 'Enter') { e.preventDefault(); saveCheck(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        checkDraft = { cardId: null, text: '' };
        render();
      }
      return;
    }

    const area = e.target.closest('[data-role="card-text"], [data-role="list-text"]');
    if (!area) return;
    onComposerKey(e, area.dataset.role === 'list-text');
  }

  /* Prawy przycisk myszy działa w całej aplikacji:
     karta -> emotki i akcje karty, lista -> menu listy, reszta -> menu tablicy.
     Pasek boczny i okno karty mają własne menu. */
  function onContextMenu(e) {
    if (e.target.closest('#layer')) return;        // okno karty
    if (e.target.closest('.sidebar')) return;      // pasek boczny
    if (e.target.closest('.titlebar')) return;     // pasek okna

    const where = { x: e.clientX, y: e.clientY };

    const cardEl = e.target.closest('.card');
    if (cardEl) { cardMenu(cardEl, cardEl, where); return; }

    const listEl = e.target.closest('.list');
    if (listEl) { listMenu(listEl, listEl, where); return; }

    if (e.target.closest('.main')) { boardMenu(null, where); }
  }

  function init() {
    listsEl.addEventListener('click', onClick);
    listsEl.addEventListener('input', onInput);
    listsEl.addEventListener('keydown', onKeydown);
    document.addEventListener('contextmenu', onContextMenu);

    /* puste pole dodawania zamyka się samo po chwili */
    listsEl.addEventListener('focusout', (e) => {
      if (!e.target.matches('.card-check-input')) return;
      if (checkDraft.text.trim()) return;
      setTimeout(() => {
        if (!checkDraft.cardId || checkDraft.text.trim()) return;
        checkDraft = { cardId: null, text: '' };
        render();
      }, 140);
    });

    titleEl.addEventListener('click', editTitle);
    boardMenuBtn.addEventListener('click', () => boardMenu(boardMenuBtn));
    themeBtn.addEventListener('click', () => themeMenu(themeBtn));

    addListBtn.addEventListener('click', () => {
      listDraft = { open: true, text: '' };
      render();
    });

    window.Store.on(render);
    render();
  }

  return { init, render, deleteCard, deleteList };
})();