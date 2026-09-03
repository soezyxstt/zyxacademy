export const MIN_TUTOR_PANEL_WIDTH = 360;
export const DEFAULT_TUTOR_PANEL_WIDTH = 480;
export const MAX_TUTOR_PANEL_WIDTH = 720;

export function clampTutorPanelWidth(width: number, viewportWidth: number): number {
  const maximum = Math.min(MAX_TUTOR_PANEL_WIDTH, Math.floor(viewportWidth * 0.5));
  return Math.max(MIN_TUTOR_PANEL_WIDTH, Math.min(maximum, width));
}
