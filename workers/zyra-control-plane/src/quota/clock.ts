export const PROVIDER_TIME_ZONE = "America/Los_Angeles";
export const APP_TIME_ZONE = "Asia/Jakarta";

type DatePart = "year" | "month" | "day" | "hour" | "minute";

function parts(date: Date, timeZone: string): Record<DatePart, string> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Partial<Record<DatePart, string>>;

  return {
    year: values.year ?? "0000",
    month: values.month ?? "00",
    day: values.day ?? "00",
    hour: values.hour ?? "00",
    minute: values.minute ?? "00"
  };
}

export function providerDayLabel(date: Date): string {
  const value = parts(date, PROVIDER_TIME_ZONE);
  return `${value.year}-${value.month}-${value.day}`;
}

export function appDayLabel(date: Date): string {
  const value = parts(date, APP_TIME_ZONE);
  return `${value.year}-${value.month}-${value.day}`;
}

export function providerMinuteBucket(date: Date): string {
  const value = parts(date, PROVIDER_TIME_ZONE);
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

export function nextProviderDayBoundaryMs(date: Date): number {
  const startLabel = providerDayLabel(date);
  let candidate = date.getTime() + 60_000;
  const maximum = date.getTime() + 48 * 60 * 60 * 1_000;

  while (candidate <= maximum && providerDayLabel(new Date(candidate)) === startLabel) {
    candidate += 60_000;
  }

  return candidate;
}
