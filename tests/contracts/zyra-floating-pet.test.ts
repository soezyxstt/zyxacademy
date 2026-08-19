import { describe, expect, it, beforeEach } from "bun:test";
import { clampZyraPetPosition } from "@/components/course/zyra-floating-pet";
import {
  ZYRA_PET_VISIBILITY_KEY,
  getZyraPetVisible,
  setZyraPetVisible,
  toggleZyraPetVisible,
} from "@/hooks/use-zyra-pet-visibility";

describe("Zyra floating pet", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };

  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = {
      localStorage: mockStorage,
      dispatchEvent: () => true,
    };
  });

  it("keeps a dragged pet inside the visible viewport", () => {
    expect(clampZyraPetPosition({ x: -200, y: -50 }, { width: 1200, height: 800 })).toEqual({ x: 16, y: 16 });
    expect(clampZyraPetPosition({ x: 2000, y: 900 }, { width: 1200, height: 800 })).toEqual({ x: 1104, y: 696 });
  });

  it("defaults to visible when no preference is saved", () => {
    expect(getZyraPetVisible()).toBe(true);
  });

  it("updates visibility in localStorage and toggles state correctly", () => {
    setZyraPetVisible(false);
    expect(getZyraPetVisible()).toBe(false);
    expect(mockStorage.getItem(ZYRA_PET_VISIBILITY_KEY)).toBe("0");

    const toggledToTrue = toggleZyraPetVisible();
    expect(toggledToTrue).toBe(true);
    expect(getZyraPetVisible()).toBe(true);
    expect(mockStorage.getItem(ZYRA_PET_VISIBILITY_KEY)).toBe("1");

    const toggledToFalse = toggleZyraPetVisible();
    expect(toggledToFalse).toBe(false);
    expect(getZyraPetVisible()).toBe(false);
    expect(mockStorage.getItem(ZYRA_PET_VISIBILITY_KEY)).toBe("0");
  });
});
