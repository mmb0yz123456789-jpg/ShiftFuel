import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { queryTable } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

type JobStatus =
  | "pending"
  | "assigned"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

interface Job {
  id: string;
  status: JobStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  address?: string;
  services?: string | string[];
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  vehicle_color?: string;
  total_amount?: number;
  created_at?: string;
}

const FILTERS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Done" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  en_route: "En Route",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<JobStatus, { bg: string; text: string }> = {
  pending: { bg: "#EAF2EA", text: "#5F6F6D" },
  assigned: { bg: "#EAF2EA", text: "#0D3B3B" },
  en_route: { bg: "#FEF3C7", text: "#8A5A00" },
  arrived: { bg: "#DCFCE7", text: "#1F7A45" },
  in_progress: { bg: "#FEE2E2", text: "#FF6B5A" },
  completed: { bg: "#DCFCE7", text: "#1F7A45" },
  cancelled: { bg: "#FEE2E2", text: "#B42318" },
};

function isToday(dateStr?: string) {
  if (!dateStr) return false;
  const today = new Date().toISOString().split("T")[0];
  return dateStr.startsWith(today);
}

function isFuture(dateStr?: string) {
  if (!dateStr) return false;
  const today = new Date().toISOString().split("T")[0];
  return dateStr > today;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr?: string) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m ?? "00"} ${ampm}`;
}

function getServices(job: Job): string {
  if (!job.services) return "Service";
  if (Array.isArray(job.services)) return job.services.join(", ");
  try {
    const parsed = JSON.parse(job.services);
    if (Array.isArray(parsed)) return parsed.join(", ");
    return String(job.services);
  } catch {
    return String(job.services);
  }
}

function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  const colors = STATUS_COLORS[job.status] ?? { bg: "#EAF2EA", text: "#5F6F6D" };
  return (
    <Pressable
      style={({ pressed }) => [styles.jobCard, pressed && styles.jobCardPressed]}
      onPress={onPress}
    >
      <View style={styles.jobCardTop}>
        <View style={styles.jobMeta}>
          <Text style={styles.jobDate}>
            {formatDate(job.scheduled_date)}
            {job.scheduled_time ? ` · ${formatTime(job.scheduled_time)}` : ""}
          </Text>
          <Text style={styles.jobServices} numberOfLines={1}>
            {getServices(job)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {STATUS_LABELS[job.status] ?? job.status}
          </Text>
        </View>
      </View>
      {job.address ? (
        <Text style={styles.jobAddress} numberOfLines={1}>
          📍 {job.address}
        </Text>
      ) : null}
      {(job.vehicle_make || job.vehicle_model) ? (
        <Text style={styles.jobVehicle} numberOfLines={1}>
          {[job.vehicle_year, job.vehicle_color, job.vehicle_make, job.vehicle_model]
            .filter(Boolean)
            .join(" ")}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function JobsTab() {
  const { worker } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("today");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!worker?.id) return;
    const filters: Record<string, string> = { worker_id: `eq.${worker.id}` };
    if (filter === "completed") filters["status"] = "eq.completed";
    if (filter === "active") filters["status"] = "in.(en_route,arrived,in_progress)";
    const data = await queryTable<Job>("service_requests", filters, {
      order: "scheduled_date.asc,scheduled_time.asc",
      limit: 50,
    });
    const filtered =
      filter === "today"
        ? data.filter((j) => isToday(j.scheduled_date))
        : filter === "upcoming"
        ? data.filter((j) => isFuture(j.scheduled_date))
        : data;
    setJobs(filtered);
  }, [worker?.id, filter]);

  useEffect(() => {
    setLoading(true);
    fetchJobs().finally(() => setLoading(false));
  }, [fetchJobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Jobs</Text>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              style={[
                styles.filterChip,
                filter === f.key && styles.filterChipActive,
              ]}
              onPress={() => setFilter(f.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === f.key && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
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
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0D3B3B"
            />
          }
          renderItem={({ item }) => (
            <JobCard
              job={item}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/job/${item.id}`);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No jobs here</Text>
              <Text style={styles.emptySubtitle}>
                {filter === "today"
                  ? "You have no jobs scheduled for today."
                  : filter === "upcoming"
                  ? "No upcoming jobs scheduled."
                  : filter === "active"
                  ? "No active jobs right now."
                  : "No completed jobs yet."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    backgroundColor: "#0D3B3B",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  filterChipActive: {
    backgroundColor: "#FF6B5A",
  },
  filterText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  filterTextActive: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  jobCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#0D3B3B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  jobCardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  jobCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  jobMeta: { flex: 1, marginRight: 10 },
  jobDate: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#5F6F6D",
    marginBottom: 2,
  },
  jobServices: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#0D3B3B",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  jobAddress: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
    marginBottom: 4,
  },
  jobVehicle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#A7BFA6",
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
