// 3D farm view. The WebGL canvas and its label layer are created once and moved
// into each freshly rendered map host, because the rest of the UI is re-rendered
// with innerHTML and a new canvas would lose its GPU context and camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CC } from '../seed/farm';
import { F } from '../seed/simulate';
import { S } from '../state';
import type { Field, FieldId, MapLayer, WaterState } from '../types';
import { ws } from '../ui/helpers';
import { can, polyPoints } from '../ui/icons';
import { SENSOR_OFFSETS, center, fillFor, valueFor } from './map';

const MID_X = 400;
const MID_Y = 260;
/** Map coordinates (the 2D map's 800×520 viewBox) to the ground plane. */
const wx = (x: number) => x - MID_X;
const wz = (y: number) => y - MID_Y;

const WATER_H: Record<WaterState, number> = { now: 34, soon: 24, rain: 18, none: 10 };
const HEALTH_H = { cr: 34, wn: 22, ok: 12 } as const;

/** Block height shows the active layer, so the worst fields stand tallest. */
function heightFor(f: Field, layer: MapLayer): number {
  if (layer === 'water') return WATER_H[ws(f)];
  if (layer === 'health') return HEALTH_H[f.hl];
  if (layer === 'moisture') return 4 + f.m * 0.75;
  return 4 + Math.max(0, f.st - 5) * 2.2;
}

interface FieldNode {
  id: FieldId;
  group: THREE.Group;
  /** Material 0 is the top face, coloured by layer; material 1 the soil sides. */
  block: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial[]>;
  edge: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  top: THREE.Group;
  label: HTMLButtonElement;
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
  focus: THREE.Vector3 | null;
}

let ctx: Ctx | null = null;

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

function scenery(scene: THREE.Scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: '#e6dcb6', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(box(1400, 1.2, 16, '#4a3a28', 0, 0.6, wz(228)));
  for (let x = -680; x < 700; x += 22) scene.add(box(12, 0.4, 1.6, '#e8e1c8', x, 1.4, wz(228)));

  const creek = new THREE.CatmullRomCurve3([[470, 215], [492, 300], [478, 400], [468, 560]].map(([x, y]) => new THREE.Vector3(wx(x), 0, wz(y))));
  const river = new THREE.Mesh(new THREE.TubeGeometry(creek, 60, 7, 8), new THREE.MeshStandardMaterial({ color: '#5b8ec9', roughness: 0.3, metalness: 0.1 }));
  river.scale.y = 0.12;
  river.position.y = 0.6;
  scene.add(river);

  const pond = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48), new THREE.MeshStandardMaterial({ color: '#5b8ec9', roughness: 0.25, metalness: 0.1 }));
  pond.scale.set(60, 1, 32);
  pond.position.set(wx(620), 0.3, wz(460));
  scene.add(pond);

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

  const tractor = new THREE.Group();
  tractor.add(box(26, 8, 12, '#c0392b', 0, 6, 0), box(11, 9, 11, '#e8e1c8', 6, 14, 0));
  [[-8, 6], [8, 4.5]].forEach(([x, r]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 14, 16), new THREE.MeshStandardMaterial({ color: '#222' }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, r, 0);
    tractor.add(wheel);
  });
  tractor.position.set(wx(373), 0, wz(222));
  scene.add(tractor);

  const leaf = new THREE.MeshStandardMaterial({ color: '#4f7558', roughness: 0.9 });
  const bark = new THREE.MeshStandardMaterial({ color: '#6b4f33' });
  [[24, 238], [780, 240], [30, 500], [760, 500], [690, 380], [560, 500], [-20, 120], [820, 140], [400, 520]].forEach(([x, y], i) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 10), bark);
    trunk.position.y = 5;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(11 + (i % 3) * 2, 28 + (i % 2) * 6, 10), leaf);
    crown.position.y = 22;
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

function fieldNode(f: Field, labels: HTMLDivElement): FieldNode {
  const pts = polyPoints(f.id);
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
  const rnd = prng(f.id.charCodeAt(0) * 7919);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const plants: THREE.Vector3[] = [];
  for (let n = 0; plants.length < 60 && n < 600; n++) {
    const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs));
    const y = Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys));
    if (inside(pts, x, y) && inside(pts, x + 8, y) && inside(pts, x - 8, y) && inside(pts, x, y + 8) && inside(pts, x, y - 8)) plants.push(new THREE.Vector3(wx(x), 0, wz(y)));
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (f.crop === 'Blueberries') {
    // Rounded shrubs dotted with berries, instead of grain spikes.
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(6, 1), new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 0.9, flatShading: true }), plants.length);
    const berry = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshStandardMaterial({ color: CC[f.crop], roughness: 0.35 }), plants.length * 6);
    plants.forEach((p, i) => {
      const s = 0.8 + rnd() * 0.4;
      m.compose(new THREE.Vector3(p.x, 5 * s, p.z), q, new THREE.Vector3(s, s * 0.85, s));
      bush.setMatrixAt(i, m);
      for (let b = 0; b < 6; b++) {
        const a = rnd() * Math.PI * 2;
        const up = 0.2 + rnd() * 0.7;
        const r = 6 * s * Math.sqrt(1 - up * up);
        m.makeTranslation(p.x + Math.cos(a) * r, 5 * s + up * 5.1 * s, p.z + Math.sin(a) * r);
        berry.setMatrixAt(i * 6 + b, m);
      }
    });
    bush.castShadow = true;
    top.add(bush, berry);
  } else {
    const crop = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 10, 6), new THREE.MeshStandardMaterial({ color: CC[f.crop], roughness: 0.8 }), plants.length);
    plants.forEach((p, i) => {
      const s = 0.75 + rnd() * 0.5;
      m.compose(new THREE.Vector3(p.x, 5 * s, p.z), q, new THREE.Vector3(s, s, s));
      crop.setMatrixAt(i, m);
    });
    crop.castShadow = true;
    top.add(crop);
  }

  const [cx, cy] = center(f.id);
  for (let i = 0; i < f.s[1]; i++) {
    const online = i < f.s[0];
    const [dx, dy] = SENSOR_OFFSETS[i];
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 18), new THREE.MeshStandardMaterial({ color: '#2a2f33' }));
    post.position.set(wx(cx + dx), 9, wz(cy + dy));
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 12),
      new THREE.MeshStandardMaterial({ color: online ? '#2f9a5a' : '#f2a33a', emissive: online ? '#0d3a1f' : '#5a2a00' }),
    );
    head.position.set(wx(cx + dx), 20, wz(cy + dy));
    post.castShadow = head.castShadow = true;
    top.add(post, head);
  }

  const group = new THREE.Group();
  group.add(block, edge, top);
  const label = document.createElement('button');
  label.className = 'f3';
  label.dataset.act = 'pk';
  label.dataset.id = f.id;
  labels.appendChild(label);
  return { id: f.id, group, block, edge, top, label, anchor: new THREE.Vector3(wx(cx), 0, wz(cy)), h: 1, target: 1 };
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
  scene.background = new THREE.Color('#cfe0ea');
  scene.fog = new THREE.Fog('#cfe0ea', 1500, 2800);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b7a77a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4dc', 2.4);
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

  const c: Ctx = { renderer, scene, camera, controls, labels, fields, pipes, running: false, onPick, sel: S.sel, focus: null };

  // A click picks a field; a drag only moves the camera.
  const ray = new THREE.Raycaster();
  let down: [number, number] | null = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(fields.map((n) => n.block))[0];
    if (hit) c.onPick(hit.object.userData.id as FieldId);
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
    const k = ws(f);
    n.label.innerHTML = `<span data-w=1>${can(k, 26)}</span><span><b>${f.name}</b><br>${valueFor(f, L)}</span>`;
    n.label.setAttribute('aria-pressed', String(sel));
    n.label.setAttribute('aria-label', `${f.name}, ${valueFor(f, L)}`);
  }
  c.pipes.visible = Object.keys(S.off).length === 0;
  if (S.sel !== c.sel) {
    c.sel = S.sel;
    const n = c.fields.find((x) => x.id === S.sel)!;
    c.focus = n.anchor.clone().add(n.group.position);
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
    tmp.copy(n.anchor).add(n.group.position).setY(n.h + 34).project(c.camera);
    const off = tmp.z > 1;
    n.label.style.display = off ? 'none' : '';
    if (!off) n.label.style.transform = `translate(-50%,-100%) translate(${((tmp.x + 1) / 2) * r.width}px,${((1 - tmp.y) / 2) * r.height}px)`;
  }
  c.renderer.render(c.scene, c.camera);
  requestAnimationFrame(() => frame(c));
}

/** Puts the 3D view into a freshly rendered host and brings it up to date with the state. */
export function mount3D(host: HTMLElement, onPick: (id: FieldId) => void) {
  ctx ??= create(onPick);
  const c = ctx;
  c.onPick = onPick;
  host.append(c.renderer.domElement, c.labels);
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
