import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

const testLocalStorage = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testLocalStorage,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testLocalStorage,
  });
}

beforeEach(() => {
  testLocalStorage.clear();
});
