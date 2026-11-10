// 3D farm view. The WebGL canvas and its label layer are created once and moved
// into each freshly rendered map host, because the rest of the UI is re-rendered
// with innerHTML and a new canvas would lose its GPU context and camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { POLY, RIDGES, TREES } from '../seed/farm';
import { F, sensorsOf } from '../seed/simulate';
import { S } from '../state';
import type { Field, FieldId, MapLayer, WaterState } from '../types';
import { esc, lastWatered, moistureTint, pending, T, ws } from '../ui/helpers';
import { can, polyPoints } from '../ui/icons';
import { plantField } from './crops3d';
import { center, fillFor, valueFor } from './map';

const MID_X = 400;
const MID_Y = 260;
/** Map coordinates (the 2D map's 800×520 viewBox) to the ground plane. */
const wx = (x: number) => x - MID_X;
const wz = (y: number) => y - MID_Y;

const WATER_H: Record<WaterState, number> = { now: 34, check: 26, soon: 24, rain: 18, none: 10, load: 6 };
const HEALTH_H = { cr: 34, wn: 22, ok: 12 } as const;

/** Block height shows the active layer, so the worst fields stand tallest. */
function heightFor(f: Field, layer: MapLayer): number {
  if (pending(f)) return WATER_H.load; // flat until real readings say otherwise
  if (layer === 'water') return WATER_H[ws(f)];
  if (layer === 'health') return HEALTH_H[f.hl];
  if (layer === 'moisture') return 4 + f.m * 0.75;
  return 4 + Math.max(0, f.st - 5) * 2.2;
}

interface Pin {
  el: HTMLButtonElement;
  x: number;
  z: number;
}

interface FieldNode {
  id: FieldId;
  group: THREE.Group;
  /** Material 0 is the top face; material 1 the soil sides. */
  block: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial[]>;
  edge: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  top: THREE.Group;
  zones: THREE.InstancedMesh;
  crops: THREE.Group;
  label: HTMLButtonElement;
  hud: HTMLDivElement;
  pins: Pin[];
  anchor: THREE.Vector3;
  h: number;
  target: number;
}

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  labels: HTMLDivElement;
  fields: FieldNode[];
  pipes: THREE.Group;
  resize?: ResizeObserver;
  running: boolean;
  onPick: (id: FieldId) => void;
  /** Field the camera last centred on, and the point it is gliding towards. */
  sel: FieldId;
  hover: FieldId | '';
  focus: THREE.Vector3 | null;
  /** Baked field outlines; if the farm parcels change, rebuild the scene. */
  layout: string;
}

let ctx: Ctx | null = null;
const layoutKey = () => `${S.farmerId ?? ''}:${F.map((f) => f.id).join(',')}`;

const prng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function inside(p: [number, number][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function waterPath(pts: [number, number][], radius: number, color: string) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(wx(x), 0.4, wz(y))));
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 72, radius, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.18 }),
  );
  mesh.scale.y = 0.1;
  return mesh;
}

function scenery(scene: THREE.Scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#6d9658', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Soft meadow patches so open land reads as pasture, not bare dirt.
  for (const [x, z, sx, sz, tone] of [
    [wx(40), wz(40), 180, 90, '#628850'],
    [wx(400), wz(20), 420, 70, '#73985c'],
    [wx(20), wz(300), 70, 280, '#5f874c'],
    [wx(780), wz(280), 90, 260, '#678e54'],
    [wx(460), wz(360), 90, 220, '#4f7340'],
    [wx(680), wz(450), 160, 120, '#5a8048'],
  ] as const) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshStandardMaterial({ color: tone, roughness: 1 }));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.15, z);
    patch.receiveShadow = true;
    scene.add(patch);
  }

  // Distant mountain range north of the farm.
  const rock = new THREE.MeshStandardMaterial({ color: '#5a6d78', roughness: 0.95 });
  const snow = new THREE.MeshStandardMaterial({ color: '#eef3f6', roughness: 0.7 });
  RIDGES.forEach(({ x, h, w }, i) => {
    const peak = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, h * 1.8, 7), rock);
    body.position.y = h * 0.9;
    body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.16, h * 0.45, 6), snow);
    cap.position.y = h * 1.55;
    peak.add(body, cap);
    if (i % 2 === 0) {
      const shoulder = new THREE.Mesh(new THREE.ConeGeometry(w * 0.28, h * 1.1, 6), rock);
      shoulder.position.set(w * 0.28, h * 0.55, w * 0.08);
      peak.add(shoulder);
    }
    peak.position.set(wx(x), 0, wz(-90 - (i % 3) * 40));
    scene.add(peak);
  });
  // Far hinterland ridges so the horizon isn't flat.
  [[-900, 220, 380], [200, 280, 420], [1100, 200, 360], [-400, 160, 300], [700, 190, 340]].forEach(([x, h, r], i) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? '#4c5f6c' : '#677b86', roughness: 1 }));
    m.position.set(x, h / 2 - 10, -1100 - (i % 3) * 120);
    scene.add(m);
  });

  scene.add(waterPath([[470, 195], [492, 275], [478, 365], [468, 440], [458, 545]], 9, '#4a8eb8'));
  scene.add(waterPath([[125, 508], [185, 472], [245, 458], [315, 450], [435, 432], [472, 402]], 6, '#3d7aaa'));

  const pond = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48), new THREE.MeshStandardMaterial({ color: '#3d7aaa', roughness: 0.2, metalness: 0.15 }));
  pond.scale.set(62, 1.2, 34);
  pond.position.set(wx(620), 0.2, wz(460));
  scene.add(pond);
  const bank = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 48), new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 1 }));
  bank.scale.set(62, 1, 34);
  bank.rotation.x = Math.PI / 2;
  bank.position.set(wx(620), 0.8, wz(460));
  scene.add(bank);

  const barn = new THREE.Group();
  barn.add(box(72, 24, 46, '#8a4a32', 0, 12, 0));
  const roofShape = new THREE.Shape([new THREE.Vector2(-40, 0), new THREE.Vector2(40, 0), new THREE.Vector2(0, 18)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 50, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#3b2f2a', roughness: 0.8 }));
  roof.position.set(0, 24, -25);
  roof.castShadow = true;
  barn.add(roof);
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 44, 24), new THREE.MeshStandardMaterial({ color: '#c9c3b4', roughness: 0.6, metalness: 0.3 }));
  silo.position.set(50, 22, 0);
  silo.castShadow = true;
  barn.add(silo);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), silo.material);
  cap.position.set(50, 44, 0);
  barn.add(cap);
  barn.position.set(wx(712), 0, wz(313));
  scene.add(barn);

  const leaves = ['#3d6b45', '#4a7a52', '#2f5a38', '#557f5c'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }));
  const bark = new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1 });
  TREES.forEach(([x, y], i) => {
    const t = new THREE.Group();
    const tall = 22 + (i % 5) * 5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, tall * 0.45, 6), bark);
    trunk.position.y = tall * 0.22;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(9 + (i % 4) * 2.2, 8, 6), leaves[i % leaves.length]);
    crown.position.y = tall * 0.55;
    crown.scale.y = 1.15 + (i % 3) * 0.1;
    if (i % 3 !== 1) {
      const mid = new THREE.Mesh(new THREE.SphereGeometry(7 + (i % 3), 8, 6), leaves[(i + 1) % leaves.length]);
      mid.position.set(3, tall * 0.42, -2);
      mid.castShadow = true;
      t.add(mid);
    }
    crown.castShadow = trunk.castShadow = true;
    t.add(trunk, crown);
    t.position.set(wx(x), 0, wz(y));
    scene.add(t);
  });
}

function irrigation(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#4a78b5', roughness: 0.4 });
  const runs: [number, number][][] = [
    [[610, 428], [610, 412], [668, 412], [668, 222], [275, 222]],
    [[326, 222], [326, 30]],
    [[548, 222], [548, 48]],
    [[275, 222], [275, 482]],
  ];
  for (const run of runs) {
    for (let i = 1; i < run.length; i++) {
      const [a, b] = [run[i - 1], run[i]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 8), mat);
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      pipe.position.set(wx((a[0] + b[0]) / 2), 2.2, wz((a[1] + b[1]) / 2));
      g.add(pipe);
    }
  }
  return g;
}

function moistureAt(x: number, y: number, f: Field, cx: number, cy: number): number {
  const ss = sensorsOf(f.id).filter((s) => s.m != null);
  if (!ss.length) return f.m;
  let num = 0;
  let den = 0;
  for (const s of ss) {
    const w = 1 / ((x - (cx + s.dx)) ** 2 + (y - (cy + s.dy)) ** 2 + 80);
    num += w * s.m!;
    den += w;
  }
  return num / den;
}

function zoneTiles(f: Field, pts: [number, number][], cx: number, cy: number): THREE.InstancedMesh {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const step = 10;
  const cells: { x: number; y: number; m: number }[] = [];
  for (let y = Math.min(...ys) + 7; y < Math.max(...ys) - 7; y += step) {
    for (let x = Math.min(...xs) + 7; x < Math.max(...xs) - 7; x += step) {
      if (inside(pts, x, y) && inside(pts, x + 4, y) && inside(pts, x - 4, y) && inside(pts, x, y + 4) && inside(pts, x, y - 4)) {
        cells.push({ x, y, m: moistureAt(x, y, f, cx, cy) });
      }
    }
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(step - 0.8, 0.7, step - 0.8),
    new THREE.MeshStandardMaterial({ roughness: 0.92, transparent: true, opacity: 0.55 }),
    cells.length,
  );
  const mat = new THREE.Matrix4();
  const col = new THREE.Color();
  cells.forEach((c, i) => {
    mat.makeTranslation(wx(c.x), 0.4, wz(c.y));
    mesh.setMatrixAt(i, mat);
    mesh.setColorAt(i, col.set(moistureTint(c.m)));
  });
  mesh.instanceColor!.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.userData.id = f.id;
  mesh.userData.cells = cells.length;
  return mesh;
}

function hudHtml(f: Field): string {
  if (pending(f)) return `<p class=hud3-k>${esc(f.name)} · ${f.crop}</p><p class=mut>Loading this field’s readings…</p>`;
  // Click HUD: last watering, humidity, and moisture per sensor area.
  const zones = sensorsOf(f.id);
  const live = zones.filter((s) => s.m != null).map((s) => s.m!);
  const lo = live.length ? Math.min(...live) : f.m;
  const hi = live.length ? Math.max(...live) : f.m;
  const rows = zones
    .map((s) => {
      const v = s.m == null ? '—' : `${Math.round(s.m)}%`;
      const tone = s.m == null ? '#b8b2a2' : moistureTint(s.m);
      return `<div class=z3><i style='background:${tone}'></i><b>${esc(s.id)}</b><span>${v}</span><em>${s.online ? 'live' : `${s.age}h ago`}</em></div>`;
    })
    .join('');
  return `<p class=hud3-k>${esc(f.name)} · ${f.crop}</p><div class=hud3-grid><div><span>Avg moisture</span><b>${f.m}%</b></div><div><span>Air humidity</span><b>${f.h}%</b></div><div><span>Soil temp</span><b>${T(f.st)}</b></div><div><span>Last watered</span><b>${lastWatered(f.id)}</b></div></div><div class=hud3-leg aria-hidden=true><span>Dry</span><i></i><span>Wet</span><em>${Math.round(lo)}–${Math.round(hi)}% across field</em></div><p class=hud3-z>Moisture by sensor area</p>${rows}<button class='btn sm hud3-btn' data-act=showfield data-id=${f.id} data-testid=open-field-details>See field details →</button>`;
}

function fieldNode(f: Field, labels: HTMLDivElement): FieldNode {
  const pts = polyPoints(f.id);
  const [cx, cy] = center(f.id);
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  const block = new THREE.Mesh(geo, [
    new THREE.MeshStandardMaterial({ roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 }),
  ]);
  block.rotation.x = -Math.PI / 2;
  block.castShadow = true;
  block.receiveShadow = true;
  block.userData.id = f.id;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#ffffff' }));
  edge.rotation.x = -Math.PI / 2;

  const top = new THREE.Group();
  const zones = zoneTiles(f, pts, cx, cy);
  const crops = new THREE.Group();
  plantField(crops, f, pts, prng(f.id.charCodeAt(0) * 7919), wx, wz);
  top.add(zones, crops);

  const ss = sensorsOf(f.id);
  ss.forEach((s) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 16), new THREE.MeshStandardMaterial({ color: '#2a2f33' }));
    post.position.set(wx(cx + s.dx), 8, wz(cy + s.dy));
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, 14, 10),
      new THREE.MeshStandardMaterial({
        color: s.online ? moistureTint(s.m ?? f.m) : '#f2a33a',
        emissive: s.online ? '#0d3a1f' : '#5a2a00',
      }),
    );
    head.position.set(wx(cx + s.dx), 18, wz(cy + s.dy));
    post.castShadow = head.castShadow = true;
    post.userData.id = head.userData.id = f.id;
    top.add(post, head);
  });

  const group = new THREE.Group();
  group.userData.id = f.id;
  group.add(block, edge, top);

  const label = document.createElement('button');
  label.className = 'f3';
  label.dataset.act = 'pk';
  label.dataset.id = f.id;
  labels.appendChild(label);

  const hud = document.createElement('div');
  hud.className = 'hud3';
  hud.dataset.testid = `hud-${f.id}`;
  labels.appendChild(hud);

  const pins: Pin[] = ss.map((s) => {
    const el = document.createElement('button');
    el.className = 'pin3';
    el.dataset.act = 'pk';
    el.dataset.id = f.id;
    labels.appendChild(el);
    return { el, x: wx(cx + s.dx), z: wz(cy + s.dy) };
  });

  return { id: f.id, group, block, edge, top, zones, crops, label, hud, pins, anchor: new THREE.Vector3(wx(cx), 0, wz(cy)), h: 1, target: 1 };
}

function create(onPick: (id: FieldId) => void): Ctx {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'gl3';
  renderer.domElement.setAttribute('aria-label', 'Farm map in 3D');
  renderer.domElement.setAttribute('role', 'img');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ec4e0');
  scene.fog = new THREE.Fog('#b7cfc0', 1400, 3200);
  scene.add(new THREE.HemisphereLight('#e8f2ff', '#5f874c', 1.35));
  const sun = new THREE.DirectionalLight('#fff4dc', 2.2);
  sun.position.set(-380, 620, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -560, right: 560, top: 420, bottom: -420, near: 10, far: 1600 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scenery(scene);

  const camera = new THREE.PerspectiveCamera(38, 1, 5, 4000);
  camera.position.set(-60, 820, 900);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 20);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.32;
  controls.minDistance = 180;
  controls.maxDistance = 1800;
  controls.update();
  controls.saveState();

  const labels = document.createElement('div');
  labels.className = 'l3';
  const fields = F.map((f) => fieldNode(f, labels));
  fields.forEach((n) => scene.add(n.group));
  const pipes = irrigation();
  scene.add(pipes);

  const c: Ctx = { renderer, scene, camera, controls, labels, fields, pipes, running: false, onPick, sel: S.sel, hover: '', focus: null, layout: layoutKey() };

  // Hover shows the field card; click still selects for the side rail.
  const ray = new THREE.Raycaster();
  let down: [number, number] | null = null;

  const fieldIdAt = (clientX: number, clientY: number): FieldId | '' => {
    const box = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1),
      camera,
    );
    const hit = ray.intersectObjects(
      fields.map((n) => n.group),
      true,
    )[0];
    let obj: THREE.Object3D | undefined = hit?.object;
    while (obj && !obj.userData.id) obj = obj.parent ?? undefined;
    return (obj?.userData.id as FieldId | undefined) ?? '';
  };

  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointermove', (e) => {
    const id = fieldIdAt(e.clientX, e.clientY);
    if (id === c.hover) return;
    c.hover = id;
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const id = fieldIdAt(e.clientX, e.clientY);
    // Touch and pen have no hover: a tap's position must not keep a card open after the next tap.
    if (e.pointerType !== 'mouse') c.hover = '';
    if (!id) c.onPick('' as FieldId);
    else c.onPick(id);
  });
  return c;
}

function fit(c: Ctx, host: HTMLElement) {
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  c.renderer.setSize(w, h, false);
  c.camera.aspect = w / h;
  c.camera.updateProjectionMatrix();
}

function sync(c: Ctx) {
  const L = S.ly;
  for (const n of c.fields) {
    const f = F.find((x) => x.id === n.id)!;
    const sel = S.sel === n.id;
    n.block.material[0].color.set(fillFor(f, L));
    n.block.material[0].emissive.set(sel ? '#2a2a14' : '#000000');
    n.edge.material.color.set(sel ? '#1b2229' : '#ffffff');
    n.target = heightFor(f, L) + (sel ? 6 : 0);
    const [ox, oy] = S.off[n.id] ?? [0, 0];
    n.group.position.set(ox, 0, oy);
    // Selected field: moisture map is loud; other fields keep a light soil wash under the crop.
    const zm = n.zones.material as THREE.MeshStandardMaterial;
    zm.opacity = sel ? 0.92 : 0.42;
    n.zones.position.y = sel ? 0.35 : 0;
    n.crops.visible = true;
    n.crops.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) {
        const mat = o.material as THREE.MeshStandardMaterial;
        mat.transparent = sel;
        mat.opacity = sel ? 0.72 : 1;
      }
    });
    const k = ws(f);
    n.label.innerHTML = `<span data-w=1>${can(k, 26)}</span><span><b>${esc(f.name)}</b><br>${valueFor(f, L)}</span>`;
    n.label.setAttribute('aria-pressed', String(sel));
    n.label.setAttribute('aria-label', `${f.name}, ${valueFor(f, L)}`);
    n.hud.innerHTML = hudHtml(f);
    n.hud.classList.add('on');
    const ss = sensorsOf(f.id);
    n.pins.forEach((p, i) => {
      const s = ss[i];
      p.el.classList.add('on');
      if (!s) return;
      p.el.innerHTML = `<b>${esc(s.id)}</b>${s.m == null ? '—' : `${Math.round(s.m)}%`}`;
      p.el.style.borderColor = s.m == null ? '#b8b2a2' : moistureTint(s.m);
    });
  }
  c.pipes.visible = Object.keys(S.off).length === 0;
  if (S.sel !== c.sel) {
    c.sel = S.sel;
    const n = c.fields.find((x) => x.id === S.sel);
    c.focus = n ? n.anchor.clone().add(n.group.position) : null;
  }
}

const tmp = new THREE.Vector3();

function frame(c: Ctx) {
  if (!c.renderer.domElement.isConnected) {
    c.running = false;
    return;
  }
  if (c.focus) {
    const step = c.focus.clone().sub(c.controls.target).multiplyScalar(0.1);
    c.controls.target.add(step);
    c.camera.position.add(step);
    if (step.length() < 0.05) c.focus = null;
  }
  c.controls.update();
  const r = c.renderer.domElement.getBoundingClientRect();
  for (const n of c.fields) {
    n.h += (n.target - n.h) * 0.14;
    n.block.scale.z = n.edge.scale.z = n.h;
    n.top.position.y = n.h;
    const toScreen = (x: number, y: number, z: number, hideBehind: boolean) => {
      tmp.set(x, y, z).project(c.camera);
      const off = tmp.z > 1;
      return { off: hideBehind && off, tx: ((tmp.x + 1) / 2) * r.width, ty: ((1 - tmp.y) / 2) * r.height };
    };
    const lab = toScreen(n.anchor.x + n.group.position.x, n.h + 36, n.anchor.z + n.group.position.z, true);
    n.label.style.display = lab.off ? 'none' : '';
    if (!lab.off) n.label.style.transform = `translate(-50%,-100%) translate(${lab.tx}px,${lab.ty}px)`;
    // The hovered field, or with nothing hovered the one the farmer tapped open: so it works on touch
    // screens and stays while the pointer moves onto its "See field details" button. Never opens by itself.
    const hot = c.hover ? c.hover === n.id : n.id === S.hud;
    n.hud.style.display = hot && !lab.off ? '' : 'none';
    if (hot && !lab.off) n.hud.style.transform = `translate(18px,-100%) translate(${lab.tx}px,${lab.ty}px)`;
    if (hot) {
      n.pins.forEach((p) => {
        const pin = toScreen(p.x + n.group.position.x, n.h + 22, p.z + n.group.position.z, true);
        p.el.style.display = pin.off ? 'none' : '';
        if (!pin.off) p.el.style.transform = `translate(-50%,-110%) translate(${pin.tx}px,${pin.ty}px)`;
      });
    } else {
      n.pins.forEach((p) => (p.el.style.display = 'none'));
    }
  }
  c.renderer.render(c.scene, c.camera);
  requestAnimationFrame(() => frame(c));
}

/** Puts the 3D view into a freshly rendered host and brings it up to date with the state. */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    ctx?.renderer.dispose();
    ctx = null;
  });
}

export function mount3D(host: HTMLElement, onPick: (id: FieldId) => void) {
  // Crop and parcel meshes are built once; rebuild if the layout changed or a stale canvas is left behind.
  if (ctx && (ctx.layout !== layoutKey() || (!host.contains(ctx.renderer.domElement) && host.querySelector('.gl3')))) {
    ctx.renderer.dispose();
    ctx.labels.remove();
    ctx = null;
  }
  ctx ??= create(onPick);
  const c = ctx;
  c.onPick = onPick;
  host.append(c.renderer.domElement, c.labels);
  if (!host.dataset.fwHoverLeave) {
    host.dataset.fwHoverLeave = '1';
    host.addEventListener('pointerleave', () => {
      if (ctx) ctx.hover = '';
    });
  }
  c.resize?.disconnect();
  c.resize = new ResizeObserver(() => fit(c, host));
  c.resize.observe(host);
  fit(c, host);
  sync(c);
  if (!c.running) {
    c.running = true;
    requestAnimationFrame(() => frame(c));
  }
}

export function zoom3D(factor: number) {
  if (!ctx) return;
  const { camera, controls } = ctx;
  const d = camera.position.clone().sub(controls.target);
  const len = Math.max(controls.minDistance, Math.min(controls.maxDistance, d.length() / factor));
  camera.position.copy(controls.target).add(d.setLength(len));
  controls.update();
}

export function reset3D() {
  if (!ctx) return;
  ctx.focus = null;
  ctx.controls.reset();
}

export function dispose3D() {
  if (!ctx) return;
  ctx.running = false;
  ctx.resize?.disconnect();
  ctx.renderer.dispose();
  ctx.labels.remove();
  ctx.renderer.domElement.remove();
  ctx = null;
}
