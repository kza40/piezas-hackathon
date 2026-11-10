// The side rail can be dragged wider or narrower from its left edge (or with the arrow keys on the grip).
// The width survives a reload. During a drag only a CSS variable changes, so the board isn't re-rendered.
const KEY = 'fw-rail';
export const RAIL_DEFAULT = 360;
const RAIL_MIN = 300;
const STEP = 24;
/** Leave the map at least this wide. */
const MAP_MIN = 380;

const maxWidth = () => Math.max(RAIL_MIN, Math.min(900, window.innerWidth - MAP_MIN));
const clamp = (w: number) => Math.round(Math.min(maxWidth(), Math.max(RAIL_MIN, w)));

let width = (() => {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= RAIL_MIN ? n : RAIL_DEFAULT;
  } catch {
    return RAIL_DEFAULT;
  }
})();

function save() {
  try {
    if (width === RAIL_DEFAULT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(width));
  } catch {
    // storage blocked: the width just won't survive a reload
  }
}

/** Show the width, fitted to the window as it is now (the saved width is kept for a wider window). */
function paint() {
  const w = clamp(width);
  document.querySelector<HTMLElement>('.workspace')?.style.setProperty('--rail', `${w}px`);
  const grip = document.querySelector('.rail-grip');
  grip?.setAttribute('aria-valuenow', String(w));
  grip?.setAttribute('aria-valuemax', String(maxWidth()));
}

function apply(w: number) {
  width = clamp(w);
  paint();
}

// A narrower window must not squeeze the map under its minimum until something re-renders.
window.addEventListener('resize', paint);

/** Inline style for the workspace, so a re-render keeps the farmer's width. */
export const railStyle = () => `--rail:${clamp(width)}px`;

/** The drag handle between the map and the rail. */
export const railGrip = () =>
  `<div class=rail-grip role=separator aria-orientation=vertical aria-label='Resize side panel' aria-valuemin=${RAIL_MIN} aria-valuemax=${maxWidth()} aria-valuenow=${clamp(width)} tabindex=0 title='Drag to resize · double-click to reset' data-testid=rail-grip></div>`;

export function onRailPointerDown(e: PointerEvent, grip: HTMLElement) {
  if (e.button !== 0) return;
  e.preventDefault();
  const startX = e.clientX;
  const startW = width;
  grip.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  // Listen on the window, not the grip: live data arriving mid-drag re-renders the board and replaces the
  // grip, and its pointerup would never come (leaving .resizing on, which turns off clicks on the map).
  const move = (ev: PointerEvent) => {
    if (ev.pointerId === e.pointerId) apply(startW + (startX - ev.clientX));
  };
  const end = (ev: Event) => {
    if (ev instanceof PointerEvent && ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    window.removeEventListener('blur', end);
    document.body.classList.remove('resizing');
    save();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', end);
}

/** Arrow keys widen or narrow; Home resets. Returns whether the key was handled. */
export function onRailKey(e: KeyboardEvent): boolean {
  const d = e.key === 'ArrowLeft' ? STEP : e.key === 'ArrowRight' ? -STEP : 0;
  if (e.key === 'Home') apply(RAIL_DEFAULT);
  else if (d) apply(width + d);
  else return false;
  save();
  return true;
}

export function resetRail() {
  apply(RAIL_DEFAULT);
  save();
}
