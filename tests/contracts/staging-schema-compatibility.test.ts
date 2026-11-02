import {expect,test} from 'bun:test';
import {sql} from 'drizzle-orm';
import {createPostgresTestDb} from '../helpers/postgres';
import {accountLocalePreferences,user} from '../../db/schema';

test('staging schema retains locale validation, coding constraints and occupied-slot uniqueness',async()=>{
 const {testDb,client}=await createPostgresTestDb();
 try {
  await testDb.insert(user).values({id:'locale-user',name:'Fixture',email:'locale@example.invalid'});
  await testDb.insert(accountLocalePreferences).values({userId:'locale-user',locale:'en'});
  await expect(Promise.resolve(testDb.execute(sql`UPDATE account_locale_preferences SET locale='other' WHERE user_id='locale-user'`))).rejects.toThrow();
  const tables=await testDb.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('coding_problems','coding_attempts','coding_drafts') ORDER BY tablename`);
  expect(tables.rows).toHaveLength(3);
  const constraints=await testDb.execute(sql`SELECT conname FROM pg_constraint WHERE conname IN ('coding_attempt_status_check','coding_attempt_surface_check','coding_attempt_ordinal_check','coding_problems_version_check','coding_problems_status_check')`);
  expect(constraints.rows).toHaveLength(5);
  const indexes=await testDb.execute(sql`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='bookings_occupied_slot_unique_idx'`);
  expect(indexes.rows).toHaveLength(1);
  expect(String(indexes.rows[0].indexdef)).toContain('cancelled');
  const old=await testDb.execute(sql`SELECT conname FROM pg_constraint WHERE conrelid='public.bookings'::regclass AND conname='bookings_slot_id_unique'`);
  expect(old.rows).toHaveLength(0);
 } finally {await client.close();}
},60000);
