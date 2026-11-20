"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  APPEARANCE_ATTRIBUTES,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  parseAppearancePreferences,
  type AppearancePreferences,
} from "@/lib/appearance-preferences";

export {
  DEFAULT_APPEARANCE_PREFERENCES,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  TOAST_POSITION_OPTIONS,
} from "@/lib/appearance-preferences";

const subscribers = new Set<() => void>();
let current: AppearancePreferences | undefined;

function getServerSnapshot() {
  return DEFAULT_APPEARANCE_PREFERENCES;
}

function readStorage() {
  try {
    return parseAppearancePreferences(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
}

function getSnapshot() {
  current ??= readStorage();
  return current;
}

function applyAttributes(preferences: AppearancePreferences) {
  for (const key of Object.keys(APPEARANCE_ATTRIBUTES) as (keyof typeof APPEARANCE_ATTRIBUTES)[]) {
    const name = APPEARANCE_ATTRIBUTES[key];
    const value = preferences[key];
    if (value === DEFAULT_APPEARANCE_PREFERENCES[key]) {
      document.documentElement.removeAttribute(name);
    } else {
      document.documentElement.setAttribute(name, String(value));
    }
  }
}

function update(preferences: AppearancePreferences) {
  current = preferences;
  applyAttributes(preferences);
  subscribers.forEach((notify) => notify());
}

function readStorageEvent(event: StorageEvent) {
  if (event.key !== APPEARANCE_STORAGE_KEY && event.key !== null) return;
  if (event.storageArea === window.localStorage) update(readStorage());
}

function subscribe(notify: () => void) {
  if (subscribers.size === 0) window.addEventListener("storage", readStorageEvent);
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) window.removeEventListener("storage", readStorageEvent);
  };
}

function setPreference<Key extends keyof AppearancePreferences>(
  key: Key,
  value: AppearancePreferences[Key],
) {
  const previous = getSnapshot();
  if (previous[key] === value) return;
  const next = { ...previous, [key]: value };
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The current page can still use the selection when storage is unavailable.
  }
  update(next);
}

export function useAppearancePreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { preferences, setPreference };
}

export function AppearancePreferencesRuntime() {
  // Keep CSS working if a browser policy blocks the optional head script.
  useEffect(() => applyAttributes(getSnapshot()), []);
  return null;
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
let systemMotion: MediaQueryList | undefined;

function getSystemMotionQuery() {
  systemMotion ??= window.matchMedia(reducedMotionQuery);
  return systemMotion;
}

function subscribeSystemMotion(notify: () => void) {
  const preference = getSystemMotionQuery();
  preference.addEventListener("change", notify);
  return () => preference.removeEventListener("change", notify);
}

function getSystemMotion() {
  return getSystemMotionQuery().matches;
}

function getAppMotion() {
  return getSnapshot().animations;
}

function getServerAppMotion() {
  return DEFAULT_APPEARANCE_PREFERENCES.animations;
}

function getServerSystemMotion() {
  return false;
}

export function useAppReducedMotion() {
  const animations = useSyncExternalStore(subscribe, getAppMotion, getServerAppMotion);
  const systemReducedMotion = useSyncExternalStore(subscribeSystemMotion, getSystemMotion, getServerSystemMotion);
  return !animations || systemReducedMotion;
}

export function prefersAppReducedMotion() {
  return !getSnapshot().animations || getSystemMotion();
}

export function getAppScrollBehavior(): ScrollBehavior {
  return prefersAppReducedMotion() ? "auto" : "smooth";
}
