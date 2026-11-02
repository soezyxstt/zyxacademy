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
  const localUrl = url || "file:dev.db";

  if (localUrl.startsWith("libsql://") || localUrl.startsWith("https://") || localUrl.startsWith("http://")) {
    client = createWebClient({ url: localUrl, authToken });
  } else {
    // Next externalizes @libsql/client, so native SQLite loads only on this path.
    // Remote Turso continues to use the web client above.
    const { createClient: createNodeClient } = require("@libsql/client") as typeof import("@libsql/client");
    client = createNodeClient({ url: localUrl });
  }
}

export const db = drizzle(client, { schema });
