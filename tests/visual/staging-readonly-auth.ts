import type { Page } from '@playwright/test';
import {
  loadVerifiedStagingEnvironment,
  fetchFreshSignedSessionCookie,
  probeSessionCookieName,
} from '../../scripts/performance/staging-env-loader';

/** Opt-in local staging capture; credentials and cookies never enter test output. */
export async function prepareReadOnlyStagingCapture(page: Page, baseUrl: string) {
  if (process.env.VISUAL_CHECK_STAGING_SESSION !== '1') return;
  const origin = new URL(baseUrl);
  loadVerifiedStagingEnvironment({ port: Number(origin.port || 80) });
  const auth = await fetchFreshSignedSessionCookie();
  const probe = await probeSessionCookieName(origin.origin, auth.signedCookieValue, auth.userIdHash);
  if (!probe.verified || !probe.cookieName) throw new Error('STAGING_VISUAL_AUTH_UNAVAILABLE');
  await page.context().addCookies([{
    name: probe.cookieName, value: auth.signedCookieValue,
    domain: origin.hostname, path: '/', httpOnly: true,
    secure: probe.cookieName.startsWith('__Secure-'), sameSite: 'Lax',
  }]);
  // Vercel analytics scripts do not exist on next start. Keep this isolated
  // local transport substitution explicit; it does not verify analytics delivery.
  if (process.env.VISUAL_CHECK_STUB_VERCEL === '1') {
    await page.route('**/_vercel/**/script.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript', body: '',
    }));
  }
}
