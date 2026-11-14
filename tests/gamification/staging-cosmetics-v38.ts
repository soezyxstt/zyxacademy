/** Explicit guarded staging check. Uses real services and synthetic users only. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { build } from 'esbuild';

const host = 'ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech';
const root = process.cwd();
const prefix = `zyx-cosmetics-v38-${randomUUID()}`;
const actors = [`${prefix}-owner`, `${prefix}-other`];
const report: Record<string, unknown> = { target: { host, database: 'neondb', branch: 'br-gentle-scene-azq0gp91' }, auth: 'Direct service check. Session authentication is not exercised.', passed: false };

async function main() {
  assert.equal(process.env.RUN_GAMIFICATION_STAGING_CHECKS, '1', 'Explicit staging opt-in is required');
  const url = new URL(process.env.DATABASE_URL || '');
  assert(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === host && url.pathname === '/neondb' && !url.searchParams.has('host'), 'Staging target mismatch');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000 });
  let appPool: { end(): Promise<void> } | undefined;
  let fixturesStarted = false;
  try {
    const guard = await pool.connect();
    try {
      await guard.query('begin read only');
      const identity = (await guard.query("select current_database() db, current_schema() schema, current_setting('transaction_read_only') ro")).rows[0];
      assert.deepEqual(identity, { db: 'neondb', schema: 'public', ro: 'on' });
      const journal = JSON.parse(await readFile(path.join(root, 'drizzle-postgres/meta/_journal.json'), 'utf8'));
      const entry = journal.entries.find((item: { idx: number }) => item.idx === 16);
      assert(entry);
      const hash = createHash('sha256').update(await readFile(path.join(root, `drizzle-postgres/${entry.tag}.sql`))).digest('hex');
      const migration = await guard.query('select hash from drizzle.__drizzle_migrations where created_at = $1', [entry.when]);
      assert.equal(migration.rows[0]?.hash, hash, 'Migration 0016 is not applied');
      const columns = await guard.query("select column_name,is_nullable from information_schema.columns where table_schema='public' and table_name='gamification_profiles' and column_name = any($1::text[]) order by column_name", [['equipped_zyra_skin_id', 'equipped_zyra_avatar_id']]);
      assert.equal(columns.rowCount, 2);
      assert(columns.rows.every(row => row.is_nullable === 'YES'));
      report.guard = { ...identity, migrationHash: hash, nullableColumns: columns.rows };
      await guard.query('commit');
    } catch (error) { await guard.query('rollback'); throw error; } finally { guard.release(); }

    const bundled = await build({ stdin: { contents: "export {purchaseGamificationCosmetic,equipGamificationCosmetics,seedGamificationCosmetics} from './lib/gamification/rewards'; export {getEquippedZyraAppearance} from './lib/gamification/queries'; export {COSMETIC_CATALOG} from './lib/gamification/catalog'; export {pool} from './lib/db';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'server-marker', setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: '', loader: 'js' }));
    }}] });
    const Module = require('node:module');
    const mod = new Module(path.join(root, 'fixture-cosmetics.cjs'), module);
    mod.filename = path.join(root, 'fixture-cosmetics.cjs'); mod.paths = module.paths;
    mod._compile(bundled.outputFiles[0].text, mod.filename);
    const app = mod.exports; appPool = app.pool;
    const catalogIds = app.COSMETIC_CATALOG.map((item: { id: string }) => item.id);
    const readCatalog = async () => (await pool.query('select id,slot,price_lp from gamification_cosmetics where id = any($1::text[]) order by id', [catalogIds])).rows;
    report.catalogBefore = await readCatalog();
    await app.seedGamificationCosmetics();
    const catalog = await readCatalog(); assert.equal(catalog.length, app.COSMETIC_CATALOG.length);
    await app.seedGamificationCosmetics(); assert.deepEqual(await readCatalog(), catalog);
    for (const item of app.COSMETIC_CATALOG) {
      const actual = catalog.find(row => row.id === item.id);
      assert.equal(actual?.slot, item.slot); assert.equal(Number(actual?.price_lp), item.priceLp);
    }
    report.catalogAfter = catalog;

    const counts = async () => {
      const values: Record<string, number> = {};
      for (const table of ['gamification_inventory', 'gamification_lp_ledger', 'gamification_accounts', 'gamification_profiles']) values[table] = Number((await pool.query(`select count(*) n from ${table} where user_id = any($1::text[])`, [actors])).rows[0].n);
      values.users = Number((await pool.query('select count(*) n from "user" where id = any($1::text[])', [actors])).rows[0].n);
      return values;
    };
    report.fixturesBefore = await counts();
    assert(Object.values(report.fixturesBefore as Record<string, number>).every(value => value === 0));
    fixturesStarted = true;
    for (const id of actors) {
      await pool.query('insert into "user" (id,name,email,role) values ($1,$2,$3,$4)', [id, 'Cosmetic fixture', `${id}@example.invalid`, 'student']);
      await pool.query('insert into gamification_profiles (user_id,public_id) values ($1,$2)', [id, `${id}-public`]);
      await pool.query('insert into gamification_accounts (user_id,lp_balance) values ($1,$2)', [id, id === actors[0] ? 5000 : 1]);
      await pool.query("insert into gamification_lp_ledger (id,user_id,reward_key,amount,reason) values ($1,$2,'fixture:opening',$3,'fixture')", [randomUUID(), id, id === actors[0] ? 5000 : 1]);
    }
    const frameId = 'frame-classic', skinId = 'zyra-skin-bara', avatarId = 'zyra-avatar-komodo';
    await app.purchaseGamificationCosmetic(actors[0], frameId);
    await Promise.all([app.purchaseGamificationCosmetic(actors[0], skinId), app.purchaseGamificationCosmetic(actors[0], skinId)]);
    await app.purchaseGamificationCosmetic(actors[0], avatarId);
    const expectedDebit = [frameId, skinId, avatarId].reduce((sum, id) => sum + Number(catalog.find(row => row.id === id).price_lp), 0);
    const inventory = await pool.query('select cosmetic_id from gamification_inventory where user_id=$1', [actors[0]]); assert.equal(inventory.rowCount, 3);
    const ledger = (await pool.query("select count(*)::int n,sum(amount)::int amount from gamification_lp_ledger where user_id=$1 and reason='purchase'", [actors[0]])).rows[0];
    assert.deepEqual(ledger, { n: 3, amount: -expectedDebit });
    const balance = Number((await pool.query('select lp_balance from gamification_accounts where user_id=$1', [actors[0]])).rows[0].lp_balance);
    assert.equal(balance, 5000 - expectedDebit);
    await assert.rejects(() => app.purchaseGamificationCosmetic(actors[1], frameId), /INSUFFICIENT_LP/);
    await assert.rejects(() => app.purchaseGamificationCosmetic(actors[0], 'unknown'), /COSMETIC_UNAVAILABLE/);
    await app.equipGamificationCosmetics(actors[0], { frameId, zyraSkinId: skinId, zyraAvatarId: avatarId });
    assert.deepEqual(await app.getEquippedZyraAppearance(actors[0]), { skinId, avatarId });
    await assert.rejects(() => app.equipGamificationCosmetics(actors[0], { zyraSkinId: avatarId }), /INVALID_COSMETIC_SLOT/);
    await assert.rejects(() => app.equipGamificationCosmetics(actors[1], { zyraSkinId: skinId }), /COSMETIC_NOT_OWNED/);
    await app.equipGamificationCosmetics(actors[0], { zyraAvatarId: null });
    assert.deepEqual(await app.getEquippedZyraAppearance(actors[0]), { skinId, avatarId: null });
    const profile = (await pool.query('select equipped_frame_id,equipped_zyra_skin_id,equipped_zyra_avatar_id from gamification_profiles where user_id=$1', [actors[0]])).rows[0];
    assert.deepEqual(profile, { equipped_frame_id: frameId, equipped_zyra_skin_id: skinId, equipped_zyra_avatar_id: null });
    assert.deepEqual(await app.getEquippedZyraAppearance(actors[1]), { skinId: null, avatarId: null });
    report.transactions = { purchaseCount: 3, debitedLp: expectedDebit, balance, duplicateAndConcurrentPurchase: true, wrongSlotRejected: true, unownedRejected: true, insufficientRejected: true, partialUpdatePreservedFrameAndSkin: true, privateAppearanceOwnedOnly: true };
    report.passed = true;
  } finally {
    if (fixturesStarted) {
      const cleanup = await pool.connect();
      try {
        await cleanup.query('begin');
        for (const table of ['gamification_inventory', 'gamification_lp_ledger', 'gamification_accounts', 'gamification_profiles']) await cleanup.query(`delete from ${table} where user_id = any($1::text[])`, [actors]);
        await cleanup.query('delete from "user" where id = any($1::text[])', [actors]);
        await cleanup.query('commit');
      } catch (error) { await cleanup.query('rollback'); throw error; } finally { cleanup.release(); }
      const residual = await pool.query('select (select count(*) from "user" where id=any($1::text[])) + (select count(*) from gamification_inventory where user_id=any($1::text[])) + (select count(*) from gamification_lp_ledger where user_id=any($1::text[])) + (select count(*) from gamification_profiles where user_id=any($1::text[])) + (select count(*) from gamification_accounts where user_id=any($1::text[])) as remaining', [actors]);
      report.fixtureRowsAfter = Number(residual.rows[0].remaining); assert.equal(report.fixtureRowsAfter, 0);
    }
    await writeFile(path.join(root, 'artifacts/gamification/staging-cosmetics-v38.json'), JSON.stringify(report, null, 2) + '\n');
    if (appPool) await appPool.end();
    await pool.end();
  }
  console.log('PASS: staged catalog, purchase concurrency, LP, ownership, partial equip, private appearance and fixture cleanup');
}
main().catch(error => { console.error(`Staging cosmetics check failed: ${error?.code || error?.name || 'Error'}`); process.exitCode = 1; });
