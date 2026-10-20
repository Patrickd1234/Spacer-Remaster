export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Per Tech Spec 7.2: authorization failures return 404, not 403, so a
// resource's existence is never confirmed to a user without access.
export function notFound(message = "Not found") {
  return jsonResponse({ error: message }, 404);
}

export function badRequest(message: string) {
  return jsonResponse({ error: message }, 400);
}
