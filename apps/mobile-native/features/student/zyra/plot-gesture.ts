import { isRepresentableRange, zoomNumericRange } from "../../../../../lib/zyra/canvas/viewport";
import { plotFrame, plotHeight, plotWidth, type PlotBounds } from "./canvas-plot-model";

type Point = { x: number; y: number };
type Size = { width: number; height: number };
export type Contact = { count: number; center: Point; span: number };

export function plotContact(touches: readonly { locationX: number; locationY: number }[]): Contact | null {
  const [one, two] = touches;
  if (!one) return null;
  const center = two ? { x: (one.locationX + two.locationX) / 2, y: (one.locationY + two.locationY) / 2 }
    : { x: one.locationX, y: one.locationY };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  const span = two ? Math.hypot(one.locationX - two.locationX, one.locationY - two.locationY) : 0;
  return { center, span, count: two ? 2 : 1 };
}

export function toPlotCoordinates(point: Point, size: Size): Point | null {
  const scale = Math.min(size.width / plotWidth, size.height / plotHeight);
  if (!(scale > 0)) return null;
  return {
    x: (point.x - (size.width - plotWidth * scale) / 2) / scale,
    y: (point.y - (size.height - plotHeight * scale) / 2) / scale,
  };
}

export function movePlot(start: PlotBounds, from: Contact, to: Contact, size: Size): PlotBounds {
  const scale = Math.min(size.width / plotWidth, size.height / plotHeight);
  if (!(scale > 0) || from.count !== to.count) return start;
  const left = (size.width - plotWidth * scale) / 2 + plotFrame.left * scale;
  const top = (size.height - plotHeight * scale) / 2 + plotFrame.top * scale;
  const width = plotFrame.width * scale, height = plotFrame.height * scale;
  const ratio = from.count === 2 && from.span > 0 && to.span > 0 ? from.span / to.span : 1;
  const fraction = (n: number) => Math.max(0, Math.min(1, n));
  const x = zoomNumericRange(start.x, ratio, fraction((from.center.x - left) / width));
  const y = zoomNumericRange(start.y, ratio, 1 - fraction((from.center.y - top) / height));
  if (!x || !y) return start;
  const dx = (from.center.x - to.center.x) / width * (x.max - x.min);
  const dy = (to.center.y - from.center.y) / height * (y.max - y.min);
  const moved = { x: { min: x.min + dx, max: x.max + dx }, y: { min: y.min + dy, max: y.max + dy } };
  return isRepresentableRange(moved.x) && isRepresentableRange(moved.y) ? moved : start;
}
