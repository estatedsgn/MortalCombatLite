// Острова Племён — правила игры и ИИ.
// Чистая логика без DOM и без графики: можно гонять в Node (tools/simulate.js)
// и позже перенести на сервер для сетевой игры.
(function (root) {
  'use strict';

  // ---------- Справочники ----------

  const TRIBES = [
    { id: 0, name: 'Азуры', color: '#3f7fe0', syl: ['ла', 'ви', 'ар', 'не', 'со', 'ри', 'та', 'эль'] },
    { id: 1, name: 'Кармины', color: '#d9443a', syl: ['кар', 'до', 'ру', 'ма', 'гор', 'ба', 'зен', 'ок'] },
    { id: 2, name: 'Солары', color: '#e6b12a', syl: ['са', 'ло', 'ун', 'ди', 'ха', 'ми', 'ра', 'ку'] },
    { id: 3, name: 'Виолы', color: '#8e58d6', syl: ['ви', 'ол', 'эн', 'та', 'ли', 'ус', 'фе', 'ран'] },
  ];

  const UNITS = {
    warrior: { name: 'Воин', cost: 2, atk: 2, def: 2, move: 1, range: 1, hp: 10, tech: null },
    rider: { name: 'Всадник', cost: 3, atk: 2, def: 1, move: 2, range: 1, hp: 10, tech: 'riding' },
    archer: { name: 'Лучник', cost: 3, atk: 2, def: 1, move: 1, range: 2, hp: 10, tech: 'archery' },
    defender: { name: 'Защитник', cost: 3, atk: 1, def: 3, move: 1, range: 1, hp: 15, tech: 'strategy' },
    swordsman: { name: 'Мечник', cost: 5, atk: 3, def: 3, move: 1, range: 1, hp: 15, tech: 'smithery' },
    catapult: { name: 'Катапульта', cost: 8, atk: 4, def: 0, move: 1, range: 3, hp: 10, tech: 'mathematics' },
    knight: { name: 'Рыцарь', cost: 8, atk: 3.5, def: 1, move: 3, range: 1, hp: 15, tech: 'chivalry' },
    giant: { name: 'Великан', cost: 0, atk: 5, def: 4, move: 1, range: 1, hp: 40, tech: null, special: true },
  };
  const TRAINABLE = ['warrior', 'rider', 'archer', 'defender', 'swordsman', 'catapult', 'knight'];

  const TECHS = {
    riding: { name: 'Верховая езда', tier: 1, req: null, gives: 'Всадник' },
    chivalry: { name: 'Рыцарство', tier: 3, req: 'riding', gives: 'Рыцарь' },
    organization: { name: 'Организация', tier: 1, req: null, gives: 'Сбор фруктов' },
    farming: { name: 'Земледелие', tier: 2, req: 'organization', gives: 'Ферма' },
    strategy: { name: 'Стратегия', tier: 2, req: 'organization', gives: 'Защитник' },
    climbing: { name: 'Скалолазание', tier: 1, req: null, gives: 'Проход по горам' },
    mining: { name: 'Горное дело', tier: 2, req: 'climbing', gives: 'Шахта' },
    smithery: { name: 'Кузнечество', tier: 3, req: 'mining', gives: 'Мечник' },
    fishing: { name: 'Рыболовство', tier: 1, req: null, gives: 'Рыбалка' },
    hunting: { name: 'Охота', tier: 1, req: null, gives: 'Охота на зверя' },
    archery: { name: 'Стрельба из лука', tier: 2, req: 'hunting', gives: 'Лучник, защита в лесу' },
    forestry: { name: 'Лесное дело', tier: 2, req: 'hunting', gives: 'Лесопилка' },
    mathematics: { name: 'Математика', tier: 3, req: 'archery', gives: 'Катапульта' },
  };
  const TECH_TREE = [
    ['riding', 'chivalry'],
    ['organization', 'farming', 'strategy'],
    ['climbing', 'mining', 'smithery'],
    ['fishing'],
    ['hunting', 'archery', 'forestry', 'mathematics'],
  ];

  const BUILDS = {
    fruit: { name: 'Собрать фрукты', cost: 2, pop: 1, tech: 'organization', res: 'fruit' },
    hunt: { name: 'Охота', cost: 2, pop: 1, tech: 'hunting', res: 'animal' },
    fish: { name: 'Рыбалка', cost: 2, pop: 1, tech: 'fishing', res: 'fish' },
    farm: { name: 'Ферма', cost: 5, pop: 2, tech: 'farming', res: 'crop', imp: 'farm' },
    mine: { name: 'Шахта', cost: 5, pop: 2, tech: 'mining', res: 'ore', imp: 'mine' },
    lumber: { name: 'Лесопилка', cost: 3, pop: 1, tech: 'forestry', terrain: 'forest', imp: 'lumber' },
  };

  const LEVEL_REWARDS = {
    2: [{ id: 'workshop', name: 'Мастерская', desc: '+1 звезда за ход' }, { id: 'explorer', name: 'Разведчик', desc: 'Открывает часть карты' }],
    3: [{ id: 'walls', name: 'Стены', desc: 'Защита города ×4' }, { id: 'resources', name: 'Ресурсы', desc: '+5 звёзд сейчас' }],
    4: [{ id: 'growth', name: 'Рост населения', desc: '+3 жителя' }, { id: 'borders', name: 'Расширение границ', desc: 'Территория 5×5' }],
    5: [{ id: 'park', name: 'Парк', desc: '+1 звезда за ход, +250 очков' }, { id: 'giant', name: 'Великан', desc: 'Могучий юнит в городе' }],
  };
  const rewardsFor = (level) => LEVEL_REWARDS[Math.min(level, 5)];

  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  // ---------- Утилиты ----------

  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const isLand = (t) => t.t === 'field' || t.t === 'forest' || t.t === 'mountain';

  // ---------- Карта ----------

  function generate(s, rng, playerCount) {
    const S = s.size;
    const at = (x, y) => s.tiles[y * S + x];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      s.tiles.push({ x, y, t: 'ocean', res: null, imp: null, terr: null });
    }

    // Столицы по кругу вокруг центра.
    const caps = [];
    const c = (S - 1) / 2;
    const R = S * 0.33;
    const a0 = rng() * Math.PI * 2;
    for (let p = 0; p < playerCount; p++) {
      const a = a0 + (p / playerCount) * Math.PI * 2;
      caps.push([Math.round(c + Math.cos(a) * R), Math.round(c + Math.sin(a) * R)]);
    }

    // Суша — пятна вокруг столиц и случайных центров, с шумом по краям.
    const blobs = caps.map(([x, y]) => ({ x, y, r: 3.4 }));
    const extra = Math.round(S * 0.55);
    for (let k = 0; k < extra; k++) blobs.push({ x: 1 + rng() * (S - 3), y: 1 + rng() * (S - 3), r: 1.6 + rng() * 2 });
    for (const t of s.tiles) {
      let best = 9;
      for (const b of blobs) best = Math.min(best, Math.hypot(t.x - b.x, t.y - b.y) / b.r);
      if (best + (rng() - 0.5) * 0.45 < 1) t.t = 'field';
    }
    // Острова соединены перешейками: без кораблей иначе не дойти до соседа.
    for (let p = 1; p < caps.length; p++) carve(s, caps[p - 1], caps[p], rng);
    for (const t of s.tiles) if (t.x === 0 || t.y === 0 || t.x === S - 1 || t.y === S - 1) t.t = 'ocean';

    // Мелководье у берегов.
    for (const t of s.tiles) {
      if (isLand(t)) continue;
      if (DIRS.some(([dx, dy]) => { const n = at(t.x + dx, t.y + dy); return n && isLand(n); })) t.t = 'water';
    }

    // Рельеф и ресурсы.
    for (const t of s.tiles) {
      if (t.t === 'field') {
        const r = rng();
        t.t = r < 0.5 ? 'field' : r < 0.82 ? 'forest' : 'mountain';
      }
      const q = rng();
      if (t.t === 'field') t.res = q < 0.17 ? 'fruit' : q < 0.32 ? 'crop' : null;
      else if (t.t === 'forest') t.res = q < 0.22 ? 'animal' : null;
      else if (t.t === 'mountain') t.res = q < 0.28 ? 'ore' : null;
      else if (t.t === 'water') t.res = q < 0.3 ? 'fish' : null;
    }

    // Столицы и стартовые наборы ресурсов — у всех одинаково щедрые.
    caps.forEach(([x, y], p) => {
      const t = at(x, y);
      t.t = 'field'; t.res = null;
      const around = DIRS.map(([dx, dy]) => at(x + dx, y + dy)).filter(Boolean);
      for (const n of around) if (!isLand(n)) { n.t = 'field'; n.res = null; }
      const want = [['fruit', 'field'], ['fruit', 'field'], ['animal', 'forest'], ['crop', 'field']];
      const free = around.filter((n) => !n.res);
      for (const [res, terr] of want) {
        const n = free.shift();
        if (n) { n.t = terr; n.res = res; }
      }
      addCity(s, x, y, p, true, rng);
    });
    // Пересчёт мелководья после правок у столиц.
    for (const t of s.tiles) {
      if (t.t === 'water' && !DIRS.some(([dx, dy]) => { const n = at(t.x + dx, t.y + dy); return n && isLand(n); })) { t.t = 'ocean'; t.res = null; }
      if (t.t === 'ocean' && DIRS.some(([dx, dy]) => { const n = at(t.x + dx, t.y + dy); return n && isLand(n); })) t.t = 'water';
    }

    // Деревни.
    const land = s.tiles.filter((t) => isLand(t) && t.t !== 'mountain');
    for (let k = 0; k < 400; k++) {
      const t = land[(rng() * land.length) | 0];
      if (s.cities.some((cc) => cheb(cc.x, cc.y, t.x, t.y) < 3)) continue;
      t.t = 'field'; t.res = null;
      addCity(s, t.x, t.y, -1, false, rng);
    }
  }

  function carve(s, [ax, ay], [bx, by], rng) {
    let x = ax, y = ay;
    while (x !== bx || y !== by) {
      if (x !== bx && (y === by || rng() < 0.5)) x += Math.sign(bx - x); else y += Math.sign(by - y);
      const t = s.tiles[y * s.size + x];
      if (!isLand(t)) t.t = 'field';
    }
  }

  function cityName(s, tribe, rng) {
    const syl = TRIBES[tribe] ? TRIBES[tribe].syl : TRIBES[0].syl;
    for (let k = 0; k < 20; k++) {
      const n = 2 + (rng() < 0.4 ? 1 : 0);
      let name = '';
      for (let i = 0; i < n; i++) name += syl[(rng() * syl.length) | 0];
      name = name[0].toUpperCase() + name.slice(1);
      if (!s.cities.some((c) => c.name === name)) return name;
    }
    return 'Город ' + s.cities.length;
  }

  function addCity(s, x, y, owner, capital, rng) {
    const c = {
      id: s.cities.length, x, y, owner, capital, level: owner >= 0 ? 1 : 0, pop: 0, border: 1,
      walls: false, workshop: 0, park: 0, pending: [], name: owner >= 0 ? cityName(s, s.players[owner].tribe, rng) : 'Деревня',
    };
    s.cities.push(c);
    s.tiles[y * s.size + x].terr = c.id;
    if (owner >= 0) claim(s, c);
    return c;
  }

  function claim(s, c) {
    for (let dy = -c.border; dy <= c.border; dy++) for (let dx = -c.border; dx <= c.border; dx++) {
      const t = tileAt(s, c.x + dx, c.y + dy);
      if (!t) continue;
      if (t.terr === null) t.terr = c.id;
      else if (t.terr !== c.id) {
        const o = s.cities[t.terr];
        // Землю у нейтральной деревни (кроме её собственной клетки) можно забрать.
        if (o.owner === -1 && !(o.x === t.x && o.y === t.y)) t.terr = c.id;
      }
    }
    s.version++;
  }

  // ---------- Состояние ----------

  function newGame(opts) {
    const seed = opts.seed != null ? opts.seed : (Math.random() * 2 ** 31) | 0;
    const rng = rngFrom(seed);
    const count = opts.players || 2;
    const size = opts.size || { 2: 12, 3: 14, 4: 16 }[count];
    const tribes = opts.tribes || [0, 1, 2, 3].slice(0, count);
    const s = {
      seed, size, turn: 1, current: 0, tiles: [], cities: [], units: [], nextId: 1, version: 0,
      players: tribes.map((tribe, p) => ({
        id: p, tribe, name: TRIBES[tribe].name, color: TRIBES[tribe].color,
        human: p === 0 && !opts.allBots, stars: 5, techs: [], alive: true, explored: new Array(size * size).fill(0),
      })),
      over: false, winner: null, events: [], log: [],
    };
    generate(s, rng, count);
    for (const p of s.players) {
      const cap = s.cities.find((c) => c.owner === p.id);
      spawn(s, 'warrior', p.id, cap.x, cap.y, false);
      reveal(s, p.id, cap.x, cap.y, 2);
    }
    beginTurn(s, true);
    return s;
  }

  function tileAt(s, x, y) {
    if (x < 0 || y < 0 || x >= s.size || y >= s.size) return null;
    return s.tiles[y * s.size + x];
  }
  const unitAt = (s, x, y) => s.units.find((u) => u.x === x && u.y === y) || null;
  const unitById = (s, id) => s.units.find((u) => u.id === id) || null;
  const cityAt = (s, x, y) => s.cities.find((c) => c.x === x && c.y === y) || null;
  const citiesOf = (s, p) => s.cities.filter((c) => c.owner === p);
  const hasTech = (s, p, t) => !t || s.players[p].techs.includes(t);
  const tileOwner = (s, t) => (t.terr === null ? -1 : s.cities[t.terr].owner);
  const explored = (s, p, x, y) => !!s.players[p].explored[y * s.size + x];

  function spawn(s, type, owner, x, y, exhausted) {
    const u = { id: s.nextId++, type, owner, x, y, hp: UNITS[type].hp, moved: exhausted, attacked: exhausted };
    s.units.push(u);
    return u;
  }

  function reveal(s, p, x, y, r) {
    const tiles = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const t = tileAt(s, x + dx, y + dy);
      if (!t) continue;
      const i = t.y * s.size + t.x;
      if (!s.players[p].explored[i]) { s.players[p].explored[i] = 1; tiles.push(i); }
    }
    if (tiles.length) s.events.push({ kind: 'reveal', player: p, tiles, from: [x, y] });
  }

  const sightOf = (s, u) => (tileAt(s, u.x, u.y).t === 'mountain' ? 2 : 1);

  // ---------- Экономика ----------

  function cityIncome(c) { return c.level + (c.capital ? 1 : 0) + c.workshop + c.park; }
  function income(s, p) { return citiesOf(s, p).reduce((a, c) => a + cityIncome(c), 0); }
  function unitCap(s, p) { return citiesOf(s, p).reduce((a, c) => a + c.level + 1, 0); }
  function techCost(s, p, t) { return TECHS[t].tier * Math.max(1, citiesOf(s, p).length) + 4; }

  function score(s, p) {
    let sc = s.players[p].explored.reduce((a, v) => a + v, 0) * 5;
    for (const c of citiesOf(s, p)) sc += 100 + c.level * 50 + c.park * 250;
    for (const t of s.players[p].techs) sc += TECHS[t].tier * 40;
    for (const u of s.units) if (u.owner === p) sc += UNITS[u.type].cost * 5;
    return sc;
  }

  function addPop(s, c, n) {
    c.pop += n;
    while (c.pop >= c.level + 1) {
      c.pop -= c.level + 1;
      c.level++;
      c.pending.push(c.level);
      s.events.push({ kind: 'levelup', city: c.id, level: c.level, player: c.owner });
    }
  }

  // ---------- Движение и бой ----------

  function canEnter(s, p, t) {
    if (t.t === 'field' || t.t === 'forest') return true;
    if (t.t === 'mountain') return hasTech(s, p, 'climbing');
    return false;
  }

  function enemyAdjacent(s, p, x, y) {
    return DIRS.some(([dx, dy]) => { const e = unitAt(s, x + dx, y + dy); return e && e.owner !== p; });
  }

  // Клетки, куда юнит может дойти: лес и горы останавливают, рядом с врагом — тоже (зона контроля).
  function reachable(s, u) {
    const out = new Map();
    if (u.moved) return out;
    const start = u.y * s.size + u.x;
    const best = new Map([[start, UNITS[u.type].move]]);
    const prev = new Map();
    const q = [[u.x, u.y, UNITS[u.type].move]];
    while (q.length) {
      const [x, y, left] = q.shift();
      if (left <= 0) continue;
      if ((x !== u.x || y !== u.y) && enemyAdjacent(s, u.owner, x, y)) continue;
      for (const [dx, dy] of DIRS) {
        const t = tileAt(s, x + dx, y + dy);
        if (!t || !canEnter(s, u.owner, t)) continue;
        const o = unitAt(s, t.x, t.y);
        if (o && o.owner !== u.owner) continue;
        const i = t.y * s.size + t.x;
        const stop = t.t === 'forest' || t.t === 'mountain';
        const rem = stop ? 0 : left - 1;
        if (best.has(i) && best.get(i) >= rem) continue;
        best.set(i, rem);
        prev.set(i, y * s.size + x);
        if (!o) out.set(i, true);
        q.push([t.x, t.y, rem]);
      }
    }
    // Восстановим пути для анимации.
    const res = new Map();
    for (const i of out.keys()) {
      const path = [];
      let k = i;
      while (k !== undefined && k !== start) { path.unshift([k % s.size, (k / s.size) | 0]); k = prev.get(k); }
      res.set(i, path);
    }
    return res;
  }

  function targets(s, u) {
    if (u.attacked) return [];
    const r = UNITS[u.type].range;
    return s.units.filter((e) => e.owner !== u.owner && cheb(e.x, e.y, u.x, u.y) <= r && explored(s, u.owner, e.x, e.y));
  }

  function defenseBonus(s, d) {
    const t = tileAt(s, d.x, d.y);
    const c = cityAt(s, d.x, d.y);
    if (c && c.owner === d.owner) return c.walls ? 4 : 1.5;
    if (t.t === 'forest' && hasTech(s, d.owner, 'archery')) return 1.5;
    if (t.t === 'mountain' && hasTech(s, d.owner, 'climbing')) return 1.5;
    return 1;
  }

  // Формула боя в духе оригинала: сила зависит от оставшегося здоровья, защитник получает бонус местности.
  function combat(s, a, d) {
    const A = UNITS[a.type], D = UNITS[d.type];
    const af = A.atk * (a.hp / A.hp);
    const df = D.def * (d.hp / D.hp) * defenseBonus(s, d);
    const total = af + df;
    const dmg = Math.round((af / total) * A.atk * 4.5);
    let ret = Math.round((df / total) * D.def * 4.5);
    const kills = dmg >= d.hp;
    if (kills || cheb(a.x, a.y, d.x, d.y) > D.range) ret = 0;
    return { dmg, ret, kills };
  }

  // ---------- Действия игрока ----------

  const fail = (error) => ({ ok: false, error });

  function move(s, unitId, x, y) {
    const u = unitById(s, unitId);
    if (!u || u.owner !== s.current || s.over) return fail('Нельзя');
    const path = reachable(s, u).get(y * s.size + x);
    if (!path) return fail('Туда не дойти');
    u.x = x; u.y = y; u.moved = true;
    reveal(s, u.owner, x, y, sightOf(s, u));
    return { ok: true, path };
  }

  function attack(s, unitId, x, y) {
    const a = unitById(s, unitId);
    const d = unitAt(s, x, y);
    if (!a || !d || a.owner !== s.current || s.over) return fail('Нельзя');
    if (!targets(s, a).includes(d)) return fail('Цель вне досягаемости');
    const r = combat(s, a, d);
    d.hp -= r.dmg;
    a.attacked = true; a.moved = true;
    let moveInto = null;
    if (r.kills) {
      s.units = s.units.filter((o) => o !== d);
      if (UNITS[a.type].range === 1) { moveInto = [d.x, d.y]; a.x = d.x; a.y = d.y; reveal(s, a.owner, a.x, a.y, sightOf(s, a)); }
    } else {
      a.hp -= r.ret;
      if (a.hp <= 0) s.units = s.units.filter((o) => o !== a);
    }
    return { ok: true, dmg: r.dmg, ret: r.ret, killed: r.kills, attackerDied: a.hp <= 0, moveInto, target: { x, y, id: d.id } };
  }

  function canCapture(s, u) {
    if (!u || u.moved || u.attacked) return false;
    const c = cityAt(s, u.x, u.y);
    return !!(c && c.owner !== u.owner);
  }

  function capture(s, unitId) {
    const u = unitById(s, unitId);
    if (!u || u.owner !== s.current || !canCapture(s, u)) return fail('Захватить нельзя');
    const c = cityAt(s, u.x, u.y);
    const prev = c.owner;
    c.owner = u.owner;
    c.pending = [];
    c.capital = false; // захваченная столица теряет дворец
    if (prev === -1) { c.level = 1; c.pop = 0; c.name = cityName(s, s.players[u.owner].tribe, rngFrom(s.seed + c.id * 31 + s.turn)); }
    claim(s, c);
    reveal(s, u.owner, c.x, c.y, 2);
    u.moved = true; u.attacked = true;
    s.log.push(`${s.players[u.owner].name} захватывают ${prev === -1 ? 'деревню' : 'город ' + c.name}`);
    if (prev >= 0 && !citiesOf(s, prev).length) eliminate(s, prev);
    return { ok: true, city: c.id, from: prev };
  }

  function eliminate(s, p) {
    s.players[p].alive = false;
    s.units = s.units.filter((u) => u.owner !== p);
    s.events.push({ kind: 'eliminated', player: p });
    s.log.push(`${s.players[p].name} уничтожены`);
    const alive = s.players.filter((q) => q.alive);
    if (alive.length === 1) { s.over = true; s.winner = alive[0].id; }
  }

  function recover(s, unitId) {
    const u = unitById(s, unitId);
    if (!u || u.owner !== s.current || u.moved || u.attacked) return fail('Юнит уже действовал');
    const max = UNITS[u.type].hp;
    if (u.hp >= max) return fail('Юнит здоров');
    const own = tileOwner(s, tileAt(s, u.x, u.y)) === u.owner;
    const heal = Math.min(max - u.hp, own ? 8 : 4);
    u.hp += heal;
    u.moved = true; u.attacked = true;
    return { ok: true, heal };
  }

  function canTrain(s, cityId, type) {
    const c = s.cities[cityId];
    const p = s.current;
    const U = UNITS[type];
    if (!c || c.owner !== p) return fail('Не ваш город');
    if (!U || U.special) return fail('Нельзя');
    if (!hasTech(s, p, U.tech)) return fail('Нужна технология «' + TECHS[U.tech].name + '»');
    if (unitAt(s, c.x, c.y)) return fail('Город занят юнитом');
    if (s.units.filter((u) => u.owner === p).length >= unitCap(s, p)) return fail('Нет места: растите города');
    if (s.players[p].stars < U.cost) return fail('Мало звёзд');
    return { ok: true };
  }

  function train(s, cityId, type) {
    const chk = canTrain(s, cityId, type);
    if (!chk.ok) return chk;
    const c = s.cities[cityId];
    s.players[s.current].stars -= UNITS[type].cost;
    const u = spawn(s, type, s.current, c.x, c.y, true);
    return { ok: true, unit: u.id };
  }

  function buildsFor(s, t) {
    if (t.imp) return [];
    const out = [];
    for (const [k, b] of Object.entries(BUILDS)) {
      if (b.res && t.res === b.res) out.push(k);
      if (b.terrain && t.t === b.terrain && !t.res) out.push(k);
    }
    return out;
  }

  function canBuild(s, x, y, kind) {
    const t = tileAt(s, x, y);
    const b = BUILDS[kind];
    const p = s.current;
    if (!t || !b || !buildsFor(s, t).includes(kind)) return fail('Здесь нельзя');
    if (tileOwner(s, t) !== p) return fail('Только на своей территории');
    if (cityAt(s, x, y)) return fail('Здесь город');
    const e = unitAt(s, x, y);
    if (e && e.owner !== p) return fail('Клетку занял враг');
    if (!hasTech(s, p, b.tech)) return fail('Нужна технология «' + TECHS[b.tech].name + '»');
    if (s.players[p].stars < b.cost) return fail('Мало звёзд');
    return { ok: true };
  }

  function build(s, x, y, kind) {
    const chk = canBuild(s, x, y, kind);
    if (!chk.ok) return chk;
    const t = tileAt(s, x, y);
    const b = BUILDS[kind];
    s.players[s.current].stars -= b.cost;
    if (b.imp) t.imp = b.imp; else t.res = null;
    addPop(s, s.cities[t.terr], b.pop);
    return { ok: true, pop: b.pop };
  }

  function canResearch(s, tech) {
    const p = s.current;
    const T = TECHS[tech];
    if (!T) return fail('Нет такой технологии');
    if (hasTech(s, p, tech)) return fail('Уже изучено');
    if (T.req && !hasTech(s, p, T.req)) return fail('Сначала «' + TECHS[T.req].name + '»');
    if (s.players[p].stars < techCost(s, p, tech)) return fail('Мало звёзд');
    return { ok: true };
  }

  function research(s, tech) {
    const chk = canResearch(s, tech);
    if (!chk.ok) return chk;
    s.players[s.current].stars -= techCost(s, s.current, tech);
    s.players[s.current].techs.push(tech);
    return { ok: true };
  }

  function chooseReward(s, cityId, opt) {
    const c = s.cities[cityId];
    if (!c || c.owner !== s.current || !c.pending.length) return fail('Нечего выбирать');
    const level = c.pending.shift();
    const r = rewardsFor(level)[opt ? 1 : 0];
    const P = s.players[c.owner];
    switch (r.id) {
      case 'workshop': c.workshop = 1; break;
      case 'explorer': {
        const rng = rngFrom(s.seed + c.id * 97 + level);
        let x = c.x, y = c.y;
        for (let k = 0; k < 14; k++) {
          const [dx, dy] = DIRS[(rng() * 8) | 0];
          if (tileAt(s, x + dx * 2, y + dy * 2)) { x += dx * 2; y += dy * 2; }
          reveal(s, c.owner, x, y, 1);
        }
        break;
      }
      case 'walls': c.walls = true; break;
      case 'resources': P.stars += 5; break;
      case 'growth': addPop(s, c, 3); break;
      case 'borders': c.border = 2; claim(s, c); reveal(s, c.owner, c.x, c.y, 3); break;
      case 'park': c.park++; break;
      case 'giant': {
        const spot = [[0, 0]].concat(DIRS).map(([dx, dy]) => tileAt(s, c.x + dx, c.y + dy))
          .find((t) => t && canEnter(s, c.owner, t) && !unitAt(s, t.x, t.y));
        if (spot) spawn(s, 'giant', c.owner, spot.x, spot.y, true);
        else P.stars += 5;
        break;
      }
    }
    return { ok: true, reward: r };
  }

  // ---------- Ходы ----------

  function beginTurn(s, first) {
    const p = s.current;
    const P = s.players[p];
    for (const u of s.units) if (u.owner === p) { u.moved = false; u.attacked = false; }
    if (!first) P.stars += income(s, p);
    s.events.push({ kind: 'turn', player: p, turn: s.turn });
  }

  function endTurn(s) {
    if (s.over) return fail('Игра окончена');
    for (const c of citiesOf(s, s.current)) while (c.pending.length) chooseReward(s, c.id, 0);
    let next = s.current;
    do {
      next = (next + 1) % s.players.length;
      if (next === 0) s.turn++;
    } while (!s.players[next].alive);
    s.current = next;
    beginTurn(s, s.turn === 1);
    return { ok: true };
  }

  // ---------- ИИ ----------

  const TECH_PLAN = ['organization', 'hunting', 'riding', 'climbing', 'farming', 'fishing', 'archery', 'mining', 'strategy', 'forestry', 'smithery', 'mathematics', 'chivalry'];

  function bfsLand(s, p, from) {
    const d = new Int16Array(s.size * s.size).fill(999);
    const q = [from];
    d[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % s.size, y = (i / s.size) | 0;
      for (const [dx, dy] of DIRS) {
        const t = tileAt(s, x + dx, y + dy);
        if (!t) continue;
        const j = t.y * s.size + t.x;
        if (d[j] <= d[i] + 1 || !canEnter(s, p, t)) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    return d;
  }

  function aiTurn(s, p, rng) {
    rng = rng || Math.random;
    const skip = new Set();
    let steps = 0;
    let noEconomy = false;
    return {
      next() {
        if (s.over || s.current !== p || steps++ > 120) return null;
        return aiNext(s, p, rng, skip, noEconomy);
      },
      failed(a) { if (a.unit) skip.add(a.unit); else noEconomy = true; },
    };
  }

  function aiNext(s, p, rng, skip, noEconomy) {
    const P = s.players[p];
    for (const c of citiesOf(s, p)) if (c.pending.length) {
      const lvl = Math.min(c.pending[0], 5);
      return { type: 'reward', city: c.id, opt: lvl === 2 ? (s.turn < 12 ? 0 : 1) : lvl === 3 ? (c.capital ? 0 : 1) : lvl === 4 ? 0 : 1 };
    }
    const mine = s.units.filter((u) => u.owner === p && !skip.has(u.id));

    // Захват.
    for (const u of mine) if (canCapture(s, u)) return { type: 'capture', unit: u.id };

    // Атака с места или после шага.
    let best = null;
    for (const u of mine) {
      if (u.attacked) continue;
      const consider = (x, y, mv) => {
        const ox = u.x, oy = u.y;
        u.x = x; u.y = y;
        for (const d of targets(s, u)) {
          const r = combat(s, u, d);
          let v = r.kills ? 8 + UNITS[d.type].cost : (r.dmg / UNITS[d.type].hp) * 4;
          v -= (r.ret / UNITS[u.type].hp) * 3.5;
          if (cityAt(s, d.x, d.y) && cityAt(s, d.x, d.y).owner === p) v += 4;
          if (mv) v -= 0.3;
          if (!best || v > best.v) best = { v, u, x, y, mv, d };
        }
        u.x = ox; u.y = oy;
      };
      consider(u.x, u.y, false);
      if (!u.moved) for (const [i] of reachable(s, u)) consider(i % s.size, (i / s.size) | 0, true);
    }
    if (best && best.v > 0.4) {
      if (best.mv) return { type: 'move', unit: best.u.id, x: best.x, y: best.y };
      return { type: 'attack', unit: best.u.id, x: best.d.x, y: best.d.y };
    }

    if (!noEconomy) {
      // Постройки: максимум жителей за звезду.
      let bb = null;
      for (const t of s.tiles) {
        if (tileOwner(s, t) !== p) continue;
        for (const k of buildsFor(s, t)) {
          if (!canBuild(s, t.x, t.y, k).ok) continue;
          const c = s.cities[t.terr];
          const v = BUILDS[k].pop / BUILDS[k].cost + (c.pop + BUILDS[k].pop >= c.level + 1 ? 0.3 : 0);
          if (!bb || v > bb.v) bb = { v, t, k };
        }
      }
      // Армия: сначала минимальная, потом по мере роста.
      const units = s.units.filter((u) => u.owner === p).length;
      const want = Math.min(unitCap(s, p), 2 + citiesOf(s, p).length + Math.floor(s.turn / 6));
      const tryTrain = () => {
        const prefs = ['knight', 'swordsman', 'catapult', 'archer', 'rider', 'defender', 'warrior'];
        for (const c of citiesOf(s, p)) for (const t of prefs) if (canTrain(s, c.id, t).ok && (t !== 'catapult' || rng() < 0.3)) return { type: 'train', city: c.id, unit: t };
        return null;
      };
      if (units < Math.min(want, 2)) { const a = tryTrain(); if (a) return a; }
      if (bb && (units >= 2 || P.stars >= BUILDS[bb.k].cost + 2)) return { type: 'build', x: bb.t.x, y: bb.t.y, kind: bb.k };
      for (const t of TECH_PLAN) {
        if (!canResearch(s, t).ok) continue;
        const useful = { organization: 'fruit', hunting: 'animal', fishing: 'fish', farming: 'crop', mining: 'ore' }[t];
        if (useful && !s.tiles.some((tt) => tileOwner(s, tt) === p && tt.res === useful && !tt.imp)) continue;
        return { type: 'research', tech: t };
      }
      if (units < want) { const a = tryTrain(); if (a) return a; }
    }

    // Передвижение.
    for (const u of mine) {
      if (u.moved) continue;
      skip.add(u.id);
      const c = cityAt(s, u.x, u.y);
      if (c && c.owner !== p) continue; // ждём захвата
      const max = UNITS[u.type].hp;
      if (u.hp < max * 0.5 && !enemyAdjacent(s, p, u.x, u.y) && !u.attacked) return { type: 'recover', unit: u.id };
      const reach = reachable(s, u);
      if (!reach.size) continue;
      const dist = bfsLand(s, p, u.y * s.size + u.x);
      let goal = null;
      const consider = (x, y, w) => {
        const d = dist[y * s.size + x];
        if (d >= 999) return;
        const sc = w / (1 + d);
        if (!goal || sc > goal.sc) goal = { x, y, sc };
      };
      for (const cc of s.cities) {
        if (cc.owner === p) continue;
        const occ = unitAt(s, cc.x, cc.y);
        if (occ && occ.owner === p) continue;
        consider(cc.x, cc.y, cc.owner === -1 ? 3 : s.turn > 6 ? 2.2 : 0.6);
      }
      for (const e of s.units) if (e.owner !== p) consider(e.x, e.y, 0.9);
      for (const t of s.tiles) if (!P.explored[t.y * s.size + t.x] && rng() < 0.15) consider(t.x, t.y, 0.5);
      if (!goal) continue;
      const toGoal = bfsLand(s, p, goal.y * s.size + goal.x);
      const cur = toGoal[u.y * s.size + u.x];
      let bm = null;
      for (const [i] of reach) {
        const v = cur - toGoal[i];
        if (!bm || v > bm.v) bm = { v, i };
      }
      if (bm && bm.v > 0) return { type: 'move', unit: u.id, x: bm.i % s.size, y: (bm.i / s.size) | 0 };
    }
    return null;
  }

  function apply(s, a) {
    switch (a.type) {
      case 'move': return move(s, a.unit, a.x, a.y);
      case 'attack': return attack(s, a.unit, a.x, a.y);
      case 'capture': return capture(s, a.unit);
      case 'recover': return recover(s, a.unit);
      case 'train': return train(s, a.city, a.unit);
      case 'build': return build(s, a.x, a.y, a.kind);
      case 'research': return research(s, a.tech);
      case 'reward': return chooseReward(s, a.city, a.opt);
    }
    return fail('Неизвестное действие');
  }

  const api = {
    TRIBES, UNITS, TRAINABLE, TECHS, TECH_TREE, BUILDS, rewardsFor, DIRS,
    newGame, tileAt, unitAt, unitById, cityAt, citiesOf, hasTech, tileOwner, explored,
    cityIncome, income, unitCap, techCost, score, reachable, targets, combat, canEnter,
    move, attack, canCapture, capture, recover, canTrain, train, buildsFor, canBuild, build,
    canResearch, research, chooseReward, endTurn, aiTurn, apply, isLand,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Isles = api;
})(typeof window !== 'undefined' ? window : globalThis);
