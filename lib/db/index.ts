import { drizzle } from "drizzle-orm/libsql/web";
import { createClient as createWebClient } from "@libsql/client/web";
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
  // Local development / build SQLite
  const isWeb =
    typeof window !== "undefined" ||
    !globalThis.process ||
    !globalThis.process.versions ||
    !globalThis.process.versions.node;

  const localUrl = isWeb
    ? "https://local-sqlite-placeholder.internal"
    : (url || "file:dev.db");

  if (localUrl.startsWith("libsql://") || localUrl.startsWith("https://") || localUrl.startsWith("http://")) {
    client = createWebClient({ url: localUrl, authToken });
  } else {
    // For local file: SQLite (e.g. dev.db), load node client via dynamic require so Turbopack does not trace native addons into production
    const getNodeClient = () => {
      try {
        const req = typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : eval("require");
        const pkg = ["@", "libsql", "/", "client"].join("");
        return req(pkg).createClient;
      } catch {
        return createWebClient;
      }
    };
    const createNodeClient = getNodeClient();
    client = createNodeClient({ url: localUrl });
  }
}

export const db = drizzle(client, { schema });
