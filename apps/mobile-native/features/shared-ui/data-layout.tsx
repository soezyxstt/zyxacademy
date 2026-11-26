import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View, useColorScheme, useWindowDimensions, type LayoutChangeEvent } from "react-native";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../../typography";
import { defaultGridGap, getGridColumnCount } from "./data-model";

export type ResponsiveGridProps<Item> = {
  items: readonly Item[];
  getItemKey: (item: Item) => string;
  renderItem: (item: Item) => ReactNode;
  minItemWidth?: number;
  maxColumns?: number;
  gap?: number;
  testID?: string;
};

export function ResponsiveGrid<Item>({
  items,
  getItemKey,
  renderItem,
  minItemWidth,
  maxColumns,
  gap,
  testID,
}: ResponsiveGridProps<Item>) {
  const { width, fontScale, onLayout } = useContainerWidth();
  const columns = getGridColumnCount(width, fontScale, { minItemWidth, gap, maxColumns });
  const itemGap = gap ?? defaultGridGap;
  const itemWidth = columns === 1 ? "100%" : (width - itemGap * (columns - 1)) / columns;

  return (
    <View testID={testID} style={[styles.grid, { gap: itemGap }]} onLayout={onLayout}>
      {items.map((item, index) => {
        const key = getItemKey(item);
        return (
          <View key={key} testID={testID && `${testID}-item-${key}-column-${index % columns + 1}`} style={{ width: itemWidth, minWidth: 0 }}>
            {renderItem(item)}
          </View>
        );
      })}
    </View>
  );
}

export type ResponsiveTableColumn<Row> = {
  id: string;
  label: string;
  renderCell: (row: Row) => ReactNode;
  weight?: number;
  align?: "start" | "end";
};

export type ResponsiveTableProps<Row> = {
  rows: readonly Row[];
  columns: readonly ResponsiveTableColumn<Row>[];
  getRowKey: (row: Row) => string;
  empty: ReactNode;
  tableMinWidth?: number;
  theme?: keyof typeof nativeColors;
  testID?: string;
};

export function ResponsiveTable<Row>({
  rows,
  columns,
  getRowKey,
  empty,
  tableMinWidth = 736,
  theme,
  testID,
}: ResponsiveTableProps<Row>) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const { width, fontScale, onLayout } = useContainerWidth();
  const stacked = width < tableMinWidth * fontScale;
  const border = { borderColor: colors.border };
  const muted = { color: colors.mutedForeground };

  if (!rows.length) return <View testID={testID}>{empty}</View>;

  return (
    <View testID={testID} onLayout={onLayout} role={stacked ? "list" : "table"} style={[styles.table, border]}>
      {!stacked && (
        <View testID={testID && `${testID}-head`} role="row" style={[styles.columns, styles.divider, border]}>
          {columns.map(({ id, label, weight = 1, align = "start" }) => (
            <Text
              key={id}
              role="columnheader"
              style={[
                styles.caption, nativeTypography.bodySemibold, muted,
                { flex: weight }, align === "end" && styles.textEnd,
              ]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}
      {rows.map((row, rowIndex) => (
        <View
          key={getRowKey(row)}
          role={stacked ? "listitem" : "row"}
          style={[stacked ? styles.stacked : styles.columns, rowIndex < rows.length - 1 && [styles.divider, border]]}
        >
          {columns.map(({ id, label, renderCell, weight = 1, align = "start" }, columnIndex) => {
            const content = renderCell(row);
            return (
              <View key={id} role={stacked ? undefined : "cell"} style={[
                styles.cell,
                !stacked && { flex: weight },
                !stacked && align === "end" && styles.cellEnd,
              ]}>
                {stacked && columnIndex > 0 && (
                  <Text style={[styles.caption, nativeTypography.bodySemibold, muted]}>{label}</Text>
                )}
                {typeof content === "string" || typeof content === "number" ? (
                  <Text
                    accessibilityLabel={stacked && columnIndex > 0 ? undefined : `${label}: ${content}`}
                    style={[
                      styles.value,
                      columnIndex === 0 ? nativeTypography.bodySemibold : nativeTypography.bodyRegular,
                      { color: colors.foreground },
                      !stacked && align === "end" && styles.textEnd,
                    ]}
                  >
                    {content}
                  </Text>
                ) : content}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function useContainerWidth() {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => setWidth(nativeEvent.layout.width);
  return { width, fontScale: Math.max(1, fontScale), onLayout };
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", alignSelf: "stretch" },
  table: { alignSelf: "stretch", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  stacked: { gap: 6, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { minWidth: 0, gap: 2 },
  cellEnd: { alignItems: "flex-end" },
  textEnd: { textAlign: "right" },
  caption: { fontSize: 12, lineHeight: 16 },
  value: { fontSize: 14, lineHeight: 20 },
});
