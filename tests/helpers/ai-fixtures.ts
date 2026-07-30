import { readFileSync } from "node:fs";
import { join } from "node:path";

export const EXPECTED_SCHEMA_VERSION = "1.0";

export interface BaseFixtureFile<T = unknown> {
  schemaVersion: string;
  requirementId: string;
  fixtures: Record<string, T>;
}

export function loadAiFixture<T = unknown>(filename: string): BaseFixtureFile<T> {
  const filePath = join(process.cwd(), "tests", "fixtures", "ai", filename);
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as BaseFixtureFile<T>;

  if (!data.schemaVersion || data.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Unknown fixture schema version "${data.schemaVersion}" in ${filename}. Expected "${EXPECTED_SCHEMA_VERSION}".`
    );
  }

  if (!data.requirementId) {
    throw new Error(`Missing requirementId in fixture file ${filename}.`);
  }

  return data;
}
