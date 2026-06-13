// Supabase Edge Function alternative to Vercel Cron.
// Configure secrets: APP_URL and CRON_SECRET.

Deno.serve(async (request) => {
  const appUrl = Deno.env.get("APP_URL");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!appUrl || !cronSecret) {
    return Response.json({ error: "APP_URL and CRON_SECRET are required" }, { status: 500 });
  }

  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/ingest/quotes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cron-secret": cronSecret
    },
    body: JSON.stringify({})
  });

  const body = await response.json().catch(() => ({}));
  return Response.json(body, { status: response.status });
});
