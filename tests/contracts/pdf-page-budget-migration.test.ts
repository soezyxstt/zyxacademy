import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

test("relaxing the PDF budget preserves evidence and permits exactly 1 to 4 pages", () => {
  const db = new Database(":memory:");
  try {
    db.run("PRAGMA foreign_keys=OFF");
    db.run("CREATE TABLE impor_bundle (id text PRIMARY KEY)");
    db.run("CREATE TABLE pengguna (id text PRIMARY KEY)");
    const migrate = (file: string) => {
      for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
        if (statement.trim()) db.run(statement);
      }
    };
    migrate("0087_curly_black_tom.sql");
    migrate("0088_talented_shinobi_shaw.sql");
    db.run("INSERT INTO impor_bundle VALUES ('bundle')");
    const insert = db.prepare("INSERT INTO bukti_pdf_bundle (id, impor_bundle_id, product_id, article_version, article_hash, diktat_hash, renderer_version, print_profile, storage_key, page_count, status) VALUES (?, 'bundle', ?, 1, 'article-hash', ?, 'renderer', 'profile', 'protected.pdf', ?, 'ready')");
    insert.run("existing", "diktat", "original", 3);
    const before = db.query("SELECT * FROM bukti_pdf_bundle WHERE id='existing'").get();
    migrate("0097_mushy_bushwacker.sql");
    expect(db.query("SELECT * FROM bukti_pdf_bundle WHERE id='existing'").get()).toEqual(before);
    const currentInsert = db.prepare("INSERT INTO bukti_pdf_bundle (id, impor_bundle_id, product_id, article_version, article_hash, diktat_hash, renderer_version, print_profile, page_count, status) VALUES (?, 'bundle', ?, 1, 'article-hash', ?, 'renderer', 'profile', ?, 'ready')");
    for (const pages of [1, 2, 3, 4]) currentInsert.run(`valid-${pages}`, `product-${pages}`, `hash-${pages}`, pages);
    for (const pages of [0, 5]) expect(() => currentInsert.run(`invalid-${pages}`, `invalid-${pages}`, `invalid-${pages}`, pages)).toThrow(/CHECK constraint failed/);
    expect(db.query("SELECT count(*) AS n FROM bukti_pdf_bundle").get()).toEqual({ n: 5 });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.query("PRAGMA index_list('bukti_pdf_bundle')").all().length).toBe(7);
  } finally {
    db.close();
  }
});
