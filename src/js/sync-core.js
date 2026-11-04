'use strict';
/* Wspólny rdzeń synchronizacji.
   Działa zarówno w przeglądarce/PWA, jak i w Electronie (require).
   Nie dotyka wyglądu ani ustawień urządzenia - tylko tablice, listy,
   karty i checklisty. Każda zmiana dostaje własny znacznik czasu. */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SyncCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const ORDER_KINDS = ['boards', 'lists', 'cards', 'items'];
  const TOMB_KINDS = ['boards', 'lists', 'cards', 'items'];

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function safeId(value) {
    const id = String(value == null ? '' : value);
    if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype') return '';
    return id;
  }

  function makeId(prefix) {
    const base = prefix || 'id';
    let random = '';
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) random = crypto.randomUUID();
    } catch { /* starsza przeglądarka */ }
    if (!random) {
      random = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    return base + '_' + random.replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  }

  function emptyMap() {
    return Object.create(null);
  }

  function mapFrom(value) {
    const out = emptyMap();
    if (!value || typeof value !== 'object') return out;
    Object.keys(value).forEach((key) => {
      const id = safeId(key);
      if (!id) return;
      const item = value[key];
      if (!item || typeof item !== 'object') return;
      out[id] = item;
    });
    return out;
  }

  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }

  function asTime(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function asBy(value) {
    return typeof value === 'string' ? value.slice(0, 120) : '';
  }

  function emptySync(deviceId) {
    const order = { boards: null };
    ORDER_KINDS.slice(1).forEach((kind) => { order[kind] = emptyMap(); });
    return {
      v: VERSION,
      deviceId: safeId(deviceId) || makeId('dev'),
      clock: 0,
      boards: emptyMap(),
      lists: emptyMap(),
      cards: emptyMap(),
      items: emptyMap(),
      order,
      tombstones: {
        boards: emptyMap(),
        lists: emptyMap(),
        cards: emptyMap(),
        items: emptyMap()
      }
    };
  }

  function flatten(boards) {
    const out = {
      boards: new Map(),
      boardOrder: [],
      lists: new Map(),
      listOrder: new Map(),
      cards: new Map(),
      cardOrder: new Map(),
      items: new Map(),
      itemOrder: new Map()
    };

    (Array.isArray(boards) ? boards : []).forEach((board) => {
      const boardId = safeId(board && board.id);
      if (!boardId) return;
      out.boards.set(boardId, {
        id: boardId,
        name: String(board.name == null ? '' : board.name)
      });
      out.boardOrder.push(boardId);

      (Array.isArray(board.lists) ? board.lists : []).forEach((list) => {
        const listId = safeId(list && list.id);
        if (!listId) return;
        out.lists.set(listId, {
          id: listId,
          boardId,
          name: String(list.name == null ? '' : list.name)
        });
        if (!out.listOrder.has(boardId)) out.listOrder.set(boardId, []);
        out.listOrder.get(boardId).push(listId);

        (Array.isArray(list.cards) ? list.cards : []).forEach((card) => {
          const cardId = safeId(card && card.id);
          if (!cardId) return;
          out.cards.set(cardId, {
            id: cardId,
            boardId,
            listId,
            title: String(card.title == null ? '' : card.title),
            note: String(card.note == null ? '' : card.note),
            labels: Array.isArray(card.labels) ? card.labels.map(String) : [],
            done: !!card.done,
            marker: String(card.marker || 'dash'),
            emoji: String(card.emoji || '✅'),
            createdAt: Number(card.createdAt) || 0
          });
          if (!out.cardOrder.has(listId)) out.cardOrder.set(listId, []);
          out.cardOrder.get(listId).push(cardId);

          (Array.isArray(card.checklist) ? card.checklist : []).forEach((item) => {
            const itemId = safeId(item && item.id);
            if (!itemId) return;
            out.items.set(itemId, {
              id: itemId,
              cardId,
              text: String(item.text == null ? '' : item.text),
              done: !!item.done
            });
            if (!out.itemOrder.has(cardId)) out.itemOrder.set(cardId, []);
            out.itemOrder.get(cardId).push(itemId);
          });
        });
      });
    });

    return out;
  }

  function content(record) {
    if (!record) return '';
    if (record.title !== undefined) {
      return stable({
        title: record.title,
        note: record.note,
        labels: record.labels,
        done: record.done,
        marker: record.marker,
        emoji: record.emoji,
        createdAt: record.createdAt
      });
    }
    if (record.text !== undefined) {
      return stable({ text: record.text, done: record.done });
    }
    return stable({ name: record.name });
  }

  function sameRecord(previous, current) {
    if (!previous || !current) return false;
    if (content(previous) !== content(current)) return false;
    if (previous.boardId !== current.boardId) return false;
    if (previous.listId !== current.listId) return false;
    if (previous.cardId !== current.cardId) return false;
    return true;
  }

  function ensureMap(container, kind) {
    if (!container[kind] || typeof container[kind] !== 'object') container[kind] = emptyMap();
    container[kind] = mapFrom(container[kind]);
    return container[kind];
  }

  function ensureState(state, options) {
    const opts = options || {};
    if (!state || typeof state !== 'object') state = { boards: [] };
    if (!Array.isArray(state.boards)) state.boards = [];

    if (!state.sync || typeof state.sync !== 'object') state.sync = {};
    const sync = state.sync;
    sync.v = VERSION;
    sync.deviceId = safeId(opts.deviceId || sync.deviceId) || makeId('dev');
    sync.clock = asTime(sync.clock);
    sync.boards = mapFrom(sync.boards);
    sync.lists = mapFrom(sync.lists);
    sync.cards = mapFrom(sync.cards);
    sync.items = mapFrom(sync.items);
    if (!sync.order || typeof sync.order !== 'object') sync.order = {};
    ['lists', 'cards', 'items'].forEach((kind) => {
      sync.order[kind] = mapFrom(sync.order[kind]);
    });
    if (!sync.order.boards || typeof sync.order.boards !== 'object') sync.order.boards = null;
    if (!sync.tombstones || typeof sync.tombstones !== 'object') sync.tombstones = {};
    TOMB_KINDS.forEach((kind) => {
      sync.tombstones[kind] = mapFrom(sync.tombstones[kind]);
    });

    const inferred = asTime(opts.time);
    const flat = flatten(state.boards);
    let clock = sync.clock;

    function metaFor(map, id) {
      const existing = map[id];
      if (existing && typeof existing === 'object') {
        const meta = {
          t: asTime(existing.t),
          by: asBy(existing.by) || sync.deviceId
        };
        if (!meta.t && inferred) meta.t = inferred;
        if (!meta.by) meta.by = sync.deviceId;
        map[id] = meta;
        clock = Math.max(clock, meta.t);
        return meta;
      }
      const meta = { t: inferred, by: sync.deviceId };
      map[id] = meta;
      clock = Math.max(clock, meta.t);
      return meta;
    }

    flat.boards.forEach((record, id) => metaFor(sync.boards, id));
    flat.lists.forEach((record, id) => metaFor(sync.lists, id));
    flat.cards.forEach((record, id) => metaFor(sync.cards, id));
    flat.items.forEach((record, id) => metaFor(sync.items, id));

    function normalizeOrder(existing, ids) {
      const source = existing && typeof existing === 'object' ? existing : {};
      const chosen = Array.isArray(source.ids)
        ? source.ids.map(safeId).filter(Boolean)
        : ids.slice();
      const result = { t: asTime(source.t), by: asBy(source.by), ids: chosen };
      clock = Math.max(clock, result.t);
      return result;
    }

    sync.order.boards = normalizeOrder(sync.order.boards, flat.boardOrder);
    ['lists', 'cards', 'items'].forEach((kind) => {
      const parents = kind === 'lists'
        ? Array.from(flat.boards.keys())
        : kind === 'cards'
          ? Array.from(flat.lists.keys())
          : Array.from(flat.cards.keys());
      const orderMap = sync.order[kind];
      const wanted = emptyMap();
      parents.forEach((parentId) => {
        const ids = kind === 'lists'
          ? (flat.listOrder.get(parentId) || [])
          : kind === 'cards'
            ? (flat.cardOrder.get(parentId) || [])
            : (flat.itemOrder.get(parentId) || []);
        wanted[parentId] = normalizeOrder(orderMap[parentId], ids);
      });
      sync.order[kind] = wanted;
    });

    TOMB_KINDS.forEach((kind) => {
      const map = sync.tombstones[kind];
      Object.keys(map).forEach((id) => {
        const meta = map[id];
        const t = asTime(meta && meta.t);
        if (!t) { delete map[id]; return; }
        map[id] = { t, by: asBy(meta && meta.by) };
        clock = Math.max(clock, t);
      });
    });

    sync.clock = clock;
    return state;
  }

  function tick(sync) {
    const now = Date.now();
    sync.clock = Math.max(now, asTime(sync.clock) + 1);
    return sync.clock;
  }

  function putTombstone(sync, kind, id, t, by) {
    const map = ensureMap(sync.tombstones, kind);
    map[id] = { t, by };
  }

  function mark(state, previousBoards, options) {
    if (!state || !state.sync) return state;
    const opts = options || {};
    const by = safeId(opts.by || state.sync.deviceId) || state.sync.deviceId;
    const sync = state.sync;
    const previous = flatten(previousBoards);
    const current = flatten(state.boards);

    sync.boards = mapFrom(sync.boards);
    sync.lists = mapFrom(sync.lists);
    sync.cards = mapFrom(sync.cards);
    sync.items = mapFrom(sync.items);
    sync.tombstones = sync.tombstones && typeof sync.tombstones === 'object' ? sync.tombstones : {};
    TOMB_KINDS.forEach((kind) => { sync.tombstones[kind] = mapFrom(sync.tombstones[kind]); });
    sync.order = sync.order && typeof sync.order === 'object' ? sync.order : {};
    ['lists', 'cards', 'items'].forEach((kind) => { sync.order[kind] = mapFrom(sync.order[kind]); });

    function update(kind, map, before, after) {
      const metaMap = ensureMap(sync, kind);
      after.forEach((record, id) => {
        const old = before.get(id);
        if (!old) {
          /* Nowy element. Jeśli wcześniej usunięto element o tym samym id,
             świadome utworzenie go ponownie ma pierwszeństwo. */
          delete sync.tombstones[kind][id];
          metaMap[id] = { t: tick(sync), by };
          return;
        }
        if (!sameRecord(old, record)) {
          metaMap[id] = { t: tick(sync), by };
        } else if (!metaMap[id]) {
          metaMap[id] = { t: tick(sync), by };
        }
      });
      before.forEach((record, id) => {
        if (after.has(id)) return;
        putTombstone(sync, kind, id, tick(sync), by);
        delete metaMap[id];
      });
    }

    update('boards', sync.boards, previous.boards, current.boards);
    update('lists', sync.lists, previous.lists, current.lists);
    update('cards', sync.cards, previous.cards, current.cards);
    update('items', sync.items, previous.items, current.items);

    function orderChanged(before, after) {
      if (before.length !== after.length) return true;
      for (let i = 0; i < before.length; i += 1) {
        if (before[i] !== after[i]) return true;
      }
      return false;
    }

    function setOrder(kind, parentId, before, after) {
      if (!orderChanged(before, after)) return;
      sync.order[kind][parentId] = { t: tick(sync), by, ids: after.slice() };
    }

    if (orderChanged(previous.boardOrder, current.boardOrder) || !sync.order.boards) {
      sync.order.boards = { t: tick(sync), by, ids: current.boardOrder.slice() };
    }

    const listParents = new Set([...previous.listOrder.keys(), ...current.listOrder.keys()]);
    listParents.forEach((boardId) => {
      if (!current.boards.has(boardId)) return;
      setOrder('lists', boardId, previous.listOrder.get(boardId) || [], current.listOrder.get(boardId) || []);
    });

    const cardParents = new Set([...previous.cardOrder.keys(), ...current.cardOrder.keys()]);
    cardParents.forEach((listId) => {
      if (!current.lists.has(listId)) return;
      setOrder('cards', listId, previous.cardOrder.get(listId) || [], current.cardOrder.get(listId) || []);
    });

    const itemParents = new Set([...previous.itemOrder.keys(), ...current.itemOrder.keys()]);
    itemParents.forEach((cardId) => {
      if (!current.cards.has(cardId)) return;
      setOrder('items', cardId, previous.itemOrder.get(cardId) || [], current.itemOrder.get(cardId) || []);
    });

    /* Usuń kolejność rodziców, których już nie ma. */
    Object.keys(sync.order.lists).forEach((id) => { if (!current.boards.has(id)) delete sync.order.lists[id]; });
    Object.keys(sync.order.cards).forEach((id) => { if (!current.lists.has(id)) delete sync.order.cards[id]; });
    Object.keys(sync.order.items).forEach((id) => { if (!current.cards.has(id)) delete sync.order.items[id]; });

    return state;
  }

  function metaOf(map, id) {
    const meta = map && map[id];
    return {
      t: asTime(meta && meta.t),
      by: asBy(meta && meta.by)
    };
  }

  function choose(recordA, recordB) {
    if (!recordA) return recordB;
    if (!recordB) return recordA;
    if (recordA.t !== recordB.t) return recordA.t > recordB.t ? recordA : recordB;
    if (recordA.by !== recordB.by) return recordA.by > recordB.by ? recordA : recordB;
    return content(recordA.data) >= content(recordB.data) ? recordA : recordB;
  }

  function chooseOrder(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.t !== b.t) return a.t > b.t ? a : b;
    if (a.by !== b.by) return a.by > b.by ? a : b;
    return stable(a.ids) >= stable(b.ids) ? a : b;
  }

  function records(state, kind) {
    const flat = flatten(state.boards);
    const map = new Map();
    if (kind === 'boards') {
      flat.boards.forEach((record, id) => map.set(id, Object.assign({ data: record }, metaOf(state.sync.boards, id))));
    } else if (kind === 'lists') {
      flat.lists.forEach((record, id) => map.set(id, Object.assign({ data: record }, metaOf(state.sync.lists, id))));
    } else if (kind === 'cards') {
      flat.cards.forEach((record, id) => map.set(id, Object.assign({ data: record }, metaOf(state.sync.cards, id))));
    } else {
      flat.items.forEach((record, id) => map.set(id, Object.assign({ data: record }, metaOf(state.sync.items, id))));
    }
    return map;
  }

  function tombstones(state, kind) {
    const out = new Map();
    const map = state.sync && state.sync.tombstones && state.sync.tombstones[kind];
    if (!map || typeof map !== 'object') return out;
    Object.keys(map).forEach((id) => {
      const safe = safeId(id);
      if (!safe) return;
      const meta = metaOf(map, safe);
      if (meta.t) out.set(safe, meta);
    });
    return out;
  }

  function tombFor(a, b, kind, id) {
    const first = a.get(id);
    const second = b.get(id);
    if (!first) return second || null;
    if (!second) return first;
    if (first.t !== second.t) return first.t > second.t ? first : second;
    if (first.by !== second.by) return first.by > second.by ? first : second;
    return first;
  }

  function mergeOrder(a, b, parentId, kind, liveIds, recordMap) {
    const aOrder = kind === 'boards'
      ? a.sync.order.boards
      : a.sync.order[kind] && a.sync.order[kind][parentId];
    const bOrder = kind === 'boards'
      ? b.sync.order.boards
      : b.sync.order[kind] && b.sync.order[kind][parentId];
    const chosen = chooseOrder(aOrder, bOrder);
    const ids = [];
    const seen = new Set();
    const sourceIds = chosen && Array.isArray(chosen.ids) ? chosen.ids : [];
    sourceIds.forEach((id) => {
      const safe = safeId(id);
      if (!safe || seen.has(safe) || !liveIds.has(safe)) return;
      seen.add(safe);
      ids.push(safe);
    });
    Array.from(liveIds)
      .filter((id) => !seen.has(id))
      .sort((idA, idB) => {
        const metaA = recordMap.get(idA) || { t: 0, by: '' };
        const metaB = recordMap.get(idB) || { t: 0, by: '' };
        if (metaA.t !== metaB.t) return metaA.t - metaB.t;
        return idA.localeCompare(idB);
      })
      .forEach((id) => { seen.add(id); ids.push(id); });
    return {
      t: chosen ? chosen.t : 0,
      by: chosen ? chosen.by : '',
      ids
    };
  }

  function merge(localState, remoteState, options) {
    const opts = options || {};
    const a = ensureState(clone(localState || { boards: [] }), {
      deviceId: (localState && localState.sync && localState.sync.deviceId) || opts.deviceId || 'local',
      time: 0
    });
    const b = ensureState(clone(remoteState || { boards: [] }), {
      deviceId: (remoteState && remoteState.sync && remoteState.sync.deviceId) || opts.remoteDeviceId || 'remote',
      time: 0
    });
    const deviceId = safeId(opts.deviceId || a.sync.deviceId) || a.sync.deviceId;

    const aBoards = records(a, 'boards');
    const bBoards = records(b, 'boards');
    const aLists = records(a, 'lists');
    const bLists = records(b, 'lists');
    const aCards = records(a, 'cards');
    const bCards = records(b, 'cards');
    const aItems = records(a, 'items');
    const bItems = records(b, 'items');

    const tombstonesA = {};
    const tombstonesB = {};
    TOMB_KINDS.forEach((kind) => {
      tombstonesA[kind] = tombstones(a, kind);
      tombstonesB[kind] = tombstones(b, kind);
    });

    function isDeleted(kind, id) {
      return !!tombFor(tombstonesA[kind], tombstonesB[kind], kind, id);
    }

    function union(one, two) {
      const ids = new Map();
      one.forEach((record, id) => ids.set(id, true));
      two.forEach((record, id) => ids.set(id, true));
      return Array.from(ids.keys());
    }

    const boards = new Map();
    const boardMeta = emptyMap();
    union(aBoards, bBoards).forEach((id) => {
      if (isDeleted('boards', id)) return;
      const chosen = choose(aBoards.get(id), bBoards.get(id));
      if (!chosen) return;
      boards.set(id, { id, name: chosen.data.name });
      boardMeta[id] = { t: chosen.t, by: chosen.by };
    });

    const lists = new Map();
    const listMeta = emptyMap();
    union(aLists, bLists).forEach((id) => {
      if (isDeleted('lists', id)) return;
      const chosen = choose(aLists.get(id), bLists.get(id));
      if (!chosen || !boards.has(chosen.data.boardId)) return;
      lists.set(id, {
        id,
        boardId: chosen.data.boardId,
        name: chosen.data.name
      });
      listMeta[id] = { t: chosen.t, by: chosen.by };
    });

    const cards = new Map();
    const cardMeta = emptyMap();
    union(aCards, bCards).forEach((id) => {
      if (isDeleted('cards', id)) return;
      const chosen = choose(aCards.get(id), bCards.get(id));
      if (!chosen || !lists.has(chosen.data.listId)) return;
      const list = lists.get(chosen.data.listId);
      const data = Object.assign({}, chosen.data, { boardId: list.boardId });
      cards.set(id, data);
      cardMeta[id] = { t: chosen.t, by: chosen.by };
    });

    const items = new Map();
    const itemMeta = emptyMap();
    union(aItems, bItems).forEach((id) => {
      if (isDeleted('items', id)) return;
      const chosen = choose(aItems.get(id), bItems.get(id));
      if (!chosen || !cards.has(chosen.data.cardId)) return;
      items.set(id, chosen.data);
      itemMeta[id] = { t: chosen.t, by: chosen.by };
    });

    const boardsOrder = mergeOrder(a, b, null, 'boards', new Set(boards.keys()), boardMeta);
    const boardListIds = new Map();
    boards.forEach((board) => boardListIds.set(board.id, new Set()));
    lists.forEach((list) => {
      if (boardListIds.has(list.boardId)) boardListIds.get(list.boardId).add(list.id);
    });
    const listOrders = emptyMap();
    boards.forEach((board) => {
      listOrders[board.id] = mergeOrder(a, b, board.id, 'lists', boardListIds.get(board.id), listMeta);
    });

    const listCardIds = new Map();
    lists.forEach((list) => listCardIds.set(list.id, new Set()));
    cards.forEach((card) => {
      if (listCardIds.has(card.listId)) listCardIds.get(card.listId).add(card.id);
    });
    const cardOrders = emptyMap();
    lists.forEach((list) => {
      cardOrders[list.id] = mergeOrder(a, b, list.id, 'cards', listCardIds.get(list.id), cardMeta);
    });

    const cardItemIds = new Map();
    cards.forEach((card) => cardItemIds.set(card.id, new Set()));
    items.forEach((item) => {
      if (cardItemIds.has(item.cardId)) cardItemIds.get(item.cardId).add(item.id);
    });
    const itemOrders = emptyMap();
    cards.forEach((card) => {
      itemOrders[card.id] = mergeOrder(a, b, card.id, 'items', cardItemIds.get(card.id), itemMeta);
    });

    const mergedBoards = [];
    boardsOrder.ids.forEach((boardId) => {
      const board = boards.get(boardId);
      if (!board) return;
      const listIds = listOrders[boardId] ? listOrders[boardId].ids : [];
      const boardLists = [];
      listIds.forEach((listId) => {
        const list = lists.get(listId);
        if (!list) return;
        const cardIds = cardOrders[listId] ? cardOrders[listId].ids : [];
        const listCards = [];
        cardIds.forEach((cardId) => {
          const card = cards.get(cardId);
          if (!card) return;
          const itemIds = itemOrders[cardId] ? itemOrders[cardId].ids : [];
          const checklist = itemIds.map((itemId) => items.get(itemId)).filter(Boolean).map((item) => ({
            id: item.id,
            text: item.text,
            done: item.done
          }));
          listCards.push({
            id: card.id,
            title: card.title,
            note: card.note,
            labels: card.labels.slice(),
            done: card.done,
            marker: card.marker,
            emoji: card.emoji,
            checklist,
            createdAt: card.createdAt
          });
        });
        boardLists.push({ id: list.id, name: list.name, cards: listCards });
      });
      mergedBoards.push({ id: board.id, name: board.name, lists: boardLists });
    });

    const tombstoneOut = { boards: emptyMap(), lists: emptyMap(), cards: emptyMap(), items: emptyMap() };
    let clock = Math.max(asTime(a.sync.clock), asTime(b.sync.clock));
    TOMB_KINDS.forEach((kind) => {
      const ids = new Set([...tombstonesA[kind].keys(), ...tombstonesB[kind].keys()]);
      ids.forEach((id) => {
        const tomb = tombFor(tombstonesA[kind], tombstonesB[kind], kind, id);
        if (!tomb || !tomb.t) return;
        tombstoneOut[kind][id] = { t: tomb.t, by: tomb.by };
        clock = Math.max(clock, tomb.t);
      });
    });

    function cleanMeta(metaMap, liveMap) {
      const out = emptyMap();
      liveMap.forEach((record, id) => {
        const meta = metaMap[id] || { t: 0, by: '' };
        out[id] = { t: meta.t, by: meta.by };
        clock = Math.max(clock, meta.t);
      });
      return out;
    }

    const sync = {
      v: VERSION,
      deviceId,
      clock,
      boards: cleanMeta(boardMeta, boards),
      lists: cleanMeta(listMeta, lists),
      cards: cleanMeta(cardMeta, cards),
      items: cleanMeta(itemMeta, items),
      order: {
        boards: boardsOrder,
        lists: listOrders,
        cards: cardOrders,
        items: itemOrders
      },
      tombstones: tombstoneOut
    };

    Object.keys(sync.order.lists).forEach((id) => {
      clock = Math.max(clock, sync.order.lists[id].t);
    });
    Object.keys(sync.order.cards).forEach((id) => {
      clock = Math.max(clock, sync.order.cards[id].t);
    });
    Object.keys(sync.order.items).forEach((id) => {
      clock = Math.max(clock, sync.order.items[id].t);
    });
    clock = Math.max(clock, sync.order.boards.t);
    sync.clock = clock;

    const settingsFrom = opts.settingsFrom === 'remote' ? b : a;
    let selectedBoardId = settingsFrom.selectedBoardId;
    if (!boards.has(selectedBoardId)) selectedBoardId = mergedBoards.length ? mergedBoards[0].id : null;

    return {
      version: 1,
      theme: settingsFrom.theme,
      dim: settingsFrom.dim,
      selectedBoardId,
      boards: mergedBoards,
      sync
    };
  }

  function fingerprint(state) {
    if (!state) return '';
    const sync = state.sync || {};
    return stable({
      version: state.version || 1,
      boards: state.boards || [],
      sync: {
        boards: sync.boards || {},
        lists: sync.lists || {},
        cards: sync.cards || {},
        items: sync.items || {},
        order: sync.order || {},
        tombstones: sync.tombstones || {}
      }
    });
  }

  function looksLikeState(state) {
    if (!state || typeof state !== 'object') return false;
    if (!Array.isArray(state.boards)) return false;
    if (state.boards.length > 2000) return false;
    let count = 0;
    for (const board of state.boards) {
      if (!board || typeof board !== 'object' || !Array.isArray(board.lists)) return false;
      for (const list of board.lists) {
        if (!list || typeof list !== 'object' || !Array.isArray(list.cards)) return false;
        count += list.cards.length;
        if (count > 50000) return false;
      }
    }
    return true;
  }

  return {
    VERSION,
    clone,
    makeId,
    ensure: ensureState,
    mark,
    merge,
    flatten,
    fingerprint,
    looksLikeState,
    stable
  };
});
