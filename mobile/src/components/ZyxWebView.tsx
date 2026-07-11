import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
} from 'react-native-webview/lib/WebViewTypes';

// react-native-webview 13.x class typings clash with @types/react 19 (props
// resolve to `never`); runtime is unaffected, so cast once here and keep the
// call sites fully typed via WebViewProps.
const WebViewComponent = WebView as unknown as React.ComponentType<
  WebViewProps & { ref?: React.Ref<WebView> }
>;
import { CloudOff } from 'lucide-react-native';
import { APP_HOST, BASE_URL, UA_MARKER } from '../config';
import { useTheme } from '../theme';
import { LoadingOverlay } from './LoadingOverlay';

/**
 * The app navigates with the native bottom tab bar, so the web sidebar and
 * its hamburger trigger are hidden inside the WebView. Attribute-substring
 * selectors survive Tailwind class reshuffles better than full class lists;
 * they track components/sidebar-shell.tsx (aside is md:sticky on desktop,
 * the mobile trigger is aria-labelled, the backdrop is bg-black/50).
 */
const HIDE_WEB_SIDEBAR_JS = `(function () {
  var style = document.createElement('style');
  style.textContent =
    'aside[class*="md:sticky"]{display:none!important}' +
    'button[aria-label="Open navigation"]{display:none!important}' +
    'div[aria-hidden="true"][class*="bg-black/50"]{display:none!important}';
  (document.head || document.documentElement).appendChild(style);
})(); true;`;

function parseUrl(url: string): { scheme: string; host: string; path: string } | null {
  const m = /^(https?):\/\/([^/:?#]+)(?::\d+)?([^?#]*)/.exec(url);
  if (!m) return null;
  return { scheme: m[1], host: m[2].replace(/^www\./, ''), path: m[3] || '/' };
}

interface Props {
  path: string;
  /** Only the visible tab handles the hardware back button. */
  isActive: boolean;
  /** Prod redirects protected routes to /sign-in when the session dies. */
  onSessionExpired: () => void;
}

export function ZyxWebView({ path, isActive, onSessionExpired }: Props) {
  const { colors } = useTheme();
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && !failed) {
        webRef.current?.goBack();
        return true;
      }
      return false; // default: leave the app
    });
    return () => sub.remove();
  }, [isActive, failed]);

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      const parsed = parseUrl(request.url);
      if (!parsed) {
        Linking.openURL(request.url).catch(() => {});
        return false;
      }
      const sameOrigin = parsed.host === APP_HOST;

      // Session expired: bounce to native sign-in instead of the web form
      if (sameOrigin && parsed.path.startsWith('/sign-in')) {
        onSessionExpired();
        return false;
      }

      // Student app scope: admin and tutor surfaces stay in the browser
      const blockedInApp =
        parsed.path.startsWith('/admin') || parsed.path.startsWith('/tutor');

      if (sameOrigin && !blockedInApp) return true;

      Linking.openURL(request.url).catch(() => {});
      return false;
    },
    [onSessionExpired],
  );

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  const onError = useCallback((_e: WebViewErrorEvent) => {
    setFailed(true);
    setLoading(false);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WebViewComponent
        ref={webRef}
        source={{ uri: BASE_URL + path }}
        style={{ backgroundColor: colors.background }}
        applicationNameForUserAgent={UA_MARKER}
        injectedJavaScriptBeforeContentLoaded={HIDE_WEB_SIDEBAR_JS}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onNavigationStateChange={s => {
          canGoBack.current = s.canGoBack;
        }}
        onLoadEnd={() => setLoading(false)}
        onError={onError}
        domStorageEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        pullToRefreshEnabled
      />

      {loading && !failed && <LoadingOverlay />}

      {failed && (
        <View style={[styles.offline, { backgroundColor: colors.background }]}>
          <CloudOff size={48} color={colors.muted} />
          <Text style={[styles.offlineTitle, { color: colors.onBackground }]}>
            Tidak ada koneksi
          </Text>
          <Text style={[styles.offlineBody, { color: colors.muted }]}>
            Periksa koneksi internet Anda lalu coba lagi.
          </Text>
          <TouchableOpacity
            onPress={retry}
            style={[styles.retryButton, { borderColor: colors.outline }]}
          >
            <Text style={{ color: colors.onBackground, fontWeight: '600' }}>
              Coba lagi
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  offline: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    zIndex: 20,
  },
  offlineTitle: { marginTop: 16, fontSize: 18, fontWeight: '600' },
  offlineBody: { marginTop: 4, fontSize: 14, textAlign: 'center' },
  retryButton: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});
