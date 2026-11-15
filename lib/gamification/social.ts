import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireStudentGamificationAccess } from './access';
import { parseSocialSettings, ownsSelectedBadges, type PublicStudentProfile, type StudentSocialSettingsInput } from './social-contracts';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function actor(id: string) { const { user } = await requireStudentGamificationAccess(); if (user.id !== id) throw new Error('Forbidden'); const result = await db.execute(sql`select 1 from "user" u where u.id = ${id} and ${eligibleStudent(sql.raw('u'))}`); if (!result.rows.length) throw new Error('Forbidden'); }
/** Canonical roles override the legacy role. Staff memberships disqualify an account. */
export const eligibleStudent = (alias: ReturnType<typeof sql.raw>) => sql`(
  (exists (select 1 from pengguna p where p.id = ${alias}.id and p.status = 'active')
   and exists (select 1 from pengguna_peran pp join peran r on r.id = pp.peran_id where pp.pengguna_id = ${alias}.id and r.code = 'murid')
   and not exists (select 1 from pengguna_peran pp join peran r on r.id = pp.peran_id where pp.pengguna_id = ${alias}.id and r.code in ('admin','tutor')))
  or (not exists (select 1 from pengguna p where p.id = ${alias}.id) and not exists (select 1 from pengguna_peran pp where pp.pengguna_id = ${alias}.id) and ${alias}.role = 'student'))`;
export const noBlock = (viewer: string, target: ReturnType<typeof sql.raw>) => sql`not exists (select 1 from gamification_blocks b where (b.blocker_id = ${viewer} and b.blocked_id = ${target}) or (b.blocked_id = ${viewer} and b.blocker_id = ${target}))`;
async function lock(tx: Tx, ids: string[]) {
 for (const id of [...new Set(ids)].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 731947))`);
}
async function eligibleActor(tx: Tx, id: string) { const r = await tx.execute(sql`select 1 from "user" u where u.id=${id} and ${eligibleStudent(sql.raw('u'))}`); if (!r.rows.length) throw new Error('Forbidden'); }
async function ensure(tx: Tx, id: string) { await tx.execute(sql`insert into gamification_profiles (user_id, public_id) values (${id}, ${crypto.randomUUID()}) on conflict (user_id) do nothing`); }
function validPublicId(id: unknown): id is string { return typeof id === 'string' && id.length > 0 && id.length <= 100; }
/** Delete indexed edges and apply only their deltas, without recounting other graphs. */
async function removeEdges(tx: Tx, predicate: ReturnType<typeof sql>) {
 await tx.execute(sql`with removed as (delete from gamification_follows where ${predicate} returning follower_id, following_id),
 deltas as (select id, sum(followers)::bigint followers, sum(following)::bigint following from (
 select following_id id, count(*) followers, 0::bigint following from removed group by following_id
 union all select follower_id id, 0::bigint followers, count(*) following from removed group by follower_id
 ) d group by id)
 update gamification_profiles p set follower_count=p.follower_count-d.followers, following_count=p.following_count-d.following from deltas d where p.user_id=d.id`);
}
async function target(tx: Tx, publicId: string, viewer: string, visible = true) {
 const r = await tx.execute<{user_id:string}>(sql`select p.user_id from gamification_profiles p join "user" u on u.id = p.user_id where p.public_id = ${publicId} and ${eligibleStudent(sql.raw('u'))} ${visible ? sql`and p.visibility = 'members' and ${noBlock(viewer, sql.raw('p.user_id'))}` : sql``} limit 1`);
 return r.rows[0]?.user_id;
}
async function rate(tx: Tx, id: string, action: string, limit: number, seconds: number) {
 // A transaction lock prevents races, including first insertion.
 const r = await tx.execute<{attempts:number}>(sql`insert into gamification_social_rate_limits (user_id, action, window_key, attempts, expires_at) values (${id}, ${action}, 'rolling', 1, now() + ${seconds} * interval '1 second') on conflict (user_id, action, window_key) do update set attempts = case when gamification_social_rate_limits.expires_at <= now() then 1 else gamification_social_rate_limits.attempts + 1 end, expires_at = case when gamification_social_rate_limits.expires_at <= now() then now() + ${seconds} * interval '1 second' else gamification_social_rate_limits.expires_at end returning attempts`);
 return Number(r.rows[0].attempts) <= limit;
}
export async function getPublicStudentProfile(viewerId: string, publicId: string): Promise<PublicStudentProfile | null> {
 if (!validPublicId(publicId)) return null;
 await actor(viewerId);
 const r = await db.execute<any>(sql`select p.public_id, coalesce(p.display_name,u.name) as display_name, u.image, p.avatar_badge_id, p.avatar_mode, case when exists (select 1 from gamification_badges where user_id=p.user_id and family=p.avatar_badge_id and tier >= p.badge_tier and p.badge_tier between 1 and 5) then p.badge_tier end as avatar_badge_tier, coalesce((select jsonb_agg(jsonb_build_object('family', family, 'tier', tier) order by family) from gamification_badges where user_id=p.user_id and tier > 0), '[]'::jsonb) as earned_badges, coalesce(a.rank_key,'rakyat') as rank_key, p.featured_badge_ids, p.equipped_frame_id, p.equipped_theme_id, p.equipped_title_id, case when p.show_major then u.major end as major, case when p.show_faculty then u.faculty end as faculty, p.follower_count, p.following_count, p.allow_follows, exists(select 1 from gamification_follows f where f.follower_id = ${viewerId} and f.following_id = p.user_id) as is_following, p.user_id = ${viewerId} as is_self from gamification_profiles p join "user" u on u.id=p.user_id left join gamification_accounts a on a.user_id=p.user_id where p.public_id=${publicId} and p.visibility='members' and ${eligibleStudent(sql.raw('u'))} and ${noBlock(viewerId,sql.raw('p.user_id'))} limit 1`);
 const p = r.rows[0]; if (!p) return null;
 return { publicId:p.public_id, displayName:p.display_name, avatarUrl:p.image, avatarBadgeId:null, avatarMode:'photo', avatarBadgeTier:null, earnedBadges:p.earned_badges.map((b: {family:string; tier:number}) => ({family:b.family,tier:Number(b.tier)})), rankKey:p.rank_key, featuredBadgeIds:p.featured_badge_ids, equippedFrameId:p.equipped_frame_id, equippedThemeId:p.equipped_theme_id, equippedTitleId:p.equipped_title_id, major:p.major, faculty:p.faculty, followerCount:Number(p.follower_count), followingCount:Number(p.following_count), canFollow:p.allow_follows && !p.is_self, isFollowing:p.is_following };
}
export async function getStudentSocialSettings(userId:string) {
 await actor(userId);
 const r = await db.execute<any>(sql`select public_id, display_name, visibility, show_major, show_faculty, allow_follows, leaderboard_opt_in, case when exists(select 1 from gamification_badges b where b.user_id=p.user_id and b.family=p.avatar_badge_id and b.tier >= p.badge_tier and p.badge_tier between 1 and 5) then avatar_badge_id end as avatar_badge_id, avatar_mode, case when exists(select 1 from gamification_badges b where b.user_id=p.user_id and b.family=p.avatar_badge_id and b.tier >= p.badge_tier and p.badge_tier between 1 and 5) then badge_tier end as badge_tier, featured_badge_ids from gamification_profiles p where user_id=${userId}`);
 const p=r.rows[0];
 return p ? {publicId:p.public_id,displayName:p.display_name,visibility:p.visibility,showMajor:p.show_major,showFaculty:p.show_faculty,allowFollows:p.allow_follows,leaderboardOptIn:p.leaderboard_opt_in,avatarBadgeId:null,avatarMode:'photo' as const,badgeTier:null,featuredBadgeIds:p.featured_badge_ids} : {publicId:null,displayName:null,visibility:'private' as const,showMajor:false,showFaculty:false,allowFollows:false,leaderboardOptIn:false,avatarBadgeId:null,avatarMode:'photo' as const,badgeTier:null,featuredBadgeIds:[]};
}
export async function updateStudentSocialSettings(userId:string, input:StudentSocialSettingsInput) { const v=parseSocialSettings(input); await actor(userId); return db.transaction(async tx => { await lock(tx,[userId]); await eligibleActor(tx,userId); await ensure(tx,userId); const badges=[...v.featuredBadgeIds, ...(v.avatarBadgeId ? [v.avatarBadgeId] : [])]; if (badges.length) { const owned=await tx.execute<{family:string; tier:number}>(sql`select family, tier from gamification_badges where user_id=${userId} and tier > 0`); if (!ownsSelectedBadges(v, owned.rows)) throw new Error('INVALID_BADGE'); } await tx.execute(sql`update gamification_profiles set display_name=${v.displayName}, visibility=${v.visibility}, show_major=${v.showMajor}, show_faculty=${v.showFaculty}, allow_follows=${v.allowFollows}, leaderboard_opt_in=${v.leaderboardOptIn}, avatar_badge_id=${v.avatarBadgeId}, avatar_mode=${v.avatarMode}, badge_tier=${v.badgeTier}, featured_badge_ids=${JSON.stringify(v.featuredBadgeIds)}::jsonb, updated_at=now() where user_id=${userId}`); if (v.visibility==='private' || !v.allowFollows) await removeEdges(tx, v.visibility==='private' ? sql`following_id=${userId} or follower_id=${userId}` : sql`following_id=${userId}`); }); }
async function relation(viewer:string, publicId:string, op:'follow'|'unfollow'|'remove'|'block'|'unblock'|'report', reason?:string) {
 if (!validPublicId(publicId)) throw new Error('UNAVAILABLE');
 if (op==='report' && (!reason || !['harassment','impersonation','inappropriate','other'].includes(reason))) throw new Error('INVALID_REASON');
 await actor(viewer);
 // Admission commits independently, including attempts against unavailable targets.
 if (op==='follow' || op==='report') {
  const admitted=await db.transaction(async tx=>{ await lock(tx,[viewer]); return rate(tx,viewer,op,op==='follow'?30:10,op==='follow'?3600:86400); });
  if (!admitted) throw new Error('RATE_LIMITED');
 }
 const initial=await target(db as unknown as Tx,publicId,viewer,false);
 if (!initial || initial===viewer) throw new Error('UNAVAILABLE');
 return db.transaction(async tx=>{
  await lock(tx,[viewer,initial]);
  await eligibleActor(tx,viewer);
  const id=await target(tx,publicId,viewer,op==='follow'||op==='report');
  if (!id || id!==initial || id===viewer) throw new Error('UNAVAILABLE');
  if(op==='follow') {
   const allowed=await tx.execute(sql`select 1 from gamification_profiles where user_id=${id} and allow_follows=true`);
   if(!allowed.rows.length) throw new Error('UNAVAILABLE');
   const viewerProfile=await tx.execute(sql`select 1 from gamification_profiles where user_id=${viewer} and visibility='members'`);
   if (!viewerProfile.rows.length) throw new Error('UNAVAILABLE');
   await tx.execute(sql`with added as (insert into gamification_follows (follower_id,following_id) values (${viewer},${id}) on conflict do nothing returning follower_id,following_id) update gamification_profiles p set follower_count=p.follower_count + (select count(*) from added where following_id=p.user_id), following_count=p.following_count + (select count(*) from added where follower_id=p.user_id) where p.user_id in (${viewer},${id})`);
  }
  if(op==='unfollow') await removeEdges(tx,sql`follower_id=${viewer} and following_id=${id}`);
  if(op==='remove') await removeEdges(tx,sql`follower_id=${id} and following_id=${viewer}`);
  if(op==='block') { await tx.execute(sql`insert into gamification_blocks (blocker_id,blocked_id) values (${viewer},${id}) on conflict do nothing`); await removeEdges(tx,sql`(follower_id=${viewer} and following_id=${id}) or (follower_id=${id} and following_id=${viewer})`); }
  if(op==='unblock') await tx.execute(sql`delete from gamification_blocks where blocker_id=${viewer} and blocked_id=${id}`);
  if(op==='report') { const recent=await tx.execute(sql`select 1 from gamification_reports where reporter_id=${viewer} and target_user_id=${id} and created_at > now() - interval '24 hours' limit 1`); if(recent.rows.length) throw new Error('REPORT_COOLDOWN'); await tx.execute(sql`insert into gamification_reports (id,reporter_id,target_user_id,reason) values (${crypto.randomUUID()},${viewer},${id},${reason})`); }
 });
}
export const followStudent=(v:string,p:string)=>relation(v,p,'follow');
export const unfollowStudent=(v:string,p:string)=>relation(v,p,'unfollow');
export const removeFollower=(v:string,p:string)=>relation(v,p,'remove');
export const blockStudent=(v:string,p:string)=>relation(v,p,'block');
export const unblockStudent=(v:string,p:string)=>relation(v,p,'unblock');
export const reportStudent=(v:string,p:string,reason:string)=>relation(v,p,'report',reason);

/** Owner-only bounded keyset listing; IDs returned are public identifiers. */
export async function getStudentFollowList(userId:string, direction:'followers'|'following', cursor?:string, pageSize=20) {
 if (!['followers','following'].includes(direction) || !Number.isInteger(pageSize) || pageSize<1 || pageSize>50 || (cursor !== undefined && (typeof cursor!=='string' || cursor.length===0 || cursor.length>100))) throw new Error('Invalid pagination');
 await actor(userId);
 const r=await db.execute<any>(sql`select p.public_id, coalesce(p.display_name,u.name) as display_name, u.image, p.avatar_mode, p.avatar_badge_id, case when exists (select 1 from gamification_badges b where b.user_id=p.user_id and b.family=p.avatar_badge_id and b.tier >= p.badge_tier and p.badge_tier between 1 and 5) then p.badge_tier end as badge_tier, p.equipped_frame_id, p.equipped_theme_id from gamification_follows f join gamification_profiles p on p.user_id=${direction==='followers' ? sql.raw('f.follower_id') : sql.raw('f.following_id')} join "user" u on u.id=p.user_id where ${direction==='followers' ? sql`f.following_id=${userId}` : sql`f.follower_id=${userId}`} and p.visibility='members' and ${eligibleStudent(sql.raw('u'))} and ${noBlock(userId,sql.raw('p.user_id'))} ${cursor ? sql`and p.public_id > ${cursor}` : sql``} order by p.public_id limit ${pageSize+1}`);
 const rows=r.rows.slice(0,pageSize); return {entries:rows.map((p:any)=>({publicId:p.public_id,displayName:p.display_name,avatarUrl:p.image,avatarMode:'photo' as const,avatarBadgeId:null,badgeTier:null,equippedFrameId:p.equipped_frame_id,equippedThemeId:p.equipped_theme_id})),nextCursor:r.rows.length>pageSize ? rows.at(-1).public_id : null};
}
