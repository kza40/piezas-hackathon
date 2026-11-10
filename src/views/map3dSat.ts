import * as THREE from 'three';
import { farmImageryUrl, loadImagery, SAT_H, SAT_W } from '../satCache';
import { revealImageryCredit } from './mapGeo';

/**
 * The satellite image as the 3D ground: the same image and the same stretch of ground as the 2D map (the scene
 * uses map units, with the farm pin at the origin). Hidden until it loads, so the drawn ground shows meanwhile,
 * and for good if it never does. `isLive` says whether the scene is still on screen when the image arrives.
 */
export function addSatelliteGround(scene: THREE.Scene, isLive: () => boolean): void {
  const url = farmImageryUrl();
  if (!url) return;
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SAT_W, SAT_H), mat);
  ground.rotation.x = -Math.PI / 2; // the image's top edge to -z: north, as on the 2D map
  ground.position.y = 0.25; // over the drawn ground and its meadow patches, under the fields
  ground.receiveShadow = true;
  ground.visible = false;
  scene.add(ground);
  loadImagery(url)
    .then((src) => new THREE.TextureLoader().loadAsync(src))
    .then(
      (tex) => {
        if (!isLive()) return tex.dispose(); // the scene was torn down while the image loaded
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        mat.map = tex;
        mat.needsUpdate = true;
        ground.visible = true;
        revealImageryCredit();
      },
      () => {}, // logged once by loadImagery; the drawn ground stays
    );
}
