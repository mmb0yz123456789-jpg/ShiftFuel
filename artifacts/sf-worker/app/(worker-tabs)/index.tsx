import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { queryTable } from "@/lib/supabase";

interface Job {
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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(name?: string): string {
  return name?.split(" ")[0] ?? "there";
}

function formatTime(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h ?? "0", 10);
  return `${hour % 12 || 12}:${m ?? "00"} ${hour >= 12 ? "PM" : "AM"}`;
}

function getServices(job: Job): string {
  if (!job.services) return "Service";
  if (Array.isArray(job.services)) return job.services.join(", ");
  try {
    const p = JSON.parse(job.services);
    if (Array.isArray(p)) return p.join(", ");
  } catch {}
  return String(job.services);
}

const ACTIVE_STATUSES = new Set(["en_route", "arrived", "in_progress"]);
const UPCOMING_STATUSES = new Set(["assigned", "pending"]);

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
  pending: "Pending",
  assigned: "Assigned",
  en_route: "En Route",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  const sc = STATUS_COLORS[job.status] ?? { bg: "#EAF2EA", text: "#5F6F6D" };
  return (
    <Pressable
      style={({ pressed }) => [styles.jobCard, pressed && styles.jobCardPressed]}
      onPress={onPress}
    >
      <View style={styles.jobCardRow}>
        <View style={styles.jobCardLeft}>
          {job.scheduled_time ? (
            <Text style={styles.jobTime}>{formatTime(job.scheduled_time)}</Text>
          ) : null}
          <Text style={styles.jobService} numberOfLines={1}>
            {getServices(job)}
          </Text>
          {job.address ? (
            <Text style={styles.jobAddress} numberOfLines={1}>
              📍 {job.address}
            </Text>
          ) : null}
        </View>
        <View style={[styles.jobBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.jobBadgeText, { color: sc.text }]}>
            {STATUS_LABELS[job.status] ?? job.status}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function DashboardTab() {
  const { worker } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [todayJobs, setTodayJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!worker?.id) return;
    const today = new Date().toISOString().split("T")[0];
    const data = await queryTable<Job>(
      "service_requests",
      { worker_id: `eq.${worker.id}`, scheduled_date: `eq.${today}` },
      { order: "scheduled_time.asc", limit: 20 }
    );
    setTodayJobs(data);
  }, [worker?.id]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const activeJobs = todayJobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  const upcomingJobs = todayJobs.filter((j) => UPCOMING_STATUSES.has(j.status));
  const completedCount = todayJobs.filter((j) => j.status === "completed").length;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#FF6B5A"
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={styles.greeting}>
          {getGreeting()}, {getFirstName(worker?.name)} 👋
        </Text>
        <Text style={styles.headerDate}>
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{todayJobs.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{activeJobs.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#0D3B3B" />
        </View>
      ) : (
        <>
          {/* Active Jobs */}
          {activeJobs.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>🔴 Active Now</Text>
              {activeJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/job/${job.id}`);
                  }}
                />
              ))}
            </View>
          )}

          {/* Upcoming Today */}
          {upcomingJobs.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>📅 Up Next</Text>
              {upcomingJobs.slice(0, 3).map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/job/${job.id}`);
                  }}
                />
              ))}
            </View>
          )}

          {/* Empty State */}
          {todayJobs.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🌤️</Text>
              <Text style={styles.emptyTitle}>All clear today</Text>
              <Text style={styles.emptySubtitle}>
                No jobs scheduled yet. Check back later or view all jobs.
              </Text>
              <Pressable
                style={styles.emptyAction}
                onPress={() => router.push("/(tabs)/jobs")}
              >
                <Text style={styles.emptyActionText}>View All Jobs</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: {
    backgroundColor: "#0D3B3B",
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#A7BFA6",
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  statBox: { flex: 1, alignItems: "center" },
  statValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  loadingBox: { paddingTop: 60, alignItems: "center" },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#5F6F6D",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  jobCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#0D3B3B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  jobCardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  jobCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  jobCardLeft: { flex: 1, marginRight: 10 },
  jobTime: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#FF6B5A",
    marginBottom: 2,
  },
  jobService: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#0D3B3B",
    marginBottom: 3,
  },
  jobAddress: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
  },
  jobBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  jobBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 70,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#1F1F1F",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyAction: {
    backgroundColor: "#0D3B3B",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
