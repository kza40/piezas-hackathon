import * as THREE from 'three';
import { CC } from '../seed/farm';
import type { Crop, Field } from '../types';

type Rnd = () => number;

const q = new THREE.Quaternion();
const m = new THREE.Matrix4();
const eul = new THREE.Euler();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

function inside(p: [number, number][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Planting spacing a farmer would recognise: grain in drill rows, canola wider, blueberries in bush rows. */
function spacing(crop: Crop): [number, number] {
  if (crop === 'Blueberries') return [22, 24];
  if (crop === 'Canola') return [12, 14];
  if (crop === 'Alfalfa') return [9, 9];
  return [7, 10];
}

function spots(pts: [number, number][], crop: Crop, wx: (x: number) => number, wz: (y: number) => number): THREE.Vector3[] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [gx, gy] = spacing(crop);
  const pad = crop === 'Blueberries' ? 20 : 14;
  const out: THREE.Vector3[] = [];
  for (let y = Math.min(...ys) + pad, row = 0; y < Math.max(...ys) - pad; y += gy, row++) {
    const shift = row % 2 ? gx * 0.45 : 0;
    for (let x = Math.min(...xs) + pad + shift; x < Math.max(...xs) - pad; x += gx) {
      if (inside(pts, x, y) && inside(pts, x + 5, y) && inside(pts, x - 5, y) && inside(pts, x, y + 5) && inside(pts, x, y - 5)) {
        out.push(new THREE.Vector3(wx(x), 0, wz(y)));
      }
    }
  }
  return out;
}

function place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0, rotX = 0) {
  pos.set(x, y, z);
  scl.set(sx, sy, sz);
  q.setFromEuler(eul.set(rotX, rotY, 0));
  mesh.setMatrixAt(i, m.compose(pos, q, scl));
}

/** Wheat / barley: green tillers with a golden head and thin awns. */
function cereal(top: THREE.Group, pts: THREE.Vector3[], headCol: string, rnd: Rnd, tall = 1, awns = true) {
  const n = pts.length;
  const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 5), new THREE.MeshStandardMaterial({ color: '#4f7a38', roughness: 0.85 }), n);
  const head = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.55, 1.6, 3, 6), new THREE.MeshStandardMaterial({ color: headCol, roughness: 0.65 }), n);
  const awn = awns
    ? new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 3), new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.8 }), n * 5)
    : null;
  pts.forEach((p, i) => {
    const s = (0.85 + rnd() * 0.35) * tall;
    const h = 10 * s;
    const yaw = rnd() * Math.PI;
    place(stem, i, p.x, h / 2, p.z, s, h, s, yaw);
    place(head, i, p.x, h + 1.4 * s, p.z, 0.9 * s, 1.3 * s, 0.9 * s, yaw);
    if (awn)
      for (let k = 0; k < 5; k++) {
        const a = ((k - 2) / 5) * 0.7;
        place(awn, i * 5 + k, p.x + Math.sin(yaw) * a * s, h + 2.8 * s, p.z + Math.cos(yaw) * a * s, s, 2.4 * s, s, yaw, 0.35);
      }
  });
  stem.castShadow = head.castShadow = true;
  top.add(stem, head);
  if (awn) {
    awn.castShadow = true;
    top.add(awn);
  }
}

/** Oats: looser, drooping panicle instead of a tight head. */
function oats(top: THREE.Group, pts: THREE.Vector3[], rnd: Rnd) {
  const n = pts.length;
  const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 5), new THREE.MeshStandardMaterial({ color: '#5a8240', roughness: 0.85 }), n);
  const spike = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ color: CC.Oats, roughness: 0.7 }), n * 6);
  pts.forEach((p, i) => {
    const s = 0.8 + rnd() * 0.35;
    const h = 9 * s;
    place(stem, i, p.x, h / 2, p.z, s, h, s, rnd());
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      place(spike, i * 6 + k, p.x + Math.cos(a) * 1.4 * s, h + 0.8 * s + (k % 3) * 0.7 * s, p.z + Math.sin(a) * 1.4 * s, 0.55 * s, 0.7 * s, 0.55 * s);
    }
  });
  stem.castShadow = spike.castShadow = true;
  top.add(stem, spike);
}

/** Canola: leafy base with bright yellow flower clusters on branching stems. */
function canola(top: THREE.Group, pts: THREE.Vector3[], rnd: Rnd) {
  const n = pts.length;
  const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.32, 1, 5), new THREE.MeshStandardMaterial({ color: '#3d6b34', roughness: 0.85 }), n);
  const leaf = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: '#3f7a36', roughness: 0.9 }), n * 3);
  const bloom = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 6), new THREE.MeshStandardMaterial({ color: CC.Canola, roughness: 0.4, emissive: '#5a4a00', emissiveIntensity: 0.18 }), n * 7);
  pts.forEach((p, i) => {
    const s = 0.95 + rnd() * 0.3;
    const h = 7.5 * s;
    place(stem, i, p.x, h / 2, p.z, s, h, s);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rnd();
      place(leaf, i * 3 + k, p.x + Math.cos(a) * 1.6 * s, 1.6 * s, p.z + Math.sin(a) * 1.6 * s, 2.1 * s, 0.55 * s, 1.5 * s, a);
    }
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.4 + rnd() * 1.5;
      place(bloom, i * 7 + k, p.x + Math.cos(a) * r * s, h + rnd() * 1.8 * s, p.z + Math.sin(a) * r * s, 0.5 * s, 0.5 * s, 0.5 * s);
    }
  });
  stem.castShadow = leaf.castShadow = bloom.castShadow = true;
  top.add(stem, leaf, bloom);
}

/** Alfalfa: dense forage canopy with purple flower spikes. */
function alfalfa(top: THREE.Group, pts: THREE.Vector3[], rnd: Rnd) {
  const n = pts.length;
  const canopy = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 6), new THREE.MeshStandardMaterial({ color: '#3d7a42', roughness: 0.9 }), n);
  const flower = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 2.4, 6), new THREE.MeshStandardMaterial({ color: CC.Alfalfa, roughness: 0.5 }), n * 4);
  pts.forEach((p, i) => {
    const s = 0.85 + rnd() * 0.35;
    place(canopy, i, p.x, 2 * s, p.z, 2.6 * s, 1.7 * s, 2.6 * s, rnd());
    for (let k = 0; k < 4; k++) {
      const a = rnd() * Math.PI * 2;
      place(flower, i * 4 + k, p.x + Math.cos(a) * 1.2 * s, 3.8 * s, p.z + Math.sin(a) * 1.2 * s, s, s, s);
    }
  });
  canopy.castShadow = flower.castShadow = true;
  top.add(canopy, flower);
}

/** Highbush blueberries: woody shrub with ripe blue fruit. */
function blueberries(top: THREE.Group, pts: THREE.Vector3[], rnd: Rnd) {
  const n = pts.length;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.55, 1, 6), new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.9 }), n);
  const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 0.85, flatShading: true }), n);
  const berry = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: CC.Blueberries, roughness: 0.25, metalness: 0.15 }), n * 10);
  pts.forEach((p, i) => {
    const s = 5 + rnd() * 1.8;
    place(trunk, i, p.x, 1.6, p.z, s * 0.22, 3.2, s * 0.22);
    place(bush, i, p.x, s * 0.75, p.z, s, s * 0.72, s, rnd());
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2;
      const up = 0.2 + rnd() * 0.7;
      const r = s * Math.sqrt(1 - up * up) * 0.82;
      place(berry, i * 10 + k, p.x + Math.cos(a) * r, s * 0.5 + up * s * 0.75, p.z + Math.sin(a) * r, 1.2, 1.2, 1.2);
    }
  });
  trunk.castShadow = bush.castShadow = berry.castShadow = true;
  top.add(trunk, bush, berry);
}

/** Crop rows that match what is planted in each field. */
export function plantField(top: THREE.Group, f: Field, pts: [number, number][], rnd: Rnd, wx: (x: number) => number, wz: (y: number) => number) {
  const at = spots(pts, f.crop, wx, wz);
  if (!at.length) return;
  switch (f.crop) {
    case 'Wheat':
      return cereal(top, at, CC.Wheat, rnd, 1, true);
    case 'Barley':
      return cereal(top, at, CC.Barley, rnd, 0.92, true);
    case 'Oats':
      return oats(top, at, rnd);
    case 'Canola':
      return canola(top, at, rnd);
    case 'Alfalfa':
      return alfalfa(top, at, rnd);
    case 'Blueberries':
      return blueberries(top, at, rnd);
  }
}
