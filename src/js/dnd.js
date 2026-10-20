'use strict';
/* Przeciąganie myszką i palcem.
   Działa na własnych zdarzeniach pointer (nie HTML5 drag), więc wygląda tak samo
   niezależnie od przeglądarki.

   Na komputerze przeciąganie zaczyna się po lekkim ruchu myszką.
   Na telefonie trzeba najpierw przytrzymać palec (żeby zwykłe przewijanie
   listy nie łapało karty).

   Trzy rodzaje:
     data-drag="card"  -> karta (między listami i między tablicami)
     data-drag="list"  -> lista w tablicy
     data-drag="board" -> tablica w pasku bocznym */

window.Dnd = (function () {
  'use strict';

  const START_THRESHOLD = 6;      // ruch myszką, od którego zaczyna się przeciąganie
  const TOUCH_DELAY = 280;        // przytrzymanie palca
  const TOUCH_TOLERANCE = 10;     // ruch palca przed przytrzymaniem = przewijanie
  const EDGE = 70;                // odległość od krawędzi, od której zaczyna się przewijanie
  const MAX_SCROLL_SPEED = 22;

  let pending = null;   // wciśnięcie, jeszcze bez ruchu
  let active = null;    // przeciąganie w toku
  let dropLine = null;
  let touchTimer = null;
  let lastDragAt = 0;

  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

  /* ---------- Start ---------- */

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || active) return;

    const handle = e.target.closest('[data-drag]');
    if (!handle) return;
    if (e.target.closest('input, textarea, button, select, a')) return;

    pending = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      el: handle,
      type: handle.dataset.drag,
      id: handle.dataset.id,
      boardId: handle.dataset.board || '',
      listId: handle.dataset.list || '',
      scroller: document.getElementById('boardScroll'),
      touch: isTouch(e)
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey);

    /* Palec: najpierw czekamy. Dopiero przytrzymanie zaczyna przeciąganie. */
    if (pending.touch) {
      touchTimer = setTimeout(() => {
        if (!pending || active) return;
        begin({ clientX: pending.lastX, clientY: pending.lastY });
      }, TOUCH_DELAY);
    }
  });

  function onMove(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;

    pending.lastX = e.clientX;
    pending.lastY = e.clientY;

    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;
    const distance = Math.hypot(dx, dy);

    if (!active) {
      if (pending.touch) {
        /* Ruch przed przytrzymaniem oznacza przewijanie - oddajemy gest
           przeglądarce i nie blokujemy listy. */
        if (distance > TOUCH_TOLERANCE) cancelPending();
        return;
      }
      if (distance < START_THRESHOLD) return;
      begin(e);
    }

    if (!active) return;

    if (distance > 2) active.moved = true;
    moveGhost(e.clientX, e.clientY);
    findTarget(e.clientX, e.clientY);
    autoScroll(e.clientX, e.clientY);
    e.preventDefault();
  }

  function begin(e) {
    if (!pending || active) return;
    clearTimeout(touchTimer);
    touchTimer = null;

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
      target: null,
      moved: false
    };

    el.classList.add('drag-source');
    document.body.classList.add('dragging');
    window.UI.closePopover();

    /* Przytrzymanie palca: delikatna wibracja i blokada przewijania
       dopiero teraz, gdy gest jest już przeciąganiem. */
    if (pending.touch) {
      if (navigator.vibrate) navigator.vibrate(12);
      document.addEventListener('touchmove', blockTouch, { passive: false });
    }

    lastDragAt = Date.now() + 650;
    findTarget(e.clientX, e.clientY);
  }

  function blockTouch(e) {
    if (active) e.preventDefault();
  }

  function cancelPending() {
    clearTimeout(touchTimer);
    touchTimer = null;
    removeListeners();
    pending = null;
  }

  function removeListeners() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('touchmove', blockTouch);
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
      const index = insertionIndex(container, '.board-item', y, 'y', active.el);
      showLine(container, index, container.clientWidth - 8);
      active.target = { kind: 'board', index };
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

    /* Pionowe przewijanie listy pod palcem (na telefonie :hover nie działa). */
    const under = document.elementFromPoint(x, y);
    const list = under && under.closest('.list');
    const container = list ? list.querySelector('.cards') : null;
    if (container && container.scrollHeight > container.clientHeight + 1) {
      const box = container.getBoundingClientRect();
      if (y > box.bottom - 48) container.scrollTop += MAX_SCROLL_SPEED;
      else if (y < box.top + 48) container.scrollTop -= MAX_SCROLL_SPEED;
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
    clearTimeout(touchTimer);
    touchTimer = null;
    removeListeners();

    if (active) lastDragAt = Date.now() + 650;
    if (active && !cancelled && active.target && active.moved) apply(active);

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
      /* indeks docelowy liczymy bez przeciąganej listy, a Store oczekuje
         pozycji w oryginalnej tablicy */
      const board = window.Store.getBoard(drag.boardId);
      const from = board ? board.lists.findIndex((l) => l.id === drag.id) : -1;
      const target = from !== -1 && t.index >= from ? t.index + 1 : t.index;
      window.Store.reorderLists(drag.boardId, drag.id, target);
      return;
    }

    if (drag.type === 'board' && t.kind === 'board') {
      const boards = window.Store.get().boards;
      const target = boards[Math.min(t.index, boards.length - 1)];
      if (target && target.id !== drag.id) window.Store.reorderBoards(drag.id, target.id);
    }
  }

  /* Kliknięcie po przeciągnięciu nie powinno otwierać karty */
  document.addEventListener('click', (e) => {
    if (Date.now() < lastDragAt) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  return {
    get dragging() { return !!active; },
    get target() { return active ? active.target : null; }
  };
})();
