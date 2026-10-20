'use strict';
/* Tablice, które są gotowe przy pierwszym uruchomieniu */

window.Seed = (function () {
  'use strict';

  let counter = 0;
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const item = (text, done) => ({ id: uid('i'), text, done: !!done });

  const card = (title, opts = {}) => ({
    id: uid('c'),
    title,
    note: opts.note || '',
    labels: opts.labels || [],
    done: !!opts.done,
    marker: opts.marker || 'dash',
    checklist: opts.items ? opts.items.map(([t, d]) => item(t, d)) : [],
    createdAt: Date.now()
  });

  const list = (name, cards) => ({ id: uid('l'), name, cards });

  const board = (name, lists) => ({ id: uid('b'), name, lists });

  function create() {
    return {
      version: 1,
      theme: 'pastel',
      dim: 0,
      selectedBoardId: null,
      boards: [
        board('🛒 Lista zakupów', [
          list('Warzywa i owoce', [
            card('Do kupienia na tydzień', {
              items: [['Pomidor', 1], ['Ogórek', 1], ['Cebula', 0], ['Papryka', 0], ['Marchew', 0]]
            })
          ]),
          list('Nabój', [
            card('Wiejczyca 1 l', { labels: ['czerwony'] }),
            card('Chleb', { labels: ['pomarańczowy'] }),
            card('Mleko 2%', { labels: ['pomarańczowy'] }),
            card('Jajka (10 szt.)'),
            card('Masło', { note: 'Zwykłe, 82% tłuszczu.' })
          ]),
          list('W domu jest', [
            card('Sól', { done: true }),
            card('Przyprawy', { done: true }),
            card('Kawa', { done: true })
          ])
        ]),

        board('✨ Lista marzeń', [
          list('Marzenia i plany', [
            card('Podróż do Japonii', {
              labels: ['różowy'],
              note: 'Wiosną, żeby zobaczyć wiśnie.',
              items: [['Zebrać oszczędności', 0], ['Wybrać termin', 0], ['Rezerwacja lotu', 0], ['Hotel w Tokio', 0]]
            }),
            card('Nauczyć się grać na pianinie', { labels: ['fioletowy'] }),
            card('Zaadoptować kota 🐱', { labels: ['żółty'] }),
            card('Założyć własny blog'),
            card('Kurs malarstwa')
          ])
        ]),

        board('📚 Książki do przeczytania', [
          list('Chcę przeczytać', [
            card('Wiedźmin — Andrzej Sapkowski', { labels: ['niebieski'], items: [['Księga 1', 1], ['Księga 2', 0], ['Księga 3', 0]] }),
            card('Dune — Frank Herbert', { labels: ['pomarańczowy'] }),
            card('Mały Księgo — Małgorzata Musierowicz', { labels: ['różowy'] }),
            card('Rok 1984 — George Orwell', { labels: ['szary'] }),
            card('Project Hail Mary — Andy Weir', { labels: ['zielony'] })
          ]),
          list('Przeczytane', [
            card('Mały Księgo — Małgorzata Musierowicz', { done: true })
          ])
        ]),

        board('🧠 Rzeczy do nauczenia się', [
          list('Do nauki', [
            card('Excel — podstawy', {
              labels: ['zielony'],
              marker: 'numeric',
              items: [['Wstawianie tabel', 1], ['Wykresy', 0], ['Formatowanie warunkowe', 0], ['Skróty klawiszowe', 0]]
            }),
            card('JavaScript — pierwsze kroki', {
              labels: ['turkusowy'],
              marker: 'emoji',
              items: [['Zmienne', 1], ['Funkcje', 0], ['Tablice', 0], ['Obiekty', 0], ['Praca z DOM', 0]]
            }),
            card('Angielski — 500 najczęstszych słów', {
              labels: ['turkusowy', 'żółty'],
              marker: 'dot',
              items: [['Codziennie 10 nowych słów', 0], ['Powtórki w piątek', 0]]
            })
          ])
        ])
      ]
    };
  }

  return { create, uid };
})();