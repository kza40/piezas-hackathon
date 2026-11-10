// R-027: the satellite image, the fields drawn from their boundary and the scale bar must agree on one ground
// scale, in both map views. These check the arithmetic each one relies on.
import { afterEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { esriImageryUrl, mercatorBBox, M_PER_UNIT, PIN_XY, shiftRing, toMapXY } from './geo';
import { farmImageryUrl, forgetImagery, imageryClock, imageryIfReady, loadImagery, RETRY_FIRST_MS, SAT_H, SAT_W } from './satCache';
import { S } from './state';
import { EMPTY_FIELD, F } from './seed/simulate';
import { drawnFromBoundary, parcelOffset, polyPoints, realFieldRoom, sketchPipesFit } from './ui/icons';
import { scaleBarFor } from './views/map';

const PIN: [number, number] = [-122.128, 49.024];
const M_PER_DEG_LAT = 111_320;
const close = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

describe('ground to map units', () => {
  test('the pin is the middle of the map; north is up and east is right, at M_PER_UNIT metres a unit', () => {
    assert.deepEqual(toMapXY(PIN, PIN), PIN_XY);
    const north = toMapXY([PIN[0], PIN[1] + 100 / M_PER_DEG_LAT], PIN);
    close(north[0], PIN_XY[0], 1e-9, 'x');
    close(north[1], PIN_XY[1] - 100 / M_PER_UNIT, 1e-6, '100 m north');
    const east = toMapXY([PIN[0] + 100 / (M_PER_DEG_LAT * Math.cos((PIN[1] * Math.PI) / 180)), PIN[1]], PIN);
    close(east[0], PIN_XY[0] + 100 / M_PER_UNIT, 1e-6, '100 m east');
  });
});

describe('moving a field on the ground (Adjust farm)', () => {
  test('a ring moved by (dx, dy) map units lands (dx, dy) further on the map: east is +x, north is -y', () => {
    const ring: [number, number][] = [PIN, [PIN[0] + 0.002, PIN[1]], [PIN[0] + 0.002, PIN[1] + 0.001]];
    const moved = shiftRing(ring, [40, -20], PIN[1]); // 100 m east, 50 m north
    moved.forEach((p, i) => {
      const [x0, y0] = toMapXY(ring[i], PIN);
      const [x1, y1] = toMapXY(p, PIN);
      close(x1 - x0, 40, 0.05, 'dx');
      close(y1 - y0, -20, 0.05, 'dy');
    });
    assert.ok(moved[0][1] > PIN[1], 'moved north: a larger latitude');
  });
});

describe('the imagery request', () => {
  test('covers the requested ground, centred on the pin, in Web Mercator', () => {
    const [x0, y0, x1, y1] = mercatorBBox(PIN, 4000, 2600);
    const stretch = 1 / Math.cos((PIN[1] * Math.PI) / 180); // Mercator metres per ground metre here
    close(x1 - x0, 4000 * stretch, 1e-6, 'width');
    close(y1 - y0, 2600 * stretch, 1e-6, 'height');
    close((x0 + x1) / 2, (6_378_137 * PIN[0] * Math.PI) / 180, 1e-6, 'centre x');
  });

  test('asks for Web Mercator in and out, with a pixel size the same shape as the ground', () => {
    S.farmLat = PIN[1];
    S.farmLng = PIN[0];
    const url = new URL(farmImageryUrl()!);
    assert.equal(url.searchParams.get('bboxSR'), '3857');
    assert.equal(url.searchParams.get('imageSR'), '3857', 'not 4326, which stretches the image east-west');
    const [w, h] = url.searchParams.get('size')!.split(',').map(Number);
    const [x0, y0, x1, y1] = url.searchParams.get('bbox')!.split(',').map(Number);
    close(w / h, (x1 - x0) / (y1 - y0), 0.01, 'pixel shape vs ground shape');
    close(w / h, SAT_W / SAT_H, 0.01, 'image shape vs the plane it is drawn on');
    close((x1 - x0) * Math.cos((PIN[1] * Math.PI) / 180), SAT_W * M_PER_UNIT, 1, 'ground width = the drawn width in metres');
  });

  test('no location, no request', () => {
    S.farmLat = null;
    S.farmLng = null;
    assert.equal(farmImageryUrl(), null);
  });

  test('the URL is plain https to the World Imagery export', () => {
    assert.match(esriImageryUrl([0, 0, 1, 1], [2, 1]), /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export\?/);
  });
});

describe('loading the imagery', () => {
  const realFetch = globalThis.fetch;
  const realObjectUrl = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const realNow = imageryClock.now;
  let revoked: string[] = [];
  afterEach(() => {
    forgetImagery();
    globalThis.fetch = realFetch;
    URL.createObjectURL = realObjectUrl;
    URL.revokeObjectURL = realRevoke;
    imageryClock.now = realNow;
    mock.restoreAll();
  });

  // Stand-ins for the network: each answer in turn (the last repeats), counting the downloads.
  function network(...answers: Response[]) {
    let asked = 0;
    globalThis.fetch = async () => answers[Math.min(asked++, answers.length - 1)].clone();
    URL.createObjectURL = () => `blob:local/${asked}`;
    revoked = [];
    URL.revokeObjectURL = (u: string) => void revoked.push(u);
    return () => asked;
  }
  const jpeg = () => new Response(new Uint8Array([0xff, 0xd8]), { headers: { 'content-type': 'image/jpeg' } });

  test('one download per URL, however many views ask, and the views get a local copy', async () => {
    const asked = network(jpeg());
    const url = 'https://example.test/once.jpg';
    assert.equal(imageryIfReady(url), null);
    const [a, b] = await Promise.all([loadImagery(url), loadImagery(url)]);
    assert.equal(a, b);
    assert.match(a, /^blob:/);
    assert.equal(imageryIfReady(url), a, 'a redraw uses it straight away');
    await loadImagery(url);
    assert.equal(asked(), 1);
  });

  test('after a failure, redraws do not download again until the wait is over, and the wait doubles', async () => {
    let t = 1_000_000;
    imageryClock.now = () => t;
    const warn = mock.method(console, 'warn', () => {});
    const busy = () => new Response('busy', { status: 503 });
    const asked = network(busy(), busy(), jpeg());
    const url = 'https://example.test/flaky.jpg';
    await assert.rejects(loadImagery(url));
    for (let i = 0; i < 5; i++) await assert.rejects(loadImagery(url)); // the map redrawn, Esri still down
    t += RETRY_FIRST_MS - 1;
    await assert.rejects(loadImagery(url));
    assert.equal(asked(), 1, 'no download during the first wait');

    t += 1;
    await assert.rejects(loadImagery(url)); // tried again: fails again
    assert.equal(asked(), 2);
    t += RETRY_FIRST_MS;
    await assert.rejects(loadImagery(url));
    assert.equal(asked(), 2, 'the second wait is twice as long');

    t += RETRY_FIRST_MS;
    assert.match(await loadImagery(url), /^blob:/);
    assert.equal(asked(), 3);
    assert.equal(warn.mock.callCount(), 2, 'each failure logged once, not once per redraw');
  });

  test('only the farm on screen keeps its image; going back to another farm downloads it again', async () => {
    const asked = network(jpeg());
    const [a, b] = ['https://example.test/farm-a.jpg', 'https://example.test/farm-b.jpg'];
    const localA = await loadImagery(a);
    const localB = await loadImagery(b);
    assert.deepEqual(revoked, [localA], "farm A's image is released when farm B's arrives");
    assert.equal(imageryIfReady(a), null);
    assert.equal(imageryIfReady(b), localB);
    await loadImagery(a);
    assert.equal(asked(), 3, 'not a released blob URL from before');
  });

  test('a farm switch while downloading: the old farm\'s image is released as soon as it lands', async () => {
    network(jpeg());
    let land: (r: Response) => void = () => {};
    const [a, b] = ['https://example.test/slow-a.jpg', 'https://example.test/quick-b.jpg'];
    globalThis.fetch = () => new Promise<Response>((r) => (land = r));
    const slow = loadImagery(a);
    globalThis.fetch = async () => jpeg();
    await loadImagery(b); // the farmer is now on farm B
    land(jpeg());
    const localA = await slow;
    assert.ok(revoked.includes(localA));
    assert.equal(imageryIfReady(a), null);
    assert.notEqual(imageryIfReady(b), null);
  });

  test('sign-out releases the image, and drops a download that lands after it', async () => {
    network(jpeg());
    const url = 'https://example.test/signed-in.jpg';
    const local = await loadImagery(url);
    let land: (r: Response) => void = () => {};
    globalThis.fetch = () => new Promise<Response>((r) => (land = r));
    const late = loadImagery('https://example.test/still-downloading.jpg');
    forgetImagery();
    assert.deepEqual(revoked, [local]);
    assert.equal(imageryIfReady(url), null);
    land(jpeg());
    await assert.rejects(late);
    assert.equal(imageryIfReady('https://example.test/still-downloading.jpg'), null, 'not kept for the next farmer');
  });

  test('an error answered as 200 with JSON is a failure, not an image', async () => {
    network(new Response('{"error":{"code":400}}', { headers: { 'content-type': 'application/json' } }));
    await assert.rejects(loadImagery('https://example.test/json-error.jpg'));
  });
});

describe('field outlines', () => {
  afterEach(() => {
    F.splice(0, F.length);
    S.off = {};
  });

  const ring: [number, number][] = [
    [PIN[0] - 0.001, PIN[1] - 0.001],
    [PIN[0] + 0.001, PIN[1] - 0.001],
    [PIN[0] + 0.001, PIN[1] + 0.001],
  ];

  test('a field with a boundary on a farm with a location is drawn at its real place, and is not dragged', () => {
    S.farmLat = PIN[1];
    S.farmLng = PIN[0];
    S.off = { real: [50, 50], sketch: [10, 0] };
    F.splice(0, F.length, { ...EMPTY_FIELD, id: 'real', boundary: ring }, { ...EMPTY_FIELD, id: 'sketch', layout: 'A' });
    assert.equal(drawnFromBoundary('real'), true);
    assert.deepEqual(polyPoints('real'), ring.map((p) => toMapXY(p, PIN)));
    assert.deepEqual(parcelOffset('real'), [0, 0], 'a real place is not moved by an old drag');
    assert.equal(drawnFromBoundary('sketch'), false);
    assert.deepEqual(parcelOffset('sketch'), [10, 0]);
    assert.equal(sketchPipesFit(), false, 'the sketch pipes do not fit a farm drawn from real boundaries');
  });

  test('a boundary reaching past the imagery (the farm moved) is drawn as the sketch parcel, within reach', () => {
    S.farmLat = PIN[1];
    S.farmLng = PIN[0];
    const far = ring.map(([lng, lat]) => [lng, lat + 0.02] as [number, number]); // about 2.2 km north: past the 1.3 km the imagery covers
    F.splice(0, F.length, { ...EMPTY_FIELD, id: 'moved', layout: 'A', boundary: far });
    assert.equal(drawnFromBoundary('moved'), false);
    assert.equal(polyPoints('moved')[0].join(','), '38,42');
  });

  test('a real field can be dragged as far as keeps it on the imagery, and no further', () => {
    S.farmLat = PIN[1];
    S.farmLng = PIN[0];
    F.splice(0, F.length, { ...EMPTY_FIELD, id: 'real', boundary: ring });
    const [[minDx, minDy], [maxDx, maxDy]] = realFieldRoom('real');
    const xs = polyPoints('real').map((p) => p[0]);
    const ys = polyPoints('real').map((p) => p[1]);
    close(Math.max(...xs) + maxDx, PIN_XY[0] + SAT_W / 2, 1e-9, 'right edge');
    close(Math.min(...xs) + minDx, PIN_XY[0] - SAT_W / 2, 1e-9, 'left edge');
    close(Math.max(...ys) + maxDy, PIN_XY[1] + SAT_H / 2, 1e-9, 'bottom edge');
    close(Math.min(...ys) + minDy, PIN_XY[1] - SAT_H / 2, 1e-9, 'top edge');
    // Dragged to the very edge, it is still drawn at its real place.
    F[0] = { ...F[0], boundary: shiftRing(ring, [maxDx, maxDy], PIN[1]) };
    assert.equal(drawnFromBoundary('real'), true);
  });

  test('without a farm location the boundary cannot be placed, so the sketch parcel is drawn', () => {
    S.farmLat = null;
    S.farmLng = null;
    F.splice(0, F.length, { ...EMPTY_FIELD, id: 'x', layout: 'A', boundary: ring });
    assert.equal(drawnFromBoundary('x'), false);
    assert.equal(polyPoints('x')[0].join(','), '38,42');
    assert.equal(sketchPipesFit(), true);
  });
});

describe('the scale bar', () => {
  test('is the longest round distance that fits, at its true length', () => {
    assert.deepEqual(scaleBarFor(2.5), { m: 250, px: 100 }); // 2.5 m a pixel: 250 m is 100 px
    assert.deepEqual(scaleBarFor(10), { m: 1000, px: 100 });
    assert.deepEqual(scaleBarFor(0.5), { m: 50, px: 100 });
  });

  test('zooming in shortens the distance, not the truth', () => {
    const out = scaleBarFor(5)!;
    const zoomedIn = scaleBarFor(1)!;
    assert.ok(zoomedIn.m < out.m);
    close(zoomedIn.m / zoomedIn.px, 1, 0.01, 'metres per pixel at zoom');
  });

  test('hidden before the map is laid out', () => {
    assert.equal(scaleBarFor(Infinity), null);
    assert.equal(scaleBarFor(0), null);
  });
});
