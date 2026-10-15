// Острова Племён — 3D-сцена на three.js.
// Минималистичный стиль: плоские цвета, простые формы, без сетки и теней,
// у каждого мира (климата) своя палитра и своя форма деревьев и гор.
(function (root) {
  'use strict';
  const L = root.Isles;

  // ---------- Миры ----------
  const THEMES = {
    meadow: {
      name: 'Луга', desc: 'Сочная трава, круглые деревья, снежные пики',
      land: 0xa8d46c, side: 0x7fae4e, tree: 'round', leaf: 0x58a845, leaf2: 0x4a963b, trunk: 0x8a6142,
      rock: 0xbdb6a3, cap: 0xffffff, water: 0x82d9e4, ocean: 0x3e9fcb, fruit: 0xe4493d, bush: 0x5aa846,
      crop: 0xf2cf55, animal: 0xb57b47, ore: 0x7fd0ff, roof: 0xb9653b, hut: 0xf1e3c4,
    },
    desert: {
      name: 'Пустыня', desc: 'Песок, пальмы и рыжие столовые горы',
      land: 0xebd59c, side: 0xcfb37a, tree: 'palm', leaf: 0x79a83e, leaf2: 0x6a9636, trunk: 0xa77b4c,
      rock: 0xd99a60, cap: 0xc77d43, water: 0x74d4d6, ocean: 0x2f93ba, fruit: 0xf19d2b, bush: 0x8aa84a,
      crop: 0xf6e07e, animal: 0xc99258, ore: 0x8be0ff, roof: 0xc8743f, hut: 0xf5e8cc,
    },
    tundra: {
      name: 'Тундра', desc: 'Снег, тёмные ели и ледяная вода',
      land: 0xe9f0f3, side: 0xbfcfd8, tree: 'pine', leaf: 0x2f6f5c, leaf2: 0x3b806a, trunk: 0x6d5444,
      rock: 0x9fb1bf, cap: 0xffffff, water: 0x9ad8ea, ocean: 0x3c84b2, fruit: 0xd94f6b, bush: 0x4f8a76,
      crop: 0xe8cf7a, animal: 0x8d7a6b, ore: 0x6cc4ff, roof: 0x5e7c96, hut: 0xf4f1ea,
    },
    sakura: {
      name: 'Сакура', desc: 'Цветущие деревья и мягкие сиреневые горы',
      land: 0xbfe190, side: 0x98c06b, tree: 'blossom', leaf: 0xf3a6c4, leaf2: 0xf9cadb, trunk: 0x7a5141,
      rock: 0xc6b8cf, cap: 0xffffff, water: 0x8adcdf, ocean: 0x46a3cc, fruit: 0xe5486b, bush: 0x6cb653,
      crop: 0xf4d35e, animal: 0xb88a62, ore: 0x9fd8ff, roof: 0xd9577b, hut: 0xfbefe6,
    },
    jungle: {
      name: 'Джунгли', desc: 'Густой лес, мшистые скалы, бирюзовые лагуны',
      land: 0x76ba4c, side: 0x588f37, tree: 'jungle', leaf: 0x2e8b45, leaf2: 0x3ea654, trunk: 0x6b4b2f,
      rock: 0x8c9670, cap: 0x6fb04b, water: 0x52ccb9, ocean: 0x1f7fa0, fruit: 0xffb12b, bush: 0x2f8f45,
      crop: 0xf1d257, animal: 0x9a6a3a, ore: 0x7ef0d0, roof: 0x8c5a2e, hut: 0xe9dcb8,
    },
    ash: {
      name: 'Пепел', desc: 'Тёмная земля, кристаллы и вулканы',
      land: 0x6d6676, side: 0x4b4555, tree: 'crystal', leaf: 0x9b80ff, leaf2: 0xc1adff, trunk: 0x3b3542,
      rock: 0x443d4c, cap: 0xff7a3d, water: 0x7584d4, ocean: 0x2b2f5e, fruit: 0xff6b5a, bush: 0x56505f,
      crop: 0xe0b75a, animal: 0x8a7d6e, ore: 0xff9a4a, roof: 0x8f4f6e, hut: 0xd8d0dc,
    },
  };
  const TRIBE_THEME = ['meadow', 'desert', 'sakura', 'tundra'];

  let renderer, scene, camera, raycaster, clock;
  let S = 0, state = null, human = 0, themeMode = 'regions';
  let canvasEl;
  const tiles = [];
  const unitObjs = new Map();
  const cityObjs = new Map();
  let borderGroup, foamGroup, markerGroup, selRing, sea;
  const tweens = [];
  const target = new THREE.Vector3();
  let zoom = 1, orbit = Math.PI / 4, orbitSpeed = 0;
  let markers = [];
  let tileTheme = [];

  // ---------- Утилиты ----------
  const MATS = {};
  const matOf = (hex) => MATS[hex] || (MATS[hex] = new THREE.MeshPhongMaterial({ color: hex, flatShading: true, shininess: 0, specular: 0x000000 }));
  const GEO = {};
  const g = (key, make) => GEO[key] || (GEO[key] = make());
  const wx = (x) => x - S / 2 + 0.5;
  const wz = (y) => y - S / 2 + 0.5;
  const LAND_TOP = 0.16, WATER_TOP = 0.035;
  const topY = (t) => (L.isLand(t) ? LAND_TOP : t.t === 'water' ? WATER_TOP : 0);
  function hashRand(i) {
    let a = (i * 2654435761) >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function mesh(geo, material, x, y, z) {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x || 0, y || 0, z || 0);
    return o;
  }
  function tween(dur, update, delay) {
    return new Promise((resolve) => tweens.push({ t0: performance.now() + (delay || 0), dur, update, resolve }));
  }
  const easeOutBack = (k) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();

  function addLights(sc) {
    sc.add(new THREE.HemisphereLight(0xffffff, 0xd9e6d0, 0.78));
    const sun = new THREE.DirectionalLight(0xffffff, 0.42);
    sun.position.set(-4, 10, 6);
    sc.add(sun);
  }

  // ---------- Модели (общие для сцены и портретов на кнопках) ----------
  function pyramid(r, h, color) {
    const o = mesh(g('pyr' + r + h, () => new THREE.ConeGeometry(r, h, 4)), matOf(color), 0, h / 2, 0);
    o.rotation.y = Math.PI / 4;
    return o;
  }

  function treeModel(th, r, scale) {
    const t = new THREE.Group();
    const trunk = matOf(th.trunk);
    switch (th.tree) {
      case 'round':
        t.add(mesh(g('tk', () => new THREE.CylinderGeometry(0.025, 0.03, 0.16, 5)), trunk, 0, 0.08, 0));
        t.add(mesh(g('ball', () => new THREE.IcosahedronGeometry(0.13, 0)), matOf(r() < 0.5 ? th.leaf : th.leaf2), 0, 0.24, 0));
        break;
      case 'pine':
        t.add(mesh(g('tk', () => new THREE.CylinderGeometry(0.025, 0.03, 0.16, 5)), trunk, 0, 0.06, 0));
        t.add(mesh(g('pine1', () => new THREE.ConeGeometry(0.15, 0.24, 5)), matOf(th.leaf), 0, 0.2, 0));
        t.add(mesh(g('pine2', () => new THREE.ConeGeometry(0.1, 0.18, 5)), matOf(th.leaf2), 0, 0.34, 0));
        t.add(mesh(g('pine3', () => new THREE.ConeGeometry(0.045, 0.07, 5)), matOf(0xffffff), 0, 0.43, 0));
        break;
      case 'palm': {
        const tk = mesh(g('palmT', () => new THREE.CylinderGeometry(0.018, 0.028, 0.34, 5)), trunk, 0.02, 0.17, 0);
        tk.rotation.z = -0.18;
        t.add(tk);
        for (let k = 0; k < 5; k++) {
          const leaf = mesh(g('palmL', () => new THREE.BoxGeometry(0.2, 0.012, 0.06)), matOf(k % 2 ? th.leaf : th.leaf2), 0, 0, 0);
          const piv = new THREE.Group();
          piv.position.set(0.06, 0.34, 0);
          piv.rotation.y = (k / 5) * Math.PI * 2;
          leaf.position.x = 0.09; leaf.rotation.z = -0.35;
          piv.add(leaf);
          t.add(piv);
        }
        break;
      }
      case 'blossom':
        t.add(mesh(g('tk2', () => new THREE.CylinderGeometry(0.025, 0.035, 0.18, 5)), trunk, 0, 0.09, 0));
        t.add(mesh(g('ball', () => new THREE.IcosahedronGeometry(0.13, 0)), matOf(th.leaf), 0, 0.26, 0));
        t.add(mesh(g('ballS', () => new THREE.IcosahedronGeometry(0.075, 0)), matOf(th.leaf2), 0.07, 0.33, 0.05));
        break;
      case 'jungle':
        t.add(mesh(g('tk3', () => new THREE.CylinderGeometry(0.03, 0.04, 0.22, 5)), trunk, 0, 0.11, 0));
        t.add(mesh(g('ballL', () => new THREE.IcosahedronGeometry(0.17, 0)), matOf(th.leaf), 0, 0.3, 0));
        t.add(mesh(g('ballS', () => new THREE.IcosahedronGeometry(0.075, 0)), matOf(th.leaf2), -0.1, 0.22, 0.08));
        break;
      case 'crystal': {
        const c1 = mesh(g('cry1', () => new THREE.ConeGeometry(0.06, 0.32, 4)), matOf(th.leaf), 0, 0.16, 0);
        const c2 = mesh(g('cry2', () => new THREE.ConeGeometry(0.045, 0.22, 4)), matOf(th.leaf2), 0.07, 0.1, 0.03);
        c2.rotation.z = -0.35;
        const c3 = mesh(g('cry2', () => new THREE.ConeGeometry(0.045, 0.22, 4)), matOf(th.leaf), -0.06, 0.1, -0.02);
        c3.rotation.z = 0.4;
        t.add(c1, c2, c3);
        break;
      }
    }
    t.scale.setScalar(scale);
    return t;
  }

  function mountainModel(th) {
    const m = new THREE.Group();
    if (th === THEMES.desert) {
      const mesa = mesh(g('mesa', () => new THREE.CylinderGeometry(0.26, 0.4, 0.34, 4)), matOf(th.rock), 0, 0.17, 0);
      mesa.rotation.y = Math.PI / 4;
      m.add(mesa);
      const top = mesh(g('mesaT', () => new THREE.CylinderGeometry(0.262, 0.262, 0.04, 4)), matOf(th.cap), 0, 0.36, 0);
      top.rotation.y = Math.PI / 4;
      m.add(top);
      return m;
    }
    m.add(pyramid(0.4, 0.6, th.rock));
    const cap = pyramid(0.14, 0.21, th.cap);
    cap.position.y = 0.6 - 0.21 + 0.105;
    m.add(cap);
    if (th === THEMES.ash) {
      const smoke = mesh(g('smoke', () => new THREE.IcosahedronGeometry(0.07, 0)), matOf(0x8b8494), 0, 0.72, 0);
      smoke.userData.smoke = true;
      m.add(smoke);
    }
    return m;
  }

  function resourceModel(kind, th) {
    const o = new THREE.Group();
    if (kind === 'fruit') {
      o.add(mesh(g('bush', () => new THREE.IcosahedronGeometry(0.11, 0)), matOf(th.bush), 0, 0.09, 0));
      for (const [x, y, z] of [[-0.06, 0.13, 0.06], [0.07, 0.12, 0.05], [0.01, 0.18, -0.03]]) o.add(mesh(g('berry', () => new THREE.IcosahedronGeometry(0.035, 0)), matOf(th.fruit), x, y, z));
    } else if (kind === 'crop') {
      for (const [x, z] of [[-0.08, 0], [0.08, 0.02]]) o.add(mesh(g('sheaf', () => new THREE.ConeGeometry(0.06, 0.18, 5)), matOf(th.crop), x, 0.09, z));
    } else if (kind === 'animal') {
      o.add(mesh(g('anB', () => new THREE.BoxGeometry(0.17, 0.08, 0.07)), matOf(th.animal), 0, 0.13, 0));
      o.add(mesh(g('anH', () => new THREE.BoxGeometry(0.06, 0.09, 0.06)), matOf(th.animal), 0.09, 0.2, 0));
      for (const [x, z] of [[-0.06, -0.025], [-0.06, 0.025], [0.06, -0.025], [0.06, 0.025]]) o.add(mesh(g('anL', () => new THREE.BoxGeometry(0.02, 0.09, 0.02)), matOf(th.animal), x, 0.045, z));
    } else if (kind === 'fish') {
      for (const [x, z, r] of [[-0.1, -0.05, 0.4], [0.1, 0.08, 2.4]]) {
        const f = mesh(g('fish', () => new THREE.ConeGeometry(0.05, 0.18, 4)), matOf(new THREE.Color(th.water).lerp(new THREE.Color(0xffffff), 0.6).getHex()), x, 0.02, z);
        f.rotation.set(Math.PI / 2, 0, r);
        f.userData.fish = true;
        o.add(f);
      }
    } else if (kind === 'ore') {
      const c = mesh(g('ore', () => new THREE.OctahedronGeometry(0.07, 0)), matOf(th.ore), 0, 0.07, 0);
      const c2 = mesh(g('ore2', () => new THREE.OctahedronGeometry(0.05, 0)), matOf(th.ore), 0.08, 0.05, 0.03);
      o.add(c, c2);
    }
    return o;
  }

  function improvementModel(kind, th) {
    const o = new THREE.Group();
    if (kind === 'farm') {
      o.add(mesh(g('farmB', () => new THREE.BoxGeometry(0.72, 0.02, 0.72)), matOf(th.crop), 0, 0.01, 0));
      for (let k = 0; k < 3; k++) o.add(mesh(g('farmR', () => new THREE.BoxGeometry(0.72, 0.025, 0.05)), matOf(shade(th.crop, 0.82)), 0, 0.015, -0.2 + k * 0.2));
    } else if (kind === 'mine') {
      o.add(mesh(g('mineD', () => new THREE.BoxGeometry(0.14, 0.12, 0.04)), matOf(0x3a3330), 0, 0.06, 0));
      o.add(mesh(g('mineF', () => new THREE.BoxGeometry(0.18, 0.03, 0.05)), matOf(th.trunk), 0, 0.13, 0));
    } else if (kind === 'lumber') {
      o.add(mesh(g('hutB', () => new THREE.BoxGeometry(0.18, 0.12, 0.16)), matOf(th.trunk), 0, 0.06, 0));
      const r = pyramid(0.15, 0.11, th.roof); r.position.y = 0.12; o.add(r);
    }
    return o;
  }

  function houseModel(h, roofCol, wallCol) {
    const o = new THREE.Group();
    o.add(mesh(new THREE.BoxGeometry(0.17, h, 0.17), matOf(wallCol), 0, h / 2, 0));
    const r = pyramid(0.15, 0.13, roofCol);
    r.position.y = h;
    o.add(r);
    return o;
  }

  function unitModel(type, color) {
    const fig = new THREE.Group();
    const tribe = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0, specular: 0 });
    const tribeDark = new THREE.MeshPhongMaterial({ color: shade(color, 0.72), flatShading: true, shininess: 0, specular: 0 });
    const skin = matOf(0xf3cba2), wood = matOf(0x8a5a33), metal = matOf(0xdde2e6), horse = matOf(0xd2a273);
    const person = (sc, y0) => {
      const p = new THREE.Group();
      p.position.y = y0 || 0;
      p.add(mesh(g('ubody', () => new THREE.CylinderGeometry(0.075, 0.11, 0.24, 6)), tribe, 0, 0.12, 0));
      p.add(mesh(g('uhead', () => new THREE.IcosahedronGeometry(0.075, 0)), skin, 0, 0.31, 0));
      p.add(mesh(g('uhat', () => new THREE.CylinderGeometry(0.06, 0.08, 0.05, 6)), tribeDark, 0, 0.38, 0));
      p.scale.setScalar(sc || 1);
      return p;
    };
    const steed = () => {
      const h = new THREE.Group();
      h.add(mesh(g('hb', () => new THREE.BoxGeometry(0.3, 0.12, 0.12)), horse, 0, 0.17, 0));
      h.add(mesh(g('hh', () => new THREE.BoxGeometry(0.08, 0.14, 0.08)), horse, 0.17, 0.26, 0));
      for (const [x, z] of [[-0.11, -0.04], [-0.11, 0.04], [0.11, -0.04], [0.11, 0.04]]) h.add(mesh(g('hl', () => new THREE.BoxGeometry(0.035, 0.12, 0.035)), horse, x, 0.06, z));
      return h;
    };
    switch (type) {
      case 'warrior': {
        fig.add(person());
        const c = mesh(g('club', () => new THREE.BoxGeometry(0.035, 0.26, 0.035)), wood, 0.13, 0.22, 0.03); c.rotation.z = -0.4; fig.add(c);
        break;
      }
      case 'rider': case 'knight': {
        fig.add(steed());
        fig.add(person(0.78, 0.16));
        if (type === 'knight') {
          const l = mesh(g('lance', () => new THREE.CylinderGeometry(0.012, 0.018, 0.55, 4)), metal, 0.18, 0.38, 0.07); l.rotation.z = -1.2; fig.add(l);
        } else {
          const sp = mesh(g('spear', () => new THREE.CylinderGeometry(0.01, 0.01, 0.38, 4)), wood, 0.08, 0.42, 0.07); sp.rotation.z = -0.5; fig.add(sp);
        }
        break;
      }
      case 'archer': {
        fig.add(person());
        const b = mesh(g('bow', () => new THREE.TorusGeometry(0.13, 0.013, 3, 8, Math.PI)), wood, 0.12, 0.23, 0); b.rotation.z = -Math.PI / 2; fig.add(b);
        break;
      }
      case 'defender': {
        fig.add(person(1.05));
        const sh = mesh(g('shield', () => new THREE.CylinderGeometry(0.14, 0.14, 0.035, 8)), tribeDark, 0.12, 0.17, 0.03); sh.rotation.z = Math.PI / 2; fig.add(sh);
        break;
      }
      case 'swordsman': {
        fig.add(person(1.12));
        const sw = mesh(g('sword', () => new THREE.BoxGeometry(0.03, 0.34, 0.05)), metal, 0.15, 0.28, 0.04); sw.rotation.z = -0.25; fig.add(sw);
        break;
      }
      case 'catapult': {
        fig.add(mesh(g('cb', () => new THREE.BoxGeometry(0.34, 0.07, 0.22)), wood, 0, 0.09, 0));
        for (const [x, z] of [[-0.12, -0.13], [0.12, -0.13], [-0.12, 0.13], [0.12, 0.13]]) {
          const w = mesh(g('wh', () => new THREE.CylinderGeometry(0.06, 0.06, 0.03, 6)), matOf(0x5d3b1f), x, 0.06, z); w.rotation.x = Math.PI / 2; fig.add(w);
        }
        const arm = mesh(g('ca', () => new THREE.BoxGeometry(0.04, 0.36, 0.04)), wood, -0.04, 0.26, 0); arm.rotation.z = 0.7; fig.add(arm);
        fig.add(mesh(g('cbk', () => new THREE.BoxGeometry(0.09, 0.05, 0.09)), tribe, -0.17, 0.4, 0));
        break;
      }
      case 'giant': {
        fig.add(person(1.9));
        const c = mesh(g('gclub', () => new THREE.BoxGeometry(0.08, 0.5, 0.08)), wood, 0.26, 0.45, 0.04); c.rotation.z = -0.5; fig.add(c);
        break;
      }
    }
    return { fig, tribe, tribeDark };
  }

  // ---------- Инициализация ----------
  function init(canvas) {
    canvasEl = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();
    addLights(scene);
    sea = mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: THEMES.meadow.ocean }), 0, 0, 0);
    sea.rotation.x = -Math.PI / 2;
    scene.add(sea);
    scene.background = new THREE.Color(THEMES.meadow.ocean);
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
  }

  function resize() {
    const w = canvasEl.clientWidth || window.innerWidth;
    const h = canvasEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewH = aspect < 0.8 ? 12 : 9;
    camera.left = (-viewH * aspect) / 2; camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  }

  // Классическая изометрия: взгляд под 30° к горизонту, повёрнут на 45°.
  function placeCamera() {
    const d = 40, el = Math.PI / 6;
    camera.position.set(target.x + Math.cos(orbit) * Math.cos(el) * d, target.y + Math.sin(el) * d, target.z + Math.sin(orbit) * Math.cos(el) * d);
    camera.lookAt(target);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }

  // ---------- Мир ----------
  function computeThemes() {
    tileTheme = new Array(S * S);
    const caps = state.cities.filter((c) => c.capital && c.owner >= 0).map((c) => ({ x: c.x, y: c.y, th: TRIBE_THEME[state.players[c.owner].tribe] }));
    for (let i = 0; i < S * S; i++) {
      if (themeMode !== 'regions') { tileTheme[i] = THEMES[themeMode]; continue; }
      const t = state.tiles[i];
      let best = null;
      for (const c of caps) {
        const d = Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y)) + (Math.abs(c.x - t.x) + Math.abs(c.y - t.y)) * 0.01;
        if (!best || d < best.d) best = { d, th: c.th };
      }
      tileTheme[i] = THEMES[best ? best.th : 'meadow'];
    }
    const oceanTheme = themeMode === 'regions' ? THEMES.meadow : THEMES[themeMode];
    sea.material.color.set(oceanTheme.ocean);
    scene.background = new THREE.Color(oceanTheme.ocean);
  }

  function setTheme(mode) {
    themeMode = mode;
    if (!state) return;
    computeThemes();
    for (let i = 0; i < S * S; i++) { tiles[i].sig = null; paintTile(i); }
    for (const c of cityObjs.keys()) cityObjs.get(c).sig = null;
    sync(true);
    buildFoam();
  }

  function clearScene() {
    for (const t of tiles) { scene.remove(t.group); if (t.cloud) scene.remove(t.cloud); }
    tiles.length = 0;
    for (const o of unitObjs.values()) scene.remove(o.group);
    unitObjs.clear();
    for (const o of cityObjs.values()) scene.remove(o.group);
    cityObjs.clear();
    for (const gr of [borderGroup, foamGroup, markerGroup, selRing]) if (gr) scene.remove(gr);
  }

  function setState(s, humanId, mode) {
    clearScene();
    state = s; human = humanId; S = s.size;
    if (mode) themeMode = mode;
    computeThemes();
    borderGroup = new THREE.Group(); scene.add(borderGroup);
    foamGroup = new THREE.Group(); scene.add(foamGroup);
    markerGroup = new THREE.Group(); scene.add(markerGroup);
    selRing = mesh(new THREE.RingGeometry(0.42, 0.48, 4, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0, 0);
    selRing.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    selRing.visible = false;
    scene.add(selRing);
    for (let i = 0; i < S * S; i++) tiles.push(makeTile(i));
    sync(true);
    buildFoam();
  }

  function makeTile(i) {
    const t = state.tiles[i];
    const group = new THREE.Group();
    group.position.set(wx(t.x), 0, wz(t.y));
    const rec = { group, block: null, deco: new THREE.Group(), sig: null, cloud: null, explored: false };
    group.add(rec.deco);
    scene.add(group);
    group.visible = false;
    rec.cloud = makeCloud(i);
    paintTile(i, rec);
    return rec;
  }

  function paintTile(i, recIn) {
    const rec = recIn || tiles[i];
    const t = state.tiles[i];
    const th = tileTheme[i];
    if (rec.block) rec.group.remove(rec.block);
    rec.block = null;
    const r = hashRand(i + 3);
    if (L.isLand(t)) {
      const top = new THREE.MeshLambertMaterial({ color: shade(th.land, 0.985 + r() * 0.03) });
      const side = new THREE.MeshLambertMaterial({ color: th.side });
      rec.block = mesh(g('landB', () => new THREE.BoxGeometry(1, 0.6, 1)), [side, side, top, side, side, side], 0, LAND_TOP - 0.3, 0);
    } else if (t.t === 'water') {
      rec.block = mesh(g('waterB', () => new THREE.BoxGeometry(1, 0.05, 1)), new THREE.MeshBasicMaterial({ color: th.water }), 0, WATER_TOP - 0.025, 0);
    } else {
      rec.block = mesh(g('oceanB', () => new THREE.BoxGeometry(1, 0.01, 1)), new THREE.MeshBasicMaterial({ visible: false }), 0, -0.004, 0);
    }
    rec.block.userData.tile = i;
    rec.group.add(rec.block);
  }

  function makeCloud(i) {
    const t = state.tiles[i];
    const r = hashRand(i + 7);
    const c = new THREE.Group();
    c.position.set(wx(t.x), 0.4, wz(t.y));
    // Мягкие облака: гладкие сплюснутые сферы без граней.
    const geo = g('cloud', () => new THREE.SphereGeometry(0.5, 18, 12));
    const cm = MATS.cloud || (MATS.cloud = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa6b0 }));
    for (let k = 0; k < 3; k++) {
      const p = mesh(geo, cm, (r() - 0.5) * 0.45, k * 0.05, (r() - 0.5) * 0.45);
      const sc = 0.85 - k * 0.18 + r() * 0.15;
      p.scale.set(sc * 1.2, sc * 0.5, sc * 1.2);
      c.add(p);
    }
    c.userData.phase = r() * 6.28;
    scene.add(c);
    return c;
  }

  function tileSig(t) { return [t.res, t.imp, L.cityAt(state, t.x, t.y) ? 1 : 0].join('|'); }

  function buildDeco(rec, t, i) {
    const d = rec.deco;
    while (d.children.length) d.remove(d.children[0]);
    const th = tileTheme[i];
    const r = hashRand(i);
    const y = topY(t);
    const put = (o, x, z, ry) => { o.position.set(x, y, z); if (ry != null) o.rotation.y = ry; d.add(o); return o; };
    if (L.cityAt(state, t.x, t.y)) return;
    if (t.t === 'forest') {
      if (t.imp === 'lumber') {
        put(treeModel(th, r, 1), -0.18, -0.16, r() * 6);
      } else {
        put(treeModel(th, r, 1.05 + r() * 0.15), -0.16, -0.12, r() * 6);
        put(treeModel(th, r, 0.8 + r() * 0.15), 0.18, 0.14, r() * 6);
      }
    }
    if (t.t === 'mountain') put(mountainModel(th), -0.02, -0.02);
    if (t.res && !t.imp) {
      const spot = { fruit: [0.02, 0.02], crop: [0, 0.04], animal: [0.16, -0.14], fish: [0, 0], ore: [0.24, 0.24] }[t.res];
      put(resourceModel(t.res, th), spot[0], spot[1], t.res === 'animal' ? r() * 6 : 0);
    }
    if (t.imp) put(improvementModel(t.imp, th), t.imp === 'mine' ? 0.22 : t.imp === 'lumber' ? 0.16 : 0, t.imp === 'mine' ? 0.3 : t.imp === 'lumber' ? 0.16 : 0);
  }

  // ---------- Города ----------
  function citySig(c) { return [c.owner, c.level, c.walls, c.park, c.capital, c.name, c.pop, themeMode].join('|'); }

  function buildCity(c) {
    const old = cityObjs.get(c.id);
    if (old) scene.remove(old.group);
    const i = c.y * S + c.x;
    const th = tileTheme[i];
    const grp = new THREE.Group();
    grp.position.set(wx(c.x), LAND_TOP, wz(c.y));
    const r = hashRand(c.id * 13 + 5);
    if (c.owner < 0) {
      const h1 = houseModel(0.13, th.roof, th.hut); h1.position.set(-0.12, 0, -0.08); grp.add(h1);
      const h2 = houseModel(0.1, th.roof, th.hut); h2.position.set(0.14, 0, 0.1); h2.scale.setScalar(0.85); grp.add(h2);
    } else {
      const roof = new THREE.Color(state.players[c.owner].color).getHex();
      const spots = [[0, 0], [-0.22, 0.04], [0.04, -0.22], [0.22, 0.2], [-0.2, -0.22], [0.24, -0.06], [-0.06, 0.25]];
      const n = Math.min(spots.length, c.level + 1);
      for (let k = 0; k < n; k++) {
        const h = k === 0 ? (c.capital ? 0.34 : 0.22) : 0.12 + r() * 0.08;
        const hs = houseModel(h, roof, th.hut);
        hs.position.set(spots[k][0], 0, spots[k][1]);
        grp.add(hs);
      }
      if (c.capital) {
        grp.add(mesh(g('pole', () => new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4)), matOf(0x6b4a2c), 0, 0.55, 0));
        const flag = mesh(g('flag', () => new THREE.BoxGeometry(0.12, 0.07, 0.008)), matOf(roof), 0.06, 0.62, 0);
        flag.userData.flag = true;
        grp.add(flag);
      }
      if (c.walls) {
        for (let k = 0; k < 4; k++) {
          const piv = new THREE.Group();
          piv.rotation.y = (k * Math.PI) / 2;
          piv.add(mesh(g('wall', () => new THREE.BoxGeometry(0.86, 0.07, 0.05)), matOf(0xd8d2c6), 0, 0.035, 0.43));
          grp.add(piv);
        }
      }
      if (c.park) { const tr = treeModel(th, r, 0.8); tr.position.set(0.3, 0, -0.3); grp.add(tr); }
    }
    if (c.owner >= 0) grp.add(makeLabel(c));
    scene.add(grp);
    cityObjs.set(c.id, { group: grp, sig: citySig(c) });
    return grp;
  }

  // Подпись города: имя белым с мягкой обводкой, под ним полоска жителей.
  function makeLabel(c) {
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 96;
    const x = cv.getContext('2d');
    const text = c.owner >= 0 ? c.name : 'Деревня';
    x.font = '800 34px "Nunito", "Segoe UI", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = 7; x.strokeStyle = 'rgba(20,30,40,0.55)';
    x.strokeText(text, 160, 30);
    x.fillStyle = '#ffffff';
    x.fillText(text, 160, 30);
    if (c.owner >= 0) {
      const need = c.level + 1;
      const seg = Math.min(30, 220 / need);
      const left = 160 - (need * seg) / 2;
      x.fillStyle = 'rgba(20,30,40,0.45)';
      x.fillRect(left - 3, 60, need * seg + 6, 16);
      for (let k = 0; k < need; k++) {
        x.fillStyle = k < c.pop ? state.players[c.owner].color : 'rgba(255,255,255,0.55)';
        x.fillRect(left + k * seg + 1, 63, seg - 2, 10);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.25, 0.375, 1);
    sp.center.set(0.5, 0.95);
    sp.position.set(0.32, 0, 0.32);
    sp.renderOrder = 10;
    return sp;
  }

  // ---------- Юниты ----------
  function buildUnit(u) {
    const grp = new THREE.Group();
    const color = new THREE.Color(state.players[u.owner].color).getHex();
    const { fig, tribe, tribeDark } = unitModel(u.type, color);
    grp.add(fig);
    const shadow = mesh(g('ush', () => new THREE.CircleGeometry(0.2, 16)), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 }), 0, 0.006, 0);
    shadow.rotation.x = -Math.PI / 2;
    grp.add(shadow);
    const label = makeHpLabel(u);
    label.position.set(0, u.type === 'giant' ? 1.05 : 0.62, 0);
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
    sp.scale.set(0.26, 0.26, 1);
    sp.renderOrder = 11;
    sp.userData.cv = cv;
    drawHp(sp, u);
    return sp;
  }

  function drawHp(sp, u) {
    const x = sp.userData.cv.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(32, 32, 29, 0, Math.PI * 2); x.fill();
    x.fillStyle = state.players[u.owner].color;
    x.beginPath(); x.arc(32, 32, 24, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.font = '900 30px "Nunito", "Segoe UI", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(u.hp), 32, 34);
    sp.material.map.needsUpdate = true;
  }

  function unitPos(x, y) {
    const t = state.tiles[y * S + x];
    const off = L.cityAt(state, x, y) ? 0.18 : 0;
    return new THREE.Vector3(wx(x) + off, topY(t), wz(y) + off);
  }

  function setExhausted(rec, ex) {
    if (rec.exhausted === ex) return;
    rec.exhausted = ex;
    const c = new THREE.Color(rec.color);
    if (ex) c.lerp(new THREE.Color(0x9aa0a6), 0.6);
    rec.tribe.color.copy(c);
    rec.tribeDark.color.copy(c.clone().multiplyScalar(0.72));
  }

  // ---------- Синхронизация ----------
  function sync(instant) {
    if (!state) return;
    const s = state;
    const exp = s.players[human].explored;
    for (let i = 0; i < S * S; i++) {
      const rec = tiles[i];
      const t = s.tiles[i];
      const sig = tileSig(t);
      if (sig !== rec.sig) { rec.sig = sig; buildDeco(rec, t, i); }
      if (exp[i] && !rec.explored && instant) {
        rec.explored = true;
        rec.group.visible = true;
        if (rec.cloud) { scene.remove(rec.cloud); rec.cloud = null; }
      }
    }
    if (instant || borderGroup.userData.v !== s.version) buildBorders();
    for (const c of s.cities) {
      const o = cityObjs.get(c.id);
      if (!o || o.sig !== citySig(c)) {
        const grp = buildCity(c);
        if (o && !instant && o.sig.split('|')[1] !== String(c.level)) popIn(grp);
        if (o && !instant && o.sig.split('|')[0] !== String(c.owner)) popIn(grp);
      }
      cityObjs.get(c.id).group.visible = tiles[c.y * S + c.x].explored;
    }
    const alive = new Set();
    for (const u of s.units) {
      alive.add(u.id);
      let rec = unitObjs.get(u.id);
      if (!rec) { rec = buildUnit(u); if (!instant) popIn(rec.group); }
      if (!rec.busy) rec.group.position.copy(unitPos(u.x, u.y));
      if (rec.hp !== u.hp) { rec.hp = u.hp; drawHp(rec.label, u); }
      setExhausted(rec, u.owner === s.current && u.moved && u.attacked);
      rec.group.visible = tiles[u.y * S + u.x].explored || rec.busy;
    }
    for (const [id, rec] of unitObjs) {
      if (alive.has(id)) continue;
      unitObjs.delete(id);
      const grp = rec.group;
      tween(320, (k) => { grp.scale.setScalar(Math.max(0.01, 1 - k)); }).then(() => scene.remove(grp));
    }
  }

  function popIn(grp) {
    grp.scale.setScalar(0.01);
    tween(380, (k) => grp.scale.setScalar(Math.max(0.01, easeOutBack(k))));
  }

  function buildBorders() {
    const s = state;
    while (borderGroup.children.length) borderGroup.remove(borderGroup.children[0]);
    borderGroup.userData.v = s.version;
    const geoH = g('bh', () => new THREE.BoxGeometry(1, 0.012, 0.06));
    const geoV = g('bv', () => new THREE.BoxGeometry(0.06, 0.012, 1));
    for (let i = 0; i < S * S; i++) {
      const t = s.tiles[i];
      const own = L.tileOwner(s, t);
      if (own < 0 || !tiles[i].explored) continue;
      const m = new THREE.MeshBasicMaterial({ color: s.players[own].color });
      const y = topY(t) + 0.008;
      const diff = (dx, dy) => { const n = L.tileAt(s, t.x + dx, t.y + dy); return !n || L.tileOwner(s, n) !== own; };
      const e = 0.44;
      if (diff(0, -1)) borderGroup.add(mesh(geoH, m, wx(t.x), y, wz(t.y) - e));
      if (diff(0, 1)) borderGroup.add(mesh(geoH, m, wx(t.x), y, wz(t.y) + e));
      if (diff(-1, 0)) borderGroup.add(mesh(geoV, m, wx(t.x) - e, y, wz(t.y)));
      if (diff(1, 0)) borderGroup.add(mesh(geoV, m, wx(t.x) + e, y, wz(t.y)));
    }
  }

  // Белая пена вдоль берега — главный штрих минималистичной воды.
  function buildFoam() {
    while (foamGroup.children.length) foamGroup.remove(foamGroup.children[0]);
    const s = state;
    const foam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const geoH = g('fh', () => new THREE.BoxGeometry(1, 0.01, 0.05));
    const geoV = g('fv', () => new THREE.BoxGeometry(0.05, 0.01, 1));
    for (let i = 0; i < S * S; i++) {
      const t = s.tiles[i];
      if (L.isLand(t)) continue;
      const land = (dx, dy) => { const n = L.tileAt(s, t.x + dx, t.y + dy); return n && L.isLand(n); };
      const y = topY(t) + 0.012;
      const add = (geo, x, z) => { const o = mesh(geo, foam, x, y, z); o.userData.tile = i; foamGroup.add(o); };
      if (land(0, -1)) add(geoH, wx(t.x), wz(t.y) - 0.42);
      if (land(0, 1)) add(geoH, wx(t.x), wz(t.y) + 0.42);
      if (land(-1, 0)) add(geoV, wx(t.x) - 0.42, wz(t.y));
      if (land(1, 0)) add(geoV, wx(t.x) + 0.42, wz(t.y));
    }
    updateFoamVisibility();
  }
  function updateFoamVisibility() {
    for (const f of foamGroup.children) f.visible = tiles[f.userData.tile].explored;
  }

  function reveal(list, from) {
    const [fx, fy] = from || [S / 2, S / 2];
    for (const i of list) {
      const rec = tiles[i];
      if (rec.explored) continue;
      rec.explored = true;
      const t = state.tiles[i];
      const delay = Math.hypot(t.x - fx, t.y - fy) * 60;
      const cloud = rec.cloud;
      rec.cloud = null;
      if (cloud) {
        cloud.children.forEach((p) => { p.material = p.material.clone(); p.material.transparent = true; });
        tween(420, (k) => { cloud.scale.setScalar(1 + k * 0.5); cloud.position.y = 0.4 + k * 0.4; cloud.children.forEach((p) => { p.material.opacity = 1 - k; }); }, delay)
          .then(() => scene.remove(cloud));
      }
      rec.group.visible = true;
      rec.group.position.y = -1.2;
      tween(560, (k) => { rec.group.position.y = -1.2 * (1 - easeOutBack(k)); }, delay + 40).then(() => { rec.group.position.y = 0; });
    }
    buildBorders();
    updateFoamVisibility();
  }

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
      rec.fig.rotation.y = Math.atan2(to.x - a.x, to.z - a.z) - Math.PI / 2;
      await tween(160, (k) => {
        const e = easeInOut(k);
        rec.group.position.set(a.x + (to.x - a.x) * e, a.y + (to.y - a.y) * e + Math.sin(k * Math.PI) * 0.18, a.z + (to.z - a.z) * e);
      });
      from = to;
    }
    rec.busy = false;
  }

  async function animateAttack(attId, from, to, res) {
    const rec = unitObjs.get(attId);
    if (!rec) return;
    const a = unitPos(from[0], from[1]);
    const b = unitPos(to[0], to[1]);
    rec.busy = true;
    rec.fig.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    const ranged = Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1])) > 1;
    if (ranged) {
      const ball = mesh(g('proj', () => new THREE.IcosahedronGeometry(0.05, 0)), matOf(0x5b4030), a.x, a.y + 0.35, a.z);
      scene.add(ball);
      await tween(300, (k) => ball.position.set(a.x + (b.x - a.x) * k, a.y + 0.35 + Math.sin(k * Math.PI) * 0.8, a.z + (b.z - a.z) * k));
      scene.remove(ball);
    } else {
      await tween(140, (k) => rec.group.position.set(a.x + (b.x - a.x) * 0.45 * k, a.y + Math.sin(k * Math.PI) * 0.08, a.z + (b.z - a.z) * 0.45 * k));
    }
    floatText(to[0], to[1], '-' + res.dmg, '#ff5a4f');
    shake(res.target && res.target.id);
    if (!ranged) await tween(140, (k) => rec.group.position.set(a.x + (b.x - a.x) * 0.45 * (1 - k), a.y, a.z + (b.z - a.z) * 0.45 * (1 - k)));
    if (res.ret) { await wait(100); floatText(from[0], from[1], '-' + res.ret, '#ff5a4f'); }
    rec.busy = false;
  }

  function shake(id) {
    const rec = id && unitObjs.get(id);
    if (!rec) return;
    tween(240, (k) => { rec.fig.position.x = Math.sin(k * 30) * 0.04 * (1 - k); });
  }

  function floatText(x, y, text, color) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d');
    c.font = '900 42px "Nunito", "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 8; c.strokeStyle = 'rgba(20,30,40,0.6)';
    c.strokeText(text, 128, 34);
    c.fillStyle = color; c.fillText(text, 128, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    sp.scale.set(1, 0.25, 1);
    sp.renderOrder = 12;
    const p = unitPos(x, y);
    sp.position.set(p.x, p.y + 0.75, p.z);
    scene.add(sp);
    tween(900, (k) => { sp.position.y = p.y + 0.75 + k * 0.5; sp.material.opacity = 1 - k * k; }).then(() => scene.remove(sp));
  }

  // ---------- Подсветка ----------
  function setMarkers(sel, moves, attacks, extra) {
    while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0]);
    markers = [];
    if (sel && state) {
      const t = state.tiles[sel[1] * S + sel[0]];
      selRing.position.set(wx(sel[0]), topY(t) + 0.02, wz(sel[1]));
      selRing.visible = true;
    } else if (selRing) selRing.visible = false;
    const dot = g('mdot', () => new THREE.CircleGeometry(0.09, 16));
    const ring = g('mring', () => new THREE.RingGeometry(0.3, 0.38, 24));
    const add = (geo, color, x, y, opacity) => {
      const t = state.tiles[y * S + x];
      const o = mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity }), wx(x), topY(t) + 0.03, wz(y));
      o.rotation.x = -Math.PI / 2;
      o.renderOrder = 5;
      markerGroup.add(o);
      markers.push(o);
    };
    for (const [x, y] of moves || []) add(dot, 0xffffff, x, y, 0.9);
    for (const [x, y] of attacks || []) add(ring, 0xff4b3e, x, y, 1);
    for (const [x, y] of extra || []) add(ring, 0xffd23f, x, y, 1);
  }

  // ---------- Портреты для кнопок ----------
  let thumbR = null, thumbScene = null, thumbCam = null;
  const thumbCache = new Map();
  function thumbnail(key, make) {
    if (thumbCache.has(key)) return thumbCache.get(key);
    if (!thumbR) {
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      thumbR = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
      thumbR.setClearColor(0x000000, 0);
      thumbScene = new THREE.Scene();
      addLights(thumbScene);
      thumbCam = new THREE.OrthographicCamera(-0.36, 0.36, 0.36, -0.36, 0.1, 20);
      const d = 5, el = Math.PI / 6, az = Math.PI / 4;
      thumbCam.position.set(Math.cos(az) * Math.cos(el) * d, 0.25 + Math.sin(el) * d, Math.sin(az) * Math.cos(el) * d);
      thumbCam.lookAt(0, 0.25, 0);
    }
    const obj = make();
    thumbScene.add(obj);
    thumbR.render(thumbScene, thumbCam);
    const url = thumbR.domElement.toDataURL('image/png');
    thumbScene.remove(obj);
    thumbCache.set(key, url);
    return url;
  }
  function unitThumb(type, color) {
    return thumbnail('u:' + type + color, () => {
      const { fig } = unitModel(type, new THREE.Color(color).getHex());
      if (type === 'giant') fig.scale.setScalar(0.55);
      return fig;
    });
  }
  function buildThumb(kind, themeId) {
    const th = THEMES[themeId] || THEMES.meadow;
    return thumbnail('b:' + kind + themeId, () => {
      const o = new THREE.Group();
      const base = mesh(new THREE.BoxGeometry(0.62, 0.06, 0.62), new THREE.MeshLambertMaterial({ color: kind === 'fish' ? th.water : th.land }), 0, 0.03, 0);
      o.add(base);
      const inner = { fruit: () => resourceModel('fruit', th), hunt: () => resourceModel('animal', th), fish: () => resourceModel('fish', th), farm: () => improvementModel('farm', th), mine: () => { const m = mountainModel(th); m.scale.setScalar(0.7); return m; }, lumber: () => improvementModel('lumber', th) }[kind]();
      inner.position.y = 0.06;
      if (kind === 'farm') inner.scale.setScalar(0.8);
      if (kind === 'fish') inner.scale.setScalar(1.6);
      o.add(inner);
      o.position.y = 0.1;
      return o;
    });
  }
  const themeOfTribe = (tribe) => TRIBE_THEME[tribe] || 'meadow';

  // ---------- Камера и ввод ----------
  function rayFrom(clientX, clientY) {
    const rect = canvasEl.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
  }
  function pick(clientX, clientY) {
    if (!state) return null;
    rayFrom(clientX, clientY);
    const objs = [];
    for (const o of unitObjs.values()) if (o.group.visible) objs.push(o.fig);
    for (const t of tiles) if (t.explored && t.block) objs.push(t.block);
    for (const h of raycaster.intersectObjects(objs, true)) {
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
    const p = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.16), p)) {
      return L.tileAt(state, Math.round(p.x + S / 2 - 0.5), Math.round(p.z + S / 2 - 0.5));
    }
    return null;
  }
  function groundAt(clientX, clientY) {
    rayFrom(clientX, clientY);
    const p = new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return p;
  }
  function panBy(dx, dy) {
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const a = groundAt(cx, cy), b = groundAt(cx + dx, cy + dy);
    target.x -= b.x - a.x; target.z -= b.z - a.z;
    const lim = S / 2 + 1;
    target.x = Math.max(-lim, Math.min(lim, target.x));
    target.z = Math.max(-lim, Math.min(lim, target.z));
    placeCamera();
  }
  function zoomBy(f) { zoom = Math.max(0.5, Math.min(2.6, zoom * f)); placeCamera(); }
  function setZoom(z) { zoom = z; placeCamera(); }
  function focus(x, y, instant) {
    const to = new THREE.Vector3(wx(x), 0, wz(y));
    if (instant) { target.copy(to); placeCamera(); return; }
    const from = target.clone();
    tween(420, (k) => { target.lerpVectors(from, to, easeInOut(k)); placeCamera(); });
  }
  function focusCenter() { target.set(0, 0, 0); placeCamera(); }
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
    for (let i = 0; i < tiles.length; i++) {
      const rec = tiles[i];
      if (rec.cloud) {
        const ph = rec.cloud.userData.phase;
        rec.cloud.position.y = 0.4 + Math.sin(t * 0.7 + ph) * 0.04;
      } else if (state && state.tiles[i].t === 'water' && rec.group.position.y === 0) {
        rec.block.position.y = WATER_TOP - 0.025 + Math.sin(t * 1.4 + i * 0.6) * 0.006;
        for (const o of rec.deco.children) o.position.x = Math.sin(t * 0.8 + i) * 0.04;
      }
    }
    for (const rec of unitObjs.values()) {
      if (rec.busy) continue;
      rec.fig.position.y = rec.exhausted ? 0 : Math.abs(Math.sin(t * 2.2 + rec.phase)) * 0.03;
    }
    for (const o of cityObjs.values()) for (const c of o.group.children) if (c.userData.flag) c.rotation.y = Math.sin(t * 3) * 0.35;
    if (selRing && selRing.visible) selRing.scale.setScalar(1 + Math.sin(t * 5) * 0.03);
    for (const mk of markers) mk.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    renderer.render(scene, camera);
  }

  root.IslesView = {
    THEMES, TRIBE_THEME, init, setState, setTheme, sync, reveal, animateMove, animateAttack, floatText, setMarkers,
    pick, panBy, zoomBy, setZoom, focus, focusCenter, setOrbitSpeed, resize, unitThumb, buildThumb, themeOfTribe,
  };
})(window);
