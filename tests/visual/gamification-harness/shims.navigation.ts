import { useSyncExternalStore } from 'react';
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
const locationSnapshot = () => window.location.href;
function navigate(href: string, replace = false) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin && url.protocol !== 'file:') return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function useRouter() { return { push: (href: string) => navigate(href), replace: (href: string) => navigate(href, true), refresh: () => {}, back: () => history.back(), forward: () => history.forward(), prefetch: () => {} }; }
export function usePathname() { useSyncExternalStore(subscribe, locationSnapshot); const view = new URLSearchParams(window.location.search).get('view') || 'overview'; return view.startsWith('toast-') || view === 'dashboard' ? '/dashboard' : view === 'profile-edit' ? '/profile/edit' : view === 'profile' ? '/profile' : view === 'public-profile' ? '/students/alya-fixture' : view === 'admin' ? '/admin/gamification' : view.startsWith('solution') ? '/courses/math/solutions/fixture' : '/achievements'; }
export function useSearchParams() { useSyncExternalStore(subscribe, locationSnapshot); return new URLSearchParams(window.location.search); }
export function useParams() { return {}; }
export function redirect(href: string) { navigate(href); }
