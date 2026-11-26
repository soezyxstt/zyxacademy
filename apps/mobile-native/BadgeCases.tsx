import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import { badgePosition, quizInsightsBadgeTabs, type BadgeCaseSpec, type BetaBadgeCaseSpec } from "../../packages/ui-parity/badge-cases";
import { Badge, BetaBadge } from "./components/Badge";
import { nativeControlLabelPosition, nativeTypography } from "./typography";

export function BadgeCase({ item }: { item: BadgeCaseSpec }) {
  return (
    <View style={[badgePosition, styles.center]}>
      <Badge testID={`${item.id}-text`} theme={item.theme} variant={item.variant} style={styles.centeredBadge}>{item.label}</Badge>
    </View>
  );
}

// BrainCircuit and Target geometry. Copyright (c) 2026 Lucide Icons and Contributors.
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTIES.
// Target originated in Feather, copyright (c) 2013-present Cole Bemis (MIT).
const brainPaths = [
  "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
  "M9 13a4.5 4.5 0 0 0 3-4",
  "M6.003 5.125A3 3 0 0 0 6.401 6.5",
  "M3.477 10.896a4 4 0 0 1 .585-.396",
  "M6 18a4 4 0 0 1-1.967-.516",
  "M12 13h4",
  "M12 18h6a2 2 0 0 1 2 2v1",
  "M12 8h8",
  "M16 8V5a2 2 0 0 1 2-2",
];
const brainPoints = [[16, 13], [18, 3], [20, 21], [20, 8]];

function QuizTabIcon({ ai, color }: { ai: boolean; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
  return (
    <Svg accessible={false} width={16} height={16} viewBox="0 0 24 24">
      {ai ? (
        <>
          {brainPaths.map(path => <Path key={path} d={path} {...stroke} />)}
          {brainPoints.map(([cx, cy]) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0.5} {...stroke} />)}
        </>
      ) : [10, 6, 2].map(radius => <Circle key={radius} cx={12} cy={12} r={radius} {...stroke} />)}
    </Svg>
  );
}

export function BetaBadgeCase({ item }: { item: BetaBadgeCaseSpec }) {
  const [selected, setSelected] = useState<(typeof quizInsightsBadgeTabs)[number]["value"]>(item.selected);
  const colors = nativeColors[item.theme];
  return (
    <View style={[badgePosition, styles.center]}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {quizInsightsBadgeTabs.map(({ value, label }) => {
          const active = selected === value;
          const ai = value === "ai-insights";
          const color = active ? colors.foreground : colors.mutedForeground;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityLabel={ai ? `${label} Beta` : label}
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(value)}
              style={styles.tab}
              testID={`${item.id}-${value}`}
            >
              <QuizTabIcon ai={ai} color={color} />
              <Text style={[styles.label, nativeControlLabelPosition, { color }]}>{label}</Text>
              {ai && <BetaBadge theme={item.theme} style={styles.centeredBadge} />}
              {active && <View style={[styles.indicator, { backgroundColor: colors.primary }]} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  tabs: { flexDirection: "row", gap: 2 },
  tab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  label: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  centeredBadge: { alignSelf: "center" },
  indicator: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2 },
});
