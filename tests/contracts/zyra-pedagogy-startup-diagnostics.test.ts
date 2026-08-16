import { describe, expect, test } from "bun:test";
import {
  maskedPedagogyStartupReason,
  PedagogyStartupDiagnosticError,
  runMaskedPedagogyStartupDiagnostics,
} from "@/lib/zyra/pedagogy/startup-diagnostics";
import { createZyraRuntimeEnv } from "@/lib/zyra/runtime-env";

describe("Plan 007 masked startup diagnostics", () => {
  test("maps generic errors to the failed stage without retaining raw details", async () => {
    const rawError = new Error("request failed against an authenticated URL with private details");
    const result = await runMaskedPedagogyStartupDiagnostics([
      { stage: "staging_guard", run: async () => ({ stagingConfirmed: true }) },
      { stage: "database_connectivity", run: async () => { throw rawError; } },
      { stage: "identity", run: async () => ({ active: true }) },
    ]);

    expect(result).toEqual({
      status: "blocked",
      failedStage: "database_connectivity",
      reasonCode: "PEDAGOGY_STARTUP_DATABASE_UNAVAILABLE",
      stages: [
        { stage: "staging_guard", status: "passed", metadata: { stagingConfirmed: true } },
        {
          stage: "database_connectivity",
          status: "failed",
          reasonCode: "PEDAGOGY_STARTUP_DATABASE_UNAVAILABLE",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(rawError.message);
  });

  test("preserves safe named reason codes and stops before later actions", async () => {
    let providerInvoked = false;
    const result = await runMaskedPedagogyStartupDiagnostics([
      {
        stage: "config",
        run: async () => { throw new Error("PEDAGOGY_STARTUP_CONFIG_INVALID"); },
      },
      {
        stage: "tutor_runtime_import",
        run: async () => {
          providerInvoked = true;
          return { providerCallAttempted: true };
        },
      },
    ]);

    expect(result.reasonCode).toBe("PEDAGOGY_STARTUP_CONFIG_INVALID");
    expect(providerInvoked).toBe(false);
  });

  test("maps Drizzle and schema failures to stable masked codes", () => {
    expect(maskedPedagogyStartupReason({ name: "DrizzleQueryError" }, "identity"))
      .toBe("PEDAGOGY_STARTUP_DATABASE_QUERY_FAILED");
    expect(maskedPedagogyStartupReason({ name: "ZodError" }, "tutor_runtime_import"))
      .toBe("PEDAGOGY_STARTUP_ENV_SCHEMA_INVALID");
    expect(maskedPedagogyStartupReason(new Error("ordinary failure"), "tutor_runtime_import"))
      .toBe("PEDAGOGY_STARTUP_TUTOR_RUNTIME_IMPORT_FAILED");
  });

  test("retains only masked scalar metadata for missing runtime configuration", async () => {
    const result = await runMaskedPedagogyStartupDiagnostics([
      {
        stage: "runtime_env_contract",
        run: async () => {
          throw new PedagogyStartupDiagnosticError(
            "PEDAGOGY_STARTUP_RUNTIME_ENV_MISSING_REQUIRED_CONFIG",
            { missingRequiredConfigCount: 2 },
          );
        },
      },
    ]);

    expect(result.stages[0]).toEqual({
      stage: "runtime_env_contract",
      status: "failed",
      reasonCode: "PEDAGOGY_STARTUP_RUNTIME_ENV_MISSING_REQUIRED_CONFIG",
      metadata: { missingRequiredConfigCount: 2 },
    });
  });

  test("scoped Zyra runtime env does not require UploadThing or Resend", () => {
    const runtime = createZyraRuntimeEnv({
      ZYX_ENVIRONMENT: "staging",
      STAGING_ZYRA_PEDAGOGY_USER_ID: "shadow-user",
      GEMINI_API_KEY: "test-key",
      CF_AI_GATEWAY_URL: "https://gateway.example.test",
      VECTORIZE_WORKER_URL: "https://vector.example.test",
      UPLOADTHING_TOKEN: undefined,
      RESEND_API_KEY: undefined,
    });

    expect(runtime.ZYX_ENVIRONMENT).toBe("staging");
    expect(runtime.STAGING_ZYRA_PEDAGOGY_USER_ID).toBe("shadow-user");
    expect(runtime).not.toHaveProperty("UPLOADTHING_TOKEN");
    expect(runtime).not.toHaveProperty("RESEND_API_KEY");
  });

  test("canonical and tutor runtimes import without unrelated credentials or network", async () => {
    const script = `
      globalThis.fetch = async () => { throw new Error("UNEXPECTED_NETWORK_CALL"); };
      const canonical = await import("./lib/zyra/canonical-runtime.ts");
      const tutor = await import("./lib/tutor-rag.ts");
      if (typeof canonical.retrieveCanonicalEvidence !== "function") process.exit(2);
      if (typeof tutor.askTutorRag !== "function") process.exit(3);
      console.log("SCOPED_ZYRA_RUNTIME_IMPORT_OK");
    `;
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        UPLOADTHING_TOKEN: "",
        RESEND_API_KEY: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    if (exitCode !== 0) {
      const maskedError = stderr
        .replace(/https?:\/\/\S+/g, "[masked-url]")
        .replace(/(token|key|secret|cookie|session)\s*[:=]\s*\S+/gi, "$1=[masked]");
      throw new Error(`Scoped runtime import failed: ${maskedError}`);
    }
    expect(exitCode).toBe(0);
    expect(stdout).toContain("SCOPED_ZYRA_RUNTIME_IMPORT_OK");
    expect(`${stdout}\n${stderr}`).not.toContain("UNEXPECTED_NETWORK_CALL");
  }, 20_000);
});
