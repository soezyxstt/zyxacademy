import { resolveOperationsArea } from "../../../apps/mobile-native/features/operations/routes";
import { operationsCases } from "../../../packages/native-parity/operations/cases";

console.log("case_id\tarea\tcomponent\tpath\tfixture\tlocale\ttheme\tdevice_entry");
for (const c of operationsCases) {
  const url = "zyx-native-parity://operations-fixture?caseId=" + encodeURIComponent(c.id);
  console.log([c.id, resolveOperationsArea(c.path), c.component, c.path, c.mode, c.locale, c.theme, url].join("\t"));
}
