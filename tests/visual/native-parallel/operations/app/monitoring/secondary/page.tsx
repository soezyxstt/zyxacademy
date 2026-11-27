import { MonitoringProviders } from "../providers";
import { MonitoringReference } from "../reference-clients";

export default async function MonitoringSecondaryPage({ searchParams }: {
  searchParams: Promise<{ screen?: string; mode?: string; theme?: string }>;
}) {
  const { screen = "ops", mode = "populated", theme } = await searchParams;
  return <MonitoringProviders>
    <main className={`${theme === "dark" ? "dark" : "light"} bg-background text-foreground min-h-screen p-4 space-y-5`} data-monitoring-reference={screen}>
      <MonitoringReference screen={screen} mode={mode} />
    </main>
  </MonitoringProviders>;
}
