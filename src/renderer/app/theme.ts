/**
 * Centralized design tokens. Like palmier's AppTheme, nothing in the UI should
 * hardcode spacing, colors, or typography — pull from here so the look stays
 * consistent and is trivial to retheme.
 */
export const theme = {
  color: {
    bg: '#0d0d10',
    panel: '#16161c',
    panelAlt: '#1d1d25',
    border: '#2a2a35',
    text: '#e6e6ec',
    textDim: '#9a9aa8',
    accent: '#6c8cff',
    accentDim: '#3a4a8c',
    track: '#22222c',
    clip: '#3a4a8c',
    clipAudio: '#3a7a5a',
    danger: '#e0556b'
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 4, md: 8 },
  font: {
    ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    size: { sm: 11, md: 13, lg: 15 }
  }
} as const

export type Theme = typeof theme
