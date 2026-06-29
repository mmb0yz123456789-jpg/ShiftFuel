const SUPABASE_URL = "https://nhdsokqxndhlkbsvmxio.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZHNva3F4bmRobGtic3ZteGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDU3ODgsImV4cCI6MjA5NzEyMTc4OH0.Fd7y0eVy-lCDYQ9UXVoDi6kWxdgmGk1QZ_SeVrmIP8I";

function headers(token?: string) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    Accept: "application/json",
  };
}

export async function callRpc<T>(
  name: string,
  params: Record<string, unknown>,
  token?: string
): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data as T;
  } catch {
    return null;
  }
}

export async function queryTable<T>(
  table: string,
  filters: Record<string, string> = {},
  options: { select?: string; order?: string; limit?: number } = {}
): Promise<T[]> {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
    if (options.select) url.searchParams.set("select", options.select);
    if (options.order) url.searchParams.set("order", options.order);
    if (options.limit) url.searchParams.set("limit", String(options.limit));
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

export async function patchRow(
  table: string,
  filter: Record<string, string>,
  patch: Record<string, unknown>
): Promise<boolean> {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      method: "PATCH",
      headers: { ...headers(), Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}
