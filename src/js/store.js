'use strict';
/* Model danych i wszystkie zmiany na tablicach.
   Zapis idzie do pliku data.json (przez Electron), automatycznie po każdej zmianie. */

window.Store = (function () {
  'use strict';

  const uid = window.Seed.uid;

  /* Kategorie kolorowe dostępne dla kart - barwy łagodne, żeby nie raziły */
  const LABELS = [
    { id: 'czerwony', name: 'Czerwony', color: '#d4574f' },
    { id: 'pomarańczowy', name: 'Pomarańczowy', color: '#d99038' },
    { id: 'żółty', name: 'Żółty', color: '#d3ae38' },
    { id: 'zielony', name: 'Zielony', color: '#56a874' },
    { id: 'turkusowy', name: 'Turkusowy', color: '#45a49c' },
    { id: 'niebieski', name: 'Niebieski', color: '#5e87d0' },
    { id: 'fioletowy', name: 'Fioletowy', color: '#9c72d8' },
    { id: 'różowy', name: 'Różowy', color: '#d2739f' },
    { id: 'brązowy', name: 'Brązowy', color: '#8a6a4e' },
    { id: 'szary', name: 'Szary', color: '#75808d' }
  ];

  const LABEL_COLORS = LABELS.reduce((map, l) => { map[l.id] = l.color; return map; }, {});

  const THEMES = [
    { id: 'pastel', name: 'Pastelowy' },
    { id: 'dark', name: 'Ciemny' },
    { id: 'cozy', name: 'Cozy' }
  ];

  /* Emotki do punktacji na checklistach */
  const EMOJIS = ['✅', '⭐', '🔥', '💡', '🎯', '🚀', '📌', '❤️', '🌸', '🍀'];

  /* Sposoby punktacji */
  const MARKERS = [
    { id: 'numeric', name: '1. 2. 3.' },
    { id: 'dash', name: '– myślnik' },
    { id: 'dot', name: '• kropka' },
    { id: 'emoji', name: '😊 emotka' }
  ];

  let state = null;
  let saveTimer = null;
  let saveErrorShown = false;
  const listeners = new Set();

  /* ---------- I/O ---------- */

  async function init() {
    const raw = window.api ? await window.api.load() : null;
    if (raw && Array.isArray(raw.boards) && raw.boards.length) {
      state = repair(raw);
    } else {
      state = window.Seed.create();
      await persist();
    }
    if (!getBoard(state.selectedBoardId)) state.selectedBoardId = state.boards[0].id;
    return state;
  }

  /* Uzupełnia brakujące pola - dzięki temu aplikacja nie psuje się po awarii lub starszej kopii */
  function repair(raw) {
    const data = {
      version: 1,
      theme: THEMES.some((t) => t.id === raw.theme) ? raw.theme : 'pastel',
      dim: [0, 1, 2, 3].includes(raw.dim) ? raw.dim : 0,
      selectedBoardId: raw.selectedBoardId || null,
      boards: []
    };

    raw.boards.forEach((b) => {
      const board = { id: b.id || uid('b'), name: String(b.name || 'Tablica'), lists: [] };
      (b.lists || []).forEach((l) => {
        const list = { id: l.id || uid('l'), name: String(l.name || 'Lista'), cards: [] };
        (l.cards || []).forEach((c) => {
          list.cards.push({
            id: c.id || uid('c'),
            title: String(c.title || 'Bez tytułu'),
            note: String(c.note || ''),
            labels: Array.isArray(c.labels) ? c.labels.filter((l) => LABEL_COLORS[l]) : [],
            done: !!c.done,
            marker: ['numeric', 'dash', 'dot', 'emoji'].includes(c.marker) ? c.marker : 'dash',
            emoji: c.emoji || '✅',
            checklist: Array.isArray(c.checklist)
              ? c.checklist.map((i) => ({ id: i.id || uid('i'), text: String(i.text || ''), done: !!i.done }))
              : [],
            createdAt: c.createdAt || Date.now()
          });
        });
        board.lists.push(list);
      });
      data.boards.push(board);
    });

    if (!data.boards.length) data.boards = window.Seed.create().boards;
    if (!data.selectedBoardId) data.selectedBoardId = data.boards[0].id;
    return data;
  }

  function get() { return state; }

  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function emit(reason) {
    save();
    listeners.forEach((fn) => fn(reason));
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
  }

  async function persist() {
    if (!window.api) return;
    const result = await window.api.save(state);
    if (result && !result.ok && !saveErrorShown) {
      saveErrorShown = true;
      window.UI && window.UI.toast('Nie udało się zapisać pliku z tablicami.');
    }
  }

  async function replaceAll(newState) {
    state = repair(newState);
    if (!getBoard(state.selectedBoardId)) state.selectedBoardId = state.boards[0].id;
    await persist();
    emit('replace');
  }

  /* ---------- Odczyty ---------- */

  const getBoard = (id) => state.boards.find((b) => b.id === id) || null;
  const getList = (boardId, listId) => {
    const b = getBoard(boardId);
    return b ? b.lists.find((l) => l.id === listId) || null : null;
  };

  const getCard = (boardId, listId, cardId) => {
    const l = getList(boardId, listId);
    return l ? l.cards.find((c) => c.id === cardId) || null : null;
  };

  /* Znajduje kartę wszędzie - wygodne przy przeciąganiu i w oknie karty */
  function locate(cardId) {
    for (const board of state.boards) {
      for (const list of board.lists) {
        const index = list.cards.findIndex((c) => c.id === cardId);
        if (index !== -1) return { board, list, card: list.cards[index], index };
      }
    }
    return null;
  }

  const cardCount = (board) => board.lists.reduce((sum, l) => sum + l.cards.length, 0);

  /* ---------- Tablice ---------- */

  function addBoard(name) {
    const board = { id: uid('b'), name: name || 'Nowa tablica', lists: [] };
    state.boards.push(board);
    state.selectedBoardId = board.id;
    emit('boards');
    return board;
  }

  function renameBoard(id, name) {
    const board = getBoard(id);
    if (!board || !name.trim()) return;
    board.name = name.trim();
    emit('boards');
  }

  function deleteBoard(id) {
    const index = state.boards.findIndex((b) => b.id === id);
    if (index === -1) return;
    state.boards.splice(index, 1);
    if (!state.boards.length) state.boards.push({ id: uid('b'), name: 'Nowa tablica', lists: [] });
    if (state.selectedBoardId === id) state.selectedBoardId = state.boards[Math.max(0, index - 1)].id;
    emit('boards');
  }

  function duplicateBoard(id) {
    const source = getBoard(id);
    if (!source) return;
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = uid('b');
    copy.name = source.name + ' (kopia)';
    copy.lists.forEach((l) => {
      l.id = uid('l');
      l.cards.forEach((c) => {
        c.id = uid('c');
        c.checklist.forEach((i) => { i.id = uid('i'); });
      });
    });
    state.boards.splice(state.boards.findIndex((b) => b.id === id) + 1, 0, copy);
    state.selectedBoardId = copy.id;
    emit('boards');
  }

  function reorderBoards(id, targetId) {
    const from = state.boards.findIndex((b) => b.id === id);
    const to = state.boards.findIndex((b) => b.id === targetId);
    if (from === -1 || to === -1 || from === to) return;
    const [board] = state.boards.splice(from, 1);
    state.boards.splice(to, 0, board);
    emit('boards');
  }

  function selectBoard(id) {
    if (!getBoard(id)) return;
    state.selectedBoardId = id;
    emit('boards');
  }

  function clearBoard(id) {
    const board = getBoard(id);
    if (!board) return;
    board.lists.forEach((l) => { l.cards = []; });
    emit('board');
  }

  /* ---------- Listy ---------- */

  function addList(boardId, name) {
    const board = getBoard(boardId);
    if (!board || !name.trim()) return null;
    const list = { id: uid('l'), name: name.trim(), cards: [] };
    board.lists.push(list);
    emit('board');
    return list;
  }

  function renameList(boardId, listId, name) {
    const list = getList(boardId, listId);
    if (!list || !name.trim()) return;
    list.name = name.trim();
    emit('board');
  }

  function deleteList(boardId, listId) {
    const board = getBoard(boardId);
    if (!board) return;
    const index = board.lists.findIndex((l) => l.id === listId);
    if (index === -1) return;
    board.lists.splice(index, 1);
    emit('board');
  }

  function reorderLists(boardId, listId, targetIndex) {
    const board = getBoard(boardId);
    if (!board) return;
    const from = board.lists.findIndex((l) => l.id === listId);
    if (from === -1) return;
    const [list] = board.lists.splice(from, 1);
    let index = targetIndex;
    if (from < targetIndex) index -= 1;
    board.lists.splice(Math.max(0, Math.min(board.lists.length, index)), 0, list);
    emit('board');
  }

  function clearList(boardId, listId) {
    const list = getList(boardId, listId);
    if (!list) return;
    list.cards = [];
    emit('board');
  }

  /* ---------- Karty ---------- */

  function addCard(boardId, listId, title) {
    const list = getList(boardId, listId);
    if (!list || !title.trim()) return null;
    const card = {
      id: uid('c'),
      title: title.trim(),
      note: '',
      labels: [],
      done: false,
      marker: 'dash',
      emoji: '✅',
      checklist: [],
      createdAt: Date.now()
    };
    list.cards.push(card);
    emit('board');
    return card;
  }

  function updateCard(boardId, listId, cardId, patch) {
    const card = getCard(boardId, listId, cardId);
    if (!card) return;
    Object.assign(card, patch);
    emit('board');
  }

  function deleteCard(boardId, listId, cardId) {
    const list = getList(boardId, listId);
    if (!list) return;
    const index = list.cards.findIndex((c) => c.id === cardId);
    if (index === -1) return;
    list.cards.splice(index, 1);
    emit('board');
  }

  function duplicateCard(boardId, listId, cardId) {
    const list = getList(boardId, listId);
    if (!list) return null;
    const index = list.cards.findIndex((c) => c.id === cardId);
    if (index === -1) return null;
    const copy = JSON.parse(JSON.stringify(list.cards[index]));
    copy.id = uid('c');
    copy.title += ' (kopia)';
    copy.checklist.forEach((i) => { i.id = uid('i'); });
    list.cards.splice(index + 1, 0, copy);
    emit('board');
    return copy;
  }

  /* Przeniesienie karty: między listami, między tablicami, na konkretne miejsce */
  function moveCard(cardId, toBoardId, toListId, index) {
    const found = locate(cardId);
    const targetBoard = getBoard(toBoardId);
    const targetList = targetBoard ? targetBoard.lists.find((l) => l.id === toListId) : null;
    if (!found || !targetList) return;

    found.list.cards.splice(found.index, 1);
    const position = index == null ? targetList.cards.length : Math.max(0, Math.min(index, targetList.cards.length));
    targetList.cards.splice(position, 0, found.card);

    if (state.selectedBoardId !== toBoardId) state.selectedBoardId = toBoardId;
    emit('board');
  }

  /* ---------- Checklista ---------- */

  function addItem(boardId, listId, cardId, text, afterIndex) {
    const card = getCard(boardId, listId, cardId);
    if (!card) return null;
    // pusty punkt jest OK - okno karty dodaje wiersz, który od razu można wypełnić
    const item = { id: uid('i'), text: String(text || '').trim(), done: false };
    const at = afterIndex == null ? card.checklist.length : afterIndex + 1;
    card.checklist.splice(at, 0, item);
    emit('board');
    return item;
  }

  function updateItem(boardId, listId, cardId, itemId, patch) {
    const card = getCard(boardId, listId, cardId);
    if (!card) return;
    const item = card.checklist.find((i) => i.id === itemId);
    if (!item) return;
    Object.assign(item, patch);
    emit('board');
  }

  function deleteItem(boardId, listId, cardId, itemId) {
    const card = getCard(boardId, listId, cardId);
    if (!card) return;
    const index = card.checklist.findIndex((i) => i.id === itemId);
    if (index === -1) return;
    card.checklist.splice(index, 1);
    emit('board');
  }

  /* ---------- Motyw ---------- */

  function setTheme(id) {
    if (!THEMES.some((t) => t.id === id)) return;
    state.theme = id;
    emit('theme');
  }

  /* Poziom przygaszenia ekranu: 0 - wyłączony, 3 - najmocniejszy */
  function setDim(level) {
    if (![0, 1, 2, 3].includes(level)) return;
    state.dim = level;
    window.UI.setDim(level);
    emit('dim');
  }

  return {
    LABEL_COLORS, LABELS, THEMES, EMOJIS, MARKERS,
    init, get, on, save, replaceAll,
    getBoard, getList, getCard, locate, cardCount,
    addBoard, renameBoard, deleteBoard, duplicateBoard, reorderBoards, selectBoard, clearBoard,
    addList, renameList, deleteList, reorderLists, clearList,
    addCard, updateCard, deleteCard, duplicateCard, moveCard,
    addItem, updateItem, deleteItem,
    setTheme, setDim
  };
})();