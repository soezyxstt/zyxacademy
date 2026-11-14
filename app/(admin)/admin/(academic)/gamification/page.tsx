import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { assertAdmin } from '@/lib/auth/admin-guards-server';
import { getAdminGamificationData } from '@/lib/gamification/admin';
import { PageHeader } from '@/components/page-header';
import { GamificationAdmin } from './ui';

export default async function GamificationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 let actor: Awaited<ReturnType<typeof assertAdmin>>;
 try { actor = await assertAdmin(); } catch { redirect('/'); }
 const params = await searchParams;
 const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined;
 const data = await getAdminGamificationData(actor.user.id, { q: value('q'), page: value('page'), course: value('course'), reports: value('reports'), reportPage: value('reportPage') }).catch(() => null);
 return <div className="space-y-6"><PageHeader title="Gamification" icon={Trophy} />{data ? <GamificationAdmin data={data} /> : <p role="alert" className="text-body-sm">Data tidak dapat dimuat. Muat ulang halaman untuk mencoba lagi.</p>}</div>;
}
