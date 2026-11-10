// Satellite imagery under the farm map: one image, shared by the 2D map and the 3D scene, of a fixed stretch of
// ground centred on the farm pin. It is fetched only when the map is drawn (the farm's location goes to Esri then),
// and never prefetched. Esri marks it uncacheable (max-age=0) and it takes seconds to make, so it is downloaded
// once into a local blob URL: the map is redrawn often, and each redraw must not fetch it again.
import { esriImageryUrl, mercatorBBox, M_PER_UNIT } from './geo';
import { S } from './state';

/** The ground the image covers, in map units: twice the 2D view each way (4 km × 2.6 km), centred on the pin. */
export const SAT_W = 1600;
export const SAT_H = 1040;
/** Pixel size: same shape as the ground, about 2 m per pixel. */
const SAT_PX: [number, number] = [2000, 1300];

/** The imagery URL for the signed-in farm, or null when the farm has no location. */
export function farmImageryUrl(): string | null {
  if (S.farmLat == null || S.farmLng == null) return null;
  return esriImageryUrl(mercatorBBox([S.farmLng, S.farmLat], SAT_W * M_PER_UNIT, SAT_H * M_PER_UNIT), SAT_PX);
}

const loads = new Map<string, Promise<string>>();
const ready = new Map<string, string>();

/**
 * Downloads the image once per URL, shared by whoever asks, and resolves to a local blob URL for it. A failed
 * download is forgotten, so the next view tries again. Esri answers some errors with 200 and a JSON body, so
 * anything that is not an image counts as a failure.
 */
export function loadImagery(url: string): Promise<string> {
  let load = loads.get(url);
  if (!load) {
    load = fetch(url)
      .then((r) => {
        if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error(`Satellite imagery could not be loaded (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        const local = URL.createObjectURL(blob);
        ready.set(url, local);
        return local;
      });
    loads.set(url, load);
    load.catch(() => loads.delete(url));
  }
  return load;
}

/** The downloaded image's local URL, or null if it has not arrived (yet). */
export const imageryIfReady = (url: string): string | null => ready.get(url) ?? null;
