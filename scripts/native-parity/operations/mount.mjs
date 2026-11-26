// Mount the isolated fixture in a disposable checkout without replacing an existing route.
import { writeFileSync } from "node:fs";
const route = new URL("../../../apps/mobile-native/app/operations-fixture.tsx", import.meta.url);
writeFileSync(route, 'export { default } from "../features/operations/OperationsFixture";\n', { flag: "wx" });
