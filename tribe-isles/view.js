// Острова Племён — 3D-сцена на three.js: парящие плитки, облака тумана, анимации юнитов.
(function (root) {
  'use strict';
  const L = root.Isles;

  const COL = {
    field: 0x93cf5c, forest: 0x7cbf4e, mountain: 0x8fc05a, water: 0x5fd0dc, ocean: 0x2d97c0,
    dirt: 0x9b7448, dirtDark: 0x7a5836, waterSide: 0x3fa9c4,
    tree: 0x3f8f3f, treeDark: 0x2f7434, trunk: 0x7a5232, rock: 0xa49a8f, snow: 0xf6f3ee,
    fruit: 0xe8453c, bush: 0x4c9e3e, crop: 0xf0cb4a, deer: 0xa86b3c, fish: 0xff9a3c, ore: 0x6fc7ff,
    hut: 0xe8d6b0, hutRoof: 0x9a5b34, stone: 0xcfc6b8, skin: 0xf2c9a0, wood: 0x8a5a33, metal: 0xd9dde2,
    cloud: 0xffffff,
  };

  let renderer, scene, camera, raycaster, clock;
  let S = 0, state = null, human = 0;
  let canvasEl;
  const tiles = []; // { group, block, top, deco, sig, cloud, explored }
  const unitObjs = new Map(); // id -> { group, body mats, label, hp, exhausted, busy }
  const cityObjs = new Map(); // id -> { group, sig, label }
  let borderGroup, markerGroup, selRing;
  const tweens = [];
  let target = new THREE.Vector3();
  let zoom = 1, viewH = 10, orbit = Math.PI / 4, orbitSpeed = 0;
  let markers = [];

  // ---------- Утилиты ----------
  const mat = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));
  const flat = (color) => new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0 });
  const MATS = {};
  const m = (key, color) => MATS[key] || (MATS[key] = flat(color));
  const wx = (x) => x - S / 2 + 0.5;
  const wz = (y) => y - S / 2 + 0.5;
  const topY = (t) => (L.isLand(t) ? 0.3 : t.t === 'water' ? 0.06 : -0.02);
  function hashRand(i) {
    let a = (i * 2654435761) >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function mesh(geo, material, x, y, z, shadow) {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x || 0, y || 0, z || 0);
    if (shadow !== false) { o.castShadow = true; o.receiveShadow = true; }
    return o;
  }
  const GEO = {};
  const g = (key, make) => GEO[key] || (GEO[key] = make());

  function tween(dur, update, delay) {
    return new Promise((resolve) => {
      tweens.push({ t0: performance.now() + (delay || 0), dur, update, resolve });
    });
  }
  const easeOutBack = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  // ---------- Инициализация ----------
  function init(canvas) {
    canvasEl = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a8fb8);
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8a5a, 0.62));
    const sun = new THREE.DirectionalLight(0xfff4de, 0.72);
    sun.position.set(-8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);

    // Бескрайний океан под островами.
    const sea = mesh(new THREE.PlaneGeometry(400, 400), mat(COL.ocean), 0, -0.06, 0, false);
    sea.rotation.x = -Math.PI / 2;
    sea.receiveShadow = true;
    scene.add(sea);

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
  }

  function resize() {
    const w = canvasEl.clientWidth || window.innerWidth;
    const h = canvasEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    viewH = aspect < 0.8 ? 13 : 10;
    camera.left = (-viewH * aspect) / 2; camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  }

  function placeCamera() {
    const d = 30;
    camera.position.set(target.x + Math.cos(orbit) * d * 0.82, target.y + d * 0.9, target.z + Math.sin(orbit) * d * 0.82);
    camera.lookAt(target);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }

  // ---------- Построение мира ----------
  function setState(s, humanId) {
    // Полная пересборка при новой партии.
    for (const t of tiles) scene.remove(t.group), t.cloud && scene.remove(t.cloud);
    tiles.length = 0;
    for (const o of unitObjs.values()) scene.remove(o.group);
    unitObjs.clear();
    for (const o of cityObjs.values()) scene.remove(o.group);
    cityObjs.clear();
    if (borderGroup) scene.remove(borderGroup);
    if (markerGroup) scene.remove(markerGroup);
    state = s; human = humanId; S = s.size;
    borderGroup = new THREE.Group(); scene.add(borderGroup);
    markerGroup = new THREE.Group(); scene.add(markerGroup);
    selRing = mesh(new THREE.RingGeometry(0.4, 0.49, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), 0, 0, 0, false);
    selRing.rotation.x = -Math.PI / 2;
    selRing.visible = false;
    scene.add(selRing);
    for (let i = 0; i < S * S; i++) tiles.push(makeTile(s.tiles[i], i));
    sync(true);
  }

  function makeTile(t, i) {
    const group = new THREE.Group();
    group.position.set(wx(t.x), 0, wz(t.y));
    const land = L.isLand(t);
    const h = land ? 1.3 : 0.5;
    const geo = g(land ? 'land' : 'wet', () => new THREE.BoxGeometry(land ? 0.985 : 1, h, land ? 0.985 : 1));
    const top = mat(COL[t.t]);
    const side = land ? m('dirt', COL.dirt) : m('wside', COL.waterSide);
    const block = mesh(geo, [side, side, top, side, side, side], 0, topY(t) - h / 2, 0, false);
    block.receiveShadow = true;
    block.userData.tile = i;
    group.add(block);
    const deco = new THREE.Group();
    group.add(deco);
    scene.add(group);
    const rec = { group, block, top, deco, sig: null, cloud: null, explored: false, base: COL[t.t] };
    group.visible = false;
    rec.cloud = makeCloud(i);
    return rec;
  }

  function makeCloud(i) {
    const t = state.tiles[i];
    const r = hashRand(i + 7);
    const c = new THREE.Group();
    c.position.set(wx(t.x), 0.55, wz(t.y));
    const geo = g('cloud', () => new THREE.IcosahedronGeometry(0.5, 1));
    const cm = m('cloud', COL.cloud);
    for (let k = 0; k < 2; k++) {
      const p = mesh(geo, cm, (r() - 0.5) * 0.35, (r() - 0.3) * 0.15 + k * 0.05, (r() - 0.5) * 0.35, false);
      const sc = 0.75 + r() * 0.35 - k * 0.15;
      p.scale.set(sc * 1.1, sc * 0.62, sc * 1.1);
      p.castShadow = false;
      c.add(p);
    }
    c.userData.phase = r() * 6.28;
    scene.add(c);
    return c;
  }

  function tileSig(s, t) {
    const own = L.tileOwner(s, t);
    return [t.res, t.imp, own].join('|');
  }

  function buildDeco(rec, t, i) {
    const d = rec.deco;
    while (d.children.length) d.remove(d.children[0]);
    const r = hashRand(i);
    const y = topY(t);
    const city = L.cityAt(state, t.x, t.y);
    if (t.t === 'forest') {
      const n = t.imp === 'lumber' ? 1 : 3;
      const spots = [[-0.22, -0.18], [0.2, -0.05], [-0.05, 0.24], [0.24, 0.26]];
      for (let k = 0; k < n; k++) {
        const [ox, oz] = spots[k];
        const s2 = 0.8 + r() * 0.4;
        const tr = new THREE.Group();
        tr.position.set(ox + (r() - 0.5) * 0.08, y, oz + (r() - 0.5) * 0.08);
        tr.add(mesh(g('trunk', () => new THREE.BoxGeometry(0.05, 0.14, 0.05)), m('trunk', COL.trunk), 0, 0.07, 0));
        tr.add(mesh(g('cone1', () => new THREE.ConeGeometry(0.17, 0.3, 6)), m(k % 2 ? 'tree' : 'treeD', k % 2 ? COL.tree : COL.treeDark), 0, 0.26, 0));
        tr.add(mesh(g('cone2', () => new THREE.ConeGeometry(0.12, 0.22, 6)), m(k % 2 ? 'tree' : 'treeD', k % 2 ? COL.tree : COL.treeDark), 0, 0.42, 0));
        tr.scale.setScalar(s2);
        tr.rotation.y = r() * 3;
        d.add(tr);
      }
    }
    if (t.t === 'mountain') {
      d.add(mesh(g('mtn', () => new THREE.ConeGeometry(0.42, 0.8, 5)), m('rock', COL.rock), -0.04, y + 0.4, 0.02));
      d.add(mesh(g('snow', () => new THREE.ConeGeometry(0.15, 0.29, 5)), m('snow', COL.snow), -0.04, y + 0.66, 0.02));
      d.add(mesh(g('mtn2', () => new THREE.ConeGeometry(0.24, 0.45, 5)), m('rock', COL.rock), 0.25, y + 0.22, 0.22));
    }
    // Ресурсы.
    if (t.res === 'fruit' && !t.imp) {
      d.add(mesh(g('bush', () => new THREE.IcosahedronGeometry(0.15, 0)), m('bush', COL.bush), 0.18, y + 0.12, 0.15));
      for (const [ox, oy, oz] of [[0.08, 0.2, 0.08], [0.27, 0.18, 0.12], [0.16, 0.24, 0.26]]) {
        d.add(mesh(g('berry', () => new THREE.IcosahedronGeometry(0.05, 0)), m('fruit', COL.fruit), ox, y + oy, oz));
      }
    }
    if (t.res === 'crop' && !t.imp) {
      for (const [ox, oz] of [[-0.18, 0.18], [0, 0.24], [0.2, 0.14]]) {
        d.add(mesh(g('sheaf', () => new THREE.CylinderGeometry(0.05, 0.07, 0.24, 6)), m('crop', COL.crop), ox, y + 0.12, oz));
      }
    }
    if (t.res === 'animal' && !t.imp) {
      const deer = new THREE.Group();
      deer.position.set(0.12, y, 0.02);
      deer.add(mesh(g('deerB', () => new THREE.BoxGeometry(0.22, 0.1, 0.09)), m('deer', COL.deer), 0, 0.16, 0));
      deer.add(mesh(g('deerH', () => new THREE.BoxGeometry(0.07, 0.12, 0.07)), m('deer', COL.deer), 0.12, 0.25, 0));
      for (const [lx, lz] of [[-0.08, -0.03], [-0.08, 0.03], [0.08, -0.03], [0.08, 0.03]]) {
        deer.add(mesh(g('deerL', () => new THREE.BoxGeometry(0.025, 0.12, 0.025)), m('deer', COL.deer), lx, 0.06, lz));
      }
      deer.rotation.y = r() * 6;
      d.add(deer);
    }
    if (t.res === 'fish') {
      const f = mesh(g('fish', () => new THREE.ConeGeometry(0.06, 0.2, 4)), m('fish', COL.fish), 0.1, y + 0.03, 0.08, false);
      f.rotation.z = Math.PI / 2;
      f.userData.fish = true;
      d.add(f);
      const f2 = f.clone(); f2.position.set(-0.15, y + 0.03, -0.12); f2.rotation.y = 2; d.add(f2);
    }
    if (t.res === 'ore' && !t.imp) {
      d.add(mesh(g('ore', () => new THREE.OctahedronGeometry(0.1, 0)), m('ore', COL.ore), -0.26, y + 0.12, 0.28));
      d.add(mesh(g('ore2', () => new THREE.OctahedronGeometry(0.07, 0)), m('ore', COL.ore), -0.12, y + 0.08, 0.34));
    }
    // Улучшения.
    if (t.imp === 'farm') {
      for (let k = 0; k < 4; k++) d.add(mesh(g('row', () => new THREE.BoxGeometry(0.78, 0.06, 0.1)), m('crop', COL.crop), 0, y + 0.03, -0.3 + k * 0.2));
    }
    if (t.imp === 'mine') {
      d.add(mesh(g('mine', () => new THREE.BoxGeometry(0.2, 0.16, 0.08)), m('dirtD', COL.dirtDark), -0.2, y + 0.08, 0.3));
      d.add(mesh(g('cart', () => new THREE.BoxGeometry(0.12, 0.07, 0.08)), m('ore', COL.ore), 0.05, y + 0.05, 0.35));
    }
    if (t.imp === 'lumber') {
      d.add(mesh(g('hutB', () => new THREE.BoxGeometry(0.24, 0.16, 0.2)), m('wood', COL.wood), 0.15, y + 0.08, 0.15));
      const roof = mesh(g('hutR', () => new THREE.ConeGeometry(0.2, 0.14, 4)), m('hutRoof', COL.hutRoof), 0.15, y + 0.23, 0.15);
      roof.rotation.y = Math.PI / 4;
      d.add(roof);
    }
    if (city) d.visible = true;
  }

  // ---------- Города ----------
  function citySig(c) { return [c.owner, c.level, c.walls, c.park, c.capital, c.name].join('|'); }

  function buildCity(c) {
    const old = cityObjs.get(c.id);
    if (old) scene.remove(old.group);
    const t = state.tiles[c.y * S + c.x];
    const grp = new THREE.Group();
    grp.position.set(wx(c.x), topY(t), wz(c.y));
    const r = hashRand(c.id * 13 + 5);
    if (c.owner < 0) {
      for (const [ox, oz, sc] of [[-0.15, -0.1, 1], [0.17, 0.12, 0.8]]) {
        const h = new THREE.Group();
        h.position.set(ox, 0, oz);
        h.add(mesh(g('vhut', () => new THREE.BoxGeometry(0.26, 0.2, 0.24)), m('hut', COL.hut), 0, 0.1, 0));
        const roof = mesh(g('vroof', () => new THREE.ConeGeometry(0.24, 0.18, 4)), m('hutRoof', COL.hutRoof), 0, 0.29, 0);
        roof.rotation.y = Math.PI / 4;
        h.add(roof);
        h.scale.setScalar(sc);
        grp.add(h);
      }
    } else {
      const roofCol = new THREE.Color(state.players[c.owner].color).getHex();
      grp.add(mesh(g('plaza', () => new THREE.CylinderGeometry(0.46, 0.48, 0.04, 8)), m('stone', COL.stone), 0, 0.02, 0));
      const spots = [[-0.2, -0.18], [0.2, -0.16], [-0.18, 0.2], [0.21, 0.2], [0, 0.02], [0.02, -0.3], [-0.32, 0.02]];
      const n = Math.min(spots.length, 1 + c.level);
      for (let k = 0; k < n; k++) {
        const [ox, oz] = spots[k];
        const hh = 0.18 + r() * 0.1 + (k === 4 ? 0.12 : 0);
        const h = new THREE.Group();
        h.position.set(ox, 0, oz);
        h.add(mesh(new THREE.BoxGeometry(0.2, hh, 0.2), m('hut', COL.hut), 0, hh / 2 + 0.04, 0));
        const roof = mesh(g('croof', () => new THREE.ConeGeometry(0.18, 0.16, 4)), m('roof' + c.owner, roofCol), 0, hh + 0.12, 0);
        roof.rotation.y = Math.PI / 4;
        h.add(roof);
        grp.add(h);
      }
      if (c.capital) {
        const tower = new THREE.Group();
        tower.position.set(0.02, 0, 0.02);
        tower.add(mesh(g('tower', () => new THREE.BoxGeometry(0.16, 0.55, 0.16)), m('stone', COL.stone), 0, 0.3, 0));
        tower.add(mesh(g('troof', () => new THREE.ConeGeometry(0.15, 0.22, 4)), m('roof' + c.owner, roofCol), 0, 0.68, 0));
        tower.add(mesh(g('pole', () => new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4)), m('wood', COL.wood), 0, 0.92, 0));
        const flag = mesh(g('flag', () => new THREE.BoxGeometry(0.16, 0.09, 0.01)), m('roof' + c.owner, roofCol), 0.08, 1.02, 0);
        flag.userData.flag = true;
        tower.add(flag);
        grp.add(tower);
      }
      if (c.walls) {
        for (let k = 0; k < 4; k++) {
          const w = mesh(g('wall', () => new THREE.BoxGeometry(0.9, 0.1, 0.06)), m('stone', COL.stone), 0, 0.07, 0.45);
          const piv = new THREE.Group(); piv.rotation.y = (k * Math.PI) / 2; piv.add(w); grp.add(piv);
        }
      }
      if (c.park) grp.add(mesh(g('parkTree', () => new THREE.IcosahedronGeometry(0.11, 0)), m('bush', COL.bush), 0.34, 0.16, -0.34));
    }
    const label = makeLabel(c);
    label.position.set(-0.3, 0.12, -0.3);
    label.center.set(0.5, 1.1);
    grp.add(label);
    scene.add(grp);
    cityObjs.set(c.id, { group: grp, sig: citySig(c) });
    return grp;
  }

  function makeLabel(c) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const x = cv.getContext('2d');
    const col = c.owner >= 0 ? state.players[c.owner].color : '#6b7a80';
    const text = c.owner >= 0 ? c.name : 'Деревня';
    x.font = '700 30px "Nunito", "Segoe UI", sans-serif';
    const w = Math.min(240, x.measureText(text).width + 40);
    const left = (256 - w) / 2;
    x.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(x, left + 2, 6, w, 46, 23); x.fill();
    x.fillStyle = col;
    roundRect(x, left, 2, w, 46, 23); x.fill();
    x.fillStyle = '#fff';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 26);
    if (c.owner >= 0) {
      const need = c.level + 1;
      const pw = Math.min(26, 200 / need);
      const start = 128 - (need * pw) / 2;
      for (let k = 0; k < need; k++) {
        x.fillStyle = k < c.pop ? '#ffffff' : 'rgba(255,255,255,0.35)';
        roundRect(x, start + k * pw + 2, 60, pw - 4, 12, 4); x.fill();
      }
      x.fillStyle = col;
      x.font = '800 22px "Nunito", sans-serif';
      x.fillText('ур. ' + c.level, 128, 86);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.5, 0.56, 1);
    sp.renderOrder = 10;
    return sp;
  }

  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
  }

  // ---------- Юниты ----------
  function buildUnit(u) {
    const grp = new THREE.Group();
    const fig = new THREE.Group();
    grp.add(fig);
    const color = new THREE.Color(state.players[u.owner].color).getHex();
    const tribe = flat(color);
    const tribeDark = flat(new THREE.Color(color).multiplyScalar(0.7).getHex());
    const skin = m('skin', COL.skin), wood = m('wood', COL.wood), metal = m('metal', COL.metal);
    const shadow = mesh(g('ushadow', () => new THREE.CircleGeometry(0.24, 20)), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }), 0, 0.012, 0, false);
    shadow.rotation.x = -Math.PI / 2;
    grp.add(shadow);

    const person = (sc, y0) => {
      const p = new THREE.Group();
      p.position.y = y0 || 0;
      p.add(mesh(g('ubody', () => new THREE.CylinderGeometry(0.09, 0.13, 0.28, 7)), tribe, 0, 0.14, 0));
      p.add(mesh(g('uhead', () => new THREE.IcosahedronGeometry(0.085, 1)), skin, 0, 0.36, 0));
      p.add(mesh(g('uhat', () => new THREE.ConeGeometry(0.09, 0.08, 7)), tribeDark, 0, 0.45, 0));
      p.scale.setScalar(sc || 1);
      return p;
    };
    const horse = () => {
      const h = new THREE.Group();
      h.add(mesh(g('hbody', () => new THREE.BoxGeometry(0.36, 0.14, 0.14)), m('horse', 0xc79a6a), 0, 0.2, 0));
      h.add(mesh(g('hhead', () => new THREE.BoxGeometry(0.1, 0.16, 0.09)), m('horse', 0xc79a6a), 0.2, 0.3, 0));
      for (const [lx, lz] of [[-0.13, -0.05], [-0.13, 0.05], [0.13, -0.05], [0.13, 0.05]]) h.add(mesh(g('hleg', () => new THREE.BoxGeometry(0.04, 0.14, 0.04)), m('horse', 0xc79a6a), lx, 0.07, lz));
      return h;
    };

    switch (u.type) {
      case 'warrior': {
        fig.add(person());
        const club = mesh(g('club', () => new THREE.BoxGeometry(0.04, 0.3, 0.04)), wood, 0.15, 0.25, 0.04);
        club.rotation.z = -0.4; fig.add(club);
        break;
      }
      case 'rider': case 'knight': {
        fig.add(horse());
        fig.add(person(0.8, 0.18));
        if (u.type === 'knight') {
          const lance = mesh(g('lance', () => new THREE.CylinderGeometry(0.015, 0.02, 0.6, 5)), metal, 0.2, 0.42, 0.08);
          lance.rotation.z = -1.2; fig.add(lance);
          fig.add(mesh(g('kshield', () => new THREE.BoxGeometry(0.03, 0.16, 0.13)), tribeDark, -0.02, 0.36, -0.1));
        } else {
          const sp = mesh(g('spear', () => new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4)), wood, 0.1, 0.48, 0.08);
          sp.rotation.z = -0.5; fig.add(sp);
        }
        break;
      }
      case 'archer': {
        fig.add(person());
        const bow = mesh(g('bow', () => new THREE.TorusGeometry(0.15, 0.015, 4, 10, Math.PI)), wood, 0.13, 0.27, 0);
        bow.rotation.z = -Math.PI / 2; fig.add(bow);
        break;
      }
      case 'defender': {
        fig.add(person(1.05));
        const sh = mesh(g('shield', () => new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10)), tribeDark, 0.14, 0.2, 0.04);
        sh.rotation.z = Math.PI / 2; fig.add(sh);
        fig.add(mesh(g('boss', () => new THREE.IcosahedronGeometry(0.04, 0)), metal, 0.17, 0.2, 0.04));
        break;
      }
      case 'swordsman': {
        fig.add(person(1.15));
        const sw = mesh(g('sword', () => new THREE.BoxGeometry(0.03, 0.38, 0.06)), metal, 0.17, 0.32, 0.05);
        sw.rotation.z = -0.25; fig.add(sw);
        fig.add(mesh(g('helm', () => new THREE.IcosahedronGeometry(0.1, 0)), metal, 0, 0.47, 0));
        break;
      }
      case 'catapult': {
        fig.add(mesh(g('cbase', () => new THREE.BoxGeometry(0.4, 0.08, 0.26)), wood, 0, 0.1, 0));
        for (const [lx, lz] of [[-0.14, -0.15], [0.14, -0.15], [-0.14, 0.15], [0.14, 0.15]]) {
          const wh = mesh(g('wheel', () => new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8)), m('wheel', 0x5d3b1f), lx, 0.07, lz);
          wh.rotation.x = Math.PI / 2; fig.add(wh);
        }
        const arm = mesh(g('carm', () => new THREE.BoxGeometry(0.05, 0.42, 0.05)), wood, -0.05, 0.3, 0);
        arm.rotation.z = 0.7; fig.add(arm);
        fig.add(mesh(g('cbucket', () => new THREE.BoxGeometry(0.1, 0.06, 0.1)), tribe, -0.2, 0.46, 0));
        break;
      }
      case 'giant': {
        const p = person(2.0);
        fig.add(p);
        const club = mesh(g('gclub', () => new THREE.BoxGeometry(0.09, 0.55, 0.09)), wood, 0.3, 0.5, 0.05);
        club.rotation.z = -0.5; fig.add(club);
        break;
      }
    }
    fig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const label = makeHpLabel(u);
    label.position.set(0, u.type === 'giant' ? 1.25 : 0.82, 0);
    grp.add(label);
    grp.position.copy(unitPos(u.x, u.y));
    grp.userData.unit = u.id;
    scene.add(grp);
    const rec = { group: grp, fig, label, hp: u.hp, tribe, tribeDark, color, exhausted: null, busy: false, phase: Math.random() * 6 };
    unitObjs.set(u.id, rec);
    return rec;
  }

  function makeHpLabel(u) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    sp.scale.set(0.34, 0.34, 1);
    sp.renderOrder = 11;
    sp.userData.cv = cv;
    drawHp(sp, u);
    return sp;
  }

  function drawHp(sp, u) {
    const cv = sp.userData.cv;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = state.players[u.owner].color;
    x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
    x.lineWidth = 5; x.strokeStyle = '#ffffff'; x.stroke();
    x.fillStyle = '#fff';
    x.font = '800 30px "Nunito", "Segoe UI", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(u.hp), 32, 34);
    sp.material.map.needsUpdate = true;
  }

  function unitPos(x, y) {
    const t = state.tiles[y * S + x];
    const inCity = state.cities.some((c) => c.x === x && c.y === y);
    const off = inCity ? 0.2 : 0;
    return new THREE.Vector3(wx(x) + off, topY(t), wz(y) + off);
  }

  function setExhausted(rec, ex) {
    if (rec.exhausted === ex) return;
    rec.exhausted = ex;
    const c = new THREE.Color(rec.color);
    if (ex) c.lerp(new THREE.Color(0x8a8a8a), 0.55);
    rec.tribe.color.copy(c);
    rec.tribeDark.color.copy(c.clone().multiplyScalar(0.72));
  }

  // ---------- Синхронизация с состоянием ----------
  function sync(instant) {
    if (!state) return;
    const s = state;
    const exp = s.players[human].explored;
    let terrChanged = false;
    for (let i = 0; i < S * S; i++) {
      const rec = tiles[i];
      const t = s.tiles[i];
      const sig = tileSig(s, t);
      if (sig !== rec.sig) {
        if (rec.sig && rec.sig.split('|')[2] !== sig.split('|')[2]) terrChanged = true;
        rec.sig = sig;
        buildDeco(rec, t, i);
        const own = L.tileOwner(s, t);
        const base = new THREE.Color(rec.base);
        if (own >= 0 && L.isLand(t)) base.lerp(new THREE.Color(s.players[own].color), 0.2);
        rec.top.color.copy(base);
      }
      if (exp[i] && !rec.explored && instant) {
        rec.explored = true;
        rec.group.visible = true;
        if (rec.cloud) { scene.remove(rec.cloud); rec.cloud = null; }
      }
    }
    if (terrChanged || instant || borderGroup.userData.v !== s.version) buildBorders();
    // Города.
    for (const c of s.cities) {
      const o = cityObjs.get(c.id);
      if (!o || o.sig !== citySig(c)) {
        const grp = buildCity(c);
        if (o && !instant) popIn(grp);
      }
      const ex = tiles[c.y * S + c.x].explored;
      cityObjs.get(c.id).group.visible = ex;
    }
    // Юниты.
    const alive = new Set();
    for (const u of s.units) {
      alive.add(u.id);
      let rec = unitObjs.get(u.id);
      if (!rec) {
        rec = buildUnit(u);
        if (!instant) popIn(rec.group);
      }
      if (!rec.busy) rec.group.position.copy(unitPos(u.x, u.y));
      if (rec.hp !== u.hp) { rec.hp = u.hp; drawHp(rec.label, u); }
      setExhausted(rec, u.owner === s.current && u.moved && u.attacked);
      rec.group.visible = tiles[u.y * S + u.x].explored || rec.busy;
    }
    for (const [id, rec] of unitObjs) {
      if (alive.has(id)) continue;
      unitObjs.delete(id);
      const grp = rec.group;
      tween(380, (k) => { grp.scale.setScalar(Math.max(0.01, 1 - k)); grp.rotation.z = k * 1.2; grp.position.y -= 0.004; })
        .then(() => scene.remove(grp));
    }
  }

  function popIn(grp) {
    grp.scale.setScalar(0.01);
    tween(420, (k) => grp.scale.setScalar(Math.max(0.01, easeOutBack(k))));
  }

  function buildBorders() {
    const s = state;
    while (borderGroup.children.length) borderGroup.remove(borderGroup.children[0]);
    borderGroup.userData.v = s.version;
    const geoH = g('bh', () => new THREE.BoxGeometry(1, 0.05, 0.07));
    const geoV = g('bv', () => new THREE.BoxGeometry(0.07, 0.05, 1));
    for (let i = 0; i < S * S; i++) {
      const t = s.tiles[i];
      const own = L.tileOwner(s, t);
      if (own < 0 || !tiles[i].explored) continue;
      const matB = m('border' + own, new THREE.Color(s.players[own].color).multiplyScalar(1.1).getHex());
      const y = topY(t) + 0.03;
      const diff = (dx, dy) => { const n = L.tileAt(s, t.x + dx, t.y + dy); return !n || L.tileOwner(s, n) !== own; };
      if (diff(0, -1)) borderGroup.add(mesh(geoH, matB, wx(t.x), y, wz(t.y) - 0.46, false));
      if (diff(0, 1)) borderGroup.add(mesh(geoH, matB, wx(t.x), y, wz(t.y) + 0.46, false));
      if (diff(-1, 0)) borderGroup.add(mesh(geoV, matB, wx(t.x) - 0.46, y, wz(t.y), false));
      if (diff(1, 0)) borderGroup.add(mesh(geoV, matB, wx(t.x) + 0.46, y, wz(t.y), false));
    }
  }

  // Открытие клеток: облака тают, острова «всплывают» волной от точки обзора.
  function reveal(list, from) {
    const [fx, fy] = from || [S / 2, S / 2];
    for (const i of list) {
      const rec = tiles[i];
      if (rec.explored) continue;
      rec.explored = true;
      const t = state.tiles[i];
      const delay = Math.hypot(t.x - fx, t.y - fy) * 70;
      const cloud = rec.cloud;
      rec.cloud = null;
      if (cloud) {
        tween(450, (k) => { cloud.scale.setScalar(1 + k * 0.6); cloud.children.forEach((p) => { p.material = p.material.isCloudFade ? p.material : cloneFade(p.material); p.material.opacity = 1 - k; }); cloud.position.y = 0.55 + k * 0.5; }, delay)
          .then(() => scene.remove(cloud));
      }
      rec.group.visible = true;
      rec.group.position.y = -1.6;
      tween(620, (k) => { rec.group.position.y = -1.6 * (1 - easeOutBack(k)); }, delay + 60).then(() => { rec.group.position.y = 0; });
    }
    buildBorders();
  }
  function cloneFade(mt) { const c = mt.clone(); c.transparent = true; c.isCloudFade = true; return c; }

  // ---------- Анимации действий ----------
  async function animateMove(unitId, path) {
    const rec = unitObjs.get(unitId);
    if (!rec || !path.length) return;
    rec.busy = true;
    rec.group.visible = true;
    let from = rec.group.position.clone();
    for (const [x, y] of path) {
      const to = unitPos(x, y);
      const a = from.clone();
      const dir = Math.atan2(to.x - a.x, to.z - a.z);
      rec.fig.rotation.y = dir - Math.PI / 2;
      await tween(170, (k) => {
        const e = easeInOut(k);
        rec.group.position.set(a.x + (to.x - a.x) * e, a.y + (to.y - a.y) * e + Math.sin(k * Math.PI) * 0.22, a.z + (to.z - a.z) * e);
      });
      from = to;
    }
    rec.busy = false;
  }

  async function animateAttack(attId, from, to, res) {
    const rec = unitObjs.get(attId);
    const a = unitPos(from[0], from[1]);
    const b = unitPos(to[0], to[1]);
    if (rec) {
      rec.busy = true;
      rec.fig.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
      const ranged = Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1])) > 1;
      if (ranged) {
        const ball = mesh(g('proj', () => new THREE.IcosahedronGeometry(0.06, 0)), m('wood', COL.wood), a.x, a.y + 0.4, a.z, false);
        scene.add(ball);
        await tween(320, (k) => ball.position.set(a.x + (b.x - a.x) * k, a.y + 0.4 + Math.sin(k * Math.PI) * 0.9, a.z + (b.z - a.z) * k));
        scene.remove(ball);
      } else {
        await tween(150, (k) => rec.group.position.set(a.x + (b.x - a.x) * 0.45 * k, a.y + Math.sin(k * Math.PI) * 0.1, a.z + (b.z - a.z) * 0.45 * k));
      }
      floatText(to[0], to[1], '-' + res.dmg, '#ff5a4f');
      shake(res.target && res.target.id);
      if (!ranged) await tween(150, (k) => rec.group.position.set(a.x + (b.x - a.x) * 0.45 * (1 - k), a.y, a.z + (b.z - a.z) * 0.45 * (1 - k)));
      if (res.ret) { await wait(120); floatText(from[0], from[1], '-' + res.ret, '#ff5a4f'); }
      rec.busy = false;
    }
  }

  function shake(id) {
    const rec = id && unitObjs.get(id);
    if (!rec) return;
    const base = rec.fig.position.x;
    tween(260, (k) => { rec.fig.position.x = base + Math.sin(k * 30) * 0.05 * (1 - k); });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function floatText(x, y, text, color) {
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 64;
    const c = cv.getContext('2d');
    c.font = '900 44px "Nunito", "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.strokeText(text, 96, 34);
    c.fillStyle = color; c.fillText(text, 96, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    sp.scale.set(0.9, 0.3, 1);
    sp.renderOrder = 12;
    const p = unitPos(x, y);
    sp.position.set(p.x, p.y + 0.9, p.z);
    scene.add(sp);
    tween(900, (k) => { sp.position.y = p.y + 0.9 + k * 0.6; sp.material.opacity = 1 - k * k; }).then(() => scene.remove(sp));
  }

  // ---------- Подсветка ----------
  function setMarkers(sel, moves, attacks, extra) {
    while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0]);
    markers = [];
    if (sel) {
      const t = state.tiles[sel[1] * S + sel[0]];
      selRing.position.set(wx(sel[0]), topY(t) + 0.04, wz(sel[1]));
      selRing.visible = true;
    } else selRing.visible = false;
    const dot = g('mdot', () => new THREE.CircleGeometry(0.13, 20));
    const ring = g('mring', () => new THREE.RingGeometry(0.33, 0.44, 32));
    const dotM = m('mdotM', 0xffffff);
    for (const [x, y] of moves || []) {
      const t = state.tiles[y * S + x];
      const o = mesh(dot, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), wx(x), topY(t) + 0.05, wz(y), false);
      o.rotation.x = -Math.PI / 2;
      markerGroup.add(o);
      markers.push(o);
    }
    for (const [x, y] of attacks || []) {
      const t = state.tiles[y * S + x];
      const o = mesh(ring, new THREE.MeshBasicMaterial({ color: 0xff4b3e }), wx(x), topY(t) + 0.05, wz(y), false);
      o.rotation.x = -Math.PI / 2;
      markerGroup.add(o);
      markers.push(o);
    }
    for (const [x, y] of extra || []) {
      const t = state.tiles[y * S + x];
      const o = mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffd23f }), wx(x), topY(t) + 0.05, wz(y), false);
      o.rotation.x = -Math.PI / 2;
      markerGroup.add(o);
    }
    void dotM;
  }

  // ---------- Камера и ввод ----------
  function pick(clientX, clientY) {
    const rect = canvasEl.getBoundingClientRect();
    const v = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    const objs = [];
    for (const o of unitObjs.values()) if (o.group.visible) objs.push(o.fig);
    for (const t of tiles) if (t.explored) objs.push(t.block);
    const hits = raycaster.intersectObjects(objs, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData.tile !== undefined) return state.tiles[o.userData.tile];
        if (o.parent && o.parent.userData.unit !== undefined) {
          const u = L.unitById(state, o.parent.userData.unit);
          if (u) return state.tiles[u.y * S + u.x];
        }
        o = o.parent;
      }
    }
    // Клик по облаку: определяем клетку по плоскости.
    const p = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), p)) {
      const x = Math.round(p.x + S / 2 - 0.5), y = Math.round(p.z + S / 2 - 0.5);
      return L.tileAt(state, x, y);
    }
    return null;
  }

  function groundAt(clientX, clientY) {
    const rect = canvasEl.getBoundingClientRect();
    const v = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    const p = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return p;
  }

  function panBy(dxPx, dyPx) {
    const rect = canvasEl.getBoundingClientRect();
    const a = groundAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const b = groundAt(rect.left + rect.width / 2 + dxPx, rect.top + rect.height / 2 + dyPx);
    target.x -= b.x - a.x; target.z -= b.z - a.z;
    clampTarget();
    placeCamera();
  }
  function clampTarget() {
    const lim = S / 2 + 1;
    target.x = Math.max(-lim, Math.min(lim, target.x));
    target.z = Math.max(-lim, Math.min(lim, target.z));
  }
  function zoomBy(f) { zoom = Math.max(0.55, Math.min(2.6, zoom * f)); placeCamera(); }
  function focus(x, y, instant) {
    const to = new THREE.Vector3(wx(x), 0, wz(y));
    if (instant) { target.copy(to); placeCamera(); return; }
    const from = target.clone();
    tween(450, (k) => { target.lerpVectors(from, to, easeInOut(k)); placeCamera(); });
  }
  function setOrbitSpeed(v) { orbitSpeed = v; if (!v) { orbit = Math.PI / 4; placeCamera(); } }

  // ---------- Кадр ----------
  function loop(now) {
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    for (let k = tweens.length - 1; k >= 0; k--) {
      const tw = tweens[k];
      if (now < tw.t0) continue;
      const p = Math.min(1, (now - tw.t0) / tw.dur);
      tw.update(p);
      if (p >= 1) { tweens.splice(k, 1); tw.resolve(); }
    }
    if (orbitSpeed) { orbit += orbitSpeed * 0.016; placeCamera(); }
    // Покачивание: облака, вода, юниты, флаги.
    for (let i = 0; i < tiles.length; i++) {
      const rec = tiles[i];
      if (rec.cloud) {
        const ph = rec.cloud.userData.phase;
        rec.cloud.position.y = 0.55 + Math.sin(t * 0.8 + ph) * 0.05;
        rec.cloud.rotation.y = Math.sin(t * 0.2 + ph) * 0.3;
      } else if (state && !L.isLand(state.tiles[i]) && rec.group.position.y > -0.2) {
        rec.block.position.y = topY(state.tiles[i]) - 0.25 + Math.sin(t * 1.6 + i * 0.7) * 0.018;
        for (const f of rec.deco.children) if (f.userData.fish) f.position.y = 0.06 + Math.sin(t * 2.2 + i) * 0.02;
      }
    }
    for (const rec of unitObjs.values()) {
      rec.fig.position.y = rec.exhausted ? 0 : Math.abs(Math.sin(t * 2.4 + rec.phase)) * 0.035;
      rec.fig.scale.y = 1 + Math.sin(t * 2.4 + rec.phase) * 0.02;
    }
    for (const o of cityObjs.values()) o.group.traverse((c) => { if (c.userData.flag) c.rotation.y = Math.sin(t * 3) * 0.4; });
    if (selRing && selRing.visible) selRing.scale.setScalar(1 + Math.sin(t * 5) * 0.05);
    for (const mk of markers) mk.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    renderer.render(scene, camera);
  }

  root.IslesView = { init, setState, sync, reveal, animateMove, animateAttack, floatText, setMarkers, pick, panBy, zoomBy, focus, setOrbitSpeed, placeCamera, resize };
})(window);
