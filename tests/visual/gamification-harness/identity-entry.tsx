'use client';
// Fictional data and mocked actions. This composes production identity and leaderboard components.
import React, { useState } from 'react';
import { StudentIdentity, StudentIdentityContent, StudentProfileDialog } from '@/components/gamification/student-identity';
import { LeaderboardResults } from '@/components/gamification/leaderboard-results';
import type { StudentIdentity as Identity } from '@/lib/gamification/social-contracts';

const person: Identity = { publicId: 'fictional-alya', displayName: 'Alya Putri Maharani Kusumawardhani', avatarUrl: null, rankKey: 'bupati', equippedFrameId: 'frame-classic', equippedThemeId: null };
export default function App() {
 const [selected, setSelected] = useState(false);
 const view = new URLSearchParams(window.location.search).get('view');
 return <main className="mx-auto max-w-3xl space-y-5 p-4 text-foreground"><h1 className="font-heading text-h5 font-bold">{view === 'group' ? 'Kelompok belajar' : view === 'search' ? 'Pencarian' : 'Papan peringkat'}</h1>
  {view === 'group' ? <section className="rounded-xl border bg-card p-4"><h2 className="text-body-base font-bold">Anggota</h2><div className="mt-3 flex flex-wrap gap-4"><StudentIdentity name="Alya" identity={person} /><StudentIdentity name="Anggota privat" showAvatar={false} /></div></section>
   : view === 'search' ? <section className="space-y-3 rounded-xl border bg-card p-4"><p className="text-body-xs text-muted-foreground">Orang</p><button type="button" className="flex items-center gap-2 rounded-md text-body-sm" onClick={() => setSelected(true)}><StudentIdentityContent name={person.displayName} identity={person} /></button><p className="text-body-xs text-muted-foreground">Halaman</p><a href="#" className="text-body-sm">Kalkulus I</a><StudentProfileDialog publicId={person.publicId} open={selected} onOpenChange={setSelected} /></section>
   : <LeaderboardResults page={{ entries: [{ ...person, avatarMode: 'photo', avatarBadgeId: null, badgeTier: null, baseXpMicro: 40000000, position: 1 }], ownEntry: null, nextCursor: null }} period="all" scope="global" locale="id" basePath="/leaderboard" />}
 </main>;
}
