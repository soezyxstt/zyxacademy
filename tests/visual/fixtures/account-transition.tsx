import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountTransitionBoundary } from "@/components/auth/account-transition-boundary";
import { setAccountTransitionPending } from "@/lib/auth/account-transition-state";

Object.assign(window, {
  fixtureWrites: 0,
  fixturePortalWrites: 0,
  fixtureLocalTransition: setAccountTransitionPending,
});
const calls = window as typeof window & { fixtureWrites: number; fixturePortalWrites: number };

function App() {
  const [saved, setSaved] = useState(0);
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>
    <AccountTransitionBoundary />
    <main className="mx-auto max-w-lg space-y-6 px-5 py-10 text-foreground">
      <h1 className="font-heading text-h5 font-bold">Pengaturan profil</h1>
      <form id="profile-form" className="space-y-3" onSubmit={event => { event.preventDefault(); calls.fixtureWrites++; setSaved(calls.fixtureWrites); }}>
        <label htmlFor="profile-name" className="block text-body-sm">Nama</label>
        <input id="profile-name" defaultValue="Nadia Putri" className="h-10 w-full rounded-md border border-input bg-background px-3 text-body-sm" />
        <button type="submit" className="min-h-10 rounded-md bg-primary px-4 text-body-sm text-primary-foreground">Simpan profil</button>
        <p className="text-body-xs text-muted-foreground">Tersimpan: {saved}</p>
      </form>
    </main>
    {createPortal(<div className="fixed inset-x-5 bottom-6 mx-auto max-w-lg rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg" data-fixture-portal="">
      <form id="portal-form" onSubmit={event => { event.preventDefault(); calls.fixturePortalWrites++; }}>
        <button id="portal-save" type="submit" className="min-h-10 rounded-md border border-border px-4 text-body-sm">Simpan dari dialog</button>
      </form>
    </div>, document.body)}
  </QueryClientProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
