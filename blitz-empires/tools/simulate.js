// Прогон партий бот против бота: проверка правил и грубый баланс.
// Запуск: node blitz-empires/tools/simulate.js [кол-во партий] [бот A] [бот B]
const E = require('../engine.js');
const AI = require('../ai.js');

const games = +process.argv[2] || 200;
const botA = AI.BOTS.find((b) => b.id === (process.argv[3] || 'strateg'));
const botB = AI.BOTS.find((b) => b.id === (process.argv[4] || 'strateg'));
const stats = { wins: [0, 0], draws: 0, reasons: {}, scores: [], firstWins: 0, levels: [], units: [] };

for (let g = 0; g < games; g++) {
  const rng = E.mulberry32(1000 + g);
  const s = E.newGame({ seed: 5000 + g });
  const bots = g % 2 ? [botB, botA] : [botA, botB];
  let guard = 0;
  while (!s.over && guard++ < 500) {
    const p = s.turn;
    const turn = AI.createTurn(s, p, bots[p], rng);
    let a;
    while ((a = turn.next())) {
      const r = AI.apply(s, a);
      if (!r.ok) turn.failed(a);
    }
    if (!s.over) E.endTurn(s);
  }
  if (!s.over) throw new Error('game did not finish');
  const sc = [E.score(s, 0), E.score(s, 1)];
  stats.scores.push(sc);
  stats.reasons[s.endReason] = (stats.reasons[s.endReason] || 0) + 1;
  if (s.winner === 'draw') stats.draws++;
  else {
    const winnerIsA = (s.winner === 0) === (g % 2 === 0);
    stats.wins[winnerIsA ? 0 : 1]++;
    if (s.winner === 0) stats.firstWins++;
  }
  stats.levels.push(E.ownedCities(s, 0).reduce((a, c) => a + c.level, 0));
  stats.units.push(s.units.length);
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`${botA.name} vs ${botB.name}, партий: ${games}`);
console.log('победы A/B:', stats.wins, 'ничьи:', stats.draws, 'первый ход побеждает:', stats.firstWins);
console.log('причины:', stats.reasons);
console.log('средний счёт:', avg(stats.scores.map((x) => x[0])), avg(stats.scores.map((x) => x[1])));
console.log('сумма уровней у синих:', avg(stats.levels), 'юнитов в конце:', avg(stats.units));
