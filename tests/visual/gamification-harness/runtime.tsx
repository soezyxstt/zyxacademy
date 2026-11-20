import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './entry';
import { CelebrationListener } from '@/components/gamification/celebration-listener';
import { Toaster } from '@/components/ui/sonner';

const view = new URLSearchParams(window.location.search).get('view');
if (view?.startsWith('toast-')) {
  localStorage.removeItem('zyx-celebrations-shown-v1');
  const event = view === 'toast-badge' ? { id: 'fixture-badge', kind: 'badge', family: 'warrior_reader', tier: 3, lp: 50 } : { id: 'fixture-rank', kind: 'rank', rank: 'bupati' };
  const originalFetch = window.fetch.bind(window);
  const interceptedFetch = (input: Parameters<typeof window.fetch>[0], init?: Parameters<typeof window.fetch>[1]) => String(input).includes('/api/student/gamification/celebrations') ? Promise.resolve(new Response(JSON.stringify(init?.method === 'POST' ? { ok: true } : { celebrations: [event] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) : originalFetch(input, init);
  window.fetch = Object.assign(interceptedFetch, window.fetch);
}
createRoot(document.getElementById('root')!).render(<><App />{view?.startsWith('toast-') && <CelebrationListener />}<Toaster /></>);
