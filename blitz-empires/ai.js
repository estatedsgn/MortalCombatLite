// Блиц Империй — соперники-боты.
// Бот выдаёт по одному действию за раз, чтобы интерфейс мог показать каждый ход,
// а часы бота тикали так же, как у человека.
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.BlitzEngine;
  const { idx, xy, UNITS, KING } = E;

  const BOTS = [
    { id: 'novice', name: 'Новобранец', rating: 800, think: [300, 520], mistake: 0.35, safety: false, aggression: 0.2 },
    { id: 'tactic', name: 'Тактик', rating: 1150, think: [210, 360], mistake: 0.14, safety: true, aggression: 0.45 },
    { id: 'strateg', name: 'Стратег', rating: 1450, think: [150, 260], mistake: 0.04, safety: true, aggression: 0.6 },
    { id: 'chronos', name: 'Хронос', rating: 1750, think: [90, 170], mistake: 0, safety: true, aggression: 0.8 },
  ];

  const TECH_PLAN = ['agriculture', 'riding', 'mining', 'milling', 'fishing', 'archery', 'mechanics', 'trade', 'chivalry', 'chrono'];

  function createTurn(s, p, bot, rng) {
    rng = rng || Math.random;
    const ctx = { skip: new Set(), noBuy: false, noBuild: false, noTech: false };
    let steps = 0;
    return {
      next: () => (steps++ > 60 ? null : nextAction(s, p, bot, rng, ctx)),
      // Действие не прошло проверку движка — больше не тратим на него ход.
      failed: (a) => {
        if (a.type === 'move') ctx.skip.add(a.unit);
        else { ctx.noBuy = true; ctx.noBuild = true; ctx.noTech = true; }
      },
    };
  }

  function nextAction(s, p, bot, rng, ctx) {
    if (s.over || s.turn !== p) return null;
    const P = s.players[p];
    const enemy = 1 - p;
    const myCities = E.ownedCities(s, p);

    // 1. Награды за уровень.
    for (const c of myCities) {
      if (c.pending.length) return { type: 'level', city: c.id, opt: chooseLevelOpt(s, c, bot, rng) };
    }

    const active = s.units.filter((u) => u.owner === p && !u.moved && !u.fresh && !ctx.skip.has(u.id));
    const enemyHits = E.attackMap(s, enemy);
    const myHits = E.attackMap(s, p);
    const cap = E.capitalOf(s, p);

    // 2. Шах: враг стоит на нашей столице — бить любой ценой.
    if (cap) {
      const intruder = E.unitAt(s, cap.x, cap.y);
      if (intruder && intruder.owner !== p) {
        for (const u of active) {
          if (E.unitMoves(s, u).some((m) => m.x === cap.x && m.y === cap.y)) return { type: 'move', unit: u.id, x: cap.x, y: cap.y };
        }
      }
    }

    // 3. Взятия.
    let best = null;
    for (const u of active) {
      for (const m of E.unitMoves(s, u)) {
        if (!m.capture) continue;
        const target = E.unitAt(s, m.x, m.y);
        let gain = UNITS[target.type].value;
        const city = E.cityAt(s, m.x, m.y);
        if (city && city.owner === p) gain += 6; // враг сидит на нашем городе
        if (city && city.owner === enemy && city.walls) gain -= UNITS[u.type].value;
        else if (bot.safety && enemyHits[idx(m.x, m.y)] > 0) {
          const defended = myHits[idx(m.x, m.y)] > 1; // мы бьём эту клетку кем-то ещё
          gain -= UNITS[u.type].value * (defended ? 0.5 : 1);
        }
        if (cap && E.cheb(m.x, m.y, cap.x, cap.y) <= 2) gain += 2;
        if (!best || gain > best.gain) best = { gain, u, m };
      }
    }
    if (best && best.gain > 0 && rng() >= bot.mistake) return { type: 'move', unit: best.u.id, x: best.m.x, y: best.m.y };

    // 4. Защита столицы: враг может встать на неё следующим ходом.
    if (cap && enemyHits[idx(cap.x, cap.y)] > 0 && !E.unitAt(s, cap.x, cap.y)) {
      for (const u of active) {
        if (E.unitMoves(s, u).some((m) => m.x === cap.x && m.y === cap.y)) return { type: 'move', unit: u.id, x: cap.x, y: cap.y };
      }
      const t = bestAffordableUnit(s, p, cap.id);
      if (t) return { type: 'buy', city: cap.id, unit: t };
    }

    // 5. Армия: нужна для захвата деревень и обороны.
    const myUnits = s.units.filter((u) => u.owner === p).length;
    const neutral = s.cities.filter((c) => c.owner === -1).length;
    const enemyUnits = s.units.filter((u) => u.owner === enemy).length;
    let wanted = Math.min(E.unitCap(s, p), Math.max(2, Math.ceil(neutral / 2) + 1, Math.round(enemyUnits * (0.6 + bot.aggression * 0.6))));
    if (s.round > s.maxRounds - 3) wanted = Math.min(wanted, myUnits); // в конце войска не дают очков
    if (!ctx.noBuy && myUnits < wanted) {
      const spots = myCities.filter((c) => !E.unitAt(s, c.x, c.y)).sort((a, b) => distToEnemy(s, a, p) - distToEnemy(s, b, p));
      for (const c of spots) {
        const t = bestAffordableUnit(s, p, c.id);
        if (t) return { type: 'buy', city: c.id, unit: t };
      }
    }

    // 6. Экономика: лучшая постройка по отдаче на золото.
    if (!ctx.noBuild) {
      const b = bestBuild(s, p, bot, rng);
      if (b) return { type: 'build', x: b.x, y: b.y, kind: b.kind };
    }

    // 7. Технологии.
    if (!ctx.noTech) {
      for (const t of TECH_PLAN) {
        if (E.hasTech(s, p, t)) continue;
        if (!E.canResearch(s, t).ok) continue;
        if (!techUseful(s, p, t)) continue;
        if (s.round >= s.maxRounds - 1 && P.gold < E.techCost(s, p, t) + 2) continue;
        return { type: 'research', tech: t };
      }
    }

    // 8. Ходы юнитов.
    for (const u of active) {
      const a = planMove(s, p, u, bot, rng, enemyHits, myHits);
      ctx.skip.add(u.id);
      if (a) return a;
    }

    // 9. Лишнее золото — в армию, если есть место.
    if (!ctx.noBuy && s.round < s.maxRounds - 2) {
      for (const c of myCities) {
        if (E.unitAt(s, c.x, c.y)) continue;
        const t = bestAffordableUnit(s, p, c.id);
        if (t && P.gold >= UNITS[t].cost + 3) { ctx.noBuy = true; return { type: 'buy', city: c.id, unit: t }; }
      }
    }
    return null;
  }

  function chooseLevelOpt(s, c, bot, rng) {
    if (rng() < bot.mistake) return rng() < 0.5 ? 0 : 1;
    const left = s.maxRounds - s.round;
    switch (Math.min(c.pending[0], 5)) {
      case 2: return left >= 5 ? 0 : 1;
      case 3: return c.capital || nearestEnemyUnit(s, c) <= 3 ? 0 : 1;
      case 4: return left >= 6 ? 0 : 1;
      default: return left >= 9 ? 0 : 1;
    }
  }

  function nearestEnemyUnit(s, c) {
    let d = 99;
    for (const u of s.units) if (u.owner !== c.owner) d = Math.min(d, E.cheb(u.x, u.y, c.x, c.y));
    return d;
  }

  function distToEnemy(s, c, p) {
    const ec = E.capitalOf(s, 1 - p);
    return ec ? E.cheb(c.x, c.y, ec.x, ec.y) : 0;
  }

  function bestAffordableUnit(s, p, cityId) {
    const prefs = s.round <= 4 ? ['rider', 'warrior'] : ['queen', 'rook', 'archer', 'rider', 'warrior'];
    for (const t of prefs) if (E.canBuy(s, cityId, t).ok) return t;
    return null;
  }

  function techUseful(s, p, t) {
    const builds = { agriculture: 'farm', mining: 'mine', fishing: 'fish', milling: 'mill', trade: 'market' };
    if (!builds[t]) return t !== 'chrono' || s.players[p].clock < 25000;
    let n = 0;
    for (let i = 0; i < E.N; i++) {
      if (E.tileOwner(s, i) !== p) continue;
      if (E.buildKindsFor(s, i).includes(builds[t])) n++;
    }
    return n > 0 || t === 'milling'; // мельницы — путь к торговле
  }

  function bestBuild(s, p, bot, rng) {
    const P = s.players[p];
    const left = s.maxRounds - s.round + 1;
    let best = null;
    for (let i = 0; i < E.N; i++) {
      if (E.tileOwner(s, i) !== p) continue;
      const [x, y] = xy(i);
      for (const kind of E.buildKindsFor(s, i)) {
        if (!E.canBuild(s, x, y, kind).ok) continue;
        const city = s.cities[s.tiles[i].terr];
        const pop = E.buildPop(s, x, y, kind);
        let incomeGain = kind === 'mine' ? 1 : 0;
        if (kind === 'market') incomeGain = Math.min(4, countAdj(s, i, p, ['farm', 'mine', 'mill']));
        if (kind === 'tower' && P.clock > 25000) continue;
        if (kind === 'mill' && pop < 2) continue;
        if (kind === 'market' && incomeGain < 2) continue;
        const levelUp = city.pop + pop >= city.level + 1 ? 1.5 : 0;
        const value = (pop + levelUp + incomeGain * Math.min(left, 8) * 0.35 + E.SCORE.improvement * 0.1) / E.BUILDS[kind].cost;
        const noisy = value * (1 + (rng() - 0.5) * bot.mistake);
        if (!best || noisy > best.value) best = { x, y, kind, value: noisy };
      }
    }
    return best && best.value > 0.18 ? best : null;
  }

  function countAdj(s, i, p, imps) {
    const [x, y] = xy(i);
    let n = 0;
    for (const [dx, dy] of KING) {
      if (!E.inside(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (imps.includes(s.tiles[j].imp) && E.tileOwner(s, j) === p) n++;
    }
    return n;
  }

  // Расстояние в ходах конкретного юнита (без учёта других юнитов).
  function distanceMap(s, u, from) {
    const d = new Int16Array(E.N).fill(99);
    const q = [from];
    d[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const [x, y] = xy(i);
      const ghost = { type: u.type, owner: -3, x, y };
      for (const m of movesIgnoringUnits(s, ghost)) {
        const j = idx(m.x, m.y);
        if (d[j] <= d[i] + 1) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    return d;
  }

  function movesIgnoringUnits(s, g) {
    const saved = s.units;
    s.units = [];
    const m = E.unitMoves(s, g);
    s.units = saved;
    return m;
  }

  function planMove(s, p, u, bot, rng, enemyHits, myHits) {
    const here = E.cityAt(s, u.x, u.y);
    // Стоим на чужом городе — ждём начала хода, чтобы захватить.
    if (here && here.owner !== p) return null;
    const cap = E.capitalOf(s, p);
    const threat = cap && s.units.some((e) => e.owner !== p && E.cheb(e.x, e.y, cap.x, cap.y) <= 3);
    if (here && here === cap && threat) return null; // держим оборону

    const moves = E.unitMoves(s, u).filter((m) => !m.capture);
    if (!moves.length) return null;
    if (rng() < bot.mistake * 0.5) {
      const m = moves[(rng() * moves.length) | 0];
      return { type: 'move', unit: u.id, x: m.x, y: m.y };
    }

    // Цели: нейтральные деревни, вражеские города (агрессия), своя столица при угрозе.
    const targets = [];
    for (const c of s.cities) {
      if (c.owner === p) continue;
      const occ = E.unitAt(s, c.x, c.y);
      if (occ && occ.owner === p) continue;
      let w = c.owner === -1 ? 1 : (c.capital ? 0.6 + bot.aggression : 0.4 + bot.aggression * 0.6);
      if (c.owner !== -1 && s.round < 4) w *= 0.4;
      targets.push({ i: idx(c.x, c.y), w });
    }
    if (threat && cap && !E.unitAt(s, cap.x, cap.y)) targets.push({ i: idx(cap.x, cap.y), w: 2.2 });
    for (const e of s.units) if (e.owner !== p) targets.push({ i: idx(e.x, e.y), w: 0.25 + bot.aggression * 0.35 });
    if (!targets.length) return null;

    const fromHere = distanceMap(s, u, idx(u.x, u.y));
    let goal = null;
    for (const t of targets) {
      const d = fromHere[t.i];
      if (d >= 99) continue;
      const score = t.w / (1 + d);
      if (!goal || score > goal.score) goal = { i: t.i, score };
    }
    if (!goal) return null;
    const toGoal = distanceMap(s, u, goal.i);
    const cur = toGoal[idx(u.x, u.y)];
    let bestMove = null;
    for (const m of moves) {
      const j = idx(m.x, m.y);
      let v = cur - toGoal[j];
      if (bot.safety && enemyHits[j] > 0) {
        const covered = myHits[j] > 0;
        v -= covered && UNITS[u.type].value <= 3 ? 0.6 : 2.5;
      }
      if (j === goal.i) v += 1;
      if (!bestMove || v > bestMove.v) bestMove = { m, v };
    }
    if (!bestMove || bestMove.v <= 0) return null;
    return { type: 'move', unit: u.id, x: bestMove.m.x, y: bestMove.m.y };
  }

  function apply(s, a) {
    switch (a.type) {
      case 'level': return E.chooseLevel(s, a.city, a.opt);
      case 'move': return E.move(s, a.unit, a.x, a.y);
      case 'buy': return E.buy(s, a.city, a.unit);
      case 'build': return E.build(s, a.x, a.y, a.kind);
      case 'research': return E.research(s, a.tech);
    }
    return { ok: false, error: 'unknown' };
  }

  const api = { BOTS, createTurn, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlitzAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
