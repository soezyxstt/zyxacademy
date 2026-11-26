import { FormattedDate } from "@/components/ui/formatted-date";
import { getFormattedDatePosition, type FormattedDateCaseSpec } from "@/packages/ui-parity/formatted-date-cases";

export function FormattedDateCase({ item }: { item: FormattedDateCaseSpec }) {
  const typography = item.role === "label" ? "text-body-sm font-semibold" : "text-body-xs text-muted-foreground";
  return (
    <div className={`flex flex-wrap items-baseline font-sans ${typography}`} style={getFormattedDatePosition()}>
      <span>{item.prefix}</span>
      <span data-parity-formatted-date>
        <FormattedDate date={item.date} locale={"locale" in item ? item.locale : undefined} options={item.options} />
      </span>
    </div>
  );
}
