// Install in a disposable checkout for a device build. Production route ownership stays with the host.
import { mkdirSync, writeFileSync } from "node:fs";
const directory = new URL("../../../apps/mobile-native/app/shared-ui/", import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL("[id].tsx", directory), `import { useLocalSearchParams } from "expo-router";
import { SharedUiCase } from "../../features/shared-ui/SharedUiCase";

export default function SharedUiFixtureRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SharedUiCase id={id} />;
}
`, { flag: "wx" });
