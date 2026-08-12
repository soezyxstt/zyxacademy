import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { SqlExecutor, SqlValue } from "../src/quota/schema";

export class BunSqliteHarness implements SqlExecutor {
  readonly database = new Database(":memory:");

  exec<T extends Record<string, SqlValue>>(query: string, ...bindings: unknown[]) {
    const isRead = /^(SELECT|WITH|PRAGMA)\b/i.test(query.trim());
    if (!isRead) {
      const run = this.database.run.bind(this.database) as unknown as (sql: string, ...values: SQLQueryBindings[]) => unknown;
      run(query, ...(bindings as SQLQueryBindings[]));
      return { toArray: () => [] as T[] };
    }
    const statement = this.database.query(query) as unknown as {
      all(...values: SQLQueryBindings[]): T[];
    };
    return {
      toArray: () => statement.all(...(bindings as SQLQueryBindings[])) as T[]
    };
  }

  close(): void {
    this.database.close();
  }
}
