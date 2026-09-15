import { drizzle } from "drizzle-orm/libsql/web";
import { createClient as createWebClient } from "@libsql/client/web";
import { createRequire } from "node:module";
import * as schema from "@/db/schema";

const url =
  process.env.TURSO_DATABASE_URL ||
  process.env.TURSO_CONNECTION_URL ||
  (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgres")
    ? process.env.DATABASE_URL
    : undefined);

const authToken = process.env.TURSO_AUTH_TOKEN;

const isRemoteTurso =
  Boolean(url) &&
  (url!.startsWith("libsql://") ||
    url!.startsWith("https://") ||
    url!.startsWith("http://") ||
    url!.startsWith("wss://") ||
    url!.startsWith("ws://"));

let client;
if (isRemoteTurso) {
  client = createWebClient({ url: url!, authToken });
} else {
  const localUrl = url || "file:dev.db";

  if (localUrl.startsWith("libsql://") || localUrl.startsWith("https://") || localUrl.startsWith("http://")) {
    client = createWebClient({ url: localUrl, authToken });
  } else {
    // For local file: SQLite (e.g. dev.db), load node client via dynamic require so Turbopack does not trace native addons into production
    const getNodeClient = () => {
      try {
        const nonWebpackReq = (globalThis as any).__non_webpack_require__;
        if (typeof nonWebpackReq !== "undefined") {
          return nonWebpackReq(["@", "libsql", "/", "client"].join("")).createClient;
        }
        let req;
        try {
          req = createRequire(import.meta.url);
        } catch {
          req = createRequire(process.cwd() + "/package.json");
        }
        return req(["@", "libsql", "/", "client"].join("")).createClient;
      } catch {
        try {
          const req = createRequire(process.cwd() + "/package.json");
          return req(["@", "libsql", "/", "client"].join("")).createClient;
        } catch {
          return createWebClient;
        }
      }
    };

    try {
      const createNodeClient = getNodeClient();
      client = createNodeClient({ url: localUrl });
    } catch {
      client = createWebClient({ url: "https://local-sqlite-placeholder.internal", authToken });
    }
  }
}

export const db = drizzle(client, { schema });
