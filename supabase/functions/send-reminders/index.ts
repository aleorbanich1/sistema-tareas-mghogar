// @ts-nocheck  ← Este archivo corre en Deno (Supabase Edge Functions), no en Node.
//   Los `npm:` y el global `Deno` son válidos ahí; el TS de VSCode los marca en
//   rojo por error. Se ejecuta y despliega bien igual.

// send-reminders — Edge Function que envía los recordatorios por Web Push.
// La invoca pg_cron cada minuto (ver NOTIFICACIONES-SETUP.md). Busca tareas
// pendientes cuyo horario de recordatorio ya llegó y todavía no se avisaron,
// y manda un push a cada dispositivo suscripto del empleado asignado.
//
// Secrets requeridos (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (los inyecta Supabase por defecto)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   CRON_SECRET  (string secreto; el cron lo manda en el header x-cron-secret)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@mghogar.app",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// Intervalo (ms) de repetición del recordatorio. reminder_hours guarda SEGUNDOS.
// NOTA: el cron corre cada 1 minuto, así que intervalos menores a 60s (ej. para
// pruebas) no se pueden entregar por Web Push; sí funcionan en primer plano/APK.
function reminderIntervalMs(task: Record<string, unknown>): number | null {
  const secs = task.reminder_hours as number | null; // SEGUNDOS
  if (!secs || Number(secs) <= 0) return null;
  return Number(secs) * 1000;
}

Deno.serve(async (req) => {
  // Autorización simple para el cron (además del gateway de Supabase).
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  const now = Date.now();

  // Candidatas: pendientes con recordatorio configurado. Repetimos por intervalo.
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id,title,reminder_hours,assigned_to,status,reminder_sent_at")
    .eq("status", "pending")
    .not("reminder_hours", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  let pushes = 0;

  for (const t of tasks || []) {
    const intervalMs = reminderIntervalMs(t);
    if (intervalMs == null) continue;
    const last = t.reminder_sent_at ? new Date(t.reminder_sent_at as string).getTime() : 0;
    if (now - last < intervalMs) continue;        // todavía no toca repetir

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", t.assigned_to);

    const payload = JSON.stringify({
      title: "⏰ Recordatorio de tarea",
      body: `Tenés que hacer: ${t.title}`,
      tag: `reminder-${t.id}`,
      url: "/",
    });

    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        pushes++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410 = suscripción muerta: la borramos.
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }

    // Marcar como avisada aunque no hubiera suscripciones (evita reintentos infinitos).
    await supabase.from("tasks").update({ reminder_sent_at: new Date().toISOString() }).eq("id", t.id);
    processed++;
  }

  return new Response(JSON.stringify({ ok: true, processed, pushes }), {
    headers: { "Content-Type": "application/json" },
  });
});
