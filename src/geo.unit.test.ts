// R-027: the satellite image, the fields drawn from their boundary and the scale bar must agree on one ground
// scale, in both map views. These check the arithmetic each one relies on.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { esriImageryUrl, mercatorBBox, M_PER_UNIT, PIN_XY, toMapXY } from './geo';
import { farmImageryUrl, imageryIfReady, loadImagery, SAT_H, SAT_W } from './satCache';
import { S } from './state';
import { EMPTY_FIELD, F } from './seed/simulate';
import { drawnFromBoundary, parcelOffset, polyPoints, sketchPipesFit } from './ui/icons';
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
  afterEach(() => {
    globalThis.fetch = realFetch;
    URL.createObjectURL = realObjectUrl;
  });

  // Stand-ins for the network: each answer in turn (the last repeats), counting the downloads.
  function network(...answers: Response[]) {
    let asked = 0;
    globalThis.fetch = async () => answers[Math.min(asked++, answers.length - 1)].clone();
    URL.createObjectURL = () => `blob:local/${asked}`;
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

  test('a failed download is not kept: the next view tries again', async () => {
    const asked = network(new Response('busy', { status: 503 }), jpeg());
    const url = 'https://example.test/flaky.jpg';
    await assert.rejects(loadImagery(url));
    assert.equal(imageryIfReady(url), null);
    await loadImagery(url); // would reject again if the failure had been cached
    assert.equal(asked(), 2);
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
