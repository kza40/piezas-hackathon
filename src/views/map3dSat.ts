import * as THREE from 'three';
import { S } from '../state';
import { preloadSat, satImageIfReady, satUrl3dFull, satUrl3dPreview } from '../satCache';

export function geoReady(): boolean {
  return S.farmLat != null && S.farmLng != null;
}

function applyTex(mat: THREE.MeshStandardMaterial, img: HTMLImageElement) {
  const old = mat.map;
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  mat.map = tex;
  mat.color.set('#ffffff');
  mat.needsUpdate = true;
  old?.dispose();
}

export function addSatelliteGround(scene: THREE.Scene): void {
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(20000, 20000),
    new THREE.MeshStandardMaterial({ color: '#5a7348', roughness: 1 }),
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.8;
  under.receiveShadow = true;
  scene.add(under);

  const mat = new THREE.MeshStandardMaterial({ color: '#6a7a5a', roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 6000), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  scene.add(ground);

  const preview = satUrl3dPreview();
  const full = satUrl3dFull();

  // If full is already warm from login, skip the blurry step.
  if (full) {
    const hit = satImageIfReady(full);
    if (hit) {
      applyTex(mat, hit);
      return;
    }
  }

  if (preview) {
    const hit = satImageIfReady(preview);
    if (hit) applyTex(mat, hit);
    else void preloadSat(preview).then((img) => applyTex(mat, img)).catch(() => {});
  }
  if (full) {
    void preloadSat(full)
      .then((img) => applyTex(mat, img))
      .catch(() => console.warn('satellite ground texture failed to load'));
  }
}
