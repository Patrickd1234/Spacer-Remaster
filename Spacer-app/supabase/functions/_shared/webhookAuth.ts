// Database webhooks (public.dispatch_edge_webhook, migration 20261031100000)
// call these functions with `x-webhook-secret: <WEBHOOK_SECRET>`, a secret the
// database reads from Vault. The public anon key is also a valid JWT, so JWT
// verification alone would let anyone with it trigger emails.
//
// The service role key is still accepted, but only when it matches
// SUPABASE_SERVICE_ROLE_KEY exactly: the old dashboard webhooks sent a
// JWT-format key that stopped matching that variable, so every call was refused.

// Constant-time comparison so a secret can't be guessed via response timing
function sameSecret(provided: string, expected: string): boolean {
  if (!expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function isServiceRoleRequest(req: Request): boolean {
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  if (sameSecret(req.headers.get("x-webhook-secret") ?? "", webhookSecret)) return true;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return false;
  return sameSecret(req.headers.get("Authorization") ?? "", `Bearer ${serviceRoleKey}`);
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
