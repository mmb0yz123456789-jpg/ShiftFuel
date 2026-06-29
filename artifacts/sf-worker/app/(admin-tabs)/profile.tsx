import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

export default function AdminProfileTab() {
  const { adminProfile, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [loggingOut, setLoggingOut] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Sign out of Admin Portal?")) { setLoggingOut(true); logout(); }
      return;
    }
    Alert.alert("Sign Out", "Sign out of Admin Portal?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setLoggingOut(true); logout(); } },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: bottomPad }}>
      <View style={[styles.header, { paddingTop: topPad + 20 }]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>🛡️</Text></View>
        <Text style={styles.name}>{adminProfile?.name ?? adminProfile?.username ?? "Admin"}</Text>
        <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Administrator</Text></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Username</Text><Text style={styles.rowValue}>{adminProfile?.username ?? "—"}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Role</Text><Text style={styles.rowValue}>Administrator</Text></View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.8 }, loggingOut && { opacity: 0.5 }]}
        onPress={handleSignOut} disabled={loggingOut}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.version}>ShiftFuel Admin · v1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: { backgroundColor: "#062727", paddingHorizontal: 24, paddingBottom: 32, alignItems: "center" },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,107,90,0.2)", borderWidth: 2, borderColor: "rgba(255,107,90,0.4)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText: { fontSize: 32 },
  name: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 8 },
  adminBadge: { backgroundColor: "rgba(255,107,90,0.2)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,107,90,0.35)" },
  adminBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FF6B5A", letterSpacing: 0.5 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, marginHorizontal: 16, marginTop: 20, padding: 20, shadowColor: "#0D3B3B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#5F6F6D", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0F5F4" },
  rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#5F6F6D" },
  rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#1F1F1F" },
  signOutBtn: { backgroundColor: "#FEE2E2", borderRadius: 14, marginHorizontal: 16, marginTop: 24, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: "#FECACA" },
  signOutText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#B42318" },
  version: { textAlign: "center", marginTop: 20, fontSize: 12, fontFamily: "Inter_400Regular", color: "#A7BFA6" },
});
