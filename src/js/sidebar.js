'use strict';
/* Pasek boczny: lista tablic, wyszukiwarka, dodawanie i przeciąganie tablic. */

window.Sidebar = (function () {
  'use strict';

  const listEl = document.getElementById('boardList');
  const searchEl = document.getElementById('boardSearch');
  const addBtn = document.getElementById('addBoardBtn');

  let query = '';
  /* kolory kółek przy tablicach - biorą się z motywu */
  const DOT_COLORS = [
    'var(--accent-2)', 'var(--accent-3)', 'var(--accent-4)',
    'var(--accent-5)', 'var(--accent)', 'var(--accent-3)', 'var(--accent-2)'
  ];

  function render() {
    const state = window.Store.get();
    const visible = state.boards.filter(matches);

    if (!visible.length) {
      listEl.innerHTML = `<div class="empty-hint">${
        query ? 'Nie ma tablic o takiej nazwie.' : 'Nie masz jeszcze żadnej tablicy.<br>Dodaj pierwszą!'
      }</div>`;
      return;
    }

    listEl.innerHTML = visible.map((board) => {
      const dot = DOT_COLORS[state.boards.indexOf(board) % DOT_COLORS.length];
      const cards = window.Store.cardCount(board);
      const cardsWord = window.UI.plural(cards, 'karta', 'karty', 'kart');
      return `
        <div class="board-item ${board.id === state.selectedBoardId ? 'active' : ''}"
             data-drag="board" data-id="${board.id}" title="${window.UI.esc(board.name)}">
          <span class="board-dot" style="background:${dot}"></span>
          <span class="board-name">${window.UI.esc(board.name)}</span>
          <span class="board-count">${cards}</span>
          <button class="mini-del" data-role="delete-board" data-id="${board.id}"
                  title="Usuń tablicę">✕</button>
        </div>`;
    }).join('');
  }

  function matches(board) {
    if (!query) return true;
    return board.name.toLowerCase().includes(query);
  }

  /* Usunięcie tablicy - pyta o potwierdzenie, nie pytając o liczbę kart */
  async function deleteBoard(boardId, after) {
    const board = window.Store.getBoard(boardId);
    if (!board) return;

    const cards = window.Store.cardCount(board);
    const lists = board.lists.length;
    const text = cards
      ? `Tablica „${board.name}” zniknie razem z ${lists} ${window.UI.plural(lists, 'listą', 'listami', 'listami')} i ${cards} ${window.UI.plural(cards, 'kartą', 'kartami', 'kartami')}.`
      : `Tablica „${board.name}” zniknie razem z ${lists} ${window.UI.plural(lists, 'listą', 'listami', 'listami')}.`;

    const ok = await window.UI.confirm({
      title: 'Usunąć tablicę?',
      text,
      okText: 'Usuń tablicę'
    });
    if (!ok) return;

    window.Store.deleteBoard(boardId);
    window.UI.toast('Tablica usunięta.');
    if (after) after();
  }

  /* Nowa tablica - nazwę wpisujemy wprost na pasku bocznym */
  function addBoard() {
    const board = window.Store.addBoard('');
    render();

    const item = listEl.querySelector(`.board-item[data-id="${board.id}"]`);
    if (!item) return;

    item.querySelector('.board-name').outerHTML =
      '<input class="title-input" style="width:100%;font-size:13px;padding:2px 5px" data-role="name-input">';

    const input = item.querySelector('[data-role="name-input"]');
    input.focus();
    input.select();

    const finish = (save) => {
      const value = input.value.trim();
      input.replaceWith(window.UI.esc(value));
      if (save && value) window.Store.renameBoard(board.id, value);
      else window.Store.deleteBoard(board.id);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  function init() {
    listEl.addEventListener('click', (e) => {
      const del = e.target.closest('[data-role="delete-board"]');
      if (del) {
        e.stopPropagation();
        deleteBoard(del.dataset.id);
        return;
      }
      const item = e.target.closest('.board-item');
      if (item) window.Store.selectBoard(item.dataset.id);
    });

    /* prawy przycisk myszy na tablicy - to samo menu */
    listEl.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('.board-item');
      if (!item) return;
      const board = window.Store.getBoard(item.dataset.id);
      window.UI.popover(item, [
        { heading: board.name },
        { label: 'Otwórz tablicę', icon: '📂', onClick: () => window.Store.selectBoard(board.id) },
        { label: 'Duplikuj tablicę', icon: '📋', onClick: () => window.Store.duplicateBoard(board.id) },
        { sep: true },
        { label: 'Usuń tablicę', icon: '🗑️', danger: true, onClick: () => deleteBoard(board.id) }
      ], { x: e.clientX, y: e.clientY });
    });

    searchEl.addEventListener('input', () => {
      query = searchEl.value.trim().toLowerCase();
      render();
    });

    addBtn.addEventListener('click', addBoard);

    /* Ctrl+K lub "/" - skok do wyszukiwarki */
    document.addEventListener('keydown', (e) => {
      const typing = e.target.matches('input, textarea');
      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (!typing && e.key === '/')) {
        e.preventDefault();
        searchEl.focus();
        searchEl.select();
      }
    });

    window.Store.on(render);
    render();
  }

  return { init, render, deleteBoard, focusSearch: () => searchEl.focus() };
})();