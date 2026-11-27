import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AdministrationActor, AdministrationScenario } from "../../../../../packages/native-parity/academic/administration/fixtures";
import { createAdministrationStore, type AdministrationStore } from "../../../../../packages/native-parity/academic/administration/store";

const AdministrationContext = createContext<AdministrationStore | null>(null);

type ProviderProps = { actor: AdministrationActor; scenario: AdministrationScenario; children: ReactNode };

function AccountAdministrationProvider({ actor, scenario, children }: ProviderProps) {
  const [store] = useState(() => createAdministrationStore(actor, scenario));
  return <AdministrationContext.Provider value={store}>{children}</AdministrationContext.Provider>;
}

export function AdministrationProvider(props: ProviderProps) {
  const { actor, scenario } = props;
  return <AccountAdministrationProvider key={JSON.stringify([actor.id, actor.role, scenario])} {...props} />;
}

export function useAdministrationStore() {
  const store = useContext(AdministrationContext);
  if (!store) throw new Error("AdministrationProvider is required.");
  return store;
}

export function useAdministrationSnapshot() {
  const store = useAdministrationStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
