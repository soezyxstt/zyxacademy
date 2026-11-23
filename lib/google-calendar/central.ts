/** Central schedules go to the primary calendar of the shared Google host. */
export const CENTRAL_CALENDAR_ID = "primary";

export function centralCalendarConfigured(environment: Record<string, string | undefined> = process.env) {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
    .every(key => Boolean(environment[key]?.trim()));
}
