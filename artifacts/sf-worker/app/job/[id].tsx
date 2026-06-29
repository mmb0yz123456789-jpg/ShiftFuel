import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { patchRow, queryTable } from "@/lib/supabase";

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
  location_notes?: string;
  services?: string | string[];
  vehicle_year?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_license_plate?: string;
  customer_name?: string;
  total_amount?: number;
  worker_pay?: number;
  notes?: string;
}

const STATUS_ACTIONS: Partial<Record<JobStatus, { label: string; next: JobStatus; color: string }>> = {
  assigned: { label: "Start Driving", next: "en_route", color: "#0D3B3B" },
  en_route: { label: "Mark Arrived", next: "arrived", color: "#8A5A00" },
  arrived: { label: "Start Job", next: "in_progress", color: "#1F7A45" },
  in_progress: { label: "Complete Job", next: "completed", color: "#FF6B5A" },
};

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
  in_progress: { bg: "#FFE4E0", text: "#FF6B5A" },
  completed: { bg: "#DCFCE7", text: "#1F7A45" },
  cancelled: { bg: "#FEE2E2", text: "#B42318" },
};

function getServices(job: Job): string[] {
  if (!job.services) return [];
  if (Array.isArray(job.services)) return job.services;
  try {
    const p = JSON.parse(job.services);
    if (Array.isArray(p)) return p;
  } catch {}
  return [String(job.services)];
}

function formatDate(d?: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function formatTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h ?? "0", 10);
  return `${hour % 12 || 12}:${m ?? "00"} ${hour >= 12 ? "PM" : "AM"}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { worker } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadJob = useCallback(async () => {
    if (!id) return;
    const [data] = await queryTable<Job>("service_requests", { id: `eq.${id}` }, { limit: 1 });
    if (data) setJob(data);
  }, [id]);

  useEffect(() => {
    loadJob().finally(() => setLoading(false));
  }, [loadJob]);

  const updateStatus = async (nextStatus: JobStatus) => {
    if (!job) return;
    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const patch: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "completed") patch["completed_at"] = new Date().toISOString();
    const ok = await patchRow("service_requests", { id: `eq.${job.id}` }, patch);
    if (ok) {
      setJob((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (nextStatus === "completed") {
        setTimeout(() => router.back(), 1000);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === "web") {
        alert("Could not update job status. Please try again.");
      } else {
        Alert.alert("Error", "Could not update job status. Please try again.");
      }
    }
    setUpdating(false);
  };

  const openMaps = () => {
    if (!job?.address) return;
    const encoded = encodeURIComponent(job.address);
    const url =
      Platform.OS === "ios"
        ? `maps://?q=${encoded}`
        : `https://maps.google.com/?q=${encoded}`;
    Linking.openURL(url);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0D3B3B" size="large" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>Job not found.</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const action = STATUS_ACTIONS[job.status];
  const statusColors = STATUS_COLORS[job.status] ?? { bg: "#EAF2EA", text: "#5F6F6D" };
  const services = getServices(job);

  return (
    <View style={styles.container}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          style={styles.headerBack}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={styles.headerBackText}>← Back</Text>
        </Pressable>
        <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
          <Text style={[styles.statusPillText, { color: statusColors.text }]}>
            {STATUS_LABELS[job.status]}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 16 }}
      >
        {/* Schedule */}
        <Section title="Schedule">
          <View style={styles.infoCard}>
            <Text style={styles.infoValue}>{formatDate(job.scheduled_date)}</Text>
            {job.scheduled_time && (
              <Text style={styles.infoSub}>{formatTime(job.scheduled_time)}</Text>
            )}
          </View>
        </Section>

        {/* Location */}
        {job.address && (
          <Section title="Location">
            <Pressable style={styles.addressCard} onPress={openMaps}>
              <View style={styles.addressMain}>
                <Text style={styles.infoValue}>{job.address}</Text>
                {job.location_notes && (
                  <Text style={styles.infoSub}>{job.location_notes}</Text>
                )}
              </View>
              <Text style={styles.mapsButton}>Open →</Text>
            </Pressable>
          </Section>
        )}

        {/* Vehicle */}
        <Section title="Vehicle">
          <View style={styles.infoCard}>
            <Text style={styles.infoValue}>
              {[job.vehicle_year, job.vehicle_color, job.vehicle_make, job.vehicle_model]
                .filter(Boolean)
                .join(" ") || "—"}
            </Text>
            {job.vehicle_license_plate && (
              <View style={styles.plateBadge}>
                <Text style={styles.plateText}>{job.vehicle_license_plate}</Text>
              </View>
            )}
          </View>
        </Section>

        {/* Services */}
        {services.length > 0 && (
          <Section title="Services">
            <View style={styles.infoCard}>
              {services.map((s, i) => (
                <View key={i} style={styles.serviceRow}>
                  <View style={styles.serviceDot} />
                  <Text style={styles.serviceText}>{s}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Notes */}
        {job.notes ? (
          <Section title="Notes">
            <View style={styles.infoCard}>
              <Text style={styles.notesText}>{job.notes}</Text>
            </View>
          </Section>
        ) : null}

        {/* Pay */}
        {(job.worker_pay != null || job.total_amount != null) && (
          <Section title="Pay">
            <View style={styles.infoCard}>
              <Text style={styles.payAmount}>
                ${Number(job.worker_pay ?? job.total_amount ?? 0).toFixed(2)}
              </Text>
            </View>
          </Section>
        )}

        {/* Status Action */}
        {action && (
          <View style={styles.actionSection}>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: action.color },
                pressed && styles.actionButtonPressed,
                updating && styles.actionButtonDisabled,
              ]}
              onPress={() => updateStatus(action.next)}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>{action.label}</Text>
              )}
            </Pressable>
          </View>
        )}

        {job.status === "completed" && (
          <View style={styles.completedBanner}>
            <Text style={styles.completedText}>✓ Job Completed</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  center: { flex: 1, backgroundColor: "#F7F7F5", alignItems: "center", justifyContent: "center" },
  header: {
    backgroundColor: "#0D3B3B",
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBack: { padding: 4 },
  headerBackText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#A7BFA6",
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: { flex: 1 },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#5F6F6D",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#0D3B3B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#1F1F1F",
    marginBottom: 2,
  },
  infoSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
  },
  addressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#0D3B3B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  addressMain: { flex: 1, marginRight: 12 },
  mapsButton: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#0D3B3B",
  },
  plateBadge: {
    marginTop: 8,
    backgroundColor: "#F0F5F4",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  plateText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#1F1F1F",
    letterSpacing: 1,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  serviceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF6B5A",
  },
  serviceText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#1F1F1F",
  },
  notesText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#5F6F6D",
    lineHeight: 20,
  },
  payAmount: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#1F7A45",
  },
  actionSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  actionButton: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
  },
  actionButtonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  actionButtonDisabled: { opacity: 0.6 },
  actionButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  completedBanner: {
    margin: 16,
    backgroundColor: "#DCFCE7",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  completedText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#1F7A45",
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#5F6F6D",
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: "#0D3B3B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
