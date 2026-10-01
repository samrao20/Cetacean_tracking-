// Supabase Edge Function: WhatsApp Cloud API webhook for the Koamas
// sighting-report bot. Deploy with:
//   supabase functions deploy whatsapp-bot --no-verify-jwt
// (--no-verify-jwt because Meta calls this anonymously; we verify the
// request ourselves via the X-Hub-Signature-256 header instead — see
// whatsapp.ts#verifySignature.)
//
// Required secrets (supabase secrets set ...): see docs/whatsapp-bot.md.
//   WA_VERIFY_TOKEN, WA_APP_SECRET, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID,
//   PHONE_HASH_SALT, ANTHROPIC_API_KEY (optional),
//   GDRIVE_SERVICE_ACCOUNT_JSON, GDRIVE_BOT_FOLDER_ID (optional — photos
//   are skipped gracefully if unset),
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (Supabase injects these
//   automatically for Edge Functions in the same project).

import { handleMessage } from "./flow.ts";
import { hashPhone } from "./hash.ts";
import { verifySignature } from "./whatsapp.ts";
import type { Env } from "./flow.ts";

function env(name: string): string | undefined {
  return Deno.env.get(name);
}

function loadEnv(): Env {
  return {
    phoneNumberId: env("WA_PHONE_NUMBER_ID") ?? "",
    waToken: env("WA_ACCESS_TOKEN") ?? "",
    claudeKey: env("ANTHROPIC_API_KEY"),
    driveServiceAccountJson: env("GDRIVE_SERVICE_ACCOUNT_JSON"),
    driveFolderId: env("GDRIVE_BOT_FOLDER_ID"),
    supabaseUrl: env("SUPABASE_URL") ?? "",
    supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Meta's webhook verification handshake (one-time, when you register the
  // callback URL in the Meta App dashboard).
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === env("WA_VERIFY_TOKEN")) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const appSecret = env("WA_APP_SECRET");
  if (appSecret) {
    const ok = await verifySignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
    if (!ok) {
      console.error("Rejected webhook: bad signature");
      return new Response("Forbidden", { status: 403 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Always 200 quickly — Meta retries aggressively on non-2xx, and we do
  // our own dedup below rather than relying on that.
  const ack = new Response("OK", { status: 200 });

  try {
    await processPayload(payload);
  } catch (err) {
    console.error("Error processing webhook payload", err);
  }
  return ack;
});

async function processPayload(payload: any) {
  const config = loadEnv();
  const salt = env("PHONE_HASH_SALT") ?? "";
  if (!config.phoneNumberId || !config.waToken || !config.supabaseUrl || !config.supabaseServiceKey || !salt) {
    console.error("whatsapp-bot missing required configuration; see docs/whatsapp-bot.md");
    return;
  }

  const entries = payload.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        await handleInboundMessage(config, salt, message);
      }
      // value.statuses (delivery/read receipts) are ignored — nothing to do with them.
    }
  }
}

async function handleInboundMessage(config: Env, salt: string, message: any) {
  const from = message.from as string; // WhatsApp's E.164-ish sender id
  const phoneHash = await hashPhone(from, salt);

  let inbound;
  switch (message.type) {
    case "text":
      inbound = { kind: "text" as const, text: message.text?.body ?? "" };
      break;
    case "interactive": {
      const btn = message.interactive?.button_reply;
      const list = message.interactive?.list_reply;
      if (btn) inbound = { kind: "button" as const, id: btn.id, text: btn.title };
      else if (list) inbound = { kind: "list" as const, id: list.id, text: list.title };
      else inbound = { kind: "other" as const };
      break;
    }
    case "location":
      inbound = { kind: "location" as const, lat: message.location.latitude, lng: message.location.longitude };
      break;
    case "image":
      inbound = { kind: "image" as const, mediaId: message.image.id };
      break;
    default:
      inbound = { kind: "other" as const };
  }

  await handleMessage(config, phoneHash, from, inbound);
}
