export const colors = {
  dark: {
    background: '#1e1e28',
    surface: '#2a2a3a',
    surfaceBorder: 'rgba(255, 255, 255, 0.08)',
    primary: '#a78bfa',
    primaryGradient: ['#a78bfa', '#8b5cf6'] as const,
    secondary: '#2dd4bf',
    secondaryGradient: ['#2dd4bf', '#018786'] as const,
    text: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.4)',
    error: '#cf6679',
    success: '#2dd4bf',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
  light: {
    background: '#fafafa',
    surface: '#ffffff',
    surfaceBorder: 'rgba(0, 0, 0, 0.08)',
    primary: '#8b5cf6',
    primaryGradient: ['#8b5cf6', '#7c3aed'] as const,
    secondary: '#018786',
    secondaryGradient: ['#018786', '#016666'] as const,
    text: '#1e293b',
    textSecondary: 'rgba(0, 0, 0, 0.6)',
    textMuted: 'rgba(0, 0, 0, 0.35)',
    error: '#b00020',
    success: '#018786',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
} as const;

export type ThemeMode = 'dark' | 'light';
export type ColorPalette = typeof colors.dark | typeof colors.light;

/**
 * Append an alpha channel to a hex color.
 *   alpha('#bb86fc', 0.15)   → '#bb86fc26'   (decimal)
 *   alpha('#bb86fc', 15)     → '#bb86fc26'   (percent shorthand)
 *
 * Use this instead of inline `color + '20'` so the intent is explicit
 * and readable. Accepts opacity as 0-1 (decimal) or 0-100 (percent).
 */
export function alpha(hexColor: string, opacity: number): string {
  const o = opacity > 1 ? opacity / 100 : opacity;
  const clamped = Math.max(0, Math.min(1, o));
  const byte = Math.round(clamped * 255);
  const hex = byte.toString(16).padStart(2, '0');
  return `${hexColor}${hex}`;
}
