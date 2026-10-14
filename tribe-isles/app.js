// Острова Племён — интерфейс и ход партии: выбор, действия игрока, ходы ботов, оверлеи.
(function () {
  'use strict';
  const L = window.Isles;
  const V = window.IslesView;
  const $ = (id) => document.getElementById(id);

  const UNIT_ICON = { warrior: '🗡️', rider: '🐎', archer: '🏹', defender: '🛡️', swordsman: '⚔️', catapult: '☄️', knight: '🏇', giant: '👹' };
  const BUILD_ICON = { fruit: '🍎', hunt: '🦌', fish: '🐟', farm: '🌾', mine: '⛏️', lumber: '🪓' };
  const TERRAIN_NAME = { field: 'Поле', forest: 'Лес', mountain: 'Горы', water: 'Мелководье', ocean: 'Океан' };
  const RES_NAME = { fruit: 'Фрукты', crop: 'Пшеница', animal: 'Дикие звери', fish: 'Рыба', ore: 'Руда' };
  const IMP_NAME = { farm: 'Ферма', mine: 'Шахта', lumber: 'Лесопилка' };

  let s = null;
  let human = 0;
  let sel = null; // { x, y, focus: 'unit' | 'tile' }
  let busy = false;
  let rewardQueue = [];
  const setup = { tribe: 0, opponents: 2 };

  // ---------- Старт ----------
  V.init($('world'));
  showMenuWorld();
  showMenu();

  function showMenuWorld() {
    const demo = L.newGame({ players: 3, allBots: true, seed: 7 });
    for (const p of demo.players) p.explored.fill(1);
    V.setState(demo, 0);
    V.focus(0, 0, true);
    V.zoomBy(0.8);
    V.setOrbitSpeed(0.12);
  }

  function showMenu() {
    $('hud').hidden = true;
    const tribes = L.TRIBES.map((t, i) => `<button class="tribe${i === setup.tribe ? ' on' : ''}" data-tribe="${i}"><i style="background:${t.color}"></i>${t.name}</button>`).join('');
    const opps = [1, 2, 3].map((n) => `<button data-opp="${n}" class="${n === setup.opponents ? 'on' : ''}">${n}</button>`).join('');
    sheet(`
      <h1>Острова Племён</h1>
      <p>Пошаговая стратегия про племена на островах. Исследуйте туман, собирайте ресурсы, растите города и захватите столицы соперников.</p>
      <div class="label">Ваше племя</div>
      <div class="tribes">${tribes}</div>
      <div class="label">Соперники</div>
      <div class="seg">${opps}</div>
      <button class="big" id="play">Играть</button>
      <button class="ghost" id="how">Как играть</button>`);
    document.querySelectorAll('[data-tribe]').forEach((b) => b.addEventListener('click', () => { setup.tribe = +b.dataset.tribe; showMenu(); }));
    document.querySelectorAll('[data-opp]').forEach((b) => b.addEventListener('click', () => { setup.opponents = +b.dataset.opp; showMenu(); }));
    $('play').addEventListener('click', startGame);
    $('how').addEventListener('click', showRules);
  }

  function showRules() {
    sheet(`
      <h2>Как играть</h2>
      <ol class="rules">
        <li><b>Звёзды</b> — валюта. Каждый ход города приносят звёзды по своему уровню.</li>
        <li><b>Ресурсы</b> на вашей территории (фрукты, звери, рыба, пшеница, руда) дают жителей. Жители поднимают уровень города, а уровень даёт награду на выбор.</li>
        <li><b>Технологии</b> открывают сбор ресурсов, новые постройки и юнитов. С каждым городом они дорожают.</li>
        <li><b>Юниты</b> ходят один раз за ход и могут атаковать после шага. Лес и горы останавливают движение, рядом с врагом тоже придётся остановиться.</li>
        <li><b>Деревни и города</b> захватываются так: встаньте на них юнитом, а в следующий ход нажмите «Захватить».</li>
        <li><b>Победа</b> — когда у соперников не осталось ни одного города.</li>
      </ol>
      <p>Нажмите на клетку ещё раз, чтобы переключиться между юнитом и клеткой под ним. Карту можно двигать пальцем или мышью, колесо и щипок — масштаб.</p>
      <button class="big" id="back">Понятно</button>`);
    $('back').addEventListener('click', () => (s && !s.over ? closeSheet() : showMenu()));
  }

  function startGame() {
    const others = [0, 1, 2, 3].filter((t) => t !== setup.tribe).slice(0, setup.opponents);
    s = L.newGame({ players: setup.opponents + 1, tribes: [setup.tribe].concat(others) });
    human = 0;
    sel = null; busy = false; rewardQueue = [];
    s.events = [];
    V.setOrbitSpeed(0);
    V.setState(s, human);
    const cap = L.citiesOf(s, human)[0];
    V.focus(cap.x, cap.y, true);
    V.zoomBy(1 / 0.8);
    closeSheet();
    $('hud').hidden = false;
    const b = $('tribeBadge');
    b.querySelector('i').style.background = s.players[human].color;
    b.querySelector('span').textContent = s.players[human].name;
    sel = { x: cap.x, y: cap.y, focus: 'tile' };
    refresh();
    toast('Ход 1 — исследуйте остров');
  }

  // ---------- Действия ----------
  async function act(a) {
    if (!s || s.over) return { ok: false };
    const before = a.unit ? Object.assign({}, L.unitById(s, a.unit)) : null;
    const r = L.apply(s, a);
    if (!r.ok) { if (s.current === human) toast(r.error, true); return r; }
    const visible = (x, y) => L.explored(s, human, x, y);
    if (a.type === 'move') {
      const show = s.current === human || visible(before.x, before.y) || visible(a.x, a.y);
      if (show) await V.animateMove(a.unit, r.path);
    } else if (a.type === 'attack') {
      if (s.current === human || visible(before.x, before.y)) await V.animateAttack(a.unit, [before.x, before.y], [a.x, a.y], r);
    }
    V.sync(false);
    if (a.type === 'attack' && r.moveInto) await V.animateMove(a.unit, [r.moveInto]);
    if (a.type === 'build') V.floatText(a.x, a.y, '+' + r.pop, '#ffd23f');
    if (a.type === 'recover') { const u = L.unitById(s, a.unit); V.floatText(u.x, u.y, '+' + r.heal, '#7cf08c'); }
    if (a.type === 'capture' && s.current === human) toast('Город захвачен!');
    consumeEvents();
    return r;
  }

  function consumeEvents() {
    for (const ev of s.events) {
      if (ev.kind === 'reveal' && ev.player === human) V.reveal(ev.tiles, ev.from);
      if (ev.kind === 'levelup' && ev.player === human) {
        const c = s.cities[ev.city];
        V.floatText(c.x, c.y, 'Уровень ' + ev.level + '!', '#ffffff');
        rewardQueue.push(ev.city);
      }
      if (ev.kind === 'eliminated') toast(ev.player === human ? 'Ваше племя пало' : `${s.players[ev.player].name} уничтожены`);
    }
    s.events = [];
    if (rewardQueue.length && s.current === human) showReward();
  }

  function showReward() {
    const id = rewardQueue[0];
    const c = s.cities[id];
    if (!c || !c.pending.length || c.owner !== human) { rewardQueue.shift(); if (rewardQueue.length) showReward(); return; }
    const opts = L.rewardsFor(c.pending[0]);
    sheet(`<h2>${c.name}: уровень ${c.pending[0]}</h2><p>Выберите награду для города.</p>
      <div class="rewards">${opts.map((o, i) => `<button class="reward" data-r="${i}"><b>${o.name}</b><span>${o.desc}</span></button>`).join('')}</div>`);
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
        await wait(a.type === 'move' || a.type === 'attack' ? 60 : 20);
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

  // ---------- Выбор и клики ----------
  function onTileClick(t) {
    if (!s || busy || !t) return;
    const myTurn = s.current === human;
    const u = sel && sel.focus === 'unit' ? L.unitAt(s, sel.x, sel.y) : null;
    if (myTurn && u && u.owner === human) {
      const enemy = L.unitAt(s, t.x, t.y);
      if (enemy && enemy.owner !== human && L.targets(s, u).includes(enemy)) {
        busy = true;
        act({ type: 'attack', unit: u.id, x: t.x, y: t.y }).then(() => { busy = false; const uu = L.unitById(s, u.id); sel = uu ? { x: uu.x, y: uu.y, focus: 'unit' } : null; refresh(); maybeEnd(); });
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
    } else {
      sel = { x: t.x, y: t.y, focus: here && seen ? 'unit' : 'tile' };
    }
    refresh();
  }

  function maybeEnd() { if (s.over) finish(); }

  // ---------- Отрисовка интерфейса ----------
  function refresh() {
    if (!s) return;
    const P = s.players[human];
    $('hScore').textContent = L.score(s, human);
    $('hTurn').textContent = s.turn;
    $('hStars').innerHTML = `${P.stars} <small>(+${L.income(s, human)})</small>`;
    $('btnNext').disabled = busy || s.current !== human;
    $('btnTech').disabled = busy;
    renderCard();
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

  function renderCard() {
    const card = $('card');
    if (!sel) { card.hidden = true; return; }
    const t = L.tileAt(s, sel.x, sel.y);
    const seen = L.explored(s, human, t.x, t.y);
    const myTurn = s.current === human && !busy;
    const parts = [];
    if (!seen) {
      parts.push(`<div class="title">Неизведанные земли</div><div class="desc">Отправьте сюда юнит, чтобы развеять облака.</div>`);
      card.innerHTML = parts.join(''); card.hidden = false; return;
    }
    const u = sel.focus === 'unit' ? L.unitAt(s, t.x, t.y) : null;
    const city = L.cityAt(s, t.x, t.y);
    const acts = [];
    if (u) {
      const U = L.UNITS[u.type];
      const P = s.players[u.owner];
      parts.push(`<div class="title"><i style="background:${P.color}"></i>${U.name}${u.owner === human ? '' : ' · ' + P.name}</div>`);
      parts.push(`<div class="stats-row"><span>Здоровье <b>${u.hp}/${U.hp}</b></span><span>Атака <b>${U.atk}</b></span><span>Защита <b>${U.def}</b></span><span>Ход <b>${U.move}</b></span><span>Дальность <b>${U.range}</b></span></div>`);
      if (u.owner === human) {
        let hint = u.moved && u.attacked ? 'Юнит уже сходил.' : u.moved ? 'Можно атаковать врага в красном кольце.' : 'Белые точки — куда можно пойти, красные кольца — атака.';
        if (L.canCapture(s, u)) hint = 'Можно захватить этот город.';
        parts.push(`<div class="desc">${hint}</div>`);
        if (myTurn && L.canCapture(s, u)) acts.push(actBtn('capture', '🚩', 'Захватить', '', true, 'gold'));
        if (myTurn && u.hp < U.hp && !u.moved && !u.attacked) acts.push(actBtn('recover', '❤️', 'Лечить', '', true, 'green'));
      }
    } else if (city) {
      const own = city.owner;
      const color = own >= 0 ? s.players[own].color : '#8b98a3';
      if (own < 0) {
        parts.push(`<div class="title"><i style="background:${color}"></i>Деревня</div><div class="desc">Поставьте сюда юнит и в следующий ход захватите — получите новый город.</div>`);
      } else {
        parts.push(`<div class="title"><i style="background:${color}"></i>${city.name}${city.capital ? ' · столица' : ''}${own === human ? '' : ' · ' + s.players[own].name}</div>`);
        parts.push(`<div class="stats-row"><span>Уровень <b>${city.level}</b></span><span>Жители <b>${city.pop}/${city.level + 1}</b></span><span>Доход <b>+${L.cityIncome(city)}</b></span>${city.walls ? '<span><b>Стены</b></span>' : ''}</div>`);
        if (own === human) {
          for (const type of L.TRAINABLE) {
            const U = L.UNITS[type];
            const chk = myTurn ? L.canTrain(s, city.id, type) : { ok: false };
            const locked = U.tech && !L.hasTech(s, human, U.tech);
            if (locked && type !== 'rider' && type !== 'archer' && type !== 'defender') continue;
            acts.push(actBtn('train:' + type, UNIT_ICON[type], U.name, '★' + U.cost, chk.ok, '', chk.error));
          }
          const total = s.units.filter((x) => x.owner === human).length;
          parts.push(`<div class="desc">Юнитов: ${total} из ${L.unitCap(s, human)}. Город должен быть свободен, чтобы обучить юнита.</div>`);
        }
      }
    } else {
      let title = TERRAIN_NAME[t.t];
      if (t.imp) title = IMP_NAME[t.imp];
      else if (t.res) title = `${TERRAIN_NAME[t.t]} · ${RES_NAME[t.res]}`;
      const own = L.tileOwner(s, t);
      parts.push(`<div class="title">${own >= 0 ? `<i style="background:${s.players[own].color}"></i>` : ''}${title}</div>`);
      const builds = L.buildsFor(s, t);
      if (own === human && builds.length) {
        for (const k of builds) {
          const b = L.BUILDS[k];
          const chk = myTurn ? L.canBuild(s, t.x, t.y, k) : { ok: false };
          acts.push(actBtn('build:' + k, BUILD_ICON[k], b.name, '★' + b.cost, chk.ok, '', chk.error));
        }
        parts.push(`<div class="desc">+${L.BUILDS[builds[0]].pop} жит. городу «${s.cities[t.terr].name}».</div>`);
      } else {
        const notes = { mountain: L.hasTech(s, human, 'climbing') ? 'Юниты видят дальше с гор.' : 'Нужно «Скалолазание», чтобы пройти.', water: 'Без кораблей сюда не пройти.', ocean: 'Открытый океан.', forest: 'Лес останавливает движение.', field: '' };
        const extra = t.res && own !== human ? 'Ресурс можно собрать только на своей территории.' : notes[t.t];
        if (extra) parts.push(`<div class="desc">${extra}</div>`);
      }
    }
    if (acts.length) parts.push(`<div class="acts">${acts.join('')}</div>`);
    card.innerHTML = parts.join('');
    card.hidden = false;
    card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => runAct(b.dataset.act)));
  }

  function actBtn(id, icon, name, cost, ok, cls, why) {
    return `<button class="act ${cls || ''}" data-act="${id}" ${ok ? '' : 'disabled'} title="${why || name}"><span class="ic">${icon}</span><span class="n">${name}</span>${cost ? `<span class="c">${cost}</span>` : ''}</button>`;
  }

  async function runAct(id) {
    if (busy || s.current !== human) return;
    busy = true;
    const u = L.unitAt(s, sel.x, sel.y);
    const city = L.cityAt(s, sel.x, sel.y);
    if (id === 'capture') await act({ type: 'capture', unit: u.id });
    else if (id === 'recover') await act({ type: 'recover', unit: u.id });
    else if (id.startsWith('train:')) {
      const r = await act({ type: 'train', city: city.id, unit: id.slice(6) });
      if (r.ok) sel.focus = 'unit';
    } else if (id.startsWith('build:')) await act({ type: 'build', x: sel.x, y: sel.y, kind: id.slice(6) });
    busy = false;
    refresh();
    maybeEnd();
  }

  // ---------- Технологии ----------
  function showTech() {
    if (!s || busy) return;
    const myTurn = s.current === human;
    const branches = L.TECH_TREE.map((ids) => {
      const cells = ids.map((id, k) => {
        const T = L.TECHS[id];
        const owned = L.hasTech(s, human, id);
        const chk = myTurn ? L.canResearch(s, id) : { ok: false };
        const cls = owned ? 'owned' : chk.ok ? 'can' : '';
        const arrow = k && T.req === ids[k - 1] ? '<div class="tier-arrow">▼</div>' : k ? '<div class="tier-arrow">▽ ' + L.TECHS[T.req].name + '</div>' : '';
        return `${arrow}<button class="tech ${cls}" data-tech="${id}" ${owned || !chk.ok ? 'disabled' : ''} title="${owned ? 'Изучено' : chk.error || ''}">
          <span class="n">${T.name}</span><span class="g">${T.gives}</span><span class="c">${owned ? 'Изучено' : '★' + L.techCost(s, human, id)}</span></button>`;
      }).join('');
      return `<div class="branch">${cells}</div>`;
    }).join('');
    sheet(`<h2>Технологии</h2><p>У вас ★${s.players[human].stars}. Цена растёт с числом городов.</p><div class="tree">${branches}</div><button class="ghost" id="closeTech">Закрыть</button>`);
    document.querySelectorAll('[data-tech]').forEach((b) => b.addEventListener('click', async () => {
      const r = await act({ type: 'research', tech: b.dataset.tech });
      if (r.ok) toast('Изучено: ' + L.TECHS[b.dataset.tech].name);
      refresh();
      showTech();
    }));
    $('closeTech').addEventListener('click', closeSheet);
  }

  // ---------- Итог ----------
  function finish() {
    const win = s.winner === human;
    sheet(`<h1>${win ? 'Победа!' : 'Поражение'}</h1>
      <p>${win ? 'Все соперники повержены' : `Остров за племенем ${s.players[s.winner].name}`}. Ход ${s.turn}, очки ${L.score(s, human)}.</p>
      <button class="big" id="again">Новая игра</button><button class="ghost" id="toMenu">В меню</button>`);
    $('again').addEventListener('click', startGame);
    $('toMenu').addEventListener('click', () => { s = null; showMenuWorld(); showMenu(); });
  }

  function gameMenu() {
    if (!s) return;
    sheet(`<h2>Пауза</h2><button class="big" id="resume">Продолжить</button><button class="ghost" id="howIn">Как играть</button><button class="ghost" id="quit">Выйти в меню</button>`);
    $('resume').addEventListener('click', closeSheet);
    $('howIn').addEventListener('click', showRules);
    $('quit').addEventListener('click', () => { s = null; showMenuWorld(); showMenu(); });
  }

  // ---------- Общие элементы ----------
  function sheet(html) { $('sheet').innerHTML = html; $('overlay').hidden = false; }
  function closeSheet() { $('overlay').hidden = true; }
  let toastTimer = null;
  function toast(text, bad) {
    const t = $('toast');
    t.textContent = text;
    t.style.color = bad ? 'var(--danger)' : '';
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1700);
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
  $('btnMenu').addEventListener('click', gameMenu);
  document.addEventListener('keydown', (e) => {
    if (!$('overlay').hidden) { if (e.key === 'Escape' && s && !s.over) closeSheet(); return; }
    if (e.key === 'Enter') nextTurn();
    if (e.key === 'Escape') { sel = null; refresh(); }
    if (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'е') showTech();
  });

  // Перетаскивание карты, масштаб колесом и щипком, клик по клетке.
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
  const up = (e) => {
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (had && dragDist <= 6 && pointers.size === 0 && s && $('overlay').hidden) onTileClick(V.pick(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); V.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
})();
