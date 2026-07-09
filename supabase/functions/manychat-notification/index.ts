// @ts-nocheck  ← Corre en Deno (Supabase Edge Functions), no en Node. Los `npm:`
//   y el global `Deno` son válidos ahí; el TS de VSCode los marca en rojo por error.
//
// manychat-notification — La "API" que recibe el webhook de Manychat cada vez que
// el bot detecta una conversación que necesita intervención humana. NO crea una
// tarea: inserta una NOTIFICACIÓN PERMANENTE y la rutea solo a los usuarios que
// el jefe configuró para ese `motivo` (tabla notification_routes).
//
// URL pública (fija para todos los clientes, esté la web en Netlify o en local):
//   https://<TU-REF>.supabase.co/functions/v1/manychat-notification
//
// ⚠️ DESPLEGAR CON --no-verify-jwt:
//     supabase functions deploy manychat-notification --no-verify-jwt
//   Manychat manda su propio secreto en Authorization (no un JWT de Supabase). Sin
//   este flag, el gateway de Supabase rechaza el request con 401 ANTES de llegar
//   acá. La seguridad la da el chequeo del token de abajo, no el gateway.
//
// Secrets requeridos (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (los inyecta Supabase por defecto)
//   MANYCHAT_WEBHOOK_SECRET                    (string secreto; Manychat lo manda
//                                               en el header Authorization: Bearer <secret>)
//
// Body que manda Manychat (JSON):
//   { "cliente_nombre": "...", "cliente_telefono": "...",
//     "mensaje_cliente": "...", "motivo": "..." }

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // ── Auth: token secreto en header (Authorization: Bearer <secret>) ──────────
  const secret = Deno.env.get("MANYCHAT_WEBHOOK_SECRET");
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  // Fallback: algunos setups de Manychat mandan el header 'x-webhook-secret'.
  const alt = req.headers.get("x-webhook-secret")?.trim();
  if (!secret || (token !== secret && alt !== secret)) {
    return json({ error: "unauthorized" }, 401);
  }

  // ── Parseo del body ─────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const cliente_nombre = (body.cliente_nombre ?? "").toString().slice(0, 200) || null;
  const cliente_telefono = (body.cliente_telefono ?? "").toString().slice(0, 60) || null;
  const mensaje_cliente = (body.mensaje_cliente ?? "").toString().slice(0, 2000) || null;
  const motivo = (body.motivo ?? "").toString().slice(0, 200) || null;

  // ── 1) Insertar la notificación ─────────────────────────────────────────────
  const { data: notif, error: notifErr } = await supabase
    .from("notifications")
    .insert({ cliente_nombre, cliente_telefono, mensaje_cliente, motivo })
    .select("id")
    .single();

  if (notifErr) return json({ error: notifErr.message }, 500);

  // ── 2) Destinatarios: todas las personas ACTIVADAS en el panel del jefe ──────
  const { data: routes, error: routesErr } = await supabase
    .from("notification_routes")
    .select("user_id")
    .eq("enabled", true);

  if (routesErr) return json({ error: routesErr.message }, 500);

  const recipientIds = [...new Set((routes || []).map((r) => Number(r.user_id)))];

  // ── 3) Insertar destinatarios ────────────────────────────────────────────────
  let delivered = 0;
  if (recipientIds.length > 0) {
    const rows = recipientIds.map((user_id) => ({
      notification_id: notif.id,
      user_id,
    }));
    const { error: recErr } = await supabase
      .from("notification_recipients")
      .insert(rows);
    if (recErr) return json({ error: recErr.message }, 500);
    delivered = rows.length;
  }

  // delivered=0 significa que NADIE está activado en el panel del jefe. La
  // notificación queda igual (sin destinatarios); activá gente en el panel.
  return json({ ok: true, notification_id: notif.id, delivered });
});
