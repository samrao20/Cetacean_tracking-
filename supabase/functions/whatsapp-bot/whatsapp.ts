// Thin wrapper around the Meta WhatsApp Cloud API (Graph API). Swapping
// providers (e.g. Twilio, if Meta business verification stalls — see
// docs/whatsapp-bot.md) means replacing this file only; nothing else in
// the function talks to the transport directly.

const GRAPH_VERSION = "v21.0";

function apiUrl(phoneNumberId: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

async function post(phoneNumberId: string, token: string, body: unknown) {
  const resp = await fetch(apiUrl(phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    console.error("WhatsApp send failed", resp.status, await resp.text());
  }
  return resp;
}

export async function sendText(phoneNumberId: string, token: string, to: string, text: string) {
  return post(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
}

export type Button = { id: string; title: string };

// WhatsApp interactive "reply buttons" — max 3 per message, 20 chars each.
export async function sendButtons(
  phoneNumberId: string,
  token: string,
  to: string,
  bodyText: string,
  buttons: Button[],
) {
  return post(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

export type ListRow = { id: string; title: string; description?: string };

// WhatsApp interactive "list" — used for the species picker, which has more
// than 3 options (buttons cap out at 3).
export async function sendList(
  phoneNumberId: string,
  token: string,
  to: string,
  bodyText: string,
  buttonLabel: string,
  rows: ListRow[],
) {
  return post(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [{ title: "Species", rows: rows.slice(0, 10) }],
      },
    },
  });
}

export async function requestLocation(phoneNumberId: string, token: string, to: string, bodyText: string) {
  return post(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: bodyText },
      action: { name: "send_location" },
    },
  });
}

// Downloads inbound media (a photo the user sent) via the two-step Graph
// flow: resolve the media id to a temporary URL, then fetch the bytes.
export async function downloadMedia(mediaId: string, token: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const metaResp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaResp.ok) throw new Error(`Failed to resolve media ${mediaId}: ${metaResp.status}`);
  const meta = await metaResp.json();

  const fileResp = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResp.ok) throw new Error(`Failed to download media ${mediaId}: ${fileResp.status}`);
  const bytes = new Uint8Array(await fileResp.arrayBuffer());
  return { bytes, mimeType: meta.mime_type ?? "application/octet-stream" };
}

// Verifies X-Hub-Signature-256 on inbound webhooks so we only act on
// deliveries genuinely signed by Meta with our app secret.
export async function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = signatureHeader.slice("sha256=".length);
  return timingSafeEqual(computed, given);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
