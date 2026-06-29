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
import { useAuth } from "@/context/AuthContext";
import { queryTable } from "@/lib/supabase";

interface CompletedJob {
  id: string;
  scheduled_date?: string;
  services?: string | string[];
  total_amount?: number;
  worker_pay?: number;
  completed_at?: string;
  address?: string;
}

type Period = "week" | "month";

function getStartDate(period: Period): string {
  const d = new Date();
  if (period === "week") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
  } else {
    d.setDate(1);
  }
  return d.toISOString().split("T")[0] ?? "";
}

function fmtCurrency(val?: number): string {
  if (val == null) return "$0.00";
  return `$${Number(val).toFixed(2)}`;
}

function fmtDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getServices(job: CompletedJob): string {
  if (!job.services) return "Service";
  if (Array.isArray(job.services)) return job.services.join(", ");
  try {
    const p = JSON.parse(job.services);
    if (Array.isArray(p)) return p.join(", ");
  } catch {}
  return String(job.services);
}

export default function EarningsTab() {
  const { worker } = useAuth();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>("week");
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!worker?.id) return;
    const startDate = getStartDate(period);
    const data = await queryTable<CompletedJob>("service_requests", {
      worker_id: `eq.${worker.id}`,
      status: "eq.completed",
      scheduled_date: `gte.${startDate}`,
    }, { order: "scheduled_date.desc", limit: 100 });
    setJobs(data);
  }, [worker?.id, period]);

  useEffect(() => {
    setLoading(true);
    fetchJobs().finally(() => setLoading(false));
  }, [fetchJobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  const totalEarnings = jobs.reduce(
    (sum, j) => sum + (Number(j.worker_pay ?? j.total_amount ?? 0)),
    0
  );
  const jobCount = jobs.length;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={styles.periodToggle}>
          {(["week", "month"] as Period[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.periodChip, period === p && styles.periodChipActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p === "week" ? "This Week" : "This Month"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Earned</Text>
          <Text style={styles.summaryAmount}>{fmtCurrency(totalEarnings)}</Text>
          <Text style={styles.summaryCount}>
            {jobCount} job{jobCount !== 1 ? "s" : ""} completed
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0D3B3B" />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D3B3B" />
          }
          ListHeaderComponent={
            jobs.length > 0 ? (
              <Text style={styles.listHeader}>Job Breakdown</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.earningRow}>
              <View style={styles.earningInfo}>
                <Text style={styles.earningDate}>{fmtDate(item.scheduled_date)}</Text>
                <Text style={styles.earningService} numberOfLines={1}>
                  {getServices(item)}
                </Text>
                {item.address ? (
                  <Text style={styles.earningAddress} numberOfLines={1}>{item.address}</Text>
                ) : null}
              </View>
              <Text style={styles.earningAmount}>
                {fmtCurrency(item.worker_pay ?? item.total_amount)}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyTitle}>No earnings yet</Text>
              <Text style={styles.emptySubtitle}>
                Complete jobs to see your earnings here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: {
    backgroundColor: "#0D3B3B",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 14,
  },
  periodToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
    alignSelf: "flex-start",
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  periodChipActive: { backgroundColor: "#FFFFFF" },
  periodText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  periodTextActive: {
    color: "#0D3B3B",
    fontFamily: "Inter_600SemiBold",
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -1,
    marginBottom: 2,
  },
  summaryCount: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#A7BFA6",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingTop: 16, gap: 2 },
  listHeader: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#5F6F6D",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  earningRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#0D3B3B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  earningInfo: { flex: 1, marginRight: 12 },
  earningDate: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#A7BFA6",
    marginBottom: 2,
  },
  earningService: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#0D3B3B",
    marginBottom: 2,
  },
  earningAddress: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
  },
  earningAmount: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#1F7A45",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 44, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#1F1F1F",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
    textAlign: "center",
    lineHeight: 20,
  },
});
