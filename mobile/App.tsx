import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { hasValidSession, signOutEverywhere } from './src/auth';
import { LoadingOverlay } from './src/components/LoadingOverlay';
import { SignInScreen } from './src/screens/SignInScreen';
import { MainTabs } from './src/screens/MainTabs';
import { useTheme } from './src/theme';

type AuthState = 'checking' | 'signedOut' | 'signedIn';

function Root() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [auth, setAuth] = useState<AuthState>('checking');

  useEffect(() => {
    hasValidSession().then(ok => setAuth(ok ? 'signedIn' : 'signedOut'));
  }, []);

  const handleSessionExpired = useCallback(() => {
    // Prod redirected a protected route to /sign-in: session is gone.
    signOutEverywhere().finally(() => setAuth('signedOut'));
  }, []);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      {auth === 'checking' && <LoadingOverlay />}
      {auth === 'signedOut' && (
        <SignInScreen onSignedIn={() => setAuth('signedIn')} />
      )}
      {auth === 'signedIn' && (
        <MainTabs onSessionExpired={handleSessionExpired} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
