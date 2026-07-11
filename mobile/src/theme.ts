import { useColorScheme } from 'react-native';

/**
 * Zyx palette, converted from app/globals.css tokens; values identical to
 * the WebView wrapper's res/values/colors.xml (light) and values-night (dark).
 */
export const palettes = {
  light: {
    primary: '#2A3C6A',
    onPrimary: '#FFFFFF',
    brandSecondary: '#CC542B',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    onBackground: '#1D1D1D',
    muted: '#6B7280',
    outline: '#E5E7EB',
    error: '#B3261E',
    logoZ: '#2A3C6A',
    logoX: '#CC542B',
  },
  dark: {
    primary: '#5375CD',
    onPrimary: '#FFFFFF',
    brandSecondary: '#CC542B',
    background: '#1D1D1D',
    surface: '#282828',
    onBackground: '#F5F5F5',
    muted: '#9CA3AF',
    outline: '#3A3A3A',
    error: '#F2B8B5',
    logoZ: '#FFFFFF',
    logoX: '#FFFFFF',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['light']]: string };

export function useTheme(): { colors: Palette; isDark: boolean } {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? palettes.dark : palettes.light, isDark };
}
