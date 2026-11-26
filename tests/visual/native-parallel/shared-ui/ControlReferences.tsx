"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import {
  QuestionBankTabs,
  QuestionBankToolbar,
} from "@/app/(admin)/admin/(eval)/questions/question-bank-tabs";
import { SearchBar } from "@/components/ui/search-bar";
import { Button } from "@/components/ui/button";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/state-panels";
import {
  DiscussionComposer,
  emptyComposerDraft,
  type ComposerDraft,
} from "@/components/discussions/composer";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  sharedUiControlCases,
  sharedUiControlFixture as f,
} from "@/packages/native-parity/shared-ui/control-cases";

export const controlReferenceCases = sharedUiControlCases;
export const controlReferenceActions: Record<string, string[]> = {
  "shared-ui-composer-attachment": ["Wait for the image thumbnail after mount"],
};

function ComposerReference({ id }: { id: string }) {
  const fixture = sharedUiControlCases.find(
    (c) => c.id === id && c.component === "composer",
  );
  const [draft, update] = useState<ComposerDraft>(() => ({
    ...emptyComposerDraft(),
    body: fixture && "draft" in fixture ? fixture.draft : "",
    error:
      fixture && "error" in fixture && fixture.error ? "unavailable" : null,
  }));
  useEffect(() => {
    if (id !== "shared-ui-composer-attachment") return;
    const file = new File([], "grafik.png", { type: "image/png" });
    const previewUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    update((current) => ({
      ...current,
      images: [{ id: "graph", file, previewUrl, status: "ready" }],
    }));
  }, [id]);
  return (
    <TooltipProvider>
      <DiscussionComposer
        draft={draft}
        update={update}
        channelId="fixture"
        questionId="fixture"
        viewer={{ id: "fixture", name: "Nara", role: "student" }}
        onSearchMentions={async () => []}
        onUpload={async () => ({ ok: false, error: "unknown" })}
        onSubmit={async () => {}}
        submitLabel={f.composer.send}
      />
    </TooltipProvider>
  );
}

export function ControlReferences({ id }: { id: string }) {
  const [recovered, setRecovered] = useState(false);
  const [toolbarAction, setToolbarAction] = useState("");
  const fixture = sharedUiControlCases.find((c) => c.id === id);
  if (!fixture) return <p role="alert">Unknown control reference: {id}</p>;
  if (fixture.component === "search")
    return (
      <SearchBar
        placeholder={f.search.label}
        defaultValue={fixture.value}
        defaultExpanded={fixture.expanded}
        isLoading={fixture.loading}
        mobileTopNav={false}
      />
    );
  if (fixture.component === "status") {
    if (fixture.kind === "empty")
      return (
        <AdminEmptyState
          title={f.status.empty}
          description={f.status.description}
          action={<Button>{f.status.create}</Button>}
        />
      );
    if (fixture.kind === "error")
      return recovered ? (
        <p role="status">{f.status.recovered}</p>
      ) : (
        <AdminErrorState
          message={f.status.error}
          onRetry={() => setRecovered(true)}
        />
      );
    return (
      <div role="status" className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        {f.status.loading}
      </div>
    );
  }
  if (fixture.component === "composer") return <ComposerReference id={id} />;
  // Real toolbar portal and layout; fixture controls are local compositions.
  return (
    <>
      <QuestionBankTabs value="active" tabs={null}>
        <QuestionBankToolbar>
          <Button variant="outline">
            {fixture.variant === "wrap" ? f.toolbar.level : f.toolbar.channels}
          </Button>
          {fixture.variant === "wrap" ? (
            <>
              <Button variant="outline">{f.toolbar.size}</Button>
              <Button variant="outline">{f.toolbar.export}</Button>
            </>
          ) : (
            <>
              <SearchBar
                placeholder={f.search.label}
                size="sm"
                mobileTopNav={false}
              />
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={
                  fixture.variant === "pending"
                    ? f.toolbar.refresh
                    : f.toolbar.create
                }
                disabled={fixture.variant === "pending"}
                onClick={() => setToolbarAction(f.toolbar.create)}
              >
                {fixture.variant === "pending" ? <RefreshCw /> : <Plus />}
              </Button>
            </>
          )}
        </QuestionBankToolbar>
      </QuestionBankTabs>
      <span role="status">{toolbarAction}</span>
    </>
  );
}
