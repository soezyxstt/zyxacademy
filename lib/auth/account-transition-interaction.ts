const interactionEvents = [
  "pointerdown", "pointerup", "click", "dblclick", "submit", "keydown",
  "beforeinput", "input", "change", "drop", "contextmenu",
] as const;

/** Capture above React roots so a receiving tab also stops forms in dialog portals. */
export function installAccountTransitionInteractionGuard({
  target,
  isPending,
  subscribe,
  cancelQueries,
}: {
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  isPending: () => boolean;
  subscribe: (listener: (pending: boolean) => void) => () => void;
  cancelQueries: () => Promise<void>;
}): () => void {
  let paused = false;
  const blockInteraction = (event: Event) => {
    if (!isPending()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of interactionEvents) target.addEventListener(type, blockInteraction, { capture: true, passive: false });

  const update = (pending: boolean) => {
    if (pending && !paused) void cancelQueries().catch(() => {});
    paused = pending;
  };
  const unsubscribe = subscribe(update);
  update(isPending());

  return () => {
    unsubscribe();
    for (const type of interactionEvents) target.removeEventListener(type, blockInteraction, true);
  };
}
