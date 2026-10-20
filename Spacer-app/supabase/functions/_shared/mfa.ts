import { jsonResponse } from "./cors.ts";

// Any Supabase client (functions here load it from jsr: or esm.sh)
interface RpcClient {
  // deno-lint-ignore no-explicit-any
  rpc(fn: string): PromiseLike<{ data: any; error: unknown }>;
}

// Headers for a client that acts as the caller: their JWT, plus the
// "remember this device" token so mfa_satisfied() can accept it
export function callerHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { Authorization: req.headers.get("Authorization") ?? "" };
  const deviceToken = req.headers.get("x-mfa-device");
  if (deviceToken) headers["x-mfa-device"] = deviceToken;
  return headers;
}

// Functions that act with the service role must enforce two-factor themselves:
// RLS (which checks it via mfa_satisfied()) doesn't apply to the service role.
// `caller` is a client carrying the user's JWT. Returns a 403 response to send
// back when the user has MFA on but this session hasn't passed it, else null.
export async function requireMfa(caller: RpcClient): Promise<Response | null> {
  const { data: satisfied, error } = await caller.rpc("mfa_satisfied");
  if (error) return jsonResponse({ error: "Two-factor check failed" }, 500);
  if (!satisfied) {
    return jsonResponse({ error: "Enter your two-factor code to continue", code: "mfa_required" }, 403);
  }
  return null;
}
