// Блиц Империй — интерфейс: меню, рейтинг, доска, часы, управление ботом.
(function () {
  'use strict';
  const E = window.BlitzEngine;
  const AI = window.BlitzAI;
  const $ = (id) => document.getElementById(id);
  const { idx, xy, UNITS, UNIT_ORDER, TECHS, BUILDS, TERRAIN, RES } = E;

  const COLORS = { p0: '#5b9bef', p1: '#e5a33d', neutral: '#a7afb6', danger: '#ff6159', gold: '#f3d877', ink: '#131a21' };
  const PCOL = [COLORS.p0, COLORS.p1];
  const TERRAIN_NAME = ['Поле', 'Лес', 'Горы', 'Вода'];
  const RES_NAME = { [RES.FRUIT]: 'фрукты', [RES.WHEAT]: 'пшеница', [RES.GAME]: 'дичь', [RES.ORE]: 'руда', [RES.FISH]: 'рыба' };
  const RES_ICON = { [RES.FRUIT]: '🍎', [RES.WHEAT]: '🌾', [RES.GAME]: '🦌', [RES.ORE]: '💎', [RES.FISH]: '🐟' };
  const IMP_NAME = { farm: 'Ферма', mine: 'Шахта', mill: 'Мельница', market: 'Рынок', tower: 'Башня времени' };
  const BUILD_KEYS = ['q', 'w', 'e', 'r'];

  // ---------- Профиль и рейтинг ----------
  const PROFILE_KEY = 'blitz-empires-profile-v1';
  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (p && typeof p.rating === 'number') return p;
    } catch (e) { /* хранилище недоступно */ }
    return { rating: 1000, games: 0, w: 0, l: 0, d: 0, history: [], seenRules: false };
  }
  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { /* без сохранения */ }
  }
  let profile = loadProfile();

  const RANKS = [[900, 'Бронза'], [1100, 'Серебро'], [1300, 'Золото'], [1500, 'Платина'], [1700, 'Алмаз'], [Infinity, 'Гроссмейстер']];
  const rankOf = (r) => RANKS.find(([lim]) => r < lim)[1];
  const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));

  function renderMenu() {
    $('mRating').textContent = Math.round(profile.rating);
    $('mRank').textContent = rankOf(profile.rating);
    $('mRecord').textContent = `${profile.w} побед · ${profile.l} поражений${profile.d ? ` · ${profile.d} ничьих` : ''}`;
    const opp = $('mOpponents');
    opp.innerHTML = '';
    for (const b of AI.BOTS) {
      const btn = document.createElement('button');
      btn.className = 'btn opp';
      const ch = Math.round(expected(profile.rating, b.rating) * 100);
      btn.innerHTML = `<b>${b.name}</b><span class="num">${b.rating}</span><span class="chance" title="Ожидаемый результат по рейтингу">${ch}%</span>`;
      btn.addEventListener('click', () => startGame({ mode: 'bot', bot: b }));
      opp.appendChild(btn);
    }
    const h = $('mHistory');
    h.innerHTML = '';
    if (!profile.history.length) {
      h.innerHTML = '<li><span></span><span>Пока пусто. Первая партия займёт около трёх минут.</span><span></span></li>';
    }
    for (const m of profile.history.slice(0, 8)) {
      const li = document.createElement('li');
      const cls = m.r === 1 ? 'res-w' : m.r === 0 ? 'res-l' : 'res-d';
      const mark = m.r === 1 ? 'П' : m.r === 0 ? 'Н' : '=';
      const sign = m.delta > 0 ? '+' : '';
      li.innerHTML = `<span class="${cls}">${mark}</span><span>${m.opp} · ${m.why}</span><span class="delta ${cls}">${sign}${m.delta}</span>`;
      h.appendChild(li);
    }
  }

  // ---------- Сессия партии ----------
  let G = null;
  const canvas = $('board');
  const ctx2d = canvas.getContext('2d');
  let boardPx = 540, ts = 60, dpr = 1;

  function startGame({ mode, bot }) {
    stopBot();
    const humanSide = mode === 'bot' ? (Math.random() < 0.5 ? 0 : 1) : null;
    const names = mode === 'bot'
      ? (humanSide === 0 ? ['Вы', bot.name] : [bot.name, 'Вы'])
      : ['Синие', 'Янтарные'];
    const state = E.newGame({ names });
    G = {
      state, mode, bot, humanSide, sel: null, anims: [], floaters: [],
      lastTs: performance.now(), botTurn: null, botKey: null, botTimer: null, token: Symbol('game'),
      toastTimer: null, finished: false, lastTurnKey: null,
    };
    $('menu').hidden = true;
    $('game').hidden = false;
    $('overlay').hidden = true;
    for (const p of [0, 1]) {
      $('name' + p).textContent = state.players[p].name;
    }
    resize();
    consumeEvents();
    refreshPanel();
    toast(mode === 'bot' ? (humanSide === 0 ? 'Вы ходите первыми — синие' : `Первым ходит ${bot.name}. Вы — янтарные`) : 'Ходят синие');
    maybeBot();
  }

  function toMenu() {
    stopBot();
    G = null;
    $('game').hidden = true;
    $('overlay').hidden = true;
    $('menu').hidden = false;
    renderMenu();
  }

  const isHumanTurn = () => G && !G.state.over && (G.mode === 'hotseat' || G.state.turn === G.humanSide);
  const viewer = () => (G.mode === 'hotseat' ? G.state.turn : G.humanSide);

  // Единая точка применения действия — и для человека, и для бота.
  function doAction(a) {
    const s = G.state;
    let pop = 0;
    let fromUnit = null;
    if (a.type === 'build') pop = E.buildPop(s, a.x, a.y, a.kind);
    if (a.type === 'move') { const u = E.unitById(s, a.unit); if (u) fromUnit = { x: u.x, y: u.y, type: u.type, owner: u.owner }; }
    const r = AI.apply(s, a);
    if (!r.ok) return r;
    const now = performance.now();
    if (a.type === 'move' && fromUnit) {
      G.anims.push({ unit: a.unit, fx: fromUnit.x, fy: fromUnit.y, tx: a.x, ty: a.y, t0: now, dur: 170 });
      if (r.captured) G.floaters.push({ x: a.x, y: a.y, text: r.died ? 'стены!' : 'взятие', color: COLORS.danger, t0: now });
    }
    if (a.type === 'build') G.floaters.push({ x: a.x, y: a.y, text: `+${pop}`, color: COLORS.gold, t0: now });
    if (a.type === 'research' && s.turn === viewer()) toast(`Изучено: ${TECHS[a.tech].name}`);
    if (a.type === 'level' && r.option && !isHumanTurn()) toast(`${s.players[s.turn].name}: ${r.option.name}`);
    afterChange();
    return r;
  }

  function endTurn() {
    if (!G || G.state.over) return;
    E.endTurn(G.state);
    G.sel = null;
    afterChange();
  }

  function afterChange() {
    if (!G) return;
    consumeEvents();
    const s = G.state;
    const key = s.round * 2 + s.turn;
    if (key !== G.lastTurnKey) {
      G.lastTurnKey = key;
      if (!s.over) {
        G.sel = null;
        if (G.mode === 'hotseat') toast(`Ход: ${s.players[s.turn].name}`);
        else if (isHumanTurn()) toast(E.inCheck(s, s.turn) ? 'Шах! Уберите врага со столицы' : 'Ваш ход');
        if (isHumanTurn()) autoSelect();
      }
    }
    refreshPanel();
    if (s.over) return finishGame();
    maybeBot();
  }

  // В начале хода выделяем столицу: самые частые действия — найм и постройки рядом.
  function autoSelect() {
    const cap = E.capitalOf(G.state, G.state.turn);
    if (cap) G.sel = { x: cap.x, y: cap.y };
  }

  function consumeEvents() {
    const s = G.state;
    const now = performance.now();
    for (const ev of s.events) {
      if (ev.kind === 'levelup') {
        const c = s.cities[ev.city];
        G.floaters.push({ x: c.x, y: c.y, text: `ур. ${ev.level}`, color: COLORS.gold, t0: now + 120 });
      } else if (ev.kind === 'citycapture') {
        const c = s.cities[ev.city];
        G.floaters.push({ x: c.x, y: c.y, text: 'захват', color: PCOL[c.owner], t0: now });
      }
    }
    s.events = [];
  }

  // ---------- Бот ----------
  function stopBot() {
    if (G && G.botTimer) clearTimeout(G.botTimer);
    if (G) G.botTimer = null;
  }

  function maybeBot() {
    if (!G || G.mode !== 'bot' || G.state.over || isHumanTurn() || G.botTimer) return;
    const s = G.state;
    const key = s.round * 2 + s.turn;
    if (G.botKey !== key) {
      G.botKey = key;
      G.botTurn = AI.createTurn(s, s.turn, G.bot);
    }
    const [a, b] = G.bot.think;
    let delay = a + Math.random() * (b - a);
    // Бот, как и человек, экономит время, когда часы на исходе.
    delay *= Math.max(0.2, Math.min(1, s.players[s.turn].clock / 45000));
    const token = G.token;
    G.botTimer = setTimeout(() => {
      if (!G || G.token !== token) return;
      G.botTimer = null;
      if (G.state.over || isHumanTurn()) return;
      const action = G.botTurn.next();
      if (!action) { endTurn(); return; }
      const r = doAction(action);
      if (!r.ok) { G.botTurn.failed(action); maybeBot(); }
    }, delay);
  }

  // ---------- Часы ----------
  function fmtClock(ms) {
    ms = Math.max(0, ms);
    if (ms < 10000) return (ms / 1000).toFixed(1);
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function tick(now) {
    if (G && !G.state.over) {
      const dt = Math.min(250, now - G.lastTs);
      const P = G.state.players[G.state.turn];
      if (!P.flagged) {
        P.clock -= dt;
        if (P.clock <= 0) {
          const p = G.state.turn;
          E.flag(G.state, p);
          toast(`${G.state.players[p].name}: время вышло — империя замерла`, true);
          stopBot();
          afterChange();
        }
      }
    }
    if (G) {
      G.lastTs = now;
      updateHud();
      draw(now);
    }
    requestAnimationFrame(tick);
  }

  function updateHud() {
    const s = G.state;
    for (const p of [0, 1]) {
      const P = s.players[p];
      $('clock' + p).textContent = P.flagged ? '0.0' : fmtClock(P.clock);
      const plate = $('plate' + p);
      plate.classList.toggle('active', s.turn === p && !s.over);
      plate.classList.toggle('low', P.clock < 10000);
      plate.classList.toggle('flagged', P.flagged);
      let sub = `${E.score(s, p)} очк.`;
      if (G.mode === 'bot') sub += p === G.humanSide ? ` · ${Math.round(profile.rating)}` : ` · ${G.bot.rating}`;
      if (P.inc) sub += ` · +${P.inc / 1000}с/ход`;
      if (P.flagged) sub = 'время вышло · ' + sub;
      $('sub' + p).textContent = sub;
    }
    $('roundVal').textContent = `${s.round}/${s.maxRounds}`;
    $('checkMark').hidden = !(!s.over && E.inCheck(s, s.turn));
  }

  // ---------- Панель решений ----------
  function refreshPanel() {
    const s = G.state;
    const me = viewer();
    const P = s.players[me];
    const my = isHumanTurn();
    $('sGold').textContent = P.gold;
    $('sIncome').textContent = '+' + E.income(s, me);
    $('sUnits').innerHTML = `${s.units.filter((u) => u.owner === me).length}<small>/${E.unitCap(s, me)}</small>`;
    $('btnEnd').disabled = !my;
    $('btnResign').disabled = s.over;

    // Награды за уровень.
    const lv = $('levelups');
    lv.innerHTML = '';
    if (my) {
      let first = true;
      for (const c of E.ownedCities(s, s.turn)) {
        if (!c.pending.length) continue;
        const opts = E.levelOptions(c.pending[0]);
        const box = document.createElement('div');
        box.className = 'panel levelup';
        box.innerHTML = `<h3><span>${E.cityName(s, c)} — уровень ${c.pending[0]}</span><span>выберите</span></h3><div class="opts"></div>`;
        opts.forEach((o, i) => {
          const b = document.createElement('button');
          b.className = 'choice';
          b.innerHTML = `<b>${o.name}${first ? ` <kbd>${i ? 'X' : 'Z'}</kbd>` : ''}</b><span>${o.desc}</span>`;
          b.addEventListener('click', () => doAction({ type: 'level', city: c.id, opt: i }));
          box.querySelector('.opts').appendChild(b);
        });
        lv.appendChild(box);
        first = false;
      }
    }

    renderSelection();
    renderTechs();

    const log = $('log');
    log.innerHTML = '';
    for (const l of s.log.slice(-6).reverse()) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${l.round}</span>${escapeHtml(l.text)}`;
      log.appendChild(li);
    }
  }

  function escapeHtml(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function selectionData() {
    const s = G.state;
    if (!G.sel) return {};
    const { x, y } = G.sel;
    const i = idx(x, y);
    return { x, y, i, tile: s.tiles[i], unit: E.unitAt(s, x, y), city: E.cityAt(s, x, y) };
  }

  function renderSelection() {
    const s = G.state;
    const box = $('selPanel');
    const d = selectionData();
    const my = isHumanTurn();
    const p = s.turn;
    if (!d.tile) {
      box.innerHTML = `<h3><span>Клетка не выбрана</span></h3><p class="hint">${my ? 'Нажмите на юнит, город или клетку своей территории. <kbd>Tab</kbd> — следующий юнит с ходом.' : 'Соперник думает. Нажмите на любую клетку, чтобы рассмотреть её.'}</p>`;
      return;
    }
    const parts = [];
    const ownerIdx = E.tileOwner(s, d.i);
    const ownerName = ownerIdx >= 0 ? s.players[ownerIdx].name : (d.city ? 'нейтральная' : 'ничья');
    let title = d.city ? (d.city.owner === -1 ? 'Деревня' : `${E.cityName(s, d.city)} · ур. ${d.city.level}`) : TERRAIN_NAME[d.tile.t];
    parts.push(`<h3><span>${title}</span><span>${ownerName}</span></h3>`);

    const info = [];
    if (d.city && d.city.owner >= 0) {
      info.push(`<span>Жители <b>${d.city.pop}/${d.city.level + 1}</b></span>`);
      info.push(`<span>Доход <b>+${E.cityIncome(s, d.city)}</b></span>`);
      if (d.city.walls) info.push('<span class="chip">стены</span>');
      if (d.city.border > 1) info.push('<span class="chip">границы 5×5</span>');
    }
    if (d.city && d.city.owner === -1) info.push('<span class="hint">Поставьте сюда юнит и дождитесь своего следующего хода — деревня станет вашим городом.</span>');
    if (!d.city) {
      if (d.tile.res) info.push(`<span>Ресурс: <b>${RES_NAME[d.tile.res]}</b></span>`);
      if (d.tile.imp) info.push(`<span>Постройка: <b>${IMP_NAME[d.tile.imp]}</b></span>`);
      if (d.tile.imp === 'market') info.push(`<span>Даёт <b>+${E.marketIncome(s, d.i)}</b> за ход</span>`);
      if (d.tile.t === TERRAIN.FOREST) info.push('<span class="hint">Лес останавливает движение по линии.</span>');
      if (!E.passable(d.tile)) info.push('<span class="hint">Непроходимо. Всадник перепрыгивает.</span>');
    }
    if (d.unit) {
      const U = UNITS[d.unit.type];
      const st = d.unit.owner !== p ? '' : d.unit.fresh ? 'новый — ходит со следующего хода' : d.unit.moved ? 'уже ходил' : 'может ходить';
      const danger = E.attackMap(s, 1 - d.unit.owner)[d.i] > 0;
      info.push(`<span><b style="color:${PCOL[d.unit.owner]}">${U.glyph} ${U.name}</b> — ${U.move}${st ? `. <i>${st}</i>` : ''}</span>`);
      if (danger) info.push('<span class="chip warn">под ударом</span>');
    }
    if (info.length) parts.push(`<div class="info-row">${info.join('')}</div>`);

    // Найм в своём городе.
    if (my && d.city && d.city.owner === p) {
      const acts = UNIT_ORDER.map((t, k) => {
        const U = UNITS[t];
        const chk = E.canBuy(s, d.city.id, t);
        return `<button class="act" data-buy="${t}" ${chk.ok ? '' : 'disabled'} title="${escapeHtml(chk.ok ? U.move : chk.error)}">
          <span class="g" style="color:${PCOL[p]}">${U.glyph}</span><span class="n">${U.name} <kbd>${k + 1}</kbd></span><span class="c">${U.cost}</span>
          <span class="d">${escapeHtml(chk.ok ? U.move : chk.error)}</span></button>`;
      }).join('');
      parts.push(`<div class="actions">${acts}</div>`);
    }

    // Постройки.
    if (my && !d.city && ownerIdx === p) {
      const kinds = E.buildKindsFor(s, d.i);
      if (kinds.length) {
        const acts = kinds.map((k, n) => {
          const chk = E.canBuild(s, d.x, d.y, k);
          const pop = E.buildPop(s, d.x, d.y, k);
          let desc = `+${pop} жит.`;
          if (k === 'mine') desc += ', +1 золото/ход';
          if (k === 'market') desc = `+1 жит., +${Math.min(4, adjCount(d.i, p))} золота/ход`;
          if (k === 'tower') desc = '+6 с сейчас, +1 с за каждый ход';
          if (!chk.ok) desc = chk.error;
          return `<button class="act" data-build="${k}" ${chk.ok ? '' : 'disabled'} title="${escapeHtml(desc)}">
            <span class="g">${buildGlyph(k, d.tile)}</span><span class="n">${BUILDS[k].name} <kbd>${BUILD_KEYS[n].toUpperCase()}</kbd></span><span class="c">${BUILDS[k].cost}</span>
            <span class="d">${escapeHtml(desc)}</span></button>`;
        }).join('');
        parts.push(`<div class="actions">${acts}</div>`);
      } else if (!d.tile.imp && E.passable(d.tile) === false && d.tile.res === RES.NONE) {
        parts.push('<p class="hint">Здесь нечего строить.</p>');
      }
    }
    if (my && d.unit && d.unit.owner === p && !d.unit.moved && !d.unit.fresh) {
      parts.push('<p class="hint">Точки на доске — куда можно пойти. Красное кольцо — взятие. Клетки под ударом врага отмечены красным.</p>');
    }
    box.innerHTML = parts.join('');
    box.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => buyUnit(b.dataset.buy)));
    box.querySelectorAll('[data-build]').forEach((b) => b.addEventListener('click', () => buildHere(b.dataset.build)));
  }

  function adjCount(i, p) {
    const s = G.state;
    const [x, y] = xy(i);
    let n = 0;
    for (const [dx, dy] of E.KING) {
      if (!E.inside(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (['farm', 'mine', 'mill'].includes(s.tiles[j].imp) && E.tileOwner(s, j) === p) n++;
    }
    return n;
  }

  function buildGlyph(k, tile) {
    if (k === 'harvest' || k === 'fish' || k === 'farm' || k === 'mine') return RES_ICON[tile.res] || '•';
    return { mill: '✣', market: '⚖', tower: '⧗' }[k] || '•';
  }

  function renderTechs() {
    const s = G.state;
    const me = viewer();
    const my = isHumanTurn();
    const box = $('techs');
    const cities = E.ownedCities(s, me).length;
    $('techNote').textContent = cities > 1 ? `+${cities - 1} к цене за города` : '';
    const rows = [
      ['Армия', ['riding', 'archery', 'chivalry']],
      ['Земля', ['agriculture', 'milling', 'trade']],
      ['Ремесло', ['mining', 'mechanics', 'chrono']],
      ['Вода', ['fishing']],
    ];
    box.innerHTML = '';
    for (const [label, ids] of rows) {
      const l = document.createElement('div');
      l.className = 'tech-row-label';
      l.textContent = label;
      box.appendChild(l);
      for (const t of ids) {
        const owned = E.hasTech(s, me, t);
        const chk = my ? E.canResearch(s, t) : { ok: false };
        const b = document.createElement('button');
        b.className = 'tech' + (owned ? ' owned' : '');
        b.disabled = owned || !chk.ok;
        b.title = owned ? 'Изучено' : (chk.error || `Открывает: ${TECHS[t].unlock}`);
        b.innerHTML = `<span class="n">${TECHS[t].name}</span><span class="u">${TECHS[t].unlock}</span><span class="c">${owned ? 'изучено' : E.techCost(s, me, t)}</span>`;
        if (!owned) b.addEventListener('click', () => { if (isHumanTurn()) doAction({ type: 'research', tech: t }); });
        box.appendChild(b);
      }
    }
  }

  function buyUnit(type, cityOverride) {
    if (!isHumanTurn()) return;
    const s = G.state;
    const d = selectionData();
    const city = cityOverride || (d.city && d.city.owner === s.turn ? d.city : E.capitalOf(s, s.turn));
    if (!city) return;
    const r = doAction({ type: 'buy', city: city.id, unit: type });
    if (!r.ok) toast(r.error, true);
  }

  function buildHere(kind) {
    if (!isHumanTurn() || !G.sel) return;
    const r = doAction({ type: 'build', x: G.sel.x, y: G.sel.y, kind });
    if (!r.ok) toast(r.error, true);
  }

  // ---------- Доска ----------
  function resize() {
    const wrap = $('boardWrap');
    const w = wrap.clientWidth;
    const narrow = window.innerWidth <= 900;
    const hLimit = narrow ? w : Math.max(320, window.innerHeight - 130);
    boardPx = Math.floor(Math.min(w, hLimit, 720));
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = boardPx + 'px';
    canvas.style.height = boardPx + 'px';
    canvas.width = Math.round(boardPx * dpr);
    canvas.height = Math.round(boardPx * dpr);
    ts = boardPx / E.SIZE;
  }

  const TERRAIN_COL = [
    ['#8b9c5c', '#829453'],
    ['#4f6d3e', '#486537'],
    ['#8a847d', '#807a73'],
    ['#3d6f90', '#38698a'],
  ];

  function draw(now) {
    const s = G.state;
    const c = ctx2d;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, boardPx, boardPx);
    const me = viewer();
    const enemyHits = E.attackMap(s, 1 - me);

    for (let i = 0; i < E.N; i++) {
      const [x, y] = xy(i);
      const t = s.tiles[i];
      const px = x * ts, py = y * ts;
      c.fillStyle = TERRAIN_COL[t.t][(x + y) % 2];
      c.fillRect(px, py, ts + 0.5, ts + 0.5);
      drawTerrain(c, t, px, py, x, y);
    }

    // Территории.
    for (let i = 0; i < E.N; i++) {
      const o = E.tileOwner(s, i);
      if (o < 0) continue;
      const [x, y] = xy(i);
      c.fillStyle = hexA(PCOL[o], 0.16);
      c.fillRect(x * ts, y * ts, ts, ts);
    }
    c.lineWidth = Math.max(2, ts * 0.045);
    for (let i = 0; i < E.N; i++) {
      const o = E.tileOwner(s, i);
      if (o < 0) continue;
      const [x, y] = xy(i);
      c.strokeStyle = PCOL[o];
      const edge = (nx, ny) => !E.inside(nx, ny) || E.tileOwner(s, idx(nx, ny)) !== o;
      const inset = c.lineWidth / 2;
      c.beginPath();
      if (edge(x, y - 1)) { c.moveTo(x * ts, y * ts + inset); c.lineTo((x + 1) * ts, y * ts + inset); }
      if (edge(x, y + 1)) { c.moveTo(x * ts, (y + 1) * ts - inset); c.lineTo((x + 1) * ts, (y + 1) * ts - inset); }
      if (edge(x - 1, y)) { c.moveTo(x * ts + inset, y * ts); c.lineTo(x * ts + inset, (y + 1) * ts); }
      if (edge(x + 1, y)) { c.moveTo((x + 1) * ts - inset, y * ts); c.lineTo((x + 1) * ts - inset, (y + 1) * ts); }
      c.stroke();
    }

    // Ресурсы и постройки.
    for (let i = 0; i < E.N; i++) {
      const [x, y] = xy(i);
      const t = s.tiles[i];
      if (t.imp) drawImprovement(c, t.imp, x * ts, y * ts);
      else if (t.res) {
        const rx = x * ts + ts * 0.22, ry = y * ts + ts * 0.22;
        c.fillStyle = 'rgba(19,26,33,0.5)';
        c.beginPath(); c.arc(rx, ry, ts * 0.18, 0, Math.PI * 2); c.fill();
        c.font = `${Math.round(ts * 0.24)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ece7da';
        c.fillText(RES_ICON[t.res], rx, ry + ts * 0.01);
      }
    }

    for (const city of s.cities) drawCity(c, city, now);

    // Выбор и ходы.
    const d = selectionData();
    let moves = [];
    if (d.unit && isHumanTurn() && d.unit.owner === s.turn && !d.unit.moved && !d.unit.fresh) moves = E.unitMoves(s, d.unit);
    if (d.tile) {
      c.strokeStyle = COLORS.gold;
      c.lineWidth = 3;
      roundRect(c, d.x * ts + 2, d.y * ts + 2, ts - 4, ts - 4, 6);
      c.stroke();
    }
    for (const m of moves) {
      const cx = (m.x + 0.5) * ts, cy = (m.y + 0.5) * ts;
      const hot = enemyHits[idx(m.x, m.y)] > 0;
      if (m.capture) {
        c.strokeStyle = COLORS.danger;
        c.lineWidth = 4;
        c.beginPath(); c.arc(cx, cy, ts * 0.42, 0, Math.PI * 2); c.stroke();
      } else {
        c.fillStyle = hot ? hexA(COLORS.danger, 0.9) : 'rgba(19,26,33,0.55)';
        c.beginPath(); c.arc(cx, cy, ts * 0.13, 0, Math.PI * 2); c.fill();
        if (hot) { c.strokeStyle = 'rgba(19,26,33,0.6)'; c.lineWidth = 1.5; c.stroke(); }
      }
    }

    // Юниты.
    G.anims = G.anims.filter((a) => now - a.t0 < a.dur);
    for (const u of s.units) {
      let ux = u.x, uy = u.y;
      const an = G.anims.find((a) => a.unit === u.id);
      if (an) {
        const k = easeOut((now - an.t0) / an.dur);
        ux = an.fx + (an.tx - an.fx) * k;
        uy = an.fy + (an.ty - an.fy) * k;
      }
      drawUnit(c, u, ux, uy, enemyHits, me);
    }

    // Всплывающие подписи.
    G.floaters = G.floaters.filter((f) => now - f.t0 < 1100);
    for (const f of G.floaters) {
      const k = Math.max(0, (now - f.t0) / 1100);
      if (now < f.t0) continue;
      c.globalAlpha = 1 - k;
      c.font = `700 ${Math.round(ts * 0.26)}px "Golos Text", system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4; c.strokeStyle = COLORS.ink;
      const fy = (f.y + 0.3) * ts - k * ts * 0.5;
      c.strokeText(f.text, (f.x + 0.5) * ts, fy);
      c.fillStyle = f.color;
      c.fillText(f.text, (f.x + 0.5) * ts, fy);
      c.globalAlpha = 1;
    }
  }

  function drawTerrain(c, t, px, py, x, y) {
    if (t.t === TERRAIN.FOREST) {
      c.fillStyle = '#2f4a27';
      for (const [ox, oy] of [[0.3, 0.62], [0.68, 0.5], [0.52, 0.82]]) {
        const cx = px + ox * ts, cy = py + oy * ts, h = ts * 0.22;
        c.beginPath(); c.moveTo(cx, cy - h); c.lineTo(cx + h * 0.6, cy + h * 0.3); c.lineTo(cx - h * 0.6, cy + h * 0.3); c.closePath(); c.fill();
      }
    } else if (t.t === TERRAIN.MOUNTAIN) {
      c.fillStyle = '#5f5953';
      c.beginPath(); c.moveTo(px + ts * 0.12, py + ts * 0.86); c.lineTo(px + ts * 0.48, py + ts * 0.26); c.lineTo(px + ts * 0.84, py + ts * 0.86); c.closePath(); c.fill();
      c.fillStyle = '#ece7da';
      c.beginPath(); c.moveTo(px + ts * 0.48, py + ts * 0.26); c.lineTo(px + ts * 0.58, py + ts * 0.43); c.lineTo(px + ts * 0.38, py + ts * 0.43); c.closePath(); c.fill();
    } else if (t.t === TERRAIN.WATER) {
      c.strokeStyle = '#6197b8';
      c.lineWidth = Math.max(1, ts * 0.03);
      for (const oy of [0.45, 0.7]) {
        c.beginPath();
        for (let k = 0; k <= 8; k++) {
          const xx = px + ts * (0.15 + k * 0.0875);
          const yy = py + ts * oy + Math.sin(k * 1.6 + x + y) * ts * 0.03;
          if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy);
        }
        c.stroke();
      }
    }
  }

  function drawImprovement(c, imp, px, py) {
    if (imp === 'farm') {
      c.fillStyle = '#c9a948';
      c.fillRect(px + ts * 0.1, py + ts * 0.1, ts * 0.8, ts * 0.8);
      c.strokeStyle = '#a3852f';
      c.lineWidth = Math.max(1.5, ts * 0.035);
      for (let k = 1; k < 5; k++) {
        c.beginPath(); c.moveTo(px + ts * 0.1, py + ts * (0.1 + k * 0.16)); c.lineTo(px + ts * 0.9, py + ts * (0.1 + k * 0.16)); c.stroke();
      }
    } else if (imp === 'mine') {
      c.fillStyle = '#3a3532';
      c.beginPath(); c.arc(px + ts * 0.5, py + ts * 0.86, ts * 0.2, Math.PI, 0); c.closePath(); c.fill();
      c.fillStyle = COLORS.gold;
      c.beginPath(); c.arc(px + ts * 0.5, py + ts * 0.8, ts * 0.05, 0, Math.PI * 2); c.fill();
    } else if (imp === 'mill') {
      const cx = px + ts * 0.5, cy = py + ts * 0.45;
      c.fillStyle = '#d9d2c2';
      c.fillRect(cx - ts * 0.08, cy, ts * 0.16, ts * 0.38);
      c.strokeStyle = '#ece7da'; c.lineWidth = Math.max(2, ts * 0.06);
      c.beginPath(); c.moveTo(cx - ts * 0.25, cy - ts * 0.25); c.lineTo(cx + ts * 0.25, cy + ts * 0.25);
      c.moveTo(cx + ts * 0.25, cy - ts * 0.25); c.lineTo(cx - ts * 0.25, cy + ts * 0.25); c.stroke();
    } else if (imp === 'market') {
      c.fillStyle = '#d9d2c2';
      c.fillRect(px + ts * 0.22, py + ts * 0.5, ts * 0.56, ts * 0.32);
      for (let k = 0; k < 4; k++) {
        c.fillStyle = k % 2 ? '#ece7da' : '#c0504a';
        c.fillRect(px + ts * (0.18 + k * 0.16), py + ts * 0.36, ts * 0.16, ts * 0.16);
      }
    } else if (imp === 'tower') {
      const cx = px + ts * 0.5;
      c.fillStyle = '#ece7da';
      c.beginPath(); c.moveTo(cx - ts * 0.2, py + ts * 0.18); c.lineTo(cx + ts * 0.2, py + ts * 0.18); c.lineTo(cx, py + ts * 0.5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(cx - ts * 0.2, py + ts * 0.82); c.lineTo(cx + ts * 0.2, py + ts * 0.82); c.lineTo(cx, py + ts * 0.5); c.closePath(); c.fill();
      c.fillStyle = COLORS.gold;
      c.beginPath(); c.moveTo(cx - ts * 0.1, py + ts * 0.82); c.lineTo(cx + ts * 0.1, py + ts * 0.82); c.lineTo(cx, py + ts * 0.66); c.closePath(); c.fill();
    }
  }

  function drawCity(c, city, now) {
    const s = G.state;
    const px = city.x * ts, py = city.y * ts;
    const col = city.owner >= 0 ? PCOL[city.owner] : COLORS.neutral;
    const checked = city.capital && city.owner >= 0 && E.inCheck(s, city.owner) && !s.over;
    if (checked) {
      c.fillStyle = hexA(COLORS.danger, 0.35 + 0.25 * Math.sin(now / 140));
      c.fillRect(px, py, ts, ts);
    }
    // Крепость: основание и зубцы.
    const bx = px + ts * 0.16, by = py + ts * 0.34, bw = ts * 0.68, bh = ts * 0.5;
    c.fillStyle = col;
    c.fillRect(bx, by, bw, bh);
    const tooth = bw / 5;
    for (let k = 0; k < 5; k += 2) c.fillRect(bx + k * tooth, by - ts * 0.1, tooth, ts * 0.1 + 1);
    c.strokeStyle = city.walls ? '#ece7da' : COLORS.ink;
    c.lineWidth = city.walls ? 3 : 1.5;
    c.strokeRect(bx, by, bw, bh);
    if (city.capital) {
      c.fillStyle = COLORS.gold;
      star(c, px + ts * 0.5, py + ts * 0.15, ts * 0.1);
    }
    // Уровень.
    if (city.owner >= 0) {
      c.fillStyle = COLORS.ink;
      c.beginPath(); c.arc(px + ts * 0.82, py + ts * 0.2, ts * 0.15, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ece7da';
      c.font = `700 ${Math.round(ts * 0.2)}px "JetBrains Mono", monospace`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(city.level), px + ts * 0.82, py + ts * 0.21);
      // Жители до следующего уровня.
      const need = city.level + 1;
      const pw = Math.min(ts * 0.14, (bw - 4) / need);
      for (let k = 0; k < need; k++) {
        c.fillStyle = k < city.pop ? COLORS.gold : 'rgba(19,26,33,0.55)';
        c.fillRect(bx + 2 + k * pw, py + ts * 0.9, pw - 2, ts * 0.06);
      }
    }
  }

  function drawUnit(c, u, ux, uy, enemyHits, me) {
    const s = G.state;
    const cx = (ux + 0.5) * ts, cy = (uy + 0.55) * ts;
    const r = ts * 0.3;
    const mine = u.owner === s.turn;
    const spent = mine && (u.moved || u.fresh) && !s.over;
    c.globalAlpha = spent ? 0.62 : 1;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(cx, cy + r * 0.85, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = PCOL[u.owner];
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = COLORS.ink; c.lineWidth = 2; c.stroke();
    c.fillStyle = COLORS.ink;
    c.font = `${Math.round(ts * 0.42)}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans","Apple Symbols",serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(UNITS[u.type].glyph, cx, cy + ts * 0.02);
    c.globalAlpha = 1;
    if (u.owner === me && enemyHits[idx(u.x, u.y)] > 0 && !s.over) {
      c.fillStyle = COLORS.danger;
      c.beginPath();
      c.moveTo(cx + r * 0.55, cy - r * 1.15); c.lineTo(cx + r * 1.15, cy - r * 1.15); c.lineTo(cx + r * 1.15, cy - r * 0.55); c.closePath(); c.fill();
    }
    if (mine && !u.moved && !u.fresh && isHumanTurn()) {
      c.strokeStyle = '#ece7da'; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, r + 3, 0, Math.PI * 2); c.stroke();
    }
  }

  function star(c, x, y, r) {
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5;
      const rr = k % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const easeOut = (k) => 1 - Math.pow(1 - Math.min(1, k), 3);

  // ---------- Ввод ----------
  canvas.addEventListener('click', (ev) => {
    if (!G) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * E.SIZE);
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * E.SIZE);
    if (!E.inside(x, y)) return;
    clickTile(x, y);
  });

  function clickTile(x, y) {
    const s = G.state;
    const d = selectionData();
    if (isHumanTurn() && d.unit && d.unit.owner === s.turn && !d.unit.moved && !d.unit.fresh) {
      if (E.unitMoves(s, d.unit).some((m) => m.x === x && m.y === y)) {
        const r = doAction({ type: 'move', unit: d.unit.id, x, y });
        if (!r.ok) toast(r.error, true);
        else G.sel = r.died ? null : { x, y };
        refreshPanel();
        return;
      }
    }
    G.sel = d.tile && d.x === x && d.y === y ? null : { x, y };
    refreshPanel();
  }

  function nextUnit() {
    const s = G.state;
    const ready = s.units.filter((u) => u.owner === s.turn && !u.moved && !u.fresh);
    if (!ready.length) { toast('Все юниты уже сходили'); return; }
    const cur = selectionData().unit;
    const k = cur ? ready.findIndex((u) => u.id === cur.id) : -1;
    const u = ready[(k + 1) % ready.length];
    G.sel = { x: u.x, y: u.y };
    refreshPanel();
  }

  document.addEventListener('keydown', (ev) => {
    if (!G || $('game').hidden || !$('overlay').hidden) return;
    if (ev.target.closest && ev.target.closest('input, textarea')) return;
    const k = ev.key.toLowerCase();
    if (k === ' ' || k === 'enter') { ev.preventDefault(); if (isHumanTurn()) endTurn(); return; }
    if (k === 'escape') { G.sel = null; refreshPanel(); return; }
    if (!isHumanTurn()) return;
    if (k === 'tab') { ev.preventDefault(); nextUnit(); return; }
    if (k >= '1' && k <= '5') { buyUnit(UNIT_ORDER[+k - 1]); return; }
    const bi = BUILD_KEYS.indexOf(k);
    if (bi >= 0 && G.sel) {
      const kinds = E.buildKindsFor(G.state, idx(G.sel.x, G.sel.y));
      if (kinds[bi]) buildHere(kinds[bi]);
      return;
    }
    if (k === 'z' || k === 'x' || k === 'я' || k === 'ч') {
      const c = E.ownedCities(G.state, G.state.turn).find((cc) => cc.pending.length);
      if (c) doAction({ type: 'level', city: c.id, opt: k === 'x' || k === 'ч' ? 1 : 0 });
    }
  });

  let toastTimer = null;
  function toast(text, bad) {
    const t = $('toast');
    t.textContent = text;
    t.classList.toggle('bad', !!bad);
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1800);
  }

  // ---------- Итог партии ----------
  function finishGame() {
    if (G.finished) return;
    G.finished = true;
    stopBot();
    const s = G.state;
    const sc = [E.score(s, 0), E.score(s, 1)];
    const why = {
      mate: 'Мат: столица взята',
      conquest: 'Все города захвачены',
      resign: 'Сдача',
      score: `По очкам развития ${sc[0]} : ${sc[1]}`,
    }[s.endReason];
    let title, ratingHtml = '';
    if (G.mode === 'bot') {
      const me = G.humanSide;
      const res = s.winner === 'draw' ? 0.5 : s.winner === me ? 1 : 0;
      title = res === 1 ? 'Победа' : res === 0 ? 'Поражение' : 'Ничья';
      const before = profile.rating;
      const K = profile.games < 10 ? 40 : 24;
      const delta = Math.round(K * (res - expected(before, G.bot.rating)));
      profile.rating = before + delta;
      profile.games++;
      if (res === 1) profile.w++; else if (res === 0) profile.l++; else profile.d++;
      profile.history.unshift({ opp: G.bot.name, r: res, delta, why: shortWhy(s.endReason), t: Date.now() });
      profile.history = profile.history.slice(0, 20);
      saveProfile();
      const sign = delta > 0 ? '+' : '';
      const rankNow = rankOf(profile.rating);
      const rankWas = rankOf(before);
      ratingHtml = `<div class="rating-row"><div class="delta-big" style="color:${delta >= 0 ? 'var(--ok)' : 'var(--danger)'}">${sign}${delta}</div>
        <div><div>Рейтинг ${Math.round(before)} → <b>${Math.round(profile.rating)}</b></div><div class="hint">${rankNow !== rankWas ? `Новый ранг: <b>${rankNow}</b>` : rankNow}</div></div></div>`;
    } else {
      title = s.winner === 'draw' ? 'Ничья' : `Победа: ${s.players[s.winner].name}`;
    }
    const clocks = s.players.map((P, p) => `${P.name}: осталось ${P.flagged ? '0.0' : fmtClock(P.clock)}`).join(' · ');
    showSheet(`
      <h2>${title}</h2>
      <p class="reason">${why}. ${clocks}.</p>
      ${ratingHtml}
      <div class="row-btns">
        <button class="btn btn-primary" id="again">Ещё матч</button>
        <button class="btn" id="toMenu">В меню</button>
      </div>`);
    $('again').addEventListener('click', () => startGame({ mode: G.mode, bot: G.mode === 'bot' ? pickOpponent() : null }));
    $('toMenu').addEventListener('click', toMenu);
  }

  function shortWhy(r) { return { mate: 'мат', conquest: 'захват', resign: 'сдача', score: 'по очкам' }[r]; }

  // «Поиск соперника»: бот с самым близким рейтингом, иногда на ступень сильнее.
  function pickOpponent() {
    const sorted = AI.BOTS.slice().sort((a, b) => Math.abs(a.rating - profile.rating) - Math.abs(b.rating - profile.rating));
    return Math.random() < 0.25 && sorted[1] ? sorted[1] : sorted[0];
  }

  function showSheet(html) {
    $('sheet').innerHTML = html;
    $('overlay').hidden = false;
  }

  function showRules() {
    const unitRows = UNIT_ORDER.map((t) => {
      const U = UNITS[t];
      return `<tr><td>${U.glyph}</td><td><b>${U.name}</b> — ${U.move}${U.tech ? ` <span class="hint">(${TECHS[U.tech].name})</span>` : ''}</td><td class="c">${U.cost} зол.</td></tr>`;
    }).join('');
    showSheet(`
      <h2>Как играть</h2>
      <ol class="rules">
        <li><b>Минута на всю партию.</b> Часы идут только в ваш ход, как в шахматном блице. Время вышло — империя замирает и больше не ходит.</li>
        <li><b>15 ходов.</b> Побеждает тот, у кого больше очков развития: 10 за каждый уровень городов, 4 за технологию, 2 за постройку, 20 за монумент.</li>
        <li><b>Мат.</b> Поставьте юнит на столицу соперника и удержите до начала своего хода — мгновенная победа. Если враг встал на вашу столицу, это шах: заберите его.</li>
        <li><b>Экономика.</b> Каждый ход города приносят золото. Тратьте его на сбор ресурсов и постройки на своей территории — жители поднимают уровень города, а уровень даёт доход и награду на выбор.</li>
        <li><b>Связки.</b> Мельница даёт жителя за каждую ферму рядом, рынок — золото за каждую ферму, шахту и мельницу рядом. Планируйте клетки заранее.</li>
        <li><b>Деревни.</b> Юнит, простоявший на деревне до своего следующего хода, превращает её в ваш город. Так же берутся вражеские города.</li>
        <li><b>Технологии</b> открывают фигуры и постройки. С каждым новым городом они дорожают на 1.</li>
      </ol>
      <table class="units-table">${unitRows}</table>
      <p class="hint">Встал на клетку врага — забрал фигуру. Горы и вода непроходимы, лес останавливает движение по линии. Новый юнит ходит со следующего хода. Лимит войск — сумма (уровень + 1) по вашим городам.</p>
      <p class="keys"><span><kbd>Пробел</kbd> конец хода</span><span><kbd>Tab</kbd> следующий юнит</span><span><kbd>1</kbd>–<kbd>5</kbd> нанять в выбранном городе или столице</span><span><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> постройки</span><span><kbd>Z</kbd>/<kbd>X</kbd> награда за уровень</span></p>
      <div class="row-btns"><button class="btn btn-primary" id="rulesOk">Понятно</button></div>`);
    $('rulesOk').addEventListener('click', () => {
      $('overlay').hidden = true;
      profile.seenRules = true;
      saveProfile();
    });
  }

  // ---------- Запуск ----------
  $('btnQuick').addEventListener('click', () => startGame({ mode: 'bot', bot: pickOpponent() }));
  $('btnHotseat').addEventListener('click', () => startGame({ mode: 'hotseat' }));
  $('btnRules').addEventListener('click', showRules);
  $('btnEnd').addEventListener('click', () => { if (isHumanTurn()) endTurn(); });
  $('btnResign').addEventListener('click', () => {
    if (!G || G.state.over) return;
    showSheet(`<h2>Сдаться?</h2><p class="reason">Партия засчитается как поражение.</p>
      <div class="row-btns"><button class="btn btn-primary" id="resYes">Сдаться</button><button class="btn" id="resNo">Играть дальше</button></div>`);
    $('resYes').addEventListener('click', () => {
      E.resign(G.state, G.mode === 'bot' ? G.humanSide : G.state.turn);
      $('overlay').hidden = true;
      afterChange();
    });
    $('resNo').addEventListener('click', () => { $('overlay').hidden = true; });
  });
  window.addEventListener('resize', () => { if (G) resize(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (G) resize(); }).observe($('boardWrap'));

  renderMenu();
  if (!profile.seenRules) showRules();
  requestAnimationFrame(tick);
})();
