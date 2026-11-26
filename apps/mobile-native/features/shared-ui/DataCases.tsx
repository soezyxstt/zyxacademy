import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { dataCalendarPeriods, dataCases, dataLabels, type DataCase } from "../../../../packages/native-parity/shared-ui/data-cases";
import { nativeTypography } from "../../typography";
import { Calendar, Pagination } from "./data-controls";
import { ResponsiveGrid, ResponsiveTable } from "./data-layout";

export function DataCases({ id }: { id: DataCase["id"] }) {
  const fixture = dataCases.find((item) => item.id === id);
  if (!fixture) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.frame, { maxWidth: fixture.width }]}>
        <DataSpecimen fixture={fixture} />
      </View>
    </ScrollView>
  );
}

function DataSpecimen({ fixture }: { fixture: DataCase }) {
  const { id, theme } = fixture;
  const colors = nativeColors[theme];

  switch (fixture.component) {
    case "grid":
      return (
        <ResponsiveGrid<(typeof fixture.cards)[number]>
          testID={`${id}-grid`}
          items={fixture.cards}
          getItemKey={(card) => card.id}
          renderItem={(card) => (
            <View style={[styles.card, { borderColor: colors.border }]} testID={`${id}-card-${card.id}`}>
              <Text style={[styles.body, nativeTypography.bodySemibold, { color: colors.foreground }]}>{card.title}</Text>
              <Text style={[styles.caption, nativeTypography.bodyRegular, { color: colors.mutedForeground }]}>{card.caption}</Text>
            </View>
          )}
        />
      );
    case "table":
      return (
        <ResponsiveTable
          testID={`${id}-table`}
          theme={fixture.theme}
          rows={fixture.rows}
          getRowKey={(row) => row.id}
          columns={[
            { id: "name", label: dataLabels.table.name, weight: 2, renderCell: (row) => row.name },
            { id: "concepts", label: dataLabels.table.concepts, weight: 3, renderCell: (row) => row.concepts },
            { id: "lastActive", label: dataLabels.table.lastActive, align: "end", renderCell: (row) => row.lastActive },
          ]}
          empty={<Text style={[styles.body, nativeTypography.bodyRegular, { color: colors.mutedForeground }]}>{dataLabels.table.empty}</Text>}
        />
      );
    case "calendar":
      return <CalendarCase key={id} fixture={fixture} />;
    case "pagination":
      return <PaginationCase key={id} fixture={fixture} />;
  }
}

function CalendarCase({ fixture }: { fixture: Extract<DataCase, { component: "calendar" }> }) {
  const [periodIndex, setPeriodIndex] = useState(0);
  const [dateId, setDateId] = useState<string>(fixture.selectedDateId);
  const [eventId, setEventId] = useState<string | undefined>(fixture.selectedEventId);
  const period = dataCalendarPeriods[periodIndex];
  const activeEvent = fixture.events.find((event) => event.id === eventId && event.dateId === dateId);
  const colors = nativeColors[fixture.theme];

  return (
    <View style={styles.calendar}>
      <Calendar
        testID={fixture.id}
        theme={fixture.theme}
        periodLabel={period.label}
        days={period.days.map((day) => ({ ...day, today: day.id === "2026-03-02" }))}
        events={fixture.events}
        labels={{ ...dataLabels.calendar, getEventCountLabel: (count) => `${count} jadwal` }}
        selectedDateId={dateId}
        selectedEventId={eventId}
        previousDisabled={periodIndex === 0}
        nextDisabled={periodIndex === dataCalendarPeriods.length - 1}
        onPeriodChange={(direction) => {
          const target = periodIndex + direction;
          if (!dataCalendarPeriods[target]) return;
          setPeriodIndex(target);
          setDateId(dataCalendarPeriods[target].days[0].id);
          setEventId(undefined);
        }}
        onDateChange={(id) => {
          setDateId(id);
          setEventId(undefined);
        }}
        onEventPress={(id) => setEventId((current) => current === id ? undefined : id)}
      />
      {activeEvent && (
        <Text accessibilityLiveRegion="polite" style={[styles.body, nativeTypography.bodyRegular, { color: colors.foreground }]}>
          {activeEvent.detail}
        </Text>
      )}
    </View>
  );
}

function PaginationCase({ fixture }: { fixture: Extract<DataCase, { component: "pagination" }> }) {
  const [page, setPage] = useState<number>(fixture.initialPage);
  return (
    <Pagination
      testID={fixture.id}
      theme={fixture.theme}
      page={page}
      pageCount={fixture.pageCount}
      labels={dataLabels.pagination}
      formatSummary={(current, total) => `${current} / ${total}`}
      pending={fixture.pending}
      onPageChange={setPage}
    />
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  frame: { width: "100%", padding: 16 },
  card: { flex: 1, gap: 4, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: nativeRadii.md },
  body: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  calendar: { gap: 12 },
});
