import type { AchievementBadge, GamificationMission, GamificationReward, GamificationSummary } from '@/lib/gamification/contracts';
import { COSMETIC_CATALOG } from '@/lib/gamification/catalog';
import type { StudentSocialSettings } from '@/lib/gamification/social-contracts';

export const summary: GamificationSummary = { rankKey: 'bupati', baseXpMicro: 40_000_000_000, bonusXpMicro: 2_650_000_000, courseCreditsMicro: 4_000_000, lpBalance: 1240 };
export const badges: AchievementBadge[] = [
 { family:'warrior_reader', count:46, tier:3, nextThreshold:100 },
 { family:'practice_knight', count:85, tier:2, nextThreshold:200 },
 { family:'memory_guardian', count:310, tier:3, nextThreshold:750 },
 { family:'steady_scholar', count:12, tier:2, nextThreshold:30 },
 { family:'comeback_champion', count:2, tier:0, nextThreshold:5 },
 { family:'consistency_captain', count:4, tier:2, nextThreshold:12 },
];
export const missions: GamificationMission[] = [
 { id:'m1', kind:'material', progress:3, target:5, rewardLp:10, endsAt:new Date('2026-11-20T16:59:00Z'), completedAt:null },
 { id:'m2', kind:'question', progress:5, target:5, rewardLp:10, endsAt:new Date('2026-11-20T16:59:00Z'), completedAt:new Date('2026-11-14T08:00:00Z') },
 { id:'m3', kind:'recall', progress:2, target:5, rewardLp:10, endsAt:new Date('2026-11-20T16:59:00Z'), completedAt:null },
 { id:'m4', kind:'qualified_days', progress:2, target:4, rewardLp:50, endsAt:new Date('2026-11-20T16:59:00Z'), completedAt:null },
];
// Fictional illustration, embedded for the file-based fixture only.
export const portrait = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#b8d8c8"/><path d="M19 128c3-30 21-43 45-43s42 13 45 43" fill="#345c78"/><ellipse cx="64" cy="58" rx="31" ry="38" fill="#d69873"/><path d="M33 54c-3-33 14-44 32-44 25 0 34 20 30 46-7-4-12-15-14-23-12 12-29 15-48 15z" fill="#302d35"/><circle cx="53" cy="58" r="3" fill="#302d35"/><circle cx="75" cy="58" r="3" fill="#302d35"/><path d="M53 75q11 9 22 0" fill="none" stroke="#824c43" stroke-width="3" stroke-linecap="round"/></svg>')}`;
export const rewards: GamificationReward[] = COSMETIC_CATALOG.map(item => ({ ...item, owned: ['frame-classic','frame-detailed','frame-laurel','title-scholar','zyra-skin-samudra','zyra-avatar-jalak'].includes(item.id), equipped: item.id === 'frame-classic' }));
export const settings: StudentSocialSettings = { publicId:'alya-fixture', displayName:'Alya Putri', visibility:'members', showMajor:true, showFaculty:true, allowFollows:true, leaderboardOptIn:true, avatarMode:'photo', avatarBadgeId:null, badgeTier:null, featuredBadgeIds:['warrior_reader','practice_knight','memory_guardian'] };
export const appearance = { name:'Alya Putri', image:portrait, mode:'photo' as const, frameId:'frame-classic' };
export const leaderboard = [
 { name:'Nadia Prameswari', position:1, xp:62000, rank:'gubernur' },
 { name:'Raka Aditya', position:2, xp:47000, rank:'bupati' },
 { name:'Sinta Maharani', position:2, xp:47000, rank:'bupati' },
 { name:'Alya Putri', position:4, xp:40000, rank:'bupati' },
 { name:'Bima Saputra', position:5, xp:35000, rank:'bupati' },
];
export const fixtureProvenance = {
 data:'Fictional deterministic fixture, no database or external API',
 components:['ApplicationPage','PageHeader','AchievementTabs','RankPromotion','BadgeList','MissionList','RewardList','StudentAvatar','BadgeArtwork','RankArtwork','ProfileSettings','ProfileFollowList','ProfileHero','AchievementBoard','SocialControls','CelebrationListener','Toaster','ProfileEditForm','SolutionCollectionReader'],
 compositions:['Fixture compositions based on AchievementsPage, ProfilePage, public profile, leaderboard and dashboard; leaderboard rows are fixture compositions'],
 mocks:['student identity and social settings','achievement and inventory data','leaderboard entries','server actions via runtime aliases','fixture student chrome'],
 omissions:['dashboard course widgets','real application sidebar and mobile navigation','production article content renderers and coding providers, replaced by fixture plain-text adapters for static markdown; solution completion uses the real reader and fixture action'],
};

const part = (id: string, markdown: string) => [{ id, kind: 'markdown', markdown }];
export const solutionFixture = { schemaVersion:'solution_collection.v1', productType:'solution_collection', release:'released_learning_content', id:'fixture-collection', title:'Pembahasan kalkulus', course:{id:'math',title:'Kalkulus I'}, chapter:{id:'limit',title:'Limit'}, items:[{id:'item-1',title:'Menghitung limit',questionType:'numeric',discipline:'mathematics',template:'calculation',prompt:part('p','Tentukan limit 2x + 1 saat x mendekati 2.'),options:[],answer:{parts:part('a','5'),optionIds:[]},strategy:part('s','Gunakan substitusi langsung.'),steps:[{id:'step',operationMarkdown:'Substitusikan x = 2.',reasonMarkdown:'Fungsi linear kontinu.'}],verification:part('v','2 × 2 + 1 = 5.'),visuals:[],provenance:{problem:{kind:'original',attribution:'Zyx',sources:[]},solution:{kind:'original',attribution:'Zyx',sources:[]}}}] };
