/** Local PostgreSQL checks. The real reward service runs against an isolated PGlite database. */
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { build } from 'esbuild';
import { COSMETIC_CATALOG } from '../../lib/gamification/catalog';
import * as schema from '../../db/schema';

const client = await PGlite.create({ parsers: { 20: Number } });
const fixtureDb = drizzle(client, { schema });
type Rewards = typeof import('../../lib/gamification/rewards');
let rewards: Rewards;
const studioIds = ['zyra-avatar-studio-tiger', 'zyra-avatar-studio-rhino', 'zyra-avatar-studio-crocodile'];

beforeAll(async () => {
  // A scoped require keeps database substitution out of Bun's shared module cache.
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await build({
    entryPoints: [`${root}lib/gamification/rewards.ts`],
    absWorkingDir: root,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    packages: 'external',
    tsconfig: `${root}tsconfig.json`,
    plugins: [{ name: 'isolated-reward-database', setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: '@/db', external: true }));
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: '', loader: 'js' }));
    } }],
  });
  const scopedModule = { exports: {} as Rewards };
  const require = createRequire(import.meta.url);
  const scopedRequire = (id: string) => id === '@/db' ? { db: fixtureDb } : require(id);
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(scopedRequire, scopedModule, scopedModule.exports);
  rewards = scopedModule.exports;

  await client.exec(`
    create table "user" (id text primary key);
    create table gamification_accounts (
      user_id text primary key references "user", base_xp_micro bigint not null default 0,
      bonus_xp_micro bigint not null default 0, course_credits_micro bigint not null default 0,
      lp_balance bigint not null default 0, rank_key text not null default 'rakyat',
      updated_at timestamptz not null default now()
    );
    create table gamification_cosmetics (
      id text primary key, name text not null, slot text not null,
      price_lp bigint not null check (price_lp >= 0), active boolean not null default true
    );
    create table gamification_inventory (
      user_id text not null references "user", cosmetic_id text not null references gamification_cosmetics,
      acquired_at timestamptz not null default now(), primary key (user_id, cosmetic_id)
    );
    create table gamification_lp_ledger (
      id text primary key, user_id text not null references "user", reward_key text not null,
      amount bigint not null, reason text not null, created_at timestamptz not null default now(),
      unique (user_id, reward_key)
    );
    create table gamification_profiles (
      user_id text primary key references "user", public_id text not null unique, display_name text,
      visibility text not null default 'members', show_major boolean not null default false,
      show_faculty boolean not null default false, allow_follows boolean not null default false,
      leaderboard_opt_in boolean not null default false, avatar_mode text not null default 'photo',
      badge_tier bigint, avatar_badge_id text, featured_badge_ids jsonb not null default '[]',
      equipped_frame_id text, equipped_theme_id text, equipped_title_id text,
      equipped_pet_action_id text, equipped_pet_suit_id text, equipped_zyra_skin_id text, equipped_zyra_avatar_id text,
      follower_count bigint not null default 0, following_count bigint not null default 0,
      updated_at timestamptz not null default now()
    );
  `);
});

beforeEach(async () => {
  await client.exec('truncate "user", gamification_accounts, gamification_cosmetics, gamification_inventory, gamification_lp_ledger, gamification_profiles');
  await rewards.seedGamificationCosmetics();
  await client.query('insert into "user" values ($1), ($2)', ['owner', 'other']);
  await client.query('insert into gamification_accounts (user_id, lp_balance) values ($1, $2), ($3, $4)', ['owner', 5000, 'other', 10]);
  await client.query('insert into gamification_profiles (user_id, public_id) values ($1, $2), ($3, $4)', ['owner', 'owner-public', 'other', 'other-public']);
});

afterAll(async () => { await client.close(); });

async function balance(id = 'owner') {
  return (await client.query<{ lp_balance: number }>('select lp_balance from gamification_accounts where user_id = $1', [id])).rows[0].lp_balance;
}

test('paid mascots use one purchase entitlement and replay without another debit', async () => {
  const total = studioIds.reduce((sum, id) => sum + COSMETIC_CATALOG.find(item => item.id === id)!.priceLp, 0);
  for (const id of studioIds) {
    await rewards.purchaseGamificationCosmetic('owner', id);
    await rewards.purchaseGamificationCosmetic('owner', id);
  }
  expect(await balance()).toBe(5000 - total);
  expect((await client.query('select cosmetic_id from gamification_inventory where user_id = $1', ['owner'])).rows).toHaveLength(studioIds.length);
  const ledger = (await client.query<{ count: number; amount: number }>("select count(*)::int count, sum(amount)::int amount from gamification_lp_ledger where reason = 'purchase'")).rows[0];
  expect(ledger).toEqual({ count: studioIds.length, amount: -total });
});

test('repeated pending purchases of the same mascot grant one item', async () => {
  await Promise.all([rewards.purchaseGamificationCosmetic('owner', studioIds[0]), rewards.purchaseGamificationCosmetic('owner', studioIds[0])]);
  expect(await balance()).toBe(4100);
  expect((await client.query('select cosmetic_id from gamification_inventory')).rows).toHaveLength(1);
  expect((await client.query('select id from gamification_lp_ledger')).rows).toHaveLength(1);
});

test('insufficient LP, inactive and unknown mascots leave balances and inventory untouched', async () => {
  await assert.rejects(rewards.purchaseGamificationCosmetic('other', studioIds[0]), /INSUFFICIENT_LP/);
  await client.query('update gamification_cosmetics set active = false where id = $1', [studioIds[0]]);
  await assert.rejects(rewards.purchaseGamificationCosmetic('owner', studioIds[0]), /COSMETIC_UNAVAILABLE/);
  await assert.rejects(rewards.purchaseGamificationCosmetic('owner', 'zyra-avatar-unknown'), /COSMETIC_UNAVAILABLE/);
  expect(await balance()).toBe(5000);
  expect(await balance('other')).toBe(10);
  expect((await client.query('select cosmetic_id from gamification_inventory')).rows).toHaveLength(0);
  expect((await client.query('select id from gamification_lp_ledger')).rows).toHaveLength(0);
});

test('server catalog price controls the debit and seeding preserves existing rows', async () => {
  await client.query('update gamification_cosmetics set price_lp = 750 where id = $1', [studioIds[0]]);
  await rewards.seedGamificationCosmetics();
  await rewards.purchaseGamificationCosmetic('owner', studioIds[0]);
  expect(await balance()).toBe(4250);
  const count = (await client.query<{ count: number }>('select count(*)::int count from gamification_cosmetics')).rows[0].count;
  expect(count).toBe(COSMETIC_CATALOG.length);
});

test('owned mascots equip independently and reject unowned or wrong-slot requests', async () => {
  await rewards.purchaseGamificationCosmetic('owner', 'frame-classic');
  await rewards.purchaseGamificationCosmetic('owner', 'zyra-skin-orbit');
  await rewards.equipGamificationCosmetics('owner', { frameId: 'frame-classic', zyraSkinId: 'zyra-skin-orbit' });
  await rewards.purchaseGamificationCosmetic('owner', studioIds[2]);
  await rewards.equipGamificationCosmetics('owner', { zyraAvatarId: studioIds[2] });
  const equipped = (await client.query('select equipped_frame_id, equipped_zyra_skin_id, equipped_zyra_avatar_id from gamification_profiles where user_id = $1', ['owner'])).rows[0];
  expect(equipped).toEqual({ equipped_frame_id: 'frame-classic', equipped_zyra_skin_id: 'zyra-skin-orbit', equipped_zyra_avatar_id: studioIds[2] });
  await assert.rejects(rewards.equipGamificationCosmetics('other', { zyraAvatarId: studioIds[2] }), /COSMETIC_NOT_OWNED/);
  await assert.rejects(rewards.equipGamificationCosmetics('owner', { zyraAvatarId: studioIds[1] }), /COSMETIC_NOT_OWNED/);
  await assert.rejects(rewards.equipGamificationCosmetics('owner', { zyraSkinId: studioIds[2] }), /INVALID_COSMETIC_SLOT/);
  await rewards.equipGamificationCosmetics('owner', { zyraAvatarId: null });
  const cleared = (await client.query('select equipped_frame_id, equipped_zyra_skin_id, equipped_zyra_avatar_id from gamification_profiles where user_id = $1', ['owner'])).rows[0];
  expect(cleared).toEqual({ equipped_frame_id: "frame-classic", equipped_zyra_skin_id: "zyra-skin-orbit", equipped_zyra_avatar_id: null });
});

test('a ledger conflict rolls back both the LP debit and new ownership', async () => {
  await client.query('insert into gamification_lp_ledger (id, user_id, reward_key, amount, reason) values ($1, $2, $3, 0, $4)', ['conflict', 'owner', `purchase:${studioIds[0]}`, 'fixture']);
  await assert.rejects(rewards.purchaseGamificationCosmetic('owner', studioIds[0]));
  expect(await balance()).toBe(5000);
  expect((await client.query('select cosmetic_id from gamification_inventory')).rows).toHaveLength(0);
  expect((await client.query('select id from gamification_lp_ledger')).rows).toEqual([{ id: 'conflict' }]);
});

test('cat is free and pet purchases grant only their own inventory row', async () => {
  await assert.rejects(rewards.purchaseGamificationCosmetic('owner', 'zyra-avatar-studio-cat'), /COSMETIC_UNAVAILABLE/);
  const ids = [studioIds[0], 'pet-action-cycle', 'pet-suit-itb-sport-outfit'];
  for (const [index, id] of ids.entries()) {
    await rewards.purchaseGamificationCosmetic('owner', id);
    const inventory = await client.query<{ cosmetic_id: string }>('select cosmetic_id from gamification_inventory where user_id = $1', ['owner']);
    expect(inventory.rows.map(row => row.cosmetic_id).sort()).toEqual(ids.slice(0, index + 1).sort());
  }
});

test('studio enforces ownership and species compatibility while switching the active loadout', async () => {
  await assert.rejects(rewards.purchaseGamificationCosmetic('owner', 'zyra-avatar-komodo'), /COSMETIC_UNAVAILABLE/);
  await assert.rejects(rewards.equipGamificationCosmetics('owner', {petActionId:'pet-action-cycle'}), /COSMETIC_NOT_OWNED/);
  for (const id of ['pet-action-cycle', 'pet-suit-astronaut-outfit', studioIds[0]]) {
    await rewards.purchaseGamificationCosmetic('owner', id);
  }
  await rewards.equipGamificationCosmetics('owner', {petActionId:'pet-action-cycle', petSuitId:'pet-suit-astronaut-outfit'});
  await rewards.equipGamificationCosmetics('owner', {zyraAvatarId:studioIds[0]});
  const read = () => client.query('select equipped_pet_action_id, equipped_pet_suit_id, equipped_zyra_avatar_id from gamification_profiles where user_id=$1', ['owner']);
  expect((await read()).rows[0]).toEqual({equipped_pet_action_id:null, equipped_pet_suit_id:'pet-suit-astronaut-outfit', equipped_zyra_avatar_id:studioIds[0]});
  await assert.rejects(rewards.equipGamificationCosmetics('owner', {petActionId:'pet-action-cycle'}), /INCOMPATIBLE_PET_ACTION/);
  await rewards.equipGamificationCosmetics('owner', {zyraAvatarId:'zyra-avatar-studio-cat', petSuitId:null});
  expect((await read()).rows[0]).toEqual({equipped_pet_action_id:null, equipped_pet_suit_id:null, equipped_zyra_avatar_id:null});
});

test('removing an old suit preserves a newer equipped suit', async () => {
  for (const id of ['pet-suit-itb-sport-outfit', 'pet-suit-graduation-gown']) {
    await rewards.purchaseGamificationCosmetic('owner', id);
    await rewards.equipGamificationCosmetics('owner', { petSuitId: id });
  }
  expect(await balance()).toBe(3600);
  await rewards.removePetGear('owner', 'pet_suit', 'pet-suit-itb-sport-outfit');
  const saved = await client.query('select equipped_pet_suit_id from gamification_profiles where user_id=$1', ['owner']);
  expect(saved.rows[0]).toEqual({equipped_pet_suit_id:'pet-suit-graduation-gown'});
});
