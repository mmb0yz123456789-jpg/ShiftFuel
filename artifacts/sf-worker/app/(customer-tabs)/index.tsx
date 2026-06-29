import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { queryTable } from "@/lib/supabase";

interface Booking {
  id: string;
  status: string;
  scheduled_date?: string;
  scheduled_time?: string;
  address?: string;
  services?: string | string[];
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  total_amount?: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#EAF2EA", text: "#5F6F6D" },
  assigned: { bg: "#EAF2EA", text: "#0D3B3B" },
  en_route: { bg: "#FEF3C7", text: "#8A5A00" },
  arrived: { bg: "#DCFCE7", text: "#1F7A45" },
  in_progress: { bg: "#FFE4E0", text: "#FF6B5A" },
  completed: { bg: "#DCFCE7", text: "#1F7A45" },
  cancelled: { bg: "#FEE2E2", text: "#B42318" },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", assigned: "Assigned", en_route: "En Route",
  arrived: "Arrived", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
  catch { return d; }
}

function fmtTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h ?? "0", 10);
  return ` · ${hour % 12 || 12}:${m ?? "00"} ${hour >= 12 ? "PM" : "AM"}`;
}

function getServices(b: Booking): string {
  if (!b.services) return "Service";
  if (Array.isArray(b.services)) return b.services.join(", ");
  try { const p = JSON.parse(b.services); if (Array.isArray(p)) return p.join(", "); } catch {}
  return String(b.services);
}

function BookingCard({ booking }: { booking: Booking }) {
  const sc = STATUS_COLORS[booking.status] ?? { bg: "#EAF2EA", text: "#5F6F6D" };
  const isActive = ["en_route", "arrived", "in_progress"].includes(booking.status);
  return (
    <View style={[styles.card, isActive && styles.cardActive]}>
      {isActive && (
        <View style={styles.activePill}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>In Progress</Text>
        </View>
      )}
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardDate}>{fmtDate(booking.scheduled_date)}{fmtTime(booking.scheduled_time)}</Text>
          <Text style={styles.cardService} numberOfLines={1}>{getServices(booking)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.badgeText, { color: sc.text }]}>{STATUS_LABELS[booking.status] ?? booking.status}</Text>
        </View>
      </View>
      {booking.address ? <Text style={styles.cardAddr} numberOfLines={1}>📍 {booking.address}</Text> : null}
      {(booking.vehicle_make || booking.vehicle_model) ? (
        <Text style={styles.cardVehicle} numberOfLines={1}>
          🚗 {[booking.vehicle_color, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" ")}
        </Text>
      ) : null}
      {booking.total_amount != null && booking.status === "completed" && (
        <Text style={styles.cardAmount}>💰 ${Number(booking.total_amount).toFixed(2)}</Text>
      )}
    </View>
  );
}

export default function CustomerBookingsTab() {
  const { customerProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBookings = useCallback(async () => {
    if (!customerProfile?.id) return;
    const data = await queryTable<Booking>("service_requests", {
      customer_id: `eq.${customerProfile.id}`,
    }, { order: "scheduled_date.desc", limit: 50 });
    setBookings(data);
  }, [customerProfile?.id]);

  useEffect(() => {
    setLoading(true);
    fetchBookings().finally(() => setLoading(false));
  }, [fetchBookings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={styles.headerTitle}>My Bookings</Text>
        <Text style={styles.headerSub}>{customerProfile?.name ? `Hi, ${customerProfile.name.split(" ")[0]}` : "Your service history"}</Text>
        <Pressable style={styles.bookNowBtn} onPress={() => Linking.openURL("https://shiftfuelconcierge.com/book")}>
          <Text style={styles.bookNowText}>+ Book a Service</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#1F7A45" /></View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={b => b.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1F7A45" />}
          renderItem={({ item }) => <BookingCard booking={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🚗</Text>
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptySub}>Your past and upcoming services will appear here.</Text>
              <Pressable style={styles.bookBtn} onPress={() => Linking.openURL("https://shiftfuelconcierge.com/book")}>
                <Text style={styles.bookBtnText}>Book Your First Service</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: { backgroundColor: "#1A4A2E", paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 2 },
  headerSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginBottom: 14 },
  bookNowBtn: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, alignSelf: "flex-start", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  bookNowText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, shadowColor: "#0D3B3B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardActive: { borderWidth: 1.5, borderColor: "#FF6B5A" },
  activePill: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FF6B5A" },
  activeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#FF6B5A", letterSpacing: 0.3 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  cardDate: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#A7BFA6", marginBottom: 2 },
  cardService: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0D3B3B" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardAddr: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#5F6F6D", marginBottom: 3 },
  cardVehicle: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#A7BFA6", marginBottom: 3 },
  cardAmount: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#1F7A45" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#1F1F1F", marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#5F6F6D", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  bookBtn: { backgroundColor: "#1F7A45", paddingHorizontal: 24, paddingVertical: 13, borderRadius: 999 },
  bookBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
});
