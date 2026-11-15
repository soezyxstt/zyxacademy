'use server';
import { requireStudentGamificationAccess } from './access';
import * as social from './social';
import { getGamificationLeaderboard } from './leaderboard';
import type { LeaderboardInput, StudentSocialSettingsInput } from './social-contracts';
async function safe<T>(fn: () => Promise<T>): Promise<T> {
 try { return await fn(); } catch (error) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string,string> = { RATE_LIMITED: 'Terlalu banyak percobaan. Coba lagi nanti.', REPORT_COOLDOWN: 'Laporan sudah dikirim. Coba lagi nanti.', UNAVAILABLE: 'Profil tidak tersedia.', INVALID_BADGE: 'Lencana tidak tersedia.', INVALID_REASON: 'Alasan laporan tidak valid.', Forbidden: 'Akses tidak tersedia.' };
  throw new Error(messages[code] ?? 'Permintaan tidak dapat diproses. Coba lagi.');
 }
}
async function actor() { return (await requireStudentGamificationAccess()).user.id; }
export async function getPublicStudentProfileAction(publicId:string) { return safe(async () => social.getPublicStudentProfile(await actor(),publicId)); }
export async function getStudentSocialSettingsAction() { return safe(async () => social.getStudentSocialSettings(await actor())); }
export async function updateStudentSocialSettingsAction(input:StudentSocialSettingsInput) { return safe(async () => social.updateStudentSocialSettings(await actor(),input)); }
export async function followStudentAction(publicId:string) { return safe(async () => social.followStudent(await actor(),publicId)); }
export async function unfollowStudentAction(publicId:string) { return safe(async () => social.unfollowStudent(await actor(),publicId)); }
export async function removeFollowerAction(publicId:string) { return safe(async () => social.removeFollower(await actor(),publicId)); }
export async function blockStudentAction(publicId:string) { return safe(async () => social.blockStudent(await actor(),publicId)); }
export async function unblockStudentAction(publicId:string) { return safe(async () => social.unblockStudent(await actor(),publicId)); }
export async function reportStudentAction(publicId:string,reason:string) { return safe(async () => social.reportStudent(await actor(),publicId,reason)); }
export async function getStudentFollowListAction(direction:'followers'|'following',cursor?:string,pageSize?:number) { return safe(async () => social.getStudentFollowList(await actor(),direction,cursor,pageSize)); }
export async function getGamificationLeaderboardAction(input:LeaderboardInput) { return safe(async () => getGamificationLeaderboard(await actor(),input)); }
