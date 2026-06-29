import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";

const ROLES = [
  {
    key: "worker",
    label: "Worker",
    desc: "View your jobs and earnings",
    icon: "🔧",
    route: "/worker-login",
    color: "#0D3B3B",
    border: "rgba(167,191,166,0.4)",
  },
  {
    key: "admin",
    label: "Admin",
    desc: "Manage requests & team",
    icon: "🛡️",
    route: "/admin-login",
    color: "#062727",
    border: "rgba(255,107,90,0.4)",
  },
  {
    key: "customer",
    label: "My Account",
    desc: "View your bookings",
    icon: "👤",
    route: "/customer-login",
    color: "#1F7A45",
    border: "rgba(31,122,69,0.4)",
  },
] as const;

export default function WelcomeScreen() {
  const { role, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLoading) {
      if (role === "worker") { router.replace("/(worker-tabs)/"); return; }
      if (role === "admin") { router.replace("/(admin-tabs)/"); return; }
      if (role === "customer") { router.replace("/(customer-tabs)/"); return; }
    }
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 700, useNativeDriver: true,
    }).start();
  }, [isLoading, role]);

  if (isLoading) return <View style={styles.loading} />;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim, paddingTop: topPad + 48, paddingBottom: bottomPad + 24 }]}>
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logoRing}>
            <Text style={styles.logoEmoji}>⛽</Text>
          </View>
          <Text style={styles.brandName}>ShiftFuel</Text>
          <Text style={styles.brandTag}>Concierge Portal</Text>
        </View>

        {/* Role cards */}
        <View style={styles.cards}>
          {ROLES.map((r) => (
            <Pressable
              key={r.key}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push(r.route as any);
              }}
            >
              <View style={[styles.cardIconWrap, { borderColor: r.border }]}>
                <Text style={styles.cardIcon}>{r.icon}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardLabel}>{r.label}</Text>
                <Text style={styles.cardDesc}>{r.desc}</Text>
              </View>
              <Text style={styles.cardArrow}>›</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footer}>
          ShiftFuel Concierge · Workday Vehicle Services
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#0D3B3B" },
  container: { flex: 1, backgroundColor: "#0D3B3B" },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  brand: { alignItems: "center", marginBottom: 48 },
  logoRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,107,90,0.18)",
    borderWidth: 1.5, borderColor: "rgba(255,107,90,0.35)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  logoEmoji: { fontSize: 36 },
  brandName: {
    fontSize: 32, fontFamily: "Inter_700Bold",
    color: "#FFFFFF", letterSpacing: -0.8,
  },
  brandTag: {
    fontSize: 13, fontFamily: "Inter_500Medium",
    color: "#A7BFA6", marginTop: 4,
    letterSpacing: 1.2, textTransform: "uppercase",
  },
  cards: { gap: 12 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    gap: 14,
  },
  cardPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  cardIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  cardIcon: { fontSize: 22 },
  cardText: { flex: 1 },
  cardLabel: {
    fontSize: 17, fontFamily: "Inter_700Bold",
    color: "#FFFFFF", marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13, fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
  },
  cardArrow: {
    fontSize: 24, color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
  },
  footer: {
    textAlign: "center", marginTop: 40,
    fontSize: 12, fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.3)",
  },
});
