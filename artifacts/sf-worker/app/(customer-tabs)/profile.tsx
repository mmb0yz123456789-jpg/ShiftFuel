import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

export default function CustomerProfileTab() {
  const { customerProfile, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [loggingOut, setLoggingOut] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  const getInitials = () => {
    const n = customerProfile?.name ?? "";
    return n ? n.split(" ").map(p => p[0] ?? "").slice(0, 2).join("").toUpperCase() : "C";
  };

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Sign out of My Account?")) { setLoggingOut(true); logout(); }
      return;
    }
    Alert.alert("Sign Out", "Sign out of My Account?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setLoggingOut(true); logout(); } },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: bottomPad }}>
      <View style={[styles.header, { paddingTop: topPad + 20 }]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials()}</Text></View>
        <Text style={styles.name}>{customerProfile?.name ?? "Customer"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contact Info</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Phone</Text><Text style={styles.rowValue}>{customerProfile?.phone ?? "—"}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Email</Text><Text style={styles.rowValue} numberOfLines={1}>{customerProfile?.email ?? "—"}</Text></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Need Help?</Text>
        <Text style={styles.helpText}>
          To update your information or cancel a booking, visit shiftfuelconcierge.com or book online.
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.8 }, loggingOut && { opacity: 0.5 }]}
        onPress={handleSignOut} disabled={loggingOut}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.version}>ShiftFuel Concierge · v1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: { backgroundColor: "#1A4A2E", paddingHorizontal: 24, paddingBottom: 32, alignItems: "center" },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  name: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, marginHorizontal: 16, marginTop: 16, padding: 20, shadowColor: "#0D3B3B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#5F6F6D", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F0F5F4" },
  rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#5F6F6D" },
  rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#1F1F1F", maxWidth: "60%", textAlign: "right" },
  helpText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#5F6F6D", lineHeight: 20 },
  signOutBtn: { backgroundColor: "#FEE2E2", borderRadius: 14, marginHorizontal: 16, marginTop: 24, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: "#FECACA" },
  signOutText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#B42318" },
  version: { textAlign: "center", marginTop: 20, fontSize: 12, fontFamily: "Inter_400Regular", color: "#A7BFA6" },
});
