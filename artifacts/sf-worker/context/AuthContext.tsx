import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { callRpc } from "@/lib/supabase";

export type Role = "worker" | "admin" | "customer";

export interface WorkerProfile {
  id: string;
  name: string;
  phone: string;
  status: string;
  rating?: number;
  total_jobs?: number;
}

export interface AdminProfile {
  id: string;
  username: string;
  name?: string;
}

export interface CustomerProfile {
  id: string;
  name?: string;
  phone: string;
  email: string;
}

interface AuthState {
  role: Role | null;
  workerProfile: WorkerProfile | null;
  adminProfile: AdminProfile | null;
  customerProfile: CustomerProfile | null;
  isLoading: boolean;
  error: string | null;
  loginWorker: (phone: string, password: string) => Promise<boolean>;
  loginAdmin: (username: string, password: string) => Promise<boolean>;
  loginCustomer: (phone: string, email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const STORAGE_KEY = "sf_portal_session";

const AuthContext = createContext<AuthState>({
  role: null,
  workerProfile: null,
  adminProfile: null,
  customerProfile: null,
  isLoading: true,
  error: null,
  loginWorker: async () => false,
  loginAdmin: async () => false,
  loginCustomer: async () => false,
  logout: async () => {},
  clearError: () => {},
});

async function sha256hex(str: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(str)
      );
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {}
  return str;
}

interface StoredSession {
  role: Role;
  worker?: WorkerProfile;
  admin?: AdminProfile;
  customer?: CustomerProfile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const s = JSON.parse(raw) as StoredSession;
          setRole(s.role);
          if (s.worker) setWorkerProfile(s.worker);
          if (s.admin) setAdminProfile(s.admin);
          if (s.customer) setCustomerProfile(s.customer);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const saveSession = async (session: StoredSession) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  };

  const loginWorker = useCallback(
    async (phone: string, password: string): Promise<boolean> => {
      setError(null);
      try {
        const data = await callRpc<WorkerProfile>("worker_login", {
          p_phone: phone.trim(),
          p_password: password,
        });
        if (!data || !data.id) {
          setError("Invalid phone number or password.");
          return false;
        }
        await saveSession({ role: "worker", worker: data });
        setRole("worker");
        setWorkerProfile(data);
        return true;
      } catch {
        setError("Unable to connect. Check your network and try again.");
        return false;
      }
    },
    []
  );

  const loginAdmin = useCallback(
    async (username: string, password: string): Promise<boolean> => {
      setError(null);
      try {
        const hash = await sha256hex(password);
        const data = await callRpc<AdminProfile>("admin_login", {
          p_username: username.trim(),
          p_password_hash: hash,
        });
        if (!data || !data.id) {
          setError("Invalid username or password.");
          return false;
        }
        await saveSession({ role: "admin", admin: data });
        setRole("admin");
        setAdminProfile(data);
        return true;
      } catch {
        setError("Unable to connect. Check your network and try again.");
        return false;
      }
    },
    []
  );

  const loginCustomer = useCallback(
    async (phone: string, email: string): Promise<boolean> => {
      setError(null);
      try {
        const data = await callRpc<CustomerProfile>("customer_login", {
          p_phone: phone.trim(),
          p_email: email.trim().toLowerCase(),
        });
        if (!data || !data.id) {
          setError("No account found with that phone and email.");
          return false;
        }
        await saveSession({ role: "customer", customer: data });
        setRole("customer");
        setCustomerProfile(data);
        return true;
      } catch {
        setError("Unable to connect. Check your network and try again.");
        return false;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setRole(null);
    setWorkerProfile(null);
    setAdminProfile(null);
    setCustomerProfile(null);
    router.replace("/");
  }, [router]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        role,
        workerProfile,
        adminProfile,
        customerProfile,
        isLoading,
        error,
        loginWorker,
        loginAdmin,
        loginCustomer,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
