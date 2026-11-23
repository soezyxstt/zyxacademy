import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { AppToaster } from "@/components/app-toaster";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import en from "@/messages/en/ui.json";
import id from "@/messages/id/ui.json";
import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance-preferences";

const dark = new URLSearchParams(location.search).get("theme") === "dark";
if (dark) {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ toastPosition: "bottom-right" }));
}

function showNotifications() {
  const alternate = { duration: Infinity, position: dark ? "top-left" : "bottom-left" } as const;
  const preferred = { duration: Infinity };

  toast.loading("Checking device permissions", alternate);
  toast.warning("Study reminders are paused", {
    ...alternate,
    cancel: { label: "Keep paused", onClick: () => {} },
  });
  toast.info("New course materials", { ...alternate, description: "The next study guide is available." });
  toast("On-screen alerts will appear here", preferred);
  toast.success("Preferences saved", preferred);
  toast.error("Could not complete device registration.", {
    ...preferred,
    description: "Check your connection before trying to enable notifications on this device again.",
    cancel: { label: "Later", onClick: () => {} },
    action: { label: "Retry device registration", onClick: () => toast.success("Registration restarted", preferred) },
  });
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" forcedTheme={dark ? "dark" : "light"}>
    <NextIntlClientProvider locale={dark ? "id" : "en"} messages={{ ui: dark ? id : en }} timeZone="UTC">
      <main className="grid min-h-dvh place-content-center gap-3 px-4 pb-10">
        <h1 className="font-heading text-h5">Preferences</h1>
        <Alert>
          <AlertTitle>Device push notifications</AlertTitle>
          <AlertDescription>Permission granted, device not registered.</AlertDescription>
        </Alert>
        <Button className="justify-self-start" onClick={showNotifications}>Show notifications</Button>
      </main>
      <AppToaster />
    </NextIntlClientProvider>
  </ThemeProvider>,
);
