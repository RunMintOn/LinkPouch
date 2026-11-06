import { vi } from "vitest";

// Unit tests run outside Chromium; the browser smoke test covers real Web Locks.
export function stubWebLocks(): void {
  const pending = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    locks: {
      request(name: string, write: () => Promise<unknown>) {
        const result = (pending.get(name) ?? Promise.resolve()).then(write);
        pending.set(name, result.catch(() => {}));
        return result;
      },
    },
  });
}
