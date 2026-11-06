import { vi } from "vitest";

export function storageArea(data: Record<string, unknown>) {
  return {
    get: vi.fn(async (keys: string | string[] | null = null) => structuredClone(keys === null ? data
      : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, data[key]])))),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    }),
  };
}
