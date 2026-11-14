'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { getAdminGamificationData } from '@/lib/gamification/admin';
import { gamificationAdminAction } from './actions';
import { AdminConfirmDialog } from '@/components/admin/confirm-dialog';
import { AdminEmptyState } from '@/components/admin/state-panels';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const categories: Record<string, string> = { article: 'Artikel', explanation: 'Pembahasan', question: 'Soal', flashcard: 'Flashcard' };
const reasons: Record<string, string> = { harassment: 'Pelecehan', impersonation: 'Peniruan identitas', inappropriate: 'Konten tidak pantas', other: 'Lainnya' };
const amount = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(n / 1_000_000);
type Data = Awaited<ReturnType<typeof getAdminGamificationData>>;
type Action = { kind: 'refresh' | 'approve' | 'resolved' | 'dismissed'; id: string };
export function GamificationAdmin({ data }: { data: Data }) {
 const router = useRouter();
 const [pending, startTransition] = useTransition();
 const [error, setError] = useState('');
 const [confirm, setConfirm] = useState<Action | null>(null);
 function run(action: Action) { setError(''); startTransition(async () => { try { const result = await gamificationAdminAction(action.kind, action.id); if (result.error) { setConfirm(null); setError(result.error); } else { setConfirm(null); router.refresh(); } } catch { setConfirm(null); setError('Permintaan gagal. Periksa koneksi dan coba lagi.'); } }); }
 function link(values: Record<string, string | number>) { const p = new URLSearchParams(); for (const [k,v] of Object.entries(values)) if (v) p.set(k, String(v)); return `?${p}`; }
 const courseParams = { tab: 'checklist', q: data.q, course: data.selected?.id ?? '' };
 return <>
  {error && <div role="alert" className="rounded-lg border border-status-error p-3 text-body-sm">{error}</div>}
  <Tabs defaultValue="checklist"><TabsList><TabsTrigger value="checklist">Checklist</TabsTrigger><TabsTrigger value="reports">Laporan</TabsTrigger><TabsTrigger value="catalog">Katalog</TabsTrigger></TabsList>
   <TabsContent value="checklist" className="space-y-4">
    <form className="flex flex-wrap items-center gap-2" action="/admin/gamification"><input type="hidden" name="tab" value="checklist" /><Input name="q" defaultValue={data.q} placeholder="Cari mata kuliah" aria-label="Cari mata kuliah" className="min-w-[140px] max-w-sm flex-1" /><Button type="submit" variant="outline">Cari</Button></form>
    <div className="rounded-xl border border-border bg-card divide-y divide-border">{data.courses.length ? data.courses.map(course => <a key={course.id} className="block p-3 text-body-sm hover:bg-muted focus-visible:outline focus-visible:outline-2" href={link({ ...courseParams, course: course.id, page: data.page })}>{course.title} <span className="text-muted-foreground">({course.code})</span></a>) : <AdminEmptyState title="Mata kuliah tidak ditemukan" />}</div>
    <div className="flex gap-2 text-body-sm">{data.page > 1 && <a href={link({ ...courseParams, page: data.page - 1 })}>Sebelumnya</a>}{data.moreCourses && <a href={link({ ...courseParams, page: data.page + 1 })}>Berikutnya</a>}</div>
    {data.selected && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading text-body-base font-bold">{data.selected.title}</h2><Button disabled={pending} onClick={() => run({ kind: 'refresh', id: data.selected!.id })}>Buat atau perbarui draf</Button></div>
     {data.checklists.length ? <div className="rounded-xl border border-border bg-card divide-y divide-border">{data.checklists.map(c => <div key={c.id} className="space-y-2 p-3 text-body-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Versi {c.version} · {c.status === 'approved' ? 'Disetujui' : c.status === 'draft' ? 'Draf' : 'Tidak tersedia'}</strong>{c.status === 'draft' && <Button size="sm" onClick={() => setConfirm({ kind: 'approve', id: c.id })}>Setujui</Button>}</div><p>{amount(c.totalXpMicro)} XP · {amount(c.credit)} kredit mata kuliah</p><p className="text-body-xs text-muted-foreground">{Object.entries(categories).map(([key, label]) => `${label}: ${c.counts.find(x => x.category === key)?.count ?? 0}`).join(' · ')}</p></div>)}</div> : <AdminEmptyState title="Belum ada checklist" />}
     {data.preview.length > 0 && <details className="text-body-sm"><summary className="cursor-pointer">Pratinjau item versi terbaru</summary><ul className="mt-2 space-y-1 break-all text-body-xs">{data.preview.map((item, i) => <li key={`${item.category}-${item.sourceId}-${i}`}>{categories[item.category] ?? 'Materi'}: {item.sourceId} (versi {item.contentVersion})</li>)}</ul><p className="mt-2 text-body-xs text-muted-foreground">Maksimal 20 item ditampilkan.</p></details>}
    </section>}
   </TabsContent>
   <TabsContent value="reports" className="space-y-4"><div className="flex flex-wrap gap-3 text-body-sm">{[['pending','Menunggu'],['resolved','Selesai'],['dismissed','Ditolak']].map(([key,label]) => <a key={key} aria-current={data.status === key ? 'page' : undefined} className={data.status === key ? 'font-bold' : ''} href={link({ tab:'reports', reports:key })}>{label}</a>)}</div>
    <div className="rounded-xl border border-border bg-card divide-y divide-border">{data.reports.length ? data.reports.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-body-sm"><div><p className="font-semibold">{r.displayName || 'Profil tidak tersedia'}</p><p className="text-body-xs text-muted-foreground">{r.publicId || 'Identitas tidak tersedia'} · {reasons[r.reason] ?? 'Alasan lain'}</p></div>{r.status === 'pending' && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setConfirm({ kind:'dismissed', id:r.id })}>Tolak</Button><Button size="sm" onClick={() => setConfirm({ kind:'resolved', id:r.id })}>Selesaikan</Button></div>}</div>) : <AdminEmptyState title="Tidak ada laporan" />}</div>
    <div className="flex gap-2 text-body-sm">{data.reportPage > 1 && <a href={link({ tab:'reports', reports:data.status, reportPage:data.reportPage - 1 })}>Sebelumnya</a>}{data.moreReports && <a href={link({ tab:'reports', reports:data.status, reportPage:data.reportPage + 1 })}>Berikutnya</a>}</div>
   </TabsContent>
   <TabsContent value="catalog"><div className="rounded-xl border border-border bg-card divide-y divide-border">{data.cosmetics.length ? data.cosmetics.map(c => <div key={c.id} className="flex flex-wrap justify-between gap-2 p-3 text-body-sm"><span>{c.name}</span><span>{c.priceLp} LP · {c.active ? 'Aktif' : 'Tidak aktif'} · {c.inventory} dimiliki</span></div>) : <AdminEmptyState title="Katalog kosong" />}</div></TabsContent>
  </Tabs>
  <AdminConfirmDialog open={!!confirm} onOpenChange={open => !open && setConfirm(null)} title={confirm?.kind === 'approve' ? 'Setujui checklist?' : 'Tutup laporan?'} description={confirm?.kind === 'approve' ? 'Versi ini dibekukan untuk peserta yang memulai setelah persetujuan. Pastikan materi sudah siap.' : confirm?.kind === 'dismissed' ? 'Laporan akan ditandai ditolak.' : 'Laporan akan ditandai selesai.'} confirmLabel={confirm?.kind === 'approve' ? 'Setujui' : 'Konfirmasi'} destructive={false} loading={pending} onConfirm={() => confirm && run(confirm)} />
 </>;
}
