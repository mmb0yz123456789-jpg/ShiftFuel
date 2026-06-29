import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { queryTable } from "@/lib/supabase";

interface Request {
  id: string;
  status: string;
  scheduled_date?: string;
  scheduled_time?: string;
  address?: string;
  services?: string | string[];
  vehicle_make?: string;
  vehicle_model?: string;
  customer_name?: string;
  worker_id?: string;
  created_at?: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Done" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

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
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return d; }
}

function getServices(r: Request): string {
  if (!r.services) return "Service";
  if (Array.isArray(r.services)) return r.services.join(", ");
  try { const p = JSON.parse(r.services); if (Array.isArray(p)) return p.join(", "); } catch {}
  return String(r.services);
}

function RequestCard({ item }: { item: Request }) {
  const sc = STATUS_COLORS[item.status] ?? { bg: "#EAF2EA", text: "#5F6F6D" };
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardDate}>{fmtDate(item.scheduled_date)}</Text>
          <Text style={styles.cardService} numberOfLines={1}>{getServices(item)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.badgeText, { color: sc.text }]}>{STATUS_LABELS[item.status] ?? item.status}</Text>
        </View>
      </View>
      {item.address ? <Text style={styles.cardAddr} numberOfLines={1}>📍 {item.address}</Text> : null}
      {(item.vehicle_make || item.vehicle_model) ? (
        <Text style={styles.cardVehicle} numberOfLines={1}>
          🚗 {[item.vehicle_make, item.vehicle_model].filter(Boolean).join(" ")}
        </Text>
      ) : null}
      {item.customer_name ? (
        <Text style={styles.cardCustomer} numberOfLines={1}>👤 {item.customer_name}</Text>
      ) : null}
    </View>
  );
}

export default function AdminRequestsTab() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = useCallback(async () => {
    const filters: Record<string, string> = {};
    if (filter === "pending") filters["status"] = "eq.pending";
    else if (filter === "active") filters["status"] = "in.(assigned,en_route,arrived,in_progress)";
    else if (filter === "completed") filters["status"] = "eq.completed";
    const data = await queryTable<Request>("service_requests", filters, {
      order: "created_at.desc", limit: 100,
    });
    setRequests(data);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchRequests().finally(() => setLoading(false));
  }, [fetchRequests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Requests</Text>
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <Pressable key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#0D3B3B" /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D3B3B" />}
          renderItem={({ item }) => <RequestCard item={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No requests</Text>
              <Text style={styles.emptySub}>No {filter === "all" ? "" : filter} requests found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: { backgroundColor: "#062727", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 12 },
  filterRow: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" },
  chipActive: { backgroundColor: "#FF6B5A" },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.65)" },
  chipTextActive: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, shadowColor: "#0D3B3B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  cardDate: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#A7BFA6", marginBottom: 2 },
  cardService: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0D3B3B" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardAddr: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#5F6F6D", marginBottom: 2 },
  cardVehicle: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#5F6F6D", marginBottom: 2 },
  cardCustomer: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#A7BFA6" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 44, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#1F1F1F", marginBottom: 6 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#5F6F6D", textAlign: "center" },
});
