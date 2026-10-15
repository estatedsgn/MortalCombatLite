// Партии ботов между собой: проверка, что правила не ломаются и партии доходят до конца.
// Запуск: node tribe-isles/tools/simulate.js [партий] [игроков]
const L = require('../logic.js');
const games = +process.argv[2] || 30;
const players = +process.argv[3] || 2;
const stats = { done: 0, turns: [], wins: {}, cities: [] };
for (let g = 0; g < games; g++) {
  const s = L.newGame({ seed: 100 + g, players, allBots: true });
  const rng = L.TRIBES && Math.random;
  while (!s.over && s.turn <= 60) {
    const p = s.current;
    const ai = L.aiTurn(s, p, rng);
    let a, n = 0;
    while ((a = ai.next())) {
      const r = L.apply(s, a);
      if (!r.ok) ai.failed(a);
      if (++n > 300) throw new Error('loop');
    }
    if (!s.over) L.endTurn(s);
    s.events = [];
  }
  if (s.over) { stats.done++; stats.wins[s.winner] = (stats.wins[s.winner] || 0) + 1; }
  stats.turns.push(s.turn);
  stats.cities.push(s.cities.filter((c) => c.owner >= 0).length + '/' + s.cities.length);
}
console.log('игроков', players, 'партий', games, 'завершено за ≤60 ходов', stats.done, 'победы', stats.wins);
console.log('ходы', stats.turns.join(' '));
console.log('города', stats.cities.slice(0, 12).join(' '));
