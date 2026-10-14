// Блиц Империй — движок правил.
// Чистая детерминированная логика без DOM: тот же файл может работать на сервере
// (проверка ходов в онлайн-матчах) и в браузере.
(function (root) {
  'use strict';

  const SIZE = 9;
  const N = SIZE * SIZE;

  const TERRAIN = { FIELD: 0, FOREST: 1, MOUNTAIN: 2, WATER: 3 };
  const RES = { NONE: 0, FRUIT: 1, WHEAT: 2, GAME: 3, ORE: 4, FISH: 5 };

  const UNITS = {
    warrior: { name: 'Воин', glyph: '♟︎', cost: 2, tech: null, value: 2, move: 'Шаг на 1 клетку в любую сторону' },
    rider: { name: 'Всадник', glyph: '♞', cost: 3, tech: 'riding', value: 3, move: 'Прыжок буквой «Г», как шахматный конь' },
    archer: { name: 'Лучник', glyph: '♝', cost: 4, tech: 'archery', value: 4, move: 'По диагонали до 3 клеток' },
    rook: { name: 'Таран', glyph: '♜', cost: 5, tech: 'mechanics', value: 5, move: 'По прямой до 4 клеток' },
    queen: { name: 'Рыцарь', glyph: '♛', cost: 8, tech: 'chivalry', value: 8, move: 'В любую сторону до 3 клеток' },
  };
  const UNIT_ORDER = ['warrior', 'rider', 'archer', 'rook', 'queen'];

  const TECHS = {
    riding: { name: 'Верховая езда', tier: 1, req: null, unlock: 'Всадник', branch: 0 },
    archery: { name: 'Стрельба', tier: 2, req: 'riding', unlock: 'Лучник', branch: 0 },
    chivalry: { name: 'Рыцарство', tier: 3, req: 'archery', unlock: 'Рыцарь', branch: 0 },
    agriculture: { name: 'Земледелие', tier: 1, req: null, unlock: 'Ферма', branch: 1 },
    milling: { name: 'Мельницы', tier: 2, req: 'agriculture', unlock: 'Мельница', branch: 1 },
    trade: { name: 'Торговля', tier: 3, req: 'milling', unlock: 'Рынок', branch: 1 },
    mining: { name: 'Горное дело', tier: 1, req: null, unlock: 'Шахта', branch: 2 },
    mechanics: { name: 'Механика', tier: 2, req: 'mining', unlock: 'Таран', branch: 2 },
    chrono: { name: 'Хронометрия', tier: 3, req: 'mechanics', unlock: 'Башня времени', branch: 2 },
    fishing: { name: 'Рыболовство', tier: 1, req: null, unlock: 'Рыбалка', branch: 3 },
  };
  const TECH_ORDER = ['riding', 'archery', 'chivalry', 'agriculture', 'milling', 'trade', 'mining', 'mechanics', 'chrono', 'fishing'];

  const BUILDS = {
    harvest: { name: 'Сбор', cost: 2, tech: null },
    fish: { name: 'Рыбалка', cost: 2, tech: 'fishing' },
    farm: { name: 'Ферма', cost: 4, tech: 'agriculture' },
    mine: { name: 'Шахта', cost: 5, tech: 'mining' },
    mill: { name: 'Мельница', cost: 5, tech: 'milling' },
    market: { name: 'Рынок', cost: 6, tech: 'trade' },
    tower: { name: 'Башня времени', cost: 6, tech: 'chrono' },
  };
  const BUILD_ORDER = ['harvest', 'fish', 'farm', 'mine', 'mill', 'market', 'tower'];

  // Награды за уровень города: всегда выбор из двух.
  const LEVEL_OPTIONS = {
    2: [
      { id: 'workshop', name: 'Мастерская', desc: '+1 золото за ход' },
      { id: 'treasury', name: 'Казна', desc: '+5 золота сейчас' },
    ],
    3: [
      { id: 'walls', name: 'Стены', desc: 'Кто взял защитника города — гибнет сам' },
      { id: 'militia', name: 'Ополчение', desc: 'Бесплатный воин' },
    ],
    4: [
      { id: 'borders', name: 'Рост границ', desc: 'Территория 5×5' },
      { id: 'abundance', name: 'Изобилие', desc: '+3 жителя' },
    ],
    5: [
      { id: 'guild', name: 'Гильдия', desc: '+2 золота за ход' },
      { id: 'monument', name: 'Монумент', desc: '+20 очков' },
    ],
  };
  function levelOptions(level) { return LEVEL_OPTIONS[Math.min(level, 5)]; }

  const SCORE = { level: 10, monument: 20, tech: 4, improvement: 2 };

  const KING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const ORTHO = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const DIAG = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  const idx = (x, y) => y * SIZE + x;
  const xy = (i) => [i % SIZE, (i / SIZE) | 0];
  const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Карта ----------
  // Карта центрально-симметрична: клетка i зеркальна клетке N-1-i.
  // Для рейтинговой игры это важно — у обоих игроков одинаковые стартовые условия.

  const CAPITALS = [[1, 7], [7, 1]];

  function randomTile(rng) {
    const r = rng();
    let t;
    if (r < 0.46) t = TERRAIN.FIELD;
    else if (r < 0.74) t = TERRAIN.FOREST;
    else if (r < 0.87) t = TERRAIN.MOUNTAIN;
    else t = TERRAIN.WATER;
    let res = RES.NONE;
    const q = rng();
    if (t === TERRAIN.FIELD) res = q < 0.24 ? RES.FRUIT : q < 0.52 ? RES.WHEAT : RES.NONE;
    if (t === TERRAIN.FOREST) res = q < 0.38 ? RES.GAME : RES.NONE;
    if (t === TERRAIN.MOUNTAIN) res = q < 0.55 ? RES.ORE : RES.NONE;
    if (t === TERRAIN.WATER) res = q < 0.5 ? RES.FISH : RES.NONE;
    return { t, res };
  }

  function passable(tile) { return tile.t === TERRAIN.FIELD || tile.t === TERRAIN.FOREST; }

  function generateMap(seed) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rng = mulberry32((seed >>> 0) + attempt * 7919);
      const half = [];
      for (let i = 0; i <= (N - 1) / 2; i++) half[i] = randomTile(rng);

      // Столица верхнего игрока стоит в «половине» индексов < 40.
      const [cx, cy] = CAPITALS[1];
      const villages = [idx(4, 4)];
      let tries = 0;
      while (villages.length < 3 && tries++ < 500) {
        const i = (rng() * 40) | 0;
        const [x, y] = xy(i);
        if (x === 0 || y === 0 || x === SIZE - 1) continue;
        if (cheb(x, y, cx, cy) < 3) continue;
        if (cheb(x, y, CAPITALS[0][0], CAPITALS[0][1]) < 3) continue;
        let ok = true;
        for (const v of villages) {
          const [vx, vy] = xy(v);
          if (cheb(x, y, vx, vy) < 3) ok = false;
          const [mx, my] = xy(N - 1 - v);
          if (cheb(x, y, mx, my) < 3) ok = false;
        }
        const [mx, my] = xy(N - 1 - i);
        if (cheb(x, y, mx, my) < 3) ok = false;
        if (ok) villages.push(i);
      }
      if (villages.length < 3) continue;

      const capI = idx(cx, cy);
      half[capI] = { t: TERRAIN.FIELD, res: RES.NONE };
      for (const v of villages) half[v] = { t: TERRAIN.FIELD, res: RES.NONE };

      // Гарантируем ровный старт: у столицы есть фрукты, дичь, пшеница и максимум 2 непроходимых клетки.
      const around = KING.map(([dx, dy]) => idx(cx + dx, cy + dy));
      let blocked = 0;
      for (const i of around) {
        if (!passable(half[i])) { blocked++; if (blocked > 2) half[i] = { t: TERRAIN.FIELD, res: RES.NONE }; }
      }
      const need = [
        [RES.FRUIT, TERRAIN.FIELD], [RES.GAME, TERRAIN.FOREST], [RES.WHEAT, TERRAIN.FIELD],
      ];
      const free = around.filter((i) => half[i].res === RES.NONE && passable(half[i]));
      for (const [res, t] of need) {
        if (around.some((i) => half[i].res === res)) continue;
        const i = free.shift();
        if (i !== undefined) half[i] = { t, res };
      }

      const tiles = new Array(N);
      for (let i = 0; i < N; i++) {
        const src = i <= (N - 1) / 2 ? half[i] : half[N - 1 - i];
        tiles[i] = { t: src.t, res: src.res, imp: null, terr: null };
      }
      const villageIdx = villages.concat(villages.slice(1).map((v) => N - 1 - v));

      if (!connected(tiles, [idx(...CAPITALS[0]), idx(...CAPITALS[1])].concat(villageIdx))) continue;
      return { tiles, villages: villageIdx };
    }
    throw new Error('Не удалось сгенерировать карту');
  }

  function connected(tiles, points) {
    const seen = new Uint8Array(N);
    const q = [points[0]];
    seen[points[0]] = 1;
    while (q.length) {
      const [x, y] = xy(q.pop());
      for (const [dx, dy] of KING) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (seen[j] || !passable(tiles[j])) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return points.every((p) => seen[p]);
  }

  // ---------- Состояние ----------

  function newGame(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Math.random() * 2 ** 31) | 0;
    const map = generateMap(seed);
    const s = {
      seed,
      size: SIZE,
      round: 1,
      maxRounds: opts.maxRounds || 15,
      turn: 0,
      tiles: map.tiles,
      cities: [],
      units: [],
      nextId: 1,
      players: [0, 1].map((p) => ({
        name: (opts.names && opts.names[p]) || (p === 0 ? 'Синие' : 'Янтарные'),
        gold: 3,
        techs: [],
        clock: opts.clockMs || 60000,
        inc: 0,
        flagged: false,
        tower: false,
      })),
      over: false,
      winner: null,
      endReason: null,
      events: [],
      log: [],
    };
    CAPITALS.forEach(([x, y], p) => addCity(s, x, y, p, true));
    for (const v of map.villages) addCity(s, ...xy(v), -1, false);
    for (const c of s.cities) if (c.owner >= 0) claimTerritory(s, c);
    CAPITALS.forEach(([x, y], p) => s.units.push(makeUnit(s, 'warrior', p, x, y)));
    beginTurn(s);
    return s;
  }

  function addCity(s, x, y, owner, capital) {
    const c = {
      id: s.cities.length, x, y, owner, capital,
      level: owner >= 0 ? 1 : 0, pop: 0, border: 1,
      walls: false, workshop: 0, guild: 0, monument: 0, pending: [],
    };
    s.cities.push(c);
    s.tiles[idx(x, y)].terr = c.id;
    return c;
  }

  function makeUnit(s, type, owner, x, y) {
    return { id: s.nextId++, type, owner, x, y, moved: false, fresh: false };
  }

  function claimTerritory(s, c) {
    for (let dy = -c.border; dy <= c.border; dy++) {
      for (let dx = -c.border; dx <= c.border; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (!inside(x, y)) continue;
        const t = s.tiles[idx(x, y)];
        if (t.terr === null || (t.terr === c.id)) { t.terr = c.id; continue; }
        // Чужие клетки не забираем, но нейтральная деревня свою землю ещё не застолбила.
        const other = s.cities[t.terr];
        if (other.owner === -1 && !(other.x === x && other.y === y)) t.terr = c.id;
      }
    }
  }

  const cityAt = (s, x, y) => {
    const t = s.tiles[idx(x, y)];
    if (t.terr === null) return null;
    const c = s.cities[t.terr];
    return c.x === x && c.y === y ? c : null;
  };
  const unitAt = (s, x, y) => s.units.find((u) => u.x === x && u.y === y) || null;
  const unitById = (s, id) => s.units.find((u) => u.id === id) || null;
  const ownedCities = (s, p) => s.cities.filter((c) => c.owner === p);
  const capitalOf = (s, p) => s.cities.find((c) => c.capital && c.owner === p) || null;
  const hasTech = (s, p, t) => !t || s.players[p].techs.includes(t);

  function tileOwner(s, i) {
    const t = s.tiles[i];
    return t.terr === null ? -1 : s.cities[t.terr].owner;
  }

  // ---------- Экономика ----------

  function cityIncome(s, c) {
    let inc = c.level + (c.capital ? 1 : 0) + c.workshop + 2 * c.guild;
    for (let i = 0; i < N; i++) if (s.tiles[i].terr === c.id && s.tiles[i].imp === 'mine') inc += 1;
    return inc;
  }

  function marketIncome(s, i) {
    const [x, y] = xy(i);
    const owner = tileOwner(s, i);
    let n = 0;
    for (const [dx, dy] of KING) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      const j = idx(nx, ny);
      const imp = s.tiles[j].imp;
      if ((imp === 'farm' || imp === 'mine' || imp === 'mill') && tileOwner(s, j) === owner) n++;
    }
    return Math.min(4, n);
  }

  function income(s, p) {
    let inc = 0;
    for (const c of ownedCities(s, p)) inc += cityIncome(s, c);
    for (let i = 0; i < N; i++) if (s.tiles[i].imp === 'market' && tileOwner(s, i) === p) inc += marketIncome(s, i);
    return inc;
  }

  function unitCap(s, p) {
    return ownedCities(s, p).reduce((a, c) => a + c.level + 1, 0);
  }

  function techCost(s, p, t) {
    return TECHS[t].tier * 3 + Math.max(0, ownedCities(s, p).length - 1);
  }

  function score(s, p) {
    let sc = 0;
    for (const c of ownedCities(s, p)) sc += SCORE.level * c.level + SCORE.monument * c.monument;
    sc += SCORE.tech * s.players[p].techs.length;
    for (let i = 0; i < N; i++) if (s.tiles[i].imp && tileOwner(s, i) === p) sc += SCORE.improvement;
    return sc;
  }

  function addPop(s, c, n) {
    c.pop += n;
    while (c.pop >= c.level + 1) {
      c.pop -= c.level + 1;
      c.level += 1;
      c.pending.push(c.level);
      s.events.push({ kind: 'levelup', city: c.id, level: c.level });
    }
  }

  // ---------- Движение ----------

  function unitMoves(s, u) {
    const out = [];
    const tryAdd = (x, y) => {
      if (!inside(x, y)) return 'stop';
      const tile = s.tiles[idx(x, y)];
      if (!passable(tile)) return 'stop';
      const o = unitAt(s, x, y);
      if (o) {
        if (o.owner !== u.owner) out.push({ x, y, capture: true });
        return 'stop';
      }
      out.push({ x, y, capture: false });
      return tile.t === TERRAIN.FOREST ? 'stop' : 'go';
    };
    const slide = (dirs, range) => {
      for (const [dx, dy] of dirs) {
        for (let k = 1; k <= range; k++) if (tryAdd(u.x + dx * k, u.y + dy * k) === 'stop') break;
      }
    };
    switch (u.type) {
      case 'warrior': for (const [dx, dy] of KING) tryAdd(u.x + dx, u.y + dy); break;
      case 'rider': for (const [dx, dy] of KNIGHT) tryAdd(u.x + dx, u.y + dy); break;
      case 'archer': slide(DIAG, 3); break;
      case 'rook': slide(ORTHO, 4); break;
      case 'queen': slide(KING, 3); break;
    }
    return out;
  }

  // Клетки, куда игрок p сможет пойти своим следующим ходом (для подсказок угроз и ИИ).
  function attackMap(s, p) {
    const m = new Uint8Array(N);
    for (const u of s.units) {
      if (u.owner !== p) continue;
      // Свои фигуры считаем «прикрытыми»: смотрим, куда юнит бьёт, даже если там свой.
      const ghost = Object.assign({}, u, { owner: -2 });
      for (const mv of unitMoves(s, ghost)) m[idx(mv.x, mv.y)]++;
    }
    return m;
  }

  // ---------- Действия ----------

  function fail(msg) { return { ok: false, error: msg }; }
  const OK = { ok: true };

  function canMove(s, u, x, y) {
    if (s.over) return fail('Партия окончена');
    if (!u || u.owner !== s.turn) return fail('Это не ваш юнит');
    if (u.fresh) return fail('Новый юнит ходит со следующего хода');
    if (u.moved) return fail('Юнит уже ходил');
    const mv = unitMoves(s, u).find((m) => m.x === x && m.y === y);
    if (!mv) return fail('Туда нельзя');
    return OK;
  }

  function move(s, unitId, x, y) {
    const u = unitById(s, unitId);
    const chk = canMove(s, u, x, y);
    if (!chk.ok) return chk;
    const from = [u.x, u.y];
    const target = unitAt(s, x, y);
    u.moved = true;
    if (target) {
      s.units = s.units.filter((o) => o !== target);
      const c = cityAt(s, x, y);
      if (c && c.owner === target.owner && c.walls) {
        s.units = s.units.filter((o) => o !== u);
        s.events.push({ kind: 'walls', x, y, attacker: u.type, defender: target.type });
        pushLog(s, `${UNITS[u.type].name} бьёт ${UNITS[target.type].name.toLowerCase()} — и гибнет у стен`);
        return { ok: true, from, captured: target, died: true };
      }
      s.events.push({ kind: 'capture', x, y, attacker: u.type, defender: target.type });
      pushLog(s, `${UNITS[u.type].name} забирает: ${UNITS[target.type].name.toLowerCase()}`);
    }
    u.x = x; u.y = y;
    return { ok: true, from, captured: target };
  }

  function canBuy(s, cityId, type) {
    const p = s.turn;
    const c = s.cities[cityId];
    const def = UNITS[type];
    if (s.over) return fail('Партия окончена');
    if (!c || c.owner !== p) return fail('Не ваш город');
    if (!def) return fail('Нет такого юнита');
    if (!hasTech(s, p, def.tech)) return fail(`Нужна технология «${TECHS[def.tech].name}»`);
    if (unitAt(s, c.x, c.y)) return fail('Клетка города занята');
    if (s.units.filter((u) => u.owner === p).length >= unitCap(s, p)) return fail('Лимит войск: растите города');
    if (s.players[p].gold < def.cost) return fail('Не хватает золота');
    return OK;
  }

  function buy(s, cityId, type) {
    const chk = canBuy(s, cityId, type);
    if (!chk.ok) return chk;
    const c = s.cities[cityId];
    s.players[s.turn].gold -= UNITS[type].cost;
    const u = makeUnit(s, type, s.turn, c.x, c.y);
    u.fresh = true; u.moved = true;
    s.units.push(u);
    return { ok: true, unit: u };
  }

  function buildKindsFor(s, i) {
    const t = s.tiles[i];
    const kinds = [];
    if (t.imp) return kinds;
    if (t.res === RES.FRUIT || t.res === RES.GAME) kinds.push('harvest');
    if (t.res === RES.FISH) kinds.push('fish');
    if (t.res === RES.WHEAT) kinds.push('farm');
    if (t.res === RES.ORE) kinds.push('mine');
    if (t.t === TERRAIN.FIELD && t.res === RES.NONE) kinds.push('mill', 'market', 'tower');
    return kinds;
  }

  function canBuild(s, x, y, kind) {
    const p = s.turn;
    if (s.over) return fail('Партия окончена');
    if (!inside(x, y)) return fail('Вне карты');
    const i = idx(x, y);
    const t = s.tiles[i];
    if (t.terr === null || s.cities[t.terr].owner !== p) return fail('Только на своей территории');
    if (cityAt(s, x, y)) return fail('На клетке города строить нельзя');
    const def = BUILDS[kind];
    if (!def || !buildKindsFor(s, i).includes(kind)) return fail('Здесь это не построить');
    const o = unitAt(s, x, y);
    if (o && o.owner !== p) return fail('Клетку занял враг');
    if (!hasTech(s, p, def.tech)) return fail(`Нужна технология «${TECHS[def.tech].name}»`);
    if (kind === 'tower' && s.players[p].tower) return fail('Башня времени — одна на империю');
    if (s.players[p].gold < def.cost) return fail('Не хватает золота');
    return OK;
  }

  // Сколько жителей даст постройка (для подсказок интерфейса и ИИ).
  function buildPop(s, x, y, kind) {
    const owner = s.turn;
    const near = (pred) => {
      let n = 0;
      for (const [dx, dy] of KING) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (pred(s.tiles[j]) && tileOwner(s, j) === owner) n++;
      }
      return n;
    };
    switch (kind) {
      case 'harvest': case 'fish': return 1;
      case 'farm': return 2 + near((t) => t.imp === 'mill');
      case 'mine': return 2;
      case 'mill': return 1 + near((t) => t.imp === 'farm');
      case 'market': return 1;
      case 'tower': return 1;
    }
    return 0;
  }

  function build(s, x, y, kind) {
    const chk = canBuild(s, x, y, kind);
    if (!chk.ok) return chk;
    const p = s.turn;
    const P = s.players[p];
    const i = idx(x, y);
    const t = s.tiles[i];
    const city = s.cities[t.terr];
    P.gold -= BUILDS[kind].cost;
    if (kind === 'harvest' || kind === 'fish') {
      t.res = RES.NONE;
      addPop(s, city, 1);
    } else if (kind === 'farm') {
      t.imp = 'farm';
      addPop(s, city, 2);
      // Мельницы рядом получают по жителю за каждую новую ферму.
      for (const [dx, dy] of KING) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (s.tiles[j].imp === 'mill' && tileOwner(s, j) === p) addPop(s, s.cities[s.tiles[j].terr], 1);
      }
    } else if (kind === 'mill') {
      const n = buildPop(s, x, y, 'mill');
      t.imp = 'mill';
      addPop(s, city, n);
    } else {
      t.imp = kind;
      addPop(s, city, kind === 'mine' ? 2 : 1);
      if (kind === 'tower') { P.tower = true; P.clock += 6000; P.inc += 1000; }
    }
    s.events.push({ kind: 'build', x, y, what: kind });
    return OK;
  }

  function canResearch(s, techId) {
    const p = s.turn;
    const T = TECHS[techId];
    if (s.over) return fail('Партия окончена');
    if (!T) return fail('Нет такой технологии');
    if (hasTech(s, p, techId)) return fail('Уже изучено');
    if (T.req && !hasTech(s, p, T.req)) return fail(`Сначала «${TECHS[T.req].name}»`);
    if (s.players[p].gold < techCost(s, p, techId)) return fail('Не хватает золота');
    return OK;
  }

  function research(s, techId) {
    const chk = canResearch(s, techId);
    if (!chk.ok) return chk;
    s.players[s.turn].gold -= techCost(s, s.turn, techId);
    s.players[s.turn].techs.push(techId);
    s.events.push({ kind: 'tech', tech: techId });
    return OK;
  }

  function chooseLevel(s, cityId, opt) {
    const c = s.cities[cityId];
    if (!c || c.owner !== s.turn || !c.pending.length) return fail('Нечего выбирать');
    const level = c.pending.shift();
    const o = levelOptions(level)[opt ? 1 : 0];
    const P = s.players[c.owner];
    switch (o.id) {
      case 'workshop': c.workshop++; break;
      case 'treasury': P.gold += 5; break;
      case 'walls': c.walls = true; break;
      case 'militia': {
        const spot = [[0, 0]].concat(KING).map(([dx, dy]) => [c.x + dx, c.y + dy])
          .find(([x, y]) => inside(x, y) && passable(s.tiles[idx(x, y)]) && !unitAt(s, x, y));
        if (spot) {
          const u = makeUnit(s, 'warrior', c.owner, spot[0], spot[1]);
          u.fresh = true; u.moved = true;
          s.units.push(u);
        } else P.gold += 3;
        break;
      }
      case 'borders': c.border = 2; claimTerritory(s, c); break;
      case 'abundance': addPop(s, c, 3); break;
      case 'guild': c.guild++; break;
      case 'monument': c.monument++; break;
    }
    pushLog(s, `${cityName(s, c)}: ${o.name}`);
    return { ok: true, option: o };
  }

  function cityName(s, c) {
    return c.capital ? 'Столица' : `Город ${String.fromCharCode(1040 + c.id)}`;
  }

  // ---------- Ход ----------

  function beginTurn(s) {
    const p = s.turn;
    const P = s.players[p];
    s.events.push({ kind: 'turn', player: p });
    for (const u of s.units) if (u.owner === p) { u.moved = false; u.fresh = false; }
    // Юнит, простоявший на чужом городе до начала своего хода, захватывает его.
    for (const u of s.units) {
      if (u.owner !== p) continue;
      const c = cityAt(s, u.x, u.y);
      if (!c || c.owner === p) continue;
      const prev = c.owner;
      c.owner = p;
      c.pending = [];
      u.moved = true;
      if (prev === -1) { c.level = 1; c.pop = 0; }
      claimTerritory(s, c);
      s.events.push({ kind: 'citycapture', city: c.id, from: prev });
      pushLog(s, `${P.name} занимают ${c.capital ? 'вражескую столицу' : cityName(s, c).toLowerCase()}`);
      if (c.capital && prev >= 0) return finish(s, p, 'mate');
    }
    if (!ownedCities(s, 1 - p).length) return finish(s, p, 'conquest');
    P.gold += income(s, p);
  }

  function endTurn(s) {
    if (s.over) return fail('Партия окончена');
    const p = s.turn;
    for (const c of ownedCities(s, p)) while (c.pending.length) chooseLevel(s, c.id, 0);
    if (!s.players[p].flagged) s.players[p].clock += s.players[p].inc;
    if (p === 1) {
      if (s.round >= s.maxRounds) { finishByScore(s); return OK; }
      s.round++;
    }
    s.turn = 1 - p;
    beginTurn(s);
    if (!s.over && s.players[s.turn].flagged) {
      if (s.players[1 - s.turn].flagged) finishByScore(s);
      else endTurn(s);
    }
    return OK;
  }

  // Время игрока p вышло: империя замирает до конца партии, её ходы пропускаются.
  function flag(s, p) {
    if (s.over || s.players[p].flagged) return;
    s.players[p].flagged = true;
    s.players[p].clock = 0;
    pushLog(s, `У игрока «${s.players[p].name}» кончилось время`);
    if (s.players[1 - p].flagged) return finishByScore(s);
    if (s.turn === p) endTurn(s);
  }

  function resign(s, p) {
    if (s.over) return;
    finish(s, 1 - p, 'resign');
  }

  function finishByScore(s) {
    const a = score(s, 0), b = score(s, 1);
    finish(s, a === b ? 'draw' : a > b ? 0 : 1, 'score');
  }

  function finish(s, winner, reason) {
    s.over = true;
    s.winner = winner;
    s.endReason = reason;
    s.events.push({ kind: 'over', winner, reason });
  }

  function inCheck(s, p) {
    const c = capitalOf(s, p);
    if (!c) return false;
    const u = unitAt(s, c.x, c.y);
    return !!(u && u.owner !== p);
  }

  function pushLog(s, text) {
    s.log.push({ round: s.round, player: s.turn, text });
    if (s.log.length > 60) s.log.shift();
  }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  const api = {
    SIZE, N, TERRAIN, RES, UNITS, UNIT_ORDER, TECHS, TECH_ORDER, BUILDS, BUILD_ORDER, SCORE,
    KING, idx, xy, inside, cheb, mulberry32, passable,
    levelOptions, newGame, generateMap, cityAt, unitAt, unitById, ownedCities, capitalOf, hasTech,
    tileOwner, cityIncome, marketIncome, income, unitCap, techCost, score, unitMoves, attackMap,
    canMove, move, canBuy, buy, buildKindsFor, canBuild, buildPop, build, canResearch, research,
    chooseLevel, cityName, endTurn, flag, resign, inCheck, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlitzEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
