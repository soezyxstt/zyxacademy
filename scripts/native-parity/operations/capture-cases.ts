// Generate the Maestro commands from the same case objects used by the mounted app.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { operationsCases } from "../../../packages/native-parity/operations/cases";
import { publicCases } from "../../../packages/native-parity/operations/public-fixtures";

import { caseInteractions } from "./case-interactions";

const [flowDirectory, screenshotDirectory, ...caseIds] = process.argv.slice(2);
if (!flowDirectory || !screenshotDirectory) throw new Error("Expected flow directory and screenshot directory");
const publicIds = new Set(publicCases.map(item => item.id));
const available = process.env.NATIVE_PARITY_PUBLIC_FIXTURES === "1"
  ? operationsCases : operationsCases.filter(item => !publicIds.has(item.id));
const cases = caseIds.length ? available.filter(item => caseIds.includes(item.id)) : available;
if (caseIds.length && cases.length !== caseIds.length) throw new Error("Expected unique registered case IDs");
mkdirSync(flowDirectory, { recursive: true });
mkdirSync(screenshotDirectory, { recursive: true });
const manifest = [];
for (const item of cases) {
  const filename = item.id + ".png";
  const url = "zyx-native-parity://operations-fixture?caseId=" + encodeURIComponent(item.id);
  // Each case has its own flow, so a failed mount does not hide subsequent cases.
  writeFileSync(join(flowDirectory, item.id + ".yaml"), [
    "appId: com.zyx.academy.nativeparity",
    "name: " + item.id,
    "---",
    "- openLink: " + JSON.stringify(url),
    "- assertVisible:",
    "    id: " + item.id,
    "- extendedWaitUntil:",
    "    notVisible:",
    "      id: operations-loading",
    "    timeout: 10000",
    ...caseInteractions(item.id).map(command => "- " + JSON.stringify(command)),
    "- waitForAnimationToEnd",
    "- takeScreenshot: " + JSON.stringify(item.id),
    "",
  ].join("\n"));
  manifest.push({ ...item, filename });
}
writeFileSync(join(screenshotDirectory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
