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

function apply(w: number) {
  width = clamp(w);
  document.querySelector<HTMLElement>('.workspace')?.style.setProperty('--rail', `${width}px`);
  document.querySelector('.rail-grip')?.setAttribute('aria-valuenow', String(width));
}

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
  const move = (ev: PointerEvent) => apply(startW + (startX - ev.clientX));
  const end = () => {
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    document.body.classList.remove('resizing');
    save();
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
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
