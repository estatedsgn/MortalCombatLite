// Острова Племён — интерфейс и ход партии: меню, экран миров, выбор, действия, ходы ботов.
(function () {
  'use strict';
  const L = window.Isles;
  const V = window.IslesView;
  const $ = (id) => document.getElementById(id);

  const TERRAIN_NAME = { field: 'Поле', forest: 'Лес', mountain: 'Горы', water: 'Мелководье', ocean: 'Океан' };
  const RES_NAME = { fruit: 'фрукты', crop: 'пшеница', animal: 'звери', fish: 'рыба', ore: 'руда' };
  const IMP_NAME = { farm: 'Ферма', mine: 'Шахта', lumber: 'Лесопилка' };
  const ICON = {
    capture: '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M7 23V4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M8 5h12l-3 4 3 4H8z" fill="#ffd447"/></svg>',
    heal: '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M13 6v14M6 13h14" stroke="#7cf08c" stroke-width="4" stroke-linecap="round"/></svg>',
  };

  let s = null;
  let human = 0;
  let sel = null;
  let busy = false;
  let rewardQueue = [];
  const setup = { tribe: 0, opponents: 2, world: 'regions' };
  const WORLD_ORDER = ['regions', 'meadow', 'desert', 'tundra', 'sakura', 'jungle', 'ash'];
  const worldName = (w) => (w === 'regions' ? 'Регионы племён' : V.THEMES[w].name);
  const worldDesc = (w) => (w === 'regions' ? 'У каждого племени своя земля: луга, пустыня, сакура, тундра' : V.THEMES[w].desc);

  // ---------- Старт ----------
  V.init($('world'));
  showMenuWorld('regions');
  showMenu();

  function showMenuWorld(world) {
    const demo = L.newGame({ players: 4, allBots: true, seed: 11 });
    for (const p of demo.players) p.explored.fill(1);
    V.setState(demo, 0, world);
    V.focusCenter();
    V.setZoom(0.62);
    V.setOrbitSpeed(0.1);
  }

  function showMenu() {
    $('hud').hidden = true;
    $('worlds').hidden = true;
    sheet(`
      <div><div class="logo shadow-text">Острова Племён</div>
      <div class="tag shadow-text">Исследуй. Расти. Захватывай.</div></div>
      <div></div>
      <div class="menu-list">
        <button class="pill primary" id="mPlay">Новая игра</button>
        <button class="pill" id="mWorlds">Миры</button>
        <button class="pill" id="mHow">Как играть</button>
      </div>`, 'stage');
    $('mPlay').addEventListener('click', showSetup);
    $('mWorlds').addEventListener('click', () => showWorlds(setup.world));
    $('mHow').addEventListener('click', showRules);
  }

  function showSetup() {
    const tribes = L.TRIBES.map((t, i) => `<button class="chip${i === setup.tribe ? ' on' : ''}" data-tribe="${i}"><i style="background:${t.color}"></i>${t.name} <small>${V.THEMES[V.TRIBE_THEME[i]].name}</small></button>`).join('');
    const opps = [1, 2, 3].map((n) => `<button class="chip${n === setup.opponents ? ' on' : ''}" data-opp="${n}">${n}</button>`).join('');
    const worlds = WORLD_ORDER.map((w) => `<button class="chip${w === setup.world ? ' on' : ''}" data-world="${w}">${worldName(w)}</button>`).join('');
    sheet(`
      <h2>Новая игра</h2>
      <div class="label">Племя</div><div class="chips">${tribes}</div>
      <div class="label">Соперники</div><div class="chips">${opps}</div>
      <div class="label">Мир</div><div class="chips">${worlds}</div>
      <button class="pill primary" id="go">Начать</button>
      <button class="pill" id="back">Назад</button>`, true);
    document.querySelectorAll('[data-tribe]').forEach((b) => b.addEventListener('click', () => { setup.tribe = +b.dataset.tribe; showSetup(); }));
    document.querySelectorAll('[data-opp]').forEach((b) => b.addEventListener('click', () => { setup.opponents = +b.dataset.opp; showSetup(); }));
    document.querySelectorAll('[data-world]').forEach((b) => b.addEventListener('click', () => { setup.world = b.dataset.world; V.setTheme(setup.world); showSetup(); }));
    $('go').addEventListener('click', startGame);
    $('back').addEventListener('click', showMenu);
  }

  // Экран миров: один и тот же остров в разных климатах.
  function showWorlds(world) {
    closeSheet();
    setup.world = world;
    V.setTheme(world);
    $('worlds').hidden = false;
    $('wName').textContent = worldName(world);
    $('wDesc').textContent = worldDesc(world);
    $('wChips').innerHTML = WORLD_ORDER.map((w) => `<button class="chip${w === world ? ' on' : ''}" data-w="${w}">${worldName(w)}</button>`).join('');
    $('wChips').querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => showWorlds(b.dataset.w)));
  }
  $('wBack').addEventListener('click', () => { $('worlds').hidden = true; showMenu(); });
  $('wPlay').addEventListener('click', () => { $('worlds').hidden = true; showSetup(); });

  function showRules() {
    const inGame = s && !s.over;
    sheet(`
      <h2>Как играть</h2>
      <ol class="rules">
        <li><b>Звёзды</b> — валюта. Каждый ход города приносят звёзды по своему уровню.</li>
        <li><b>Ресурсы</b> на своей территории дают жителей. Жители растят город, а каждый уровень — награда на выбор.</li>
        <li><b>Технологии</b> открывают сбор ресурсов, постройки и юнитов. С каждым городом они дорожают.</li>
        <li><b>Юниты</b> ходят раз за ход и могут атаковать после шага. Лес и горы останавливают, рядом с врагом — тоже.</li>
        <li><b>Захват</b>: встаньте на деревню или город, в следующий ход нажмите флаг.</li>
        <li><b>Победа</b> — у соперников не осталось городов.</li>
      </ol>
      <p>Нажмите на клетку ещё раз, чтобы переключиться между юнитом и землёй под ним. Карту двигайте пальцем или мышью, масштаб — колесом или щипком.</p>
      <button class="pill primary" id="back">Понятно</button>`, true);
    $('back').addEventListener('click', () => (inGame ? closeSheet() : showMenu()));
  }

  function startGame() {
    const others = [0, 1, 2, 3].filter((t) => t !== setup.tribe).slice(0, setup.opponents);
    s = L.newGame({ players: setup.opponents + 1, tribes: [setup.tribe].concat(others) });
    human = 0;
    busy = false; rewardQueue = [];
    s.events = [];
    V.setOrbitSpeed(0);
    V.setState(s, human, setup.world);
    const cap = L.citiesOf(s, human)[0];
    V.focus(cap.x, cap.y, true);
    V.setZoom(1);
    closeSheet();
    $('worlds').hidden = true;
    $('hud').hidden = false;
    sel = { x: cap.x, y: cap.y, focus: 'tile' };
    refresh();
    toast('Ход 1');
  }

  // ---------- Действия ----------
  async function act(a) {
    if (!s || s.over) return { ok: false };
    const before = a.unit ? Object.assign({}, L.unitById(s, a.unit)) : null;
    const r = L.apply(s, a);
    if (!r.ok) { if (s.current === human) toast(r.error, true); return r; }
    const visible = (x, y) => L.explored(s, human, x, y);
    if (a.type === 'move') {
      if (s.current === human || visible(before.x, before.y) || visible(a.x, a.y)) await V.animateMove(a.unit, r.path);
    } else if (a.type === 'attack') {
      if (s.current === human || visible(before.x, before.y)) await V.animateAttack(a.unit, [before.x, before.y], [a.x, a.y], r);
    }
    V.sync(false);
    if (a.type === 'attack' && r.moveInto) await V.animateMove(a.unit, [r.moveInto]);
    if (a.type === 'build') V.floatText(a.x, a.y, '+' + r.pop, '#ffd447');
    if (a.type === 'recover') { const u = L.unitById(s, a.unit); V.floatText(u.x, u.y, '+' + r.heal, '#7cf08c'); }
    if (a.type === 'capture' && s.current === human) toast('Город наш!');
    consumeEvents();
    return r;
  }

  function consumeEvents() {
    for (const ev of s.events) {
      if (ev.kind === 'reveal' && ev.player === human) V.reveal(ev.tiles, ev.from);
      if (ev.kind === 'levelup' && ev.player === human) {
        const c = s.cities[ev.city];
        V.floatText(c.x, c.y, 'Уровень ' + ev.level, '#ffffff');
        rewardQueue.push(ev.city);
      }
      if (ev.kind === 'eliminated') toast(ev.player === human ? 'Ваше племя пало' : `${s.players[ev.player].name} повержены`);
    }
    s.events = [];
    if (rewardQueue.length && s.current === human) showReward();
  }

  function showReward() {
    const id = rewardQueue[0];
    const c = s.cities[id];
    if (!c || !c.pending.length || c.owner !== human) { rewardQueue.shift(); if (rewardQueue.length) showReward(); return; }
    const opts = L.rewardsFor(c.pending[0]);
    sheet(`<h2>${c.name} · уровень ${c.pending[0]}</h2><p>Выберите награду.</p>
      <div class="rewards">${opts.map((o, i) => `<button class="reward" data-r="${i}"><b>${o.name}</b><span>${o.desc}</span></button>`).join('')}</div>`, true);
    document.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', async () => {
      closeSheet();
      rewardQueue.shift();
      await act({ type: 'reward', city: id, opt: +b.dataset.r });
      refresh();
      if (rewardQueue.length) showReward();
    }));
  }

  async function nextTurn() {
    if (busy || !s || s.over || s.current !== human) return;
    busy = true;
    sel = null;
    V.setMarkers(null);
    refresh();
    L.endTurn(s);
    V.sync(false);
    consumeEvents();
    while (!s.over && s.current !== human) {
      const p = s.current;
      toast(`Ходят ${s.players[p].name}`);
      const ai = L.aiTurn(s, p);
      let a;
      while ((a = ai.next())) {
        const r = await act(a);
        if (!r.ok) ai.failed(a);
        refresh();
        await wait(a.type === 'move' || a.type === 'attack' ? 50 : 15);
      }
      if (s.over) break;
      L.endTurn(s);
      V.sync(false);
      consumeEvents();
    }
    busy = false;
    if (s.over) return finish();
    toast(`Ход ${s.turn}`);
    const cap = L.citiesOf(s, human)[0];
    if (cap && !sel) sel = { x: cap.x, y: cap.y, focus: 'tile' };
    refresh();
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Выбор ----------
  function onTileClick(t) {
    if (!s || busy || !t) return;
    const myTurn = s.current === human;
    const u = sel && sel.focus === 'unit' ? L.unitAt(s, sel.x, sel.y) : null;
    if (myTurn && u && u.owner === human) {
      const enemy = L.unitAt(s, t.x, t.y);
      if (enemy && enemy.owner !== human && L.targets(s, u).includes(enemy)) {
        busy = true;
        act({ type: 'attack', unit: u.id, x: t.x, y: t.y }).then(() => { busy = false; const uu = L.unitById(s, u.id); sel = uu ? { x: uu.x, y: uu.y, focus: 'unit' } : null; refresh(); if (s.over) finish(); });
        return;
      }
      if (L.reachable(s, u).has(t.y * s.size + t.x)) {
        busy = true;
        act({ type: 'move', unit: u.id, x: t.x, y: t.y }).then(() => { busy = false; sel = { x: t.x, y: t.y, focus: 'unit' }; refresh(); });
        return;
      }
    }
    const here = L.unitAt(s, t.x, t.y);
    const seen = L.explored(s, human, t.x, t.y);
    if (sel && sel.x === t.x && sel.y === t.y) {
      if (here && sel.focus === 'unit') sel.focus = 'tile';
      else if (here && sel.focus === 'tile' && seen) sel.focus = 'unit';
      else sel = null;
    } else sel = { x: t.x, y: t.y, focus: here && seen ? 'unit' : 'tile' };
    refresh();
  }

  // ---------- Интерфейс ----------
  function refresh() {
    if (!s) return;
    const P = s.players[human];
    $('hScore').textContent = L.score(s, human);
    $('hTurn').textContent = s.turn;
    $('hStars').innerHTML = `${P.stars} <small>+${L.income(s, human)}</small>`;
    $('btnNext').disabled = busy || s.current !== human;
    renderInfo();
    renderMarkers();
  }

  function renderMarkers() {
    if (!sel) { V.setMarkers(null); return; }
    const u = sel.focus === 'unit' ? L.unitAt(s, sel.x, sel.y) : null;
    let moves = [], attacks = [], extra = [];
    if (u && u.owner === human && s.current === human && !busy) {
      moves = [...L.reachable(s, u).keys()].map((i) => [i % s.size, (i / s.size) | 0]);
      attacks = L.targets(s, u).map((e) => [e.x, e.y]);
      if (L.canCapture(s, u)) extra = [[u.x, u.y]];
    }
    V.setMarkers([sel.x, sel.y], moves, attacks, extra);
  }

  function themeAt(t) {
    if (setup.world !== 'regions') return setup.world;
    let best = null;
    for (const c of s.cities) {
      if (!c.capital || c.owner < 0) continue;
      const d = Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y));
      if (!best || d < best.d) best = { d, th: V.themeOfTribe(s.players[c.owner].tribe) };
    }
    return best ? best.th : 'meadow';
  }

  function renderInfo() {
    const box = $('info');
    if (!sel) { box.innerHTML = `<div class="sub">Выберите юнит, город или клетку</div>`; return; }
    const t = L.tileAt(s, sel.x, sel.y);
    const myTurn = s.current === human && !busy;
    if (!L.explored(s, human, t.x, t.y)) { box.innerHTML = `<div class="title">Неизведанные земли</div><div class="sub">Отправьте юнит, чтобы развеять облака</div>`; return; }
    const u = sel.focus === 'unit' ? L.unitAt(s, t.x, t.y) : null;
    const city = L.cityAt(s, t.x, t.y);
    const dot = (p) => `<i style="background:${s.players[p].color}"></i>`;
    let title = '', sub = '';
    const acts = [];
    if (u) {
      const U = L.UNITS[u.type];
      title = `${dot(u.owner)}${U.name}${u.owner === human ? '' : ' · ' + s.players[u.owner].name}`;
      sub = `Здоровье <b>${u.hp}/${U.hp}</b> · Атака <b>${U.atk}</b> · Защита <b>${U.def}</b> · Ход <b>${U.move}</b>${U.range > 1 ? ` · Дальность <b>${U.range}</b>` : ''}`;
      if (u.owner === human && myTurn) {
        if (L.canCapture(s, u)) acts.push(actBtn('capture', ICON.capture, 'Захватить', '', true));
        if (u.hp < U.hp && !u.moved && !u.attacked) acts.push(actBtn('recover', ICON.heal, 'Лечить', '', true));
      }
    } else if (city) {
      if (city.owner < 0) {
        title = 'Деревня';
        sub = 'Поставьте сюда юнит и в следующий ход захватите';
      } else {
        title = `${dot(city.owner)}${city.name}${city.capital ? ' · столица' : ''}`;
        sub = `Уровень <b>${city.level}</b> · Жители <b>${city.pop}/${city.level + 1}</b> · Доход <b>+${L.cityIncome(city)}</b>${city.walls ? ' · Стены' : ''}`;
        if (city.owner === human) {
          const color = s.players[human].color;
          for (const type of L.TRAINABLE) {
            const U = L.UNITS[type];
            if (U.tech && !L.hasTech(s, human, U.tech) && L.TECHS[U.tech].tier > 2) continue;
            const chk = myTurn ? L.canTrain(s, city.id, type) : { ok: false };
            acts.push(actBtn('train:' + type, `<img src="${V.unitThumb(type, color)}" alt="">`, U.name, U.cost, chk.ok, chk.error));
          }
        }
      }
    } else {
      const own = L.tileOwner(s, t);
      title = (own >= 0 ? dot(own) : '') + (t.imp ? IMP_NAME[t.imp] : TERRAIN_NAME[t.t] + (t.res ? ' · ' + RES_NAME[t.res] : ''));
      const builds = L.buildsFor(s, t);
      if (own === human && builds.length) {
        sub = `+${L.BUILDS[builds[0]].pop} жит. городу ${s.cities[t.terr].name}`;
        for (const k of builds) {
          const b = L.BUILDS[k];
          const chk = myTurn ? L.canBuild(s, t.x, t.y, k) : { ok: false };
          acts.push(actBtn('build:' + k, `<img src="${V.buildThumb(k, themeAt(t))}" alt="">`, b.name, b.cost, chk.ok, chk.error));
        }
      } else {
        const notes = { mountain: L.hasTech(s, human, 'climbing') ? 'С гор видно дальше' : 'Нужно «Скалолазание»', water: 'Без кораблей не пройти', ocean: 'Открытый океан', forest: 'Лес останавливает движение', field: '' };
        sub = t.res && own !== human ? 'Ресурс можно собрать только на своей земле' : notes[t.t];
      }
    }
    box.innerHTML = `<div class="title">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}`;
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => runAct(b.dataset.act)));
  }

  function actBtn(id, icon, name, cost, ok, why) {
    return `<button class="act" data-act="${id}" ${ok ? '' : 'disabled'} title="${why || name}"><span class="ic">${icon}</span><span class="n">${name}</span>${cost ? `<span class="c">★${cost}</span>` : ''}</button>`;
  }

  async function runAct(id) {
    if (busy || s.current !== human) return;
    busy = true;
    const u = L.unitAt(s, sel.x, sel.y);
    const city = L.cityAt(s, sel.x, sel.y);
    if (id === 'capture') await act({ type: 'capture', unit: u.id });
    else if (id === 'recover') await act({ type: 'recover', unit: u.id });
    else if (id.startsWith('train:')) { const r = await act({ type: 'train', city: city.id, unit: id.slice(6) }); if (r.ok) sel.focus = 'unit'; }
    else if (id.startsWith('build:')) await act({ type: 'build', x: sel.x, y: sel.y, kind: id.slice(6) });
    busy = false;
    refresh();
    if (s.over) finish();
  }

  // ---------- Технологии ----------
  function showTech() {
    if (!s || busy) return;
    const myTurn = s.current === human;
    const branches = L.TECH_TREE.map((ids) => `<div class="branch">${ids.map((id) => {
      const T = L.TECHS[id];
      const owned = L.hasTech(s, human, id);
      const chk = myTurn ? L.canResearch(s, id) : { ok: false };
      return `<button class="tech ${owned ? 'owned' : chk.ok ? 'can' : ''}" data-tech="${id}" ${owned || !chk.ok ? 'disabled' : ''} title="${owned ? 'Изучено' : chk.error || ''}">
        <span class="n">${T.name}</span><span class="g">${T.gives}</span><span class="c">${owned ? 'Изучено' : '★' + L.techCost(s, human, id)}</span></button>`;
    }).join('')}</div>`).join('');
    sheet(`<h2>Технологии</h2><p>У вас ★${s.players[human].stars}. Цена растёт с числом городов.</p><div class="tree">${branches}</div><button class="pill" id="closeTech">Закрыть</button>`, true);
    document.querySelectorAll('[data-tech]').forEach((b) => b.addEventListener('click', async () => {
      const r = await act({ type: 'research', tech: b.dataset.tech });
      if (r.ok) toast(L.TECHS[b.dataset.tech].name);
      refresh();
      showTech();
    }));
    $('closeTech').addEventListener('click', closeSheet);
  }

  // ---------- Итог и пауза ----------
  function finish() {
    const win = s.winner === human;
    sheet(`<div><div class="logo shadow-text">${win ? 'Победа' : 'Поражение'}</div>
      <div class="tag shadow-text">${win ? 'Все соперники повержены' : `Остров за племенем ${s.players[s.winner].name}`} · ход ${s.turn} · ${L.score(s, human)} очков</div></div>
      <div></div>
      <div class="menu-list"><button class="pill primary" id="again">Ещё раз</button><button class="pill" id="toMenu">В меню</button></div>`, 'stage');
    $('again').addEventListener('click', startGame);
    $('toMenu').addEventListener('click', toMenu);
  }
  function toMenu() { s = null; showMenuWorld(setup.world); showMenu(); }

  function pauseMenu() {
    if (!s) return;
    sheet(`<h2>Пауза</h2><div class="menu-list"><button class="pill primary" id="resume">Продолжить</button><button class="pill" id="howIn">Как играть</button><button class="pill" id="quit">Выйти в меню</button></div>`, true);
    $('resume').addEventListener('click', closeSheet);
    $('howIn').addEventListener('click', showRules);
    $('quit').addEventListener('click', toMenu);
  }

  // ---------- Общее ----------
  function sheet(html, panel) {
    $('sheet').innerHTML = html;
    const stage = panel === 'stage';
    $('sheet').className = 'sheet' + (stage ? ' stage' : panel ? ' panel' : '');
    $('overlay').className = 'overlay' + (stage ? ' stage' : s && !s.over ? ' dim' : '');
    $('overlay').hidden = false;
  }
  function closeSheet() { $('overlay').hidden = true; }
  let toastTimer = null;
  function toast(text, bad) {
    const t = $('toast');
    t.textContent = text;
    t.style.color = bad ? 'var(--danger)' : '';
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1600);
  }

  // Хук для автотестов и отладки в консоли.
  window.IslesDebug = {
    state: () => s,
    async autoplay(turns) {
      for (let k = 0; k < turns && s && !s.over; k++) {
        const ai = L.aiTurn(s, human);
        let a;
        busy = true;
        while ((a = ai.next())) { rewardQueue = []; const r = await act(a); if (!r.ok) ai.failed(a); closeSheet(); }
        busy = false;
        await nextTurn();
      }
    },
  };

  $('btnNext').addEventListener('click', nextTurn);
  $('btnTech').addEventListener('click', showTech);
  $('btnMenu').addEventListener('click', pauseMenu);
  document.addEventListener('keydown', (e) => {
    if (!$('overlay').hidden) { if (e.key === 'Escape' && s && !s.over) closeSheet(); return; }
    if (!s) return;
    if (e.key === 'Enter') nextTurn();
    if (e.key === 'Escape') { sel = null; refresh(); }
    if (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'е') showTech();
  });

  // Перетаскивание, масштаб, клик по клетке.
  const canvas = $('world');
  const pointers = new Map();
  let dragDist = 0, pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragDist = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) V.zoomBy(d / pinch);
      pinch = d; dragDist = 99;
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    dragDist += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX; p.y = e.clientY;
    if (dragDist > 6 && s) V.panBy(dx, dy);
  });
  canvas.addEventListener('pointerup', (e) => {
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (had && dragDist <= 6 && pointers.size === 0 && s && $('overlay').hidden) onTileClick(V.pick(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); V.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
})();
