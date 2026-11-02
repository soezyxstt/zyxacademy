import { afterAll, mock } from "bun:test";
import { createPostgresTestDb } from "./postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
afterAll(() => client.close());
