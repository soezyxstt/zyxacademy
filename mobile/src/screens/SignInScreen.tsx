import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Logo } from '../components/Logo';
import { signInWithGoogle } from '../auth';
import { useTheme } from '../theme';

/** Native sign-in gate; copy mirrors the WebView wrapper's strings.xml. */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await signInWithGoogle();
      if (ok) {
        onSignedIn();
      } else {
        setBusy(false); // cancelled or exchange rejected; stay quiet on cancel
      }
    } catch (e) {
      console.warn('ZyxAuth sign-in error:', e);
      setError('Terjadi kesalahan saat masuk dengan Google. Coba lagi sebentar lagi.');
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Logo width={126} />
      <Text style={[styles.title, { color: colors.onBackground }]}>
        Masuk ke Zyx Academy
      </Text>

      <TouchableOpacity
        disabled={busy}
        onPress={handleSignIn}
        style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
      >
        {busy ? (
          <View style={styles.buttonRow}>
            <ActivityIndicator color={colors.onPrimary} />
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              Menghubungkan...
            </Text>
          </View>
        ) : (
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
            Lanjutkan dengan Google
          </Text>
        )}
      </TouchableOpacity>

      {error && (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: { marginTop: 24, fontSize: 22, fontWeight: '600' },
  button: {
    marginTop: 40,
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  error: { marginTop: 16, fontSize: 14, textAlign: 'center' },
});
