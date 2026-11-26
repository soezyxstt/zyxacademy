import { mkdir, writeFile } from "node:fs/promises";
import { readProductV4RuntimeFingerprint, readProductV4LogicRuntimeFingerprint } from "../../lib/compute/product-v4-runtime-binding";

const fingerprint = { ...await readProductV4RuntimeFingerprint(), logicFingerprint: await readProductV4LogicRuntimeFingerprint() };
if (!/^[a-f0-9]{64}$/.test(fingerprint.rendererChecksum)) throw new Error("WEB_RUNTIME_FINGERPRINT_INVALID");
if (!/^[a-f0-9]{64}$/.test(fingerprint.logicFingerprint.logicChecksum)) throw new Error("LOGIC_RUNTIME_FINGERPRINT_INVALID");
await mkdir("artifacts/authoring-verification", { recursive: true });
await writeFile("artifacts/authoring-verification/web-runtime.json", JSON.stringify(fingerprint));
await writeFile("lib/compute/product-v4-build-runtime.json", JSON.stringify(fingerprint));
