import { useState, type ReactNode } from "react";
import { I18nManager, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";

import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import { getPaginationState } from "./data-model";

type Theme = keyof typeof nativeColors;
type Direction = -1 | 1;
type RangeLabels = { previous: string; next: string };

type RangeControlsProps = {
  children: ReactNode;
  labels: RangeLabels;
  theme: Theme;
  onMove: (direction: Direction) => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  testID?: string;
};

function RangeControls({ children, labels, theme, onMove, previousDisabled, nextDisabled, testID }: RangeControlsProps) {
  return (
    <View style={styles.controls}>
      <Button
        theme={theme}
        variant="outline"
        size="icon"
        hitSlop={0}
        style={styles.rangeAction}
        accessibilityLabel={labels.previous}
        disabled={previousDisabled}
        testID={testID && `${testID}-previous`}
        onPress={() => onMove(-1)}
        renderIcon={(color, size) => <Chevron direction={-1} color={color} size={size} />}
      />
      <View style={styles.controlLabel}>{children}</View>
      <Button
        theme={theme}
        variant="outline"
        size="icon"
        hitSlop={0}
        style={styles.rangeAction}
        accessibilityLabel={labels.next}
        disabled={nextDisabled}
        testID={testID && `${testID}-next`}
        onPress={() => onMove(1)}
        renderIcon={(color, size) => <Chevron direction={1} color={color} size={size} />}
      />
    </View>
  );
}

function Chevron({ color, direction, size }: { color: string; direction: Direction; size: number }) {
  const pointsRight = I18nManager.isRTL ? direction === -1 : direction === 1;
  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 16 16">
      <Path
        d={pointsRight ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  labels: RangeLabels & { busy: string };
  formatSummary: (page: number, pageCount: number) => string;
  pending?: boolean;
  theme?: Theme;
  testID?: string;
};

export function Pagination({
  page,
  pageCount,
  onPageChange,
  labels,
  formatSummary,
  pending = false,
  theme,
  testID,
}: PaginationProps) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const { current, count, previous, next } = getPaginationState(page, pageCount, pending);

  function onMove(direction: Direction) {
    const target = direction === -1 ? previous : next;
    if (target !== null) onPageChange(target);
  }

  return (
    <View testID={testID} accessibilityState={{ busy: pending }}>
      <RangeControls
        theme={resolvedTheme}
        labels={labels}
        onMove={onMove}
        previousDisabled={previous === null}
        nextDisabled={next === null}
        testID={testID}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.summary, nativeTypography.bodyMedium, { color: colors.foreground }]}
        >
          {formatSummary(current, count)}
        </Text>
        {pending && <Text accessibilityLiveRegion="polite" style={[styles.caption, nativeTypography.bodyRegular, { color: colors.mutedForeground }]}>{labels.busy}</Text>}
      </RangeControls>
    </View>
  );
}

export type CalendarDay = {
  id: string;
  weekday: string;
  day: string;
  label: string;
  today?: boolean;
  disabled?: boolean;
};

export type CalendarEvent = {
  id: string;
  dateId: string;
  title: string;
  caption?: string;
  disabled?: boolean;
};

export type CalendarProps = {
  periodLabel: string;
  days: readonly CalendarDay[];
  events: readonly CalendarEvent[];
  selectedDateId?: string;
  selectedEventId?: string;
  onPeriodChange: (direction: Direction) => void;
  onDateChange: (id: string) => void;
  onEventPress?: (id: string) => void;
  labels: RangeLabels & { today: string; empty: string; getEventCountLabel: (count: number) => string };
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  theme?: Theme;
  testID?: string;
};

export function Calendar({
  periodLabel,
  days,
  events,
  selectedDateId,
  selectedEventId,
  onPeriodChange,
  onDateChange,
  onEventPress,
  labels,
  previousDisabled,
  nextDisabled,
  theme,
  testID,
}: CalendarProps) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const { fontScale } = useWindowDimensions();
  const [focusedDate, setFocusedDate] = useState<string>();
  const [focusedEvent, setFocusedEvent] = useState<string>();
  const selectedDay = days.find((day) => day.id === selectedDateId);
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = eventsByDay.get(event.dateId);
    if (list) list.push(event);
    else eventsByDay.set(event.dateId, [event]);
  }
  const dayEvents = selectedDay ? eventsByDay.get(selectedDay.id) ?? [] : [];
  const muted = { color: colors.mutedForeground };
  const foreground = { color: colors.foreground };

  return (
    <View testID={testID} style={styles.calendar}>
      <RangeControls
        labels={labels}
        theme={resolvedTheme}
        onMove={onPeriodChange}
        previousDisabled={previousDisabled}
        nextDisabled={nextDisabled}
        testID={testID}
      >
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.summary, nativeTypography.bodySemibold, foreground]}>
          {periodLabel}
        </Text>
      </RangeControls>
      <ScrollView horizontal contentContainerStyle={styles.days} showsHorizontalScrollIndicator={false}>
        {days.map(({ id, label, day, weekday, today, disabled }) => {
          const selected = id === selectedDateId;
          const count = eventsByDay.get(id)?.length ?? 0;
          const spokenLabel = [label, today && labels.today, count > 0 && labels.getEventCountLabel(count)].filter(Boolean).join(", ");
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={spokenLabel}
              disabled={disabled}
              onFocus={() => setFocusedDate(id)}
              onBlur={() => setFocusedDate(undefined)}
              onPress={() => onDateChange(id)}
              testID={testID && `${testID}-date-${id}`}
              style={({ pressed }) => [styles.day, {
                minWidth: 44 * Math.max(1, fontScale),
                borderColor: selected ? colors.primary : today ? colors.border : "transparent",
                backgroundColor: selected ? `${colors.primary}1a` : pressed || today ? `${colors.muted}66` : "transparent",
                outlineColor: colors.accent,
              }, focusedDate === id && styles.focus, disabled && styles.disabled]}
            >
              <Text style={[styles.weekday, nativeTypography.bodyMedium, selected ? foreground : muted]}>{weekday}</Text>
              <Text style={[styles.summary, nativeTypography.bodySemibold, selected ? foreground : muted]}>{day}</Text>
              <View style={[styles.dot, { backgroundColor: count ? colors.primary : "transparent" }]} />
            </Pressable>
          );
        })}
      </ScrollView>
      {selectedDay && (
        <View style={styles.agenda}>
          <Text accessibilityRole="header" style={[styles.summary, nativeTypography.bodySemibold, foreground]}>{selectedDay.label}</Text>
          {dayEvents.length === 0 ? (
            <Text style={[styles.summary, nativeTypography.bodyRegular, muted]}>{labels.empty}</Text>
          ) : dayEvents.map((event) => {
            const selected = event.id === selectedEventId;
            const text = (
              <>
                <Text style={[styles.summary, nativeTypography.bodySemibold, foreground]}>{event.title}</Text>
                {event.caption && <Text style={[styles.caption, nativeTypography.bodyRegular, muted]}>{event.caption}</Text>}
              </>
            );
            if (!onEventPress) {
              return <View key={event.id} style={[styles.event, { borderColor: colors.border }]}>{text}</View>;
            }
            return (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: event.disabled, selected }}
                disabled={event.disabled}
                onFocus={() => setFocusedEvent(event.id)}
                onBlur={() => setFocusedEvent(undefined)}
                onPress={() => onEventPress(event.id)}
                testID={testID && `${testID}-event-${event.id}`}
                style={({ pressed }) => [styles.event, {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected || pressed ? `${colors.primary}14` : colors.background,
                  outlineColor: colors.accent,
                }, focusedEvent === event.id && styles.focus, event.disabled && styles.disabled]}
              >
                {text}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  controlLabel: { flex: 1, minWidth: 0, alignItems: "center", gap: 4 },
  rangeAction: { width: 44, height: 44 },
  summary: { fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  caption: { fontSize: 12, lineHeight: 16 },
  calendar: { gap: 12 },
  days: { flexGrow: 1, gap: 4, padding: 3 },
  day: { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 1, paddingVertical: 4, borderWidth: 1, borderRadius: nativeRadii.lg },
  weekday: { fontSize: 11, lineHeight: 14 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  agenda: { gap: 8 },
  event: { borderWidth: 1, borderRadius: nativeRadii.md, padding: 12, gap: 2, minHeight: 44 },
  focus: { outlineWidth: 2, outlineOffset: 1 },
  disabled: { opacity: 0.5 },
});
