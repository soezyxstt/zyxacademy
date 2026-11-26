import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { layoutCases, layoutFixture, type LayoutCaseId, type LayoutFixtureCase } from "../../../../packages/native-parity/shared-ui/layout-cases";
import type { SharedUiAction, SharedUiActionHandler } from "./actions";
import {
  NativeCompactShell,
  NativeListRow,
  NativePageHeader,
  NativeResponsiveList,
  SharedUiActionButton,
  type NativeListState,
  type NativeStatusContent,
} from "./layout";

export const firstSliceCaseId = layoutCases[0].id;

type FixtureRow = {
  id: string;
  title: string;
  subtitle: string;
  access: string;
  status: string;
};

type FixtureActionId = "open-documents" | "filter" | "save" | "reset-filters" | "retry";

type InitialListStatus = "ready" | "empty" | "error";

export function FirstSliceExample({ caseId = firstSliceCaseId }: { caseId?: LayoutCaseId }) {
  const fixture = layoutCases.find((item) => item.id === caseId) ?? layoutCases[0];
  return <LayoutExample key={fixture.id} fixture={fixture} />;
}

function LayoutExample({ fixture }: { fixture: LayoutFixtureCase }) {
  const { id, theme } = fixture;
  const documents = id === "shared-ui-shell-back-light" || id === "shared-ui-shell-long-title-dark";
  const [atCourse, setAtCourse] = useState(false);
  const [detail, setDetail] = useState<FixtureRow | null>(null);
  const [listStatus, setListStatus] = useState<InitialListStatus>(() => {
    if (id === "shared-ui-list-empty-dark") return "empty";
    if (id === "shared-ui-list-error-light") return "error";
    return "ready";
  });

  useEffect(() => {
    if ((!documents || atCourse) && !detail) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (detail) setDetail(null);
      else setAtCourse(true);
      return true;
    });
    return () => subscription.remove();
  }, [atCourse, detail, documents]);

  const onAction: SharedUiActionHandler<FixtureActionId> = (actionId) => {
    switch (actionId) {
      case "open-documents":
        setAtCourse(false);
        break;
      case "filter":
        setListStatus((status) => status === "empty" ? "ready" : "empty");
        break;
      case "retry":
      case "reset-filters":
        setListStatus("ready");
        break;
    }
  };
  const filterAction: SharedUiAction<FixtureActionId> = { id: "filter", label: layoutFixture.filter };

  if (atCourse) {
    return (
      <NativeCompactShell navigationTitle={layoutFixture.course} theme={theme}>
        <NativePageHeader actions={[{ id: "open-documents", label: layoutFixture.open }]} onAction={onAction} theme={theme} />
      </NativeCompactShell>
    );
  }

  if (detail) {
    return (
      <NativeCompactShell navigationTitle={detail.title} theme={theme} back={{ label: layoutFixture.documents, onPress: () => setDetail(null) }}>
        <Text style={{ color: nativeColors[theme].mutedForeground }}>{detail.subtitle}</Text>
      </NativeCompactShell>
    );
  }

  const empty: NativeStatusContent<FixtureActionId> = {
    title: layoutFixture.emptyTitle,
    message: layoutFixture.emptyMessage,
    action: { id: "reset-filters", label: layoutFixture.reset },
    onAction,
  };
  const state: NativeListState<FixtureRow, FixtureActionId> = listStatus === "error" ? {
    status: "error",
    title: layoutFixture.errorTitle,
    action: { id: "retry", label: layoutFixture.retry },
    onAction,
  } : {
    status: "ready",
    rows: listStatus === "empty" ? [] : documents ? layoutFixture.materials : layoutFixture.rows,
  };
  const actions: readonly SharedUiAction<FixtureActionId>[] = id === "shared-ui-header-action-states-dark" ? [
    { id: "reset-filters", label: layoutFixture.reset, disabled: true },
    { id: "save", label: layoutFixture.save, pending: true, variant: "default" },
  ] : [filterAction];
  const navigationTitle = documents
    ? (id === "shared-ui-shell-long-title-dark" ? layoutFixture.longTitle : layoutFixture.documents)
    : layoutFixture.users;
  const shellSlots = id === "shared-ui-shell-slots-light";
  const headingOnly = id === "shared-ui-header-long-title-light";

  return (
    <NativeCompactShell
      theme={theme}
      navigationTitle={headingOnly || shellSlots ? undefined : navigationTitle}
      back={documents ? { label: layoutFixture.back, onPress: () => setAtCourse(true) } : undefined}
      topBar={shellSlots && (
        <View style={styles.slot}>
          <Text accessibilityRole="header" style={[styles.slotTitle, { color: nativeColors[theme].foreground }]}>{layoutFixture.participants}</Text>
        </View>
      )}
      bottomBar={shellSlots && (
        <View style={styles.slot}>
          <SharedUiActionButton action={{ ...filterAction, label: layoutFixture.apply }} onAction={onAction} theme={theme} />
        </View>
      )}
    >
      {headingOnly ? (
        <NativePageHeader title={layoutFixture.longTitle} theme={theme} />
      ) : !documents && !shellSlots ? (
        <NativePageHeader actions={actions} onAction={onAction} theme={theme} />
      ) : null}
      <NativeResponsiveList
        label={documents ? layoutFixture.documents : layoutFixture.users}
        empty={empty}
        getRowKey={(row) => row.id}
        renderRow={(row, layout) => (
          <NativeListRow
            layout={layout}
            metadata={documents ? undefined : [
              { id: "access", label: layoutFixture.labels.access, value: row.access },
              { id: "status", label: layoutFixture.labels.status, value: row.status },
            ]}
            primary={documents ? { onPress: () => setDetail(row), role: "link" } : undefined}
            subtitle={row.subtitle}
            theme={theme}
            title={row.title}
          />
        )}
        state={state}
        theme={theme}
      />
    </NativeCompactShell>
  );
}

const styles = StyleSheet.create({
  slot: { paddingHorizontal: 16, alignItems: "flex-start" },
  slotTitle: { fontSize: 16, fontWeight: "600", paddingVertical: 12 },
});
