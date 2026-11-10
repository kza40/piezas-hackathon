import { esriImageryUrl, type LngLatBBox } from './geo';
import { S } from './state';

const PAD = 0.09;

export function farmSatBBox(): LngLatBBox | null {
  if (S.farmLat == null || S.farmLng == null) return null;
  const lat = S.farmLat;
  const lng = S.farmLng;
  return {
    minLng: lng - PAD,
    maxLng: lng + PAD,
    minLat: lat - PAD * 0.65,
    maxLat: lat + PAD * 0.65,
  };
}

export function satUrl2d(): string | null {
  const b = farmSatBBox();
  if (!b) return null;
  return esriImageryUrl(b, 960, 624);
}

export function satUrl3dPreview(): string | null {
  const b = farmSatBBox();
  if (!b) return null;
  return esriImageryUrl(b, 1024, 683);
}

export function satUrl3dFull(): string | null {
  const b = farmSatBBox();
  if (!b) return null;
  return esriImageryUrl(b, 1600, 1067);
}

type Slot = { promise: Promise<HTMLImageElement>; img?: HTMLImageElement };
const ready = new Map<string, Slot>();

export function preloadSat(url: string): Promise<HTMLImageElement> {
  let slot = ready.get(url);
  if (!slot) {
    slot = {
      promise: new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          slot!.img = img;
          resolve(img);
        };
        img.onerror = () => reject(new Error('sat preload failed'));
        img.src = url;
      }),
    };
    ready.set(url, slot);
  }
  return slot.promise;
}

/** Instant hit if warm/login already finished this URL. */
export function satImageIfReady(url: string): HTMLImageElement | null {
  return ready.get(url)?.img ?? null;
}

export function warmSatelliteCache(): void {
  const a = satUrl2d();
  const b = satUrl3dPreview();
  const c = satUrl3dFull();
  void (async () => {
    try {
      if (a) await preloadSat(a);
      if (b) await preloadSat(b);
      if (c) await preloadSat(c);
    } catch {
      /* map views still fetch */
    }
  })();
}
