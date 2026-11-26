import { createContext, useContext } from "react";
import { DEFAULT_APPEARANCE_PREFERENCES } from "../../../lib/appearance-preferences";

export const NativeAppearance = createContext(DEFAULT_APPEARANCE_PREFERENCES);
export function useNativeAppearance() { return useContext(NativeAppearance); }

export { readingFontScales, readingDensityScales } from "./reading-scales";
