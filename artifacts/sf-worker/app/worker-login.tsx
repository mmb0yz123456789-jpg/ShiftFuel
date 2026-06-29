import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

export default function WorkerLoginScreen() {
  const { loginWorker, error, clearError } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    return () => clearError();
  }, []);

  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
      ]).start();
    }
  }, [error]);

  const handleLogin = async () => {
    if (!phone.trim() || !password) return;
    clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    const ok = await loginWorker(phone, password);
    setSubmitting(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(worker-tabs)/");
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Animated.View style={[styles.inner, { opacity: fadeAnim, paddingTop: topPad + 20, paddingBottom: bottomPad + 20 }]}>
          {/* Back */}
          <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}><Text style={styles.icon}>🔧</Text></View>
            <Text style={styles.title}>Worker Sign In</Text>
            <Text style={styles.subtitle}>Enter your phone and password</Text>
          </View>

          {/* Form */}
          <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
            <View style={styles.field}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input} value={phone} onChangeText={setPhone}
                placeholder="(555) 000-0000" placeholderTextColor="#A7BFA6"
                keyboardType="phone-pad" autoCapitalize="none" returnKeyType="next"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]} value={password} onChangeText={setPassword}
                  placeholder="••••••••" placeholderTextColor="#A7BFA6"
                  secureTextEntry={!showPass} autoCapitalize="none" returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowPass(p => !p)} hitSlop={8}>
                  <Text style={styles.eyeText}>{showPass ? "🙈" : "👁️"}</Text>
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, (submitting || !phone || !password) && styles.btnDisabled]}
              onPress={handleLogin} disabled={submitting || !phone.trim() || !password}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
            </Pressable>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D3B3B" },
  kav: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  back: { marginBottom: 24 },
  backText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#A7BFA6" },
  header: { alignItems: "center", marginBottom: 32 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)", alignItems: "center",
    justifyContent: "center", marginBottom: 14,
  },
  icon: { fontSize: 28 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#A7BFA6" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 22, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#5F6F6D", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "#F7F7F5", borderWidth: 1.5, borderColor: "#D9E3DF", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, fontFamily: "Inter_400Regular", color: "#1F1F1F" },
  passRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  eyeBtn: { padding: 13, backgroundColor: "#F7F7F5", borderWidth: 1.5, borderColor: "#D9E3DF", borderRadius: 12 },
  eyeText: { fontSize: 18 },
  errorBox: { backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#FECACA" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#B42318" },
  btn: { backgroundColor: "#FF6B5A", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold" },
});
