import { useIsFocused } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { AppState, Platform, ScrollView, View } from "react-native";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { confirmReadBatch, nextReadBatch, visibleHeight, type ReadPage, type ReadHistory, type ReadBatch } from "./read-batches";

export function useDiscussionViewport() {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  return useMemo(() => {
    const listeners = new Set<() => void>();
    const notify = () => { for (const listener of listeners) listener(); };
    return { scroller: { ref, listeners }, scrollProps: { onScroll: notify, onLayout: notify, onContentSizeChange: notify, scrollEventThrottle: 64 } };
  }, []);
}
type Scroller = ReturnType<typeof useDiscussionViewport>["scroller"];
export const DiscussionViewportContext = createContext<Scroller | null>(null);

type NativeRow = ComponentRef<typeof View>;
type Bounds = { y: number; height: number };
function measure(node: Pick<NativeRow, "measureInWindow">): Promise<Bounds | undefined> {
  return new Promise(resolve => {
    // Android may detach an off-screen row without invoking its measurement callback.
    const timeout = setTimeout(() => resolve(undefined), 160);
    node.measureInWindow((_x, y, _width, height) => {
      clearTimeout(timeout);
      resolve({ y, height });
    });
  });
}

export function useVisibleDiscussionRead({ pages, enabled, submit, scroller: provided }: {
  pages: ReadPage[]; enabled: boolean; submit(batch: ReadBatch, signal: AbortSignal): Promise<void>; scroller?: Scroller;
}) {
  const context = useContext(DiscussionViewportContext);
  const scroller = provided ?? context;
  const focused = useIsFocused();
  const { suspended, canInteract } = useProtectedInteraction();
  const history = useRef<ReadHistory>({ through: 0, revisions: new Map(), sequences: new Set() });
  const nodes = useRef(new Map<string, NativeRow>());
  const latest = useRef({ pages, submit, canInteract });
  latest.current = { pages, submit, canInteract };
  const kick = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const handlers = useRef(new Map<string, (node: NativeRow | null) => void>());
  const bindRow = useCallback((id: string) => {
    let handler = handlers.current.get(id);
    if (!handler) {
      handler = node => {
        if (node) nodes.current.set(id, node);
        else { nodes.current.delete(id); handlers.current.delete(id); }
        kick.current();
      };
      handlers.current.set(id, handler);
    }
    return handler;
  }, []);
  const pageKey = JSON.stringify(pages.map(page => [page.receipt, page.status]));
  useEffect(() => {
    if (!enabled || !focused || suspended || !scroller) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let epoch = 0, busy = false, dirty = false, obscured = false;
    const active = () => !controller.signal.aborted && !obscured && AppState.currentState === "active" && latest.current.canInteract();
    const schedule = () => {
      epoch++;
      clearTimeout(timer);
      if (!active()) return;
      if (busy) { dirty = true; return; }
      timer = setTimeout(() => void observe(epoch), 1500);
    };
    const observe = async (version: number) => {
      const viewport = scroller.ref.current?.getNativeScrollRef();
      if (!viewport || !active() || busy) return;
      busy = true;
      try {
        const [bounds, rows] = await Promise.all([measure(viewport), Promise.all([...nodes.current].map(async ([id, node]) =>
          [id, await measure(node)] as const))]);
        if (!bounds || !active() || version !== epoch) return;
        const ids = new Set(rows.filter(([, rect]) => rect && visibleHeight(rect, bounds)).map(([id]) => id));
        while (active() && version === epoch) {
          const batch = nextReadBatch(latest.current.pages, ids, history.current);
          if (!batch) break;
          await latest.current.submit(batch.request, controller.signal);
          if (controller.signal.aborted) return;
          confirmReadBatch(history.current, batch);
          setFailed(false);
        }
      } catch { if (active()) setFailed(true); }
      finally { busy = false; if (dirty && active()) { dirty = false; schedule(); } }
    };
    kick.current = schedule;
    scroller.listeners.add(schedule);
    const subscriptions = [AppState.addEventListener("change", schedule)];
    if (Platform.OS === "android") {
      subscriptions.push(AppState.addEventListener("blur", () => { obscured = true; schedule(); }),
        AppState.addEventListener("focus", () => { obscured = false; schedule(); }));
    }
    schedule();
    return () => {
      controller.abort();
      clearTimeout(timer);
      for (const subscription of subscriptions) subscription.remove();
      scroller.listeners.delete(schedule);
      kick.current = () => {};
    };
  }, [enabled, focused, suspended, scroller, pageKey]);
  return { bindRow, failed, retry: () => kick.current() };
}
