"use client";

import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { completeExplanationAction } from "@/app/(student)/courses/[id]/solutions/[collectionId]/actions";
import { emitActivityUpdated } from "@/lib/activity-signal";

export function useSolutionCompletion(completion?: { collectionId: string; version: number }) {
  const inFlight = useRef(false);
  const { mutateAsync, isPending, isError, isSuccess } = useMutation({
    mutationKey: ["zyx", "v1", "solution-completion", completion?.collectionId, completion?.version],
    mutationFn: async (itemIds: string[]) => {
      if (!completion) throw new Error("Completion unavailable");
      await completeExplanationAction(completion.collectionId, completion.version, itemIds);
    },
    retry: false, networkMode: "always", gcTime: 0,
  });
  const complete = async (itemIds: string[]) => {
    if (!completion || inFlight.current || isSuccess) return;
    inFlight.current = true;
    try {
      await mutateAsync(itemIds);
      emitActivityUpdated({ type: "material", materialId: completion.collectionId });
    } catch {
      // The view renders the mutation error; no background replay of reward writes.
    } finally { inFlight.current = false; }
  };
  return { complete, state: isPending ? "saving" : isError ? "error" : isSuccess ? "saved" : "idle" };
}
