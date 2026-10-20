'use strict';
/* Przeciąganie myszką i palcem.
   Działa na własnych zdarzeniach pointer (nie HTML5 drag), więc wygląda tak samo
   niezależnie od przeglądarki i można z tego korzystać dotykiem.

   Trzy rodzaje:
     data-drag="card"  -> karta (między listami i między tablicami)
     data-drag="list"  -> lista w tablicy
     data-drag="board" -> tablica w pasku bocznym */

window.Dnd = (function () {
  'use strict';

  const START_THRESHOLD = 6;   // ile pikseli ruchu oznacza przeciąganie
  const EDGE = 70;             // odległość od krawędzi, od której zaczyna się przewijanie
  const MAX_SCROLL_SPEED = 22;

  let pending = null;   // wciśnięcie, jeszcze bez ruchu
  let active = null;    // przeciąganie w toku
  let dropLine = null;
  let justDragged = false;

  /* ---------- Start ---------- */

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || active) return;

    const handle = e.target.closest('[data-drag]');
    if (!handle) return;
    if (e.target.closest('input, textarea, button')) return;

    pending = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      el: handle,
      type: handle.dataset.drag,
      id: handle.dataset.id,
      boardId: handle.dataset.board || '',
      listId: handle.dataset.list || '',
      scroller: document.getElementById('boardScroll')
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey);
  });

  function onMove(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;

    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;

    if (!active) {
      if (Math.hypot(dx, dy) < START_THRESHOLD) return;
      begin(e);
    }

    moveGhost(e.clientX, e.clientY);
    findTarget(e.clientX, e.clientY);
    autoScroll(e.clientX, e.clientY);
    e.preventDefault();
  }

  function begin(e) {
    const el = pending.el;
    const rect = el.getBoundingClientRect();

    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    if (pending.type === 'list') ghost.classList.add('list-ghost');
    ghost.classList.remove('drag-source');
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);

    active = {
      ...pending,
      ghost,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      target: null
    };

    el.classList.add('drag-source');
    document.body.classList.add('dragging');
    window.UI.closePopover();

    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
  }

  /* ---------- Podczas przeciągania ---------- */

  function moveGhost(x, y) {
    active.ghost.style.left = `${x - active.grabX}px`;
    active.ghost.style.top = `${y - active.grabY}px`;
  }

  function findTarget(x, y) {
    clearTarget();

    const under = document.elementFromPoint(x, y);
    if (!under) return;

    if (active.type === 'card') {
      const boardItem = under.closest('.board-item');
      if (boardItem) {
        boardItem.classList.add('drop-target');
        active.target = { kind: 'board', boardId: boardItem.dataset.id };
        return;
      }

      const list = under.closest('.list');
      if (!list) {
        active.target = null;          // upuszczone w puste miejsce - karta zostaje tam gdzie była
        return;
      }

      const container = list.querySelector('.cards');
      if (!container) { active.target = null; return; }

      const index = insertionIndex(container, '.card', y, 'y', active.el);
      showLine(container, index, list.offsetWidth - 18);
      active.target = { kind: 'list', boardId: list.dataset.board, listId: list.dataset.list, index };
      return;
    }

    if (active.type === 'list') {
      const container = document.getElementById('boardLists');
      const boardId = active.boardId;
      const index = insertionIndex(container, '.list', x, 'x', active.el);
      showLine(container, index, 290, 'vertical');
      active.target = { kind: 'list', boardId, index };
      return;
    }

    if (active.type === 'board') {
      const container = document.getElementById('boardList');
      const items = [...container.querySelectorAll('.board-item')].filter((el) => el !== active.el);
      const index = insertionIndex(container, '.board-item', y, 'y', active.el);
      showLine(container, index, container.clientWidth - 8);
      // celem jest tablica poniżej linii, a przy upuszczeniu pod ostatnią - ostatnia
      const target = items[index] || items[items.length - 1];
      active.target = { kind: 'board', targetId: target ? target.dataset.id : '', index };
    }
  }

  function clearTarget() {
    if (dropLine) { dropLine.remove(); dropLine = null; }
    document.querySelectorAll('.board-item.drop-target').forEach((el) => el.classList.remove('drop-target'));
    document.querySelectorAll('.list-empty').forEach((el) => { el.style.display = 'none'; });
  }

  /* Na której pozycji wypada upuszczenie */
  function insertionIndex(container, selector, point, axis, exclude) {
    const items = [...container.querySelectorAll(selector)]
      .filter((el) => el !== exclude && !el.classList.contains('drag-source'));
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (axis === 'x' ? point < rect.left + rect.width / 2 : point < rect.top + rect.height / 2) return i;
    }
    return items.length;
  }

  function showLine(container, index, width, orientation) {
    if (!dropLine) {
      dropLine = document.createElement('div');
      dropLine.className = 'drop-line';
    }
    if (orientation === 'vertical') {
      dropLine.style.width = `${width}px`;
      dropLine.style.height = '';
    } else {
      dropLine.style.width = '';
      dropLine.style.height = '';
    }

    const items = [...container.querySelectorAll(
      active.type === 'card' ? '.card' : active.type === 'list' ? '.list' : '.board-item'
    )].filter((el) => !el.classList.contains('drag-source'));

    const before = items[index];
    if (before) container.insertBefore(dropLine, before);
    else container.appendChild(dropLine);
  }

  /* Przewijanie przy krawędziach */
  function autoScroll(x, y) {
    if (active.type === 'board') return;

    const scroller = active.scroller;
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    if (x > rect.right - EDGE) scroller.scrollLeft += MAX_SCROLL_SPEED;
    else if (x < rect.left + EDGE) scroller.scrollLeft -= MAX_SCROLL_SPEED;

    // przewijanie długiej listy w pionie
    const container = document.querySelector('.cards:hover');
    if (container) {
      const box = container.getBoundingClientRect();
      if (y > box.bottom - 40) container.scrollTop += MAX_SCROLL_SPEED;
      else if (y < box.top + 40) container.scrollTop -= MAX_SCROLL_SPEED;
    }
  }

  /* ---------- Koniec ---------- */

  function onUp(e) {
    if (pending && e.pointerId === pending.pointerId) finish();
  }

  function onCancel(e) {
    if (pending && e.pointerId === pending.pointerId) finish(true);
  }

  function onKey(e) {
    if (e.key === 'Escape' && active) {
      e.preventDefault();
      finish(true);
    }
  }

  function finish(cancelled) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey);

    if (active && !cancelled && active.target) apply(active);

    if (active) {
      active.ghost.remove();
      active.el.classList.remove('drag-source');
    }
    document.body.classList.remove('dragging');
    document.querySelectorAll('.list-empty').forEach((el) => { el.style.display = ''; });

    clearTarget();
    active = null;
    pending = null;
  }

  /* Zapisuje wynik przeciągania w danych */
  function apply(drag) {
    const t = drag.target;

    if (drag.type === 'card' && t.kind === 'board') {
      const board = window.Store.getBoard(t.boardId);
      if (!board) return;
      if (!board.lists.length) board.lists.push({ id: window.Seed.uid('l'), name: 'Do zrobienia', cards: [] });
      window.Store.moveCard(drag.id, board.id, board.lists[0].id, null);
      window.UI.toast(`Karta przeniesiona do: ${board.name}`);
      return;
    }

    if (drag.type === 'card' && t.kind === 'list') {
      window.Store.moveCard(drag.id, t.boardId, t.listId, t.index);
      return;
    }

    if (drag.type === 'list' && t.kind === 'list') {
      window.Store.reorderLists(drag.boardId, drag.id, t.index);
      return;
    }

    if (drag.type === 'board' && t.kind === 'board' && t.targetId && t.targetId !== drag.id) {
      window.Store.reorderBoards(drag.id, t.targetId);
    }
  }

  /* Kliknięcie po przeciągnięciu nie powinno otwierać karty */
  document.addEventListener('click', (e) => {
    if (justDragged) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  return {
    get dragging() { return !!active; },
    get target() { return active ? active.target : null; }
  };
})();