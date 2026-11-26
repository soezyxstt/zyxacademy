import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { badgePosition, quizInsightsBadgeTabs, type BadgeCaseSpec, type BetaBadgeCaseSpec } from "../../packages/ui-parity/badge-cases";
import { Badge, BetaBadge } from "./components/Badge";
import { NavigationTabs } from "./features/shared-ui/navigation";

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
  const tabs = quizInsightsBadgeTabs.map(({ value, label }) => {
    const ai = value === "ai-insights";
    return {
      id: value, label,
      accessibilityLabel: ai ? `${label} Beta` : label,
      renderIcon: (color: string) => <QuizTabIcon ai={ai} color={color} />,
      accessory: ai ? <BetaBadge accessible={false} theme={item.theme} style={styles.centeredBadge} /> : undefined,
    };
  });
  return (
    <View style={[badgePosition, styles.tabFrame]}>
      <NavigationTabs tabs={tabs} activeId={selected} onTabPress={setSelected}
        variant="inline" accessibilityLabel="Analisis kuis" moreLabel="Lebih" closeLabel="Tutup"
        theme={item.theme} testID={item.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  tabFrame: { justifyContent: "center" },
  centeredBadge: { alignSelf: "center" },
});
