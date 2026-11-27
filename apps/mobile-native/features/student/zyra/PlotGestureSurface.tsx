import { useEffect, useRef, type ReactNode } from "react";
import { View, type GestureResponderEvent } from "react-native";
import { plotContact, movePlot, toPlotCoordinates, type Contact } from "./plot-gesture";
import type { PlotBounds } from "./canvas-plot-model";

export function PlotGestureSurface({ bounds, interactive, children, change, reset, inspect }: {
  bounds: PlotBounds; interactive: boolean; children: ReactNode; change(bounds: PlotBounds): void; reset(): void; inspect(point: { x: number; y: number }): void;
}) {
  const layout = useRef({ width: 0, height: 0 });
  const start = useRef<{ bounds: PlotBounds; contact: Contact } | null>(null);
  const latest = useRef(bounds);
  const frame = useRef<number | undefined>(undefined);
  const dragged = useRef(false);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastRendered = useRef(bounds);
  if (lastRendered.current !== bounds) { latest.current = bounds; lastRendered.current = bounds; }
  useEffect(() => () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); }, []);

  function move(event: GestureResponderEvent) {
    const contact = plotContact(event.nativeEvent.touches);
    if (!contact) return;
    const previous = start.current;
    if (!previous || previous.contact.count !== contact.count) {
      start.current = { contact, bounds: latest.current };
      if (contact.count > 1) dragged.current = true;
      return;
    }
    if (!dragged.current && Math.hypot(contact.center.x - previous.contact.center.x, contact.center.y - previous.contact.center.y) < 4) return;
    dragged.current = true;
    latest.current = movePlot(previous.bounds, previous.contact, contact, layout.current);
    if (frame.current === undefined) frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      change(latest.current);
    });
  }
  function release() {
    const contact = start.current?.contact;
    if (contact && !dragged.current) {
      const now = Date.now(), previous = lastTap.current;
      if (previous && now - previous.time < 350 && Math.hypot(previous.x - contact.center.x, previous.y - contact.center.y) < 24) {
        lastTap.current = null;
        reset();
      } else {
        lastTap.current = { time: now, ...contact.center };
        const point = toPlotCoordinates(contact.center, layout.current);
        if (point) inspect(point);
      }
    } else lastTap.current = null;
    start.current = null;
  }
  return <View testID="student-zyra-plot-surface" collapsable={false} onLayout={event => { layout.current = event.nativeEvent.layout; }}
    onStartShouldSetResponder={() => interactive}
    onResponderGrant={event => { dragged.current = false; start.current = null; move(event); }}
    onResponderMove={move} onResponderRelease={release} onResponderTerminationRequest={() => false}
    onResponderTerminate={() => { start.current = null; lastTap.current = null; }}>
    <View pointerEvents="none">{children}</View>
  </View>;
}
