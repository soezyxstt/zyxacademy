import { createBrowserPythonRuntime } from "../../lib/coding/browser-runtime";

// Browser bundle for the opt-in probe. This calls the application's real Run adapter.
(globalThis as unknown as { codingBrowserProbe: typeof import("../../lib/coding/browser-runtime") }).codingBrowserProbe = { createBrowserPythonRuntime };
