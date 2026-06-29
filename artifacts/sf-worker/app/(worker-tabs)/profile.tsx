import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

function getInitials(name?: string): string {
  if (!name) return "W";
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

export default function ProfileTab() {
  const { worker, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [loggingOut, setLoggingOut] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Sign out of the ShiftFuel Worker app?")) {
        setLoggingOut(true);
        logout();
      }
      return;
    }
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setLoggingOut(true);
            await logout();
          },
        },
      ]
    );
  };

  const statusBg =
    worker?.status === "active"
      ? "#DCFCE7"
      : worker?.status === "on_break"
      ? "#FEF3C7"
      : "#F3F4F6";
  const statusColor =
    worker?.status === "active"
      ? "#1F7A45"
      : worker?.status === "on_break"
      ? "#8A5A00"
      : "#5F6F6D";
  const statusLabel =
    worker?.status === "active"
      ? "Active"
      : worker?.status === "on_break"
      ? "On Break"
      : worker?.status ?? "Inactive";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bottomPad }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 20 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(worker?.name)}</Text>
        </View>
        <Text style={styles.workerName}>{worker?.name ?? "Worker"}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contact Info</Text>
        <InfoRow label="Phone" value={worker?.phone ?? "—"} />
        <InfoRow label="Worker ID" value={worker?.id ?? "—"} />
        <InfoRow label="Status" value={statusLabel} />
        {worker?.rating != null && (
          <InfoRow label="Rating" value={`⭐ ${Number(worker.rating).toFixed(1)}`} />
        )}
        {worker?.total_jobs != null && (
          <InfoRow label="Total Jobs" value={String(worker.total_jobs)} />
        )}
      </View>

      {/* ShiftFuel Brand Card */}
      <View style={styles.brandCard}>
        <Text style={styles.brandCardTitle}>ShiftFuel Concierge</Text>
        <Text style={styles.brandCardSub}>
          Your work matters. Every job keeps someone's day on track.
        </Text>
      </View>

      {/* Sign Out */}
      <Pressable
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && styles.signOutButtonPressed,
          loggingOut && styles.signOutButtonDisabled,
        ]}
        onPress={handleSignOut}
        disabled={loggingOut}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.versionText}>ShiftFuel Worker · v1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: {
    backgroundColor: "#0D3B3B",
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: "center",
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FF6B5A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarText: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  workerName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 20,
    shadowColor: "#0D3B3B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#5F6F6D",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F5F4",
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#5F6F6D",
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#1F1F1F",
    maxWidth: "60%",
    textAlign: "right",
  },
  brandCard: {
    backgroundColor: "#EAF2EA",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#D9E3DF",
  },
  brandCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#0D3B3B",
    marginBottom: 4,
  },
  brandCardSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
    lineHeight: 18,
  },
  signOutButton: {
    backgroundColor: "#FEE2E2",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  signOutButtonPressed: { opacity: 0.8 },
  signOutButtonDisabled: { opacity: 0.5 },
  signOutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#B42318",
  },
  versionText: {
    textAlign: "center",
    marginTop: 20,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#A7BFA6",
  },
});
