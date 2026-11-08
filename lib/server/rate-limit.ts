// A fixed-window counter per key, in memory. Like lib/server/lock.ts it is only exact on ONE process,
// which is how the app is hosted; it is a guard against a stuck or looping device, not a security boundary.
export function rateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string): boolean => {
    const t = now();
    const w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      if (windows.size > 10_000) for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    return ++w.count <= limit;
  };
}
