// Database webhooks (supabase_functions.http_request triggers) call these
// functions with `Authorization: Bearer <service role key>`. The public anon
// key is also a valid JWT, so JWT verification alone would let anyone with
// the anon key trigger emails — require the exact service role key instead.
export function isServiceRoleRequest(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return false;

  const provided = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${serviceRoleKey}`;
  if (provided.length !== expected.length) return false;

  // Constant-time comparison so the key can't be guessed via response timing
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
