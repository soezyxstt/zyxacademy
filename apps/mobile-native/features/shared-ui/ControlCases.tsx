import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  nativeColors,
  nativeRadii,
} from "../../../../packages/design-tokens/native-colors";
import {
  sharedUiControlCases,
  sharedUiControlFixture,
  type SharedUiControlCase as ControlCase,
  type SharedUiControlCaseId,
} from "../../../../packages/native-parity/shared-ui/control-cases";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import type { SharedUiAction } from "./actions";
import {
  SharedUiComposer,
  SharedUiSearch,
  SharedUiStatus,
  SharedUiToolbar,
} from "./controls";
import { SharedUiActionButton } from "./layout";

function icon(path: string) {
  return function renderIcon(color: string, size: number) {
    return (
      <Svg
        accessible={false}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
      >
        <Path
          d={path}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  };
}

const renderNew = icon("M12 5v14M5 12h14");
const renderRefresh = icon(
  "M20 7v5h-5m-11 5v-5h5m-4.5-4A8 8 0 0 1 18 5l2 3M4 16l2 3a8 8 0 0 0 13.5-3",
);
const renderAttach = icon(
  "M21.4 11.1 11 21.5a5 5 0 0 1-7.1-7.1l10.4-10.4a3.3 3.3 0 0 1 4.7 4.7l-10.4 10.4a1.6 1.6 0 1 1-2.3-2.3l9.2-9.2",
);
const renderRemove = icon("M18 6 6 18M6 6l12 12");

function SearchCase({
  fixture,
}: {
  fixture: Extract<ControlCase, { component: "search" }>;
}) {
  const copy = sharedUiControlFixture.search;
  const [value, setValue] = useState<string>(fixture.value);
  const [expanded, setExpanded] = useState<boolean>(fixture.expanded);

  return (
    <View style={fixture.expanded || expanded ? undefined : styles.start}>
      <SharedUiSearch
        clearLabel={copy.clear}
        expansion={{
          expanded,
          onExpandedChange: setExpanded,
          closeLabel: copy.close,
        }}
        label={copy.label}
        onValueChange={setValue}
        pending={fixture.loading}
        testID={fixture.id}
        theme={fixture.theme}
        value={value}
      />
    </View>
  );
}

function StatusCase({
  fixture,
}: {
  fixture: Extract<ControlCase, { component: "status" }>;
}) {
  const copy = sharedUiControlFixture.status;
  const [recovered, setRecovered] = useState(false);
  const [creating, setCreating] = useState(false);
  const message = recovered ? copy.recovered : copy[fixture.kind];
  const action =
    fixture.kind === "empty" && !creating
      ? ({ id: "create", label: copy.create, variant: "default" } as const)
      : fixture.kind === "error" && !recovered
        ? ({ id: "retry", label: copy.retry, variant: "ghost" } as const)
        : undefined;

  const baseProps = {
    kind: recovered ? ("status" as const) : fixture.kind,
    message: creating ? copy.create : message,
    description:
      fixture.kind === "empty" && !creating ? copy.description : undefined,
    layout:
      fixture.kind === "empty" ? ("center" as const) : ("inline" as const),
    testID: fixture.id,
    theme: fixture.theme,
  };

  return action ? (
    <SharedUiStatus
      {...baseProps}
      action={action}
      onAction={(id) =>
        id === "retry" ? setRecovered(true) : setCreating(true)
      }
    />
  ) : (
    <SharedUiStatus {...baseProps} />
  );
}

type ToolbarAction =
  | "channel"
  | "create"
  | "level"
  | "size"
  | "export"
  | "refresh";

function ToolbarCase({
  fixture,
}: {
  fixture: Extract<ControlCase, { component: "toolbar" }>;
}) {
  const copy = sharedUiControlFixture.toolbar;
  const searchCopy = sharedUiControlFixture.search;
  const [value, setValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [channel, setChannel] = useState<string>(copy.channels);
  const [level, setLevel] = useState<string>(copy.level);
  const [size, setSize] = useState<string>(copy.size);
  const [result, setResult] = useState<string>();

  function handleAction(id: ToolbarAction) {
    if (id === "channel")
      setChannel(channel === copy.channels ? "Kanal Fisika" : copy.channels);
    if (id === "create") setResult("Siap membuat pertanyaan");
    if (id === "level")
      setLevel(level === copy.level ? "Tingkat menengah" : copy.level);
    if (id === "size")
      setSize(size === copy.size ? "50 soal per halaman" : copy.size);
    if (id === "export") setResult("Laporan siap diekspor");
  }

  const channelAction = {
    id: "channel",
    label: channel,
    variant: "outline",
  } as const;
  const createAction = {
    id: "create",
    label: copy.create,
    iconOnly: true,
    renderIcon: renderNew,
    disabled: fixture.variant === "pending",
    variant: "default",
  } as const;
  let actions: readonly SharedUiAction<ToolbarAction>[] = [createAction];
  if (fixture.variant === "wrap") {
    actions = [
      { id: "level", label: level, variant: "outline" },
      { id: "size", label: size, variant: "outline" },
      { id: "export", label: copy.export, variant: "ghost" },
    ];
  } else if (fixture.variant === "pending") {
    actions = [
      {
        id: "refresh",
        label: copy.refresh,
        pending: true,
        iconOnly: true,
        renderIcon: renderRefresh,
        variant: "ghost",
      },
      createAction,
    ];
  }

  const search = fixture.variant === "compact" && (
    <View style={searchOpen && styles.fill}>
      <SharedUiSearch
        clearLabel={searchCopy.clear}
        expansion={{
          expanded: searchOpen,
          onExpandedChange: setSearchOpen,
          closeLabel: searchCopy.close,
        }}
        label={searchCopy.label}
        onValueChange={setValue}
        testID={`${fixture.id}-search`}
        theme={fixture.theme}
        value={value}
      />
    </View>
  );

  return (
    <View style={styles.stack}>
      <SharedUiToolbar
        actions={searchOpen ? [] : actions}
        label={copy.label}
        leading={
          fixture.variant !== "wrap" ? (
            <View style={styles.toolbarControls}>
              {!searchOpen && (
                <View style={styles.fill}>
                  <View style={styles.start}>
                    <SharedUiActionButton
                      action={channelAction}
                      onAction={handleAction}
                      testID={`${fixture.id}-channel`}
                      theme={fixture.theme}
                    />
                  </View>
                </View>
              )}
              {search}
            </View>
          ) : undefined
        }
        onAction={handleAction}
        testID={fixture.id}
        theme={fixture.theme}
      />
      {result && (
        <SharedUiStatus kind="status" message={result} theme={fixture.theme} />
      )}
    </View>
  );
}

function ComposerCase({
  fixture,
}: {
  fixture: Extract<ControlCase, { component: "composer" }>;
}) {
  const copy = sharedUiControlFixture.composer;
  const colors = nativeColors[fixture.theme];
  const [draft, setDraft] = useState<string>(fixture.draft);
  const [hasAttachment, setHasAttachment] = useState<boolean>(
    fixture.attachment,
  );
  const [failed, setFailed] = useState<boolean>(fixture.error);
  const [sent, setSent] = useState<string>();

  function submit(body: string) {
    setSent(body.trim() || copy.attachment);
    setFailed(false);
    setDraft("");
    setHasAttachment(false);
  }

  const attachment = hasAttachment ? (
    <View style={styles.start}>
      <View style={[styles.attachment, { backgroundColor: colors.muted }]}>
        <Text
          style={[
            styles.attachmentName,
            nativeTypography.bodyRegular,
            { color: colors.foreground },
          ]}
        >
          {copy.attachment}
        </Text>
        <Button
          accessibilityLabel={copy.remove}
          onPress={() => setHasAttachment(false)}
          renderIcon={renderRemove}
          size="icon-lg"
          style={styles.attachmentAction}
          testID={`${fixture.id}-remove`}
          theme={fixture.theme}
          variant="ghost"
        />
      </View>
    </View>
  ) : undefined;

  return (
    <View style={styles.stack}>
      <SharedUiComposer
        beforeInput={attachment}
        canSubmitEmpty={hasAttachment}
        draft={draft}
        label={copy.placeholder}
        onDraftChange={setDraft}
        onSubmit={submit}
        onTool={() => setHasAttachment(true)}
        recovery={
          failed
            ? {
                message: copy.error,
                retry: { label: copy.retry, onRetry: () => submit(draft) },
              }
            : undefined
        }
        submitLabel={copy.send}
        testID={fixture.id}
        theme={fixture.theme}
        tools={[
          {
            id: "attach",
            label: copy.attachmentTool,
            iconOnly: true,
            renderIcon: renderAttach,
            variant: "ghost",
            disabled: hasAttachment,
          },
        ]}
        toolsLabel="Alat penulisan"
      />
      {sent && (
        <SharedUiStatus
          kind="status"
          message={copy.sent}
          description={sent}
          theme={fixture.theme}
        />
      )}
    </View>
  );
}

export function SharedUiControlCase({ id }: { id: SharedUiControlCaseId }) {
  const fixture = sharedUiControlCases.find((item) => item.id === id);
  if (!fixture) return null;

  switch (fixture.component) {
    case "search":
      return <SearchCase key={id} fixture={fixture} />;
    case "status":
      return <StatusCase key={id} fixture={fixture} />;
    case "toolbar":
      return <ToolbarCase key={id} fixture={fixture} />;
    case "composer":
      return <ComposerCase key={id} fixture={fixture} />;
  }
}

const styles = StyleSheet.create({
  start: { alignItems: "flex-start" },
  stack: { gap: 12 },
  fill: { flex: 1, minWidth: 0 },
  toolbarControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: nativeRadii.md,
    gap: 4,
    paddingStart: 8,
  },
  attachmentName: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
  },
  attachmentAction: { height: 44, width: 44 },
});
