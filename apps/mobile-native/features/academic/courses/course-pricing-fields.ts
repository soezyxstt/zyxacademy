export function formatWib(input: string) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input) ? input.replace(" ", "T") + ":00+07:00" : null;
}

export function displayWib(value: Date | null | undefined) {
  return value ? new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
}
