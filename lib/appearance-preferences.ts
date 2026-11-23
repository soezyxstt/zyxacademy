export const DENSITY_OPTIONS = ["tightest", "tight", "normal", "loose", "loosest"] as const;
export const FONT_SIZE_OPTIONS = ["extra-small", "small", "medium", "normal", "large"] as const;
export const TOAST_POSITION_OPTIONS = [
  "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right",
] as const;
const BACKGROUND_OPTIONS = ["default", "solid"] as const;
const ANIMATION_OPTIONS = [true, false] as const;

export type AppearancePreferences = {
  density: (typeof DENSITY_OPTIONS)[number];
  fontSize: (typeof FONT_SIZE_OPTIONS)[number];
  animations: boolean;
  background: (typeof BACKGROUND_OPTIONS)[number];
  toastPosition: (typeof TOAST_POSITION_OPTIONS)[number];
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  density: "normal",
  fontSize: "normal",
  animations: true,
  background: "default",
  toastPosition: "top-right",
};

export const APPEARANCE_STORAGE_KEY = "zyx-appearance-preferences";
export const APPEARANCE_ATTRIBUTES = {
  density: "data-preference-density",
  fontSize: "data-preference-font-size",
  animations: "data-preference-animations",
  background: "data-preference-background",
} as const;

const ALLOWED_VALUES: { [Key in keyof AppearancePreferences]: readonly AppearancePreferences[Key][] } = {
  density: DENSITY_OPTIONS,
  fontSize: FONT_SIZE_OPTIONS,
  animations: ANIMATION_OPTIONS,
  background: BACKGROUND_OPTIONS,
  toastPosition: TOAST_POSITION_OPTIONS,
};

function applySavedValues<Key extends keyof AppearancePreferences>(
  preferences: AppearancePreferences,
  stored: Record<string, unknown>,
  key: Key,
) {
  const valid = ALLOWED_VALUES[key].find((value) => value === stored[key]);
  if (valid !== undefined) preferences[key] = valid;
}

export function parseAppearancePreferences(serialized: string | null): AppearancePreferences {
  if (!serialized) return DEFAULT_APPEARANCE_PREFERENCES;
  let stored: unknown;
  try {
    stored = JSON.parse(serialized);
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
  const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES };
  for (const key of Object.keys(preferences) as (keyof AppearancePreferences)[]) {
    applySavedValues(preferences, stored as Record<string, unknown>, key);
  }
  return preferences;
}

// The head script runs before content paints. Its literals come from the same
// defaults and allowed values as the client store.
export const appearanceBootstrapScript = `(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)})) || {};
    const attributes = ${JSON.stringify(APPEARANCE_ATTRIBUTES)};
    const allowed = ${JSON.stringify(ALLOWED_VALUES)};
    const defaults = ${JSON.stringify(DEFAULT_APPEARANCE_PREFERENCES)};
    for (const key of Object.keys(attributes)) {
      if (allowed[key].includes(stored[key]) && stored[key] !== defaults[key]) {
        document.documentElement.setAttribute(attributes[key], String(stored[key]));
      }
    }
  } catch {}
})();`;
