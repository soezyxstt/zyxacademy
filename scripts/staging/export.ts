import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import {
  assertStagingEnvironment,
  parseEnvFile,
  resolveDatabaseConnection,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  artifactDirectory,
  hmacText,
  parseCliArgs,
  requiredCliArg,
  requireManifestKey,
  sha256Text,
  stableStringify,
  stableValue,
} from "@/lib/staging/migration-ledger";

type Row = Record<string, unknown>;
type ForeignKeyEdge = { source: string; target: string };
type RedactionPlan = { groupByNode: Map<string, string>; redactedGroups: Set<string> };

const SECRET_COLUMN_PATTERN = /(token|secret|password|private|api[_-]?key|client[_-]?secret|access[_-]?key|refresh[_-]?token|id[_-]?token|authorization|cookie)/i;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function rows(result: { rows: unknown[] }): Row[] {
  return result.rows as Row[];
}

function encryptionKey(secret: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(secret)) return Buffer.from(secret, "hex");
  return createHash("sha256").update(secret, "utf8").digest();
}

function nodeKey(tableName: string, column: string): string {
  return `${tableName}.${column}`;
}

function isSecretColumn(column: string): boolean {
  return SECRET_COLUMN_PATTERN.test(column);
}

async function buildRedactionPlan(
  client: ReturnType<typeof createClient>,
  tables: Array<{ name: string }>,
): Promise<RedactionPlan> {
  const nodes = new Set<string>();
  const edges: ForeignKeyEdge[] = [];
  for (const table of tables) {
    const columns = await client.execute(`PRAGMA table_info(${quoteIdentifier(table.name)})`);
    for (const column of rows(columns)) nodes.add(nodeKey(table.name, String(column.name)));
    const foreignKeys = await client.execute(`PRAGMA foreign_key_list(${quoteIdentifier(table.name)})`);
    for (const foreignKey of rows(foreignKeys)) {
      const sourceColumn = String(foreignKey.from ?? "");
      const targetTable = String(foreignKey.table ?? "");
      const targetColumn = String(foreignKey.to ?? "");
      if (!sourceColumn || !targetTable || !targetColumn) continue;
      edges.push({
        source: nodeKey(table.name, sourceColumn),
        target: nodeKey(targetTable, targetColumn),
      });
      nodes.add(nodeKey(table.name, sourceColumn));
      nodes.add(nodeKey(targetTable, targetColumn));
    }
  }

  const parent = new Map<string, string>();
  for (const node of nodes) parent.set(node, node);
  const find = (node: string): string => {
    const current = parent.get(node) ?? node;
    if (current === node) return current;
    const root = find(current);
    parent.set(node, root);
    return root;
  };
  const union = (left: string, right: string): boolean => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return false;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second, first);
    return true;
  };
  const isSensitiveGroup = (node: string): boolean => {
    const root = find(node);
    for (const candidate of nodes) {
      if (find(candidate) === root) {
        const column = candidate.slice(candidate.indexOf(".") + 1);
        if (isSecretColumn(column)) return true;
      }
    }
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (isSensitiveGroup(edge.source) || isSensitiveGroup(edge.target)) {
        changed = union(edge.source, edge.target) || changed;
      }
    }
  }

  const groupByNode = new Map<string, string>();
  const redactedGroups = new Set<string>();
  for (const node of nodes) {
    const group = find(node);
    groupByNode.set(node, group);
    if (isSensitiveGroup(node)) redactedGroups.add(group);
  }
  return { groupByNode, redactedGroups };
}

function redactRow(
  row: Row,
  tableName: string,
  manifestKey: string,
  redactionPlan: RedactionPlan,
): { row: Row; columns: string[] } {
  const redactedColumns: string[] = [];
  const redacted: Row = {};
  for (const [column, value] of Object.entries(row)) {
    const group = redactionPlan.groupByNode.get(nodeKey(tableName, column));
    if (group && redactionPlan.redactedGroups.has(group)) {
      redacted[column] = value === null || value === undefined
        ? null
        : `[REDACTED:${hmacText(manifestKey, `${group}:${stableStringify(value)}`).slice(0, 24)}]`;
      redactedColumns.push(column);
    } else {
      redacted[column] = stableValue(value);
    }
  }
  return { row: redacted, columns: redactedColumns.sort() };
}

async function primaryKeyColumns(client: ReturnType<typeof createClient>, tableName: string): Promise<string[]> {
  const result = await client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  return rows(result)
    .filter((row) => Number(row.pk ?? 0) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((row) => String(row.name));
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");

  try {
    const manifestKey = requireManifestKey();
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const connection = resolveDatabaseConnection(process.env);
    const client = createClient(connection);
    try {
      const schemaResult = await client.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type, name",
      );
      const schemaObjects = rows(schemaResult).map((row) => ({
        type: String(row.type),
        name: String(row.name),
        tableName: String(row.tbl_name ?? ""),
        sql: String(row.sql),
      }));
      const tables = schemaObjects.filter((object) => object.type === "table").sort((left, right) => left.name.localeCompare(right.name));
      const schemaEntries = schemaObjects
        .filter((object) => object.type === "table")
        .map((object) => ({ kind: "schema", ...object }));
      const secondarySchemaEntries = schemaObjects
        .filter((object) => object.type !== "table")
        .map((object) => ({ kind: "schema", ...object }));
      const redactionPlan = await buildRedactionPlan(client, tables);
      const lines: string[] = [];
      const tableSummaries: Array<{ name: string; rowCount: number; primaryKeyColumns: string[]; redactedColumns: string[] }> = [];
      for (const entry of schemaEntries) lines.push(stableStringify(entry));
      for (const table of tables) {
        const primaryKeys = await primaryKeyColumns(client, table.name);
        const redactedColumns = new Set<string>();
        const orderBy = primaryKeys.length > 0
          ? ` ORDER BY ${primaryKeys.map(quoteIdentifier).join(", ")}`
          : "";
        const result = await client.execute(`SELECT * FROM ${quoteIdentifier(table.name)}${orderBy}`);
        for (const row of rows(result)) {
          const redacted = redactRow(row, table.name, manifestKey, redactionPlan);
          for (const column of redacted.columns) redactedColumns.add(column);
          lines.push(stableStringify({
            kind: "row",
            table: table.name,
            data: redacted.row,
          }));
        }
        tableSummaries.push({
          name: table.name,
          rowCount: result.rows.length,
          primaryKeyColumns: primaryKeys,
          redactedColumns: [...redactedColumns].sort(),
        });
      }
      for (const entry of secondarySchemaEntries) lines.push(stableStringify(entry));

      const plaintext = Buffer.from(`${lines.join("\n")}\n`, "utf8");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey(manifestKey), iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedArchive = JSON.stringify({
        version: 1,
        algorithm: "aes-256-gcm",
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      });

      const backupDirectory = join(artifactDirectory(runId), "backup");
      await mkdir(backupDirectory, { recursive: true });
      const archivePath = join(backupDirectory, "staging-export.enc.json");
      await writeFile(archivePath, `${encryptedArchive}\n`, "utf8");
      const cipherHash = sha256Text(encryptedArchive);
      const manifest = {
        version: 1,
        runId,
        algorithm: "aes-256-gcm",
        archiveFile: "staging-export.enc.json",
        cipherSha256: cipherHash,
        cipherBytes: Buffer.byteLength(encryptedArchive, "utf8"),
        plaintextBytes: plaintext.byteLength,
        tableCount: tables.length,
        tables: tableSummaries,
        keyedManifestHash: hmacText(manifestKey, lines.join("\n")),
      };
      await writeFile(join(backupDirectory, "cipher-manifest.json"), `${stableStringify(manifest)}\n`, "utf8");
      console.log(JSON.stringify({
        status: "ok",
        runId,
        tableCount: tables.length,
        cipherSha256: cipherHash,
        archive: "backup/staging-export.enc.json",
        manifest: "backup/cipher-manifest.json",
      }));
    } finally {
      client.close();
    }
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
