import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { queryTable } from "@/lib/supabase";

interface Worker {
  id: string;
  name: string;
  phone?: string;
  status?: string;
  rating?: number;
  total_jobs?: number;
}

const STATUS_COLORS: Record<string, { bg: string; dot: string }> = {
  active: { bg: "#DCFCE7", dot: "#1F7A45" },
  on_break: { bg: "#FEF3C7", dot: "#8A5A00" },
  inactive: { bg: "#F3F4F6", dot: "#5F6F6D" },
};

function getInitials(name: string) {
  return name.split(" ").map(n => n[0] ?? "").slice(0, 2).join("").toUpperCase();
}

function WorkerCard({ worker }: { worker: Worker }) {
  const sc = STATUS_COLORS[worker.status ?? "inactive"] ?? STATUS_COLORS.inactive;
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(worker.name ?? "W")}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{worker.name}</Text>
        {worker.phone ? <Text style={styles.phone}>{worker.phone}</Text> : null}
        <View style={styles.metaRow}>
          {worker.rating != null && (
            <Text style={styles.meta}>⭐ {Number(worker.rating).toFixed(1)}</Text>
          )}
          {worker.total_jobs != null && (
            <Text style={styles.meta}>• {worker.total_jobs} jobs</Text>
          )}
        </View>
      </View>
      <View style={[styles.statusWrap, { backgroundColor: sc.bg }]}>
        <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
        <Text style={[styles.statusLabel, { color: sc.dot }]}>
          {worker.status === "on_break" ? "Break" : worker.status === "active" ? "Active" : "Inactive"}
        </Text>
      </View>
    </View>
  );
}

export default function AdminWorkersTab() {
  const insets = useSafeAreaInsets();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWorkers = useCallback(async () => {
    const data = await queryTable<Worker>("workers", {}, { order: "name.asc", limit: 200 });
    setWorkers(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchWorkers().finally(() => setLoading(false));
  }, [fetchWorkers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkers();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const activeCount = workers.filter(w => w.status === "active").length;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Workers</Text>
        <Text style={styles.headerSub}>
          {activeCount} active · {workers.length} total
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#0D3B3B" /></View>
      ) : (
        <FlatList
          data={workers}
          keyExtractor={w => w.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D3B3B" />}
          renderItem={({ item }) => <WorkerCard worker={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👷</Text>
              <Text style={styles.emptyTitle}>No workers yet</Text>
              <Text style={styles.emptySub}>Workers will appear here once added.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: { backgroundColor: "#062727", paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 2 },
  headerSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#A7BFA6" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#0D3B3B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#0D3B3B", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  info: { flex: 1 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#1F1F1F", marginBottom: 2 },
  phone: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#5F6F6D", marginBottom: 2 },
  metaRow: { flexDirection: "row", gap: 6 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#A7BFA6" },
  statusWrap: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 44, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#1F1F1F", marginBottom: 6 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#5F6F6D", textAlign: "center" },
});
