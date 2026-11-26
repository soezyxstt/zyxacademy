import type { NativeSessionScope } from "../../network/transport";
import type { StudentServices } from "./contracts";

type Locale = "en" | "id";
type DraftScope = NativeSessionScope & { locale: Locale };
type Drafts = NonNullable<StudentServices["drafts"]>;

export interface AssessmentDraftDatabase {
  execAsync(statement: string): Promise<void>;
  runAsync(statement: string, ...parameters: string[]): Promise<unknown>;
  getFirstAsync<T>(statement: string, ...parameters: string[]): Promise<T | null>;
  closeAsync(): Promise<void>;
}

const initDrafts = `
  PRAGMA secure_delete = ON;
  CREATE TABLE IF NOT EXISTS assessment_drafts (
    origin TEXT NOT NULL,
    account_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    draft_key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (origin, account_id, session_id, locale, draft_key)
  ) WITHOUT ROWID;
`;

const matchingDraft = "origin = ? AND account_id = ? AND session_id = ? AND locale = ? AND draft_key = ?";
export const DISCUSSION_DRAFT_KEY = "discussion:v1";
const validDraftKey = /^assessment:(quiz|tryout|start):.+:.+$/u;

export function createAssessmentDraftRepository(open: () => Promise<AssessmentDraftDatabase>) {
  let database: AssessmentDraftDatabase | undefined;
  let pending: Promise<void> = Promise.resolve();

  async function getDatabase() {
    if (database) return database;
    const opened = await open();
    try {
      await opened.execAsync(initDrafts);
      database = opened;
      return opened;
    } catch (error) {
      await opened.closeAsync().catch(() => {});
      throw error;
    }
  }

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = pending.then(run);
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  function bind(scope: DraftScope, assertCurrent: () => void) {
    const { origin, accountId, sessionId, locale } = scope;
    const scoped = [origin, accountId, sessionId, locale];
    let reconciled = false;

    async function reconcileOrphans(db: AssessmentDraftDatabase): Promise<void> {
      if (reconciled) return;
      // The installed app accepts one verified session at an origin. Reconcile
      // records left if the previous session ended with its UI unmounted.
      await db.runAsync(
        "DELETE FROM assessment_drafts WHERE origin = ? AND (account_id != ? OR session_id != ?)",
        origin, accountId, sessionId,
      );
      reconciled = true;
    }

    function useDatabase<T>(operation: (db: AssessmentDraftDatabase) => Promise<T>): Promise<T> {
      return enqueue(async () => {
        assertCurrent();
        const db = await getDatabase();
        assertCurrent();
        await reconcileOrphans(db);
        assertCurrent();
        const result = await operation(db);
        assertCurrent();
        return result;
      });
    }

    function checkKey(key: string): void {
      if (key !== DISCUSSION_DRAFT_KEY && !(key.startsWith("coding:playground:") && key.length <= 3000) && !validDraftKey.test(key)) throw new Error("Invalid assessment draft key");
    }

    async function read(db: AssessmentDraftDatabase, key: string) {
      const draft = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM assessment_drafts WHERE ${matchingDraft}`, ...scoped, key,
      );
      return draft?.value ?? null;
    }

    async function write(db: AssessmentDraftDatabase, key: string, value: string | null) {
      if (value === null) {
        await db.runAsync(`DELETE FROM assessment_drafts WHERE ${matchingDraft}`, ...scoped, key);
        return;
      }
      await db.runAsync(
        `INSERT INTO assessment_drafts (origin, account_id, session_id, locale, draft_key, value)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(origin, account_id, session_id, locale, draft_key)
         DO UPDATE SET value = excluded.value`,
        ...scoped, key, value,
      );
    }

    const drafts: Drafts = {
      async get(key) {
        checkKey(key);
        return useDatabase(db => read(db, key));
      },
      async set(key, value) {
        checkKey(key);
        return useDatabase(db => write(db, key, value));
      },
      async remove(key) {
        checkKey(key);
        return useDatabase(db => write(db, key, null));
      },
      async update(key, change) {
        checkKey(key);
        return useDatabase(async db => {
          const current = await read(db, key);
          assertCurrent();
          const value = change(current);
          if (value !== current) await write(db, key, value);
        });
      },
    };

    return { drafts, reconcile: () => useDatabase(async () => {}) };
  }

  function purgeSession({ origin, accountId, sessionId }: NativeSessionScope) {
    return enqueue(async () => {
      const db = await getDatabase();
      await db.runAsync("DELETE FROM assessment_drafts WHERE origin = ? AND account_id = ? AND session_id = ?", origin, accountId, sessionId);
    });
  }

  return { bind, purgeSession };
}
