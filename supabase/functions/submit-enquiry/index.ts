import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const allowedOrigins = new Set([
  "https://www.winloogroup.com",
  "https://winloogroup.com",
  "https://winloo.darneitt.workers.dev",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const allowedExtensions = new Set(["pdf","doc","docx","xls","xlsx","dwg","dxf","zip"]);
const maxFiles = 5;
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

    const payload = {
      contact_person: clean(form.get("contact_person"), 200),
      company: clean(form.get("company"), 200) || null,
      email: clean(form.get("email"), 320).toLowerCase(),
      phone: clean(form.get("phone"), 60),
      project_name: clean(form.get("project_name"), 250),
      project_location: clean(form.get("project_location"), 250),
      required_service: clean(form.get("required_service"), 250),
      project_stage: clean(form.get("project_stage"), 120) || null,
      expected_start_date: clean(form.get("expected_start_date"), 20) || null,
      project_description: clean(form.get("project_description"), 10000),
    };

    if (!payload.contact_person || !payload.email || !payload.phone || !payload.project_name || !payload.project_location || !payload.required_service || !payload.project_description) {
      return new Response(JSON.stringify({ error: "Please complete all required fields." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const files = form.getAll("documents").filter((v): v is File => v instanceof File && v.size > 0);
    if (files.length > maxFiles) {
      return new Response(JSON.stringify({ error: `Maximum ${maxFiles} files allowed.` }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExtensions.has(ext) || file.size > maxFileSize) {
        return new Response(JSON.stringify({ error: `Invalid file: ${file.name}` }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      }
    }

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const secret = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret) throw new Error("Server secret key is not configured.");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: enquiry, error: insertError } = await supabase.from("enquiries").insert(payload).select("id").single();
    if (insertError) throw insertError;

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `enquiries/${enquiry.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("winloo-submissions").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: fileRowError } = await supabase.from("enquiry_files").insert({
        enquiry_id: enquiry.id,
        storage_path: path,
        original_name: file.name.slice(0, 255),
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (fileRowError) throw fileRowError;
    }

    return new Response(JSON.stringify({ ok: true, id: enquiry.id }), {
      status: 201,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "We could not submit your enquiry. Please try again." }), {
      status: 500,
      headers: { ...cors(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
