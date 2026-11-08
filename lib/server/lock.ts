// Runs fn for a key only after earlier calls for the same key have finished.
// Piezas has no locking and concurrent read-modify-write loses data (docs/backend-notes.md, E13),
// so every read-then-write goes through this. Only correct while the app runs as ONE process.
const tails = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
