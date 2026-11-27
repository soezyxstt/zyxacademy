import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { loadMessages } from "@/lib/i18n/catalogs";
import { sharedUiCases } from "@/packages/native-parity/shared-ui/cases";
import { FixtureProviders } from "../../FixtureProviders";
import "../fixture.css";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const theme = sharedUiCases.find((item) => item.id === id)?.theme ?? "light";
  return (
    <html lang="id" className={theme}>
      <head>
        <link rel="icon" href="data:," />
      </head>
      <body>
        <LocaleProvider
          initialLocale="id"
          initialMessages={await loadMessages("id")}
        >
          <FixtureProviders>{children}</FixtureProviders>
        </LocaleProvider>
      </body>
    </html>
  );
}
