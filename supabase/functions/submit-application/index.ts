import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const allowedOrigins = new Set([
  "https://www.winloogroup.com",
  "https://winloogroup.com",
  "https://winloo.darneitt.workers.dev",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const allowedExtensions = new Set(["pdf","doc","docx"]);
const maxFileSize = 10 * 1024 * 1024;

function cors(origin: string | null) {
  const safeOrigin = origin && allowedOrigins.has(origin) ? origin : "https://www.winloogroup.com";
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function clean(value: FormDataEntryValue | null, max = 5000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
  if (origin && !allowedOrigins.has(origin)) return new Response("Origin not allowed", { status: 403, headers });

  try {
    const form = await req.formData();
    if (clean(form.get("website"))) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });

    const yearsRaw = clean(form.get("years_experience"), 4);
    const jobId = clean(form.get("job_id"), 64);

    const payload = {
      job_id: jobId || null,
      full_name: clean(form.get("full_name"), 200),
      email: clean(form.get("email"), 320).toLowerCase(),
      phone: clean(form.get("phone"), 60),
      current_location: clean(form.get("current_location"), 250) || null,
      position: clean(form.get("position"), 250),
      years_experience: yearsRaw === "" ? null : Math.max(0, Math.min(80, Number.parseInt(yearsRaw, 10) || 0)),
      message: clean(form.get("message"), 10000) || null,
    };

    if (!payload.full_name || !payload.email || !payload.phone || !payload.position) {
      return new Response(JSON.stringify({ error: "Please complete all required fields." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const cv = form.get("cv");
    if (cv instanceof File && cv.size > 0) {
      const ext = cv.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExtensions.has(ext) || cv.size > maxFileSize) {
        return new Response(JSON.stringify({ error: "CV must be a PDF, DOC or DOCX file up to 10 MB." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      }
    }

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const secret = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret) throw new Error("Server secret key is not configured.");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (payload.job_id) {
      const { data: job } = await supabase.from("jobs").select("id,status,closing_date,deleted_at").eq("id", payload.job_id).maybeSingle();
      if (!job || job.deleted_at || job.status !== "published" || (job.closing_date && new Date(job.closing_date) < new Date(new Date().toISOString().slice(0,10)))) {
        return new Response(JSON.stringify({ error: "This vacancy is no longer accepting applications." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      }
    }

    const { data: application, error: insertError } = await supabase.from("applications").insert(payload).select("id").single();
    if (insertError) throw insertError;

    if (cv instanceof File && cv.size > 0) {
      const ext = cv.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `applications/${application.id}/cv-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("winloo-submissions").upload(path, cv, {
        contentType: cv.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: fileRowError } = await supabase.from("application_files").insert({
        application_id: application.id,
        storage_path: path,
        original_name: cv.name.slice(0, 255),
        mime_type: cv.type || null,
        size_bytes: cv.size,
      });
      if (fileRowError) throw fileRowError;
    }

    return new Response(JSON.stringify({ ok: true, id: application.id }), {
      status: 201,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "We could not submit your application. Please try again." }), {
      status: 500,
      headers: { ...cors(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
