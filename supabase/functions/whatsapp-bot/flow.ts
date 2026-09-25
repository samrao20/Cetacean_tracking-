// The guided conversation. One function, handleMessage(), owns the whole
// state machine: it reads/writes bot_conversations.draft, and inserts into
// bot_submissions once a report is confirmed. scripts/import_sightings.py
// is the only thing that ever writes bot_submissions rows into the Excel
// sheet — this function must never touch Drive/Excel for the sheet itself
// (see the "one writer to the Excel" note in docs/whatsapp-bot.md). It may
// upload photos to Drive, since that's a separate file, not the workbook.

import { sendText, sendButtons, sendList, requestLocation, downloadMedia, Button } from "./whatsapp.ts";
import { extractFields, suggestSpeciesFromPhoto } from "./claude.ts";
import { uploadPhoto } from "./drive.ts";

const SPECIES_ROWS = [
  { id: "Spinner", title: "Spinner dolphin" },
  { id: "Bottlenose", title: "Bottlenose dolphin" },
  { id: "Risso", title: "Risso's dolphin" },
  { id: "Pilot", title: "Short-finned pilot whale" },
  { id: "Orca", title: "Orca" },
  { id: "Cuviers", title: "Cuvier's beaked whale" },
  { id: "Unkown Dolphin", title: "Unknown dolphin" },
  { id: "Unkown Whale", title: "Unknown whale" },
]; // ids must match data/species-aliases.json labels exactly

const PODSIZE_BUTTONS: Button[] = [
  { id: "pod_1-5", title: "1-5" },
  { id: "pod_6-15", title: "6-15" },
  { id: "pod_16+", title: "16+" },
];

export type Env = {
  phoneNumberId: string;
  waToken: string;
  claudeKey?: string;
  driveServiceAccountJson?: string;
  driveFolderId?: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
};

type Draft = {
  species_label?: string;
  lat?: number;
  lng?: number;
  atoll?: string;
  location_text?: string;
  sighting_date?: string; // YYYY-MM-DD
  sighting_time?: string; // HH:MM
  pod_size?: string;
  notes?: string;
  photo_links?: string[];
  ai_suggestions?: Record<string, unknown>;
};

type Conversation = { phone_hash: string; state: string; draft: Draft };

async function sb(env: Env, path: string, init: RequestInit = {}) {
  const resp = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.supabaseServiceKey,
      Authorization: `Bearer ${env.supabaseServiceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!resp.ok) throw new Error(`Supabase ${path} failed: ${resp.status} ${await resp.text()}`);
  return resp;
}

async function loadConversation(env: Env, phoneHash: string): Promise<Conversation> {
  const resp = await sb(env, `bot_conversations?phone_hash=eq.${phoneHash}&select=*`);
  const rows = await resp.json();
  if (rows.length) return rows[0];
  return { phone_hash: phoneHash, state: "menu", draft: {} };
}

async function saveConversation(env: Env, conv: Conversation) {
  await sb(env, "bot_conversations", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ ...conv, updated_at: new Date().toISOString() }),
  });
}

async function resetConversation(env: Env, phoneHash: string) {
  await sb(env, `bot_conversations?phone_hash=eq.${phoneHash}`, { method: "DELETE" });
}

type InboundMessage =
  | { kind: "text"; text: string }
  | { kind: "button" | "list"; id: string; text: string }
  | { kind: "location"; lat: number; lng: number }
  | { kind: "image"; mediaId: string }
  | { kind: "other" };

export async function handleMessage(env: Env, phoneHash: string, from: string, msg: InboundMessage) {
  const conv = await loadConversation(env, phoneHash);
  const send = (text: string) => sendText(env.phoneNumberId, env.waToken, from, text);

  // Global restart, available from any state.
  if (msg.kind === "text" && /^\s*menu\s*$/i.test(msg.text)) {
    await resetConversation(env, phoneHash);
    return sendMenu(env, from);
  }

  switch (conv.state) {
    case "menu":
      return handleMenu(env, phoneHash, from, msg);
    case "awaiting_species":
      return handleSpecies(env, conv, from, msg);
    case "awaiting_location":
      return handleLocation(env, conv, from, msg);
    case "awaiting_date":
      return handleDate(env, conv, from, msg);
    case "awaiting_podsize":
      return handlePodsize(env, conv, from, msg);
    case "awaiting_notes":
      return handleNotes(env, conv, from, msg);
    case "awaiting_photos":
      return handlePhotos(env, conv, from, msg);
    case "confirming":
      return handleConfirm(env, conv, from, msg);
    default:
      await resetConversation(env, phoneHash);
      return sendMenu(env, from);
  }
}

async function sendMenu(env: Env, from: string) {
  return sendButtons(env.phoneNumberId, env.waToken, from,
    "🐬 Welcome to Koamas — Maldives Cetacean Watch.\n\nWhat would you like to do?",
    [
      { id: "menu_report", title: "Report a sighting" },
      { id: "menu_code", title: "Koamas Code" },
      { id: "menu_about", title: "About Koamas" },
    ]);
}

async function handleMenu(env: Env, phoneHash: string, from: string, msg: InboundMessage) {
  const choice = msg.kind === "button" ? msg.id : msg.kind === "text" ? msg.text.toLowerCase() : "";
  if (choice === "menu_report" || /report|sight/i.test(choice)) {
    await startReport(env, phoneHash, from, msg);
    return;
  }
  if (choice === "menu_code" || /code/i.test(choice)) {
    return sendText(env.phoneNumberId, env.waToken, from,
      "The Koamas Code — keep your distance, go slow, give calves space:\nhttps://samrao20.github.io/Cetacean_tracking-/submit.html#koamas-code");
  }
  if (choice === "menu_about" || /about/i.test(choice)) {
    return sendText(env.phoneNumberId, env.waToken, from,
      "Koamas ('dolphin' in Dhivehi) tracks dolphin and whale sightings across the Maldives:\nhttps://samrao20.github.io/Cetacean_tracking-/about.html");
  }
  return sendMenu(env, from);
}

async function startReport(env: Env, phoneHash: string, from: string, msg: InboundMessage) {
  // If the user opened with a free-text description instead of tapping the
  // button, try to fast-forward the draft with Claude before asking anything.
  const draft: Draft = {};
  if (msg.kind === "text" && env.claudeKey && msg.text.length > 15) {
    const fields = await extractFields(env.claudeKey, msg.text);
    if (fields.species_label) draft.species_label = fields.species_label;
    if (fields.atoll) draft.atoll = fields.atoll;
    if (fields.pod_size) draft.pod_size = fields.pod_size;
    if (fields.notes) draft.notes = fields.notes;
  }
  await advanceReportFor(env, phoneHash, from, draft);
}

async function sendSummary(env: Env, from: string, draft: Draft) {
  const lines = [
    "Please confirm this sighting:",
    `Species: ${draft.species_label}`,
    `Location: ${draft.atoll ?? draft.location_text ?? `${draft.lat?.toFixed(4)}, ${draft.lng?.toFixed(4)}`}`,
    `Date: ${draft.sighting_date}${draft.sighting_time ? " " + draft.sighting_time : ""}`,
    `Pod size: ${draft.pod_size}`,
    draft.notes ? `Notes: ${draft.notes}` : null,
    `Photos: ${draft.photo_links?.length ?? 0}`,
  ].filter(Boolean);
  return sendButtons(env.phoneNumberId, env.waToken, from, lines.join("\n"),
    [{ id: "confirm_yes", title: "Confirm" }, { id: "confirm_edit", title: "Start over" }]);
}

async function handleSpecies(env: Env, conv: Conversation, from: string, msg: InboundMessage) {
  const label = msg.kind === "list" || msg.kind === "button" ? msg.id
    : msg.kind === "text" ? matchSpeciesFreeText(msg.text) : null;
  if (!label) {
    return sendList(env.phoneNumberId, env.waToken, from,
      "Sorry, please pick one from the list:", "Choose species", SPECIES_ROWS);
  }
  const draft = { ...conv.draft, species_label: label };
  await advanceReportFor(env, conv.phone_hash, from, draft);
}

function matchSpeciesFreeText(text: string): string | null {
  const t = text.trim().toLowerCase();
  const hit = SPECIES_ROWS.find((r) => r.id.toLowerCase() === t || r.title.toLowerCase().includes(t));
  return hit?.id ?? null;
}

async function handleLocation(env: Env, conv: Conversation, from: string, msg: InboundMessage) {
  const draft = { ...conv.draft };
  if (msg.kind === "location") {
    draft.lat = msg.lat;
    draft.lng = msg.lng;
  } else if (msg.kind === "text" && msg.text.trim()) {
    draft.location_text = msg.text.trim();
    draft.atoll = msg.text.trim();
    // No coordinates from typed text alone — the importer/reviewer will
    // need to fill these in from the atoll name; that's an acceptable gap
    // for a text fallback, flagged via the blue "needs review" highlight.
    draft.lat = draft.lat ?? 0;
    draft.lng = draft.lng ?? 0;
  } else {
    return sendText(env.phoneNumberId, env.waToken, from,
      "Please share your location (📎 → Location) or type the atoll/island name.");
  }
  await advanceReportFor(env, conv.phone_hash, from, draft);
}

async function handleDate(env: Env, conv: Conversation, from: string, msg: InboundMessage) {
  const draft = { ...conv.draft };
  if (msg.kind === "button" && msg.id === "date_today") {
    const now = new Date(Date.now() + 5 * 3600 * 1000); // Maldives is UTC+5
    draft.sighting_date = now.toISOString().slice(0, 10);
    draft.sighting_time = now.toISOString().slice(11, 16);
  } else if (msg.kind === "text") {
    draft.sighting_date = msg.text.trim(); // kept as free text; the importer/reviewer normalises it, same tolerance as hand-entered sheet rows
  } else {
    return sendButtons(env.phoneNumberId, env.waToken, from,
      "When was this? Reply with a date, or tap Today.", [{ id: "date_today", title: "Today" }]);
  }
  await advanceReportFor(env, conv.phone_hash, from, draft);
}

async function handlePodsize(env: Env, conv: Conversation, from: string, msg: InboundMessage) {
  const draft = { ...conv.draft };
  if (msg.kind === "button") draft.pod_size = msg.text;
  else if (msg.kind === "text" && msg.text.trim()) draft.pod_size = msg.text.trim();
  else return sendButtons(env.phoneNumberId, env.waToken, from, "About how many animals?", PODSIZE_BUTTONS);
  await advanceReportFor(env, conv.phone_hash, from, draft);
}

async function handleNotes(env: Env, conv: Conversation, from: string, msg: InboundMessage) {
  const draft = { ...conv.draft };
  if (msg.kind === "button" && msg.id === "skip_notes") draft.notes = "";
  else if (msg.kind === "text") draft.notes = msg.text.trim();
  else draft.notes = "";
  await advanceReportFor(env, conv.phone_hash, from, draft);
}

async function handlePhotos(env: Env, conv: Conversation, from: string, msg: InboundMessage) {
  const draft = { ...conv.draft, photo_links: conv.draft.photo_links ?? [] };

  if (msg.kind === "button" && msg.id === "photos_done") {
    if (draft.photo_links.length === 0) draft.photo_links = ["none"]; // marker so advanceReport doesn't loop forever asking
    await advanceReportFor(env, conv.phone_hash, from, draft);
    return;
  }

  if (msg.kind === "image") {
    if (!env.driveServiceAccountJson || !env.driveFolderId) {
      await sendText(env.phoneNumberId, env.waToken, from,
        "(Photo uploads aren't configured yet — your report will still be saved without it.)");
    } else {
      try {
        const { bytes, mimeType } = await downloadMedia(msg.mediaId, env.waToken);
        const ext = mimeType.includes("png") ? "png" : "jpg";
        const filename = `${conv.phone_hash.slice(0, 8)}-${Date.now()}.${ext}`;
        const link = await uploadPhoto(env.driveServiceAccountJson, env.driveFolderId, filename, bytes, mimeType);
        draft.photo_links.push(link);

        // Advisory only — stored alongside the submission for a reviewer to
        // see, never written as the actual species (see claude.ts).
        if (env.claudeKey) {
          const suggestion = await suggestSpeciesFromPhoto(env.claudeKey, bytes, mimeType);
          if (suggestion) draft.ai_suggestions = { ...draft.ai_suggestions, photo_species_guess: suggestion };
        }
      } catch (err) {
        console.error("Photo handling failed", err);
        await sendText(env.phoneNumberId, env.waToken, from, "Sorry, that photo didn't upload — you can try again or tap Done.");
      }
    }
    await saveConversation(env, { ...conv, state: "awaiting_photos", draft });
    return sendButtons(env.phoneNumberId, env.waToken, from,
      `Got it (${draft.photo_links.length} photo${draft.photo_links.length === 1 ? "" : "s"} so far). Send more, or tap Done.`,
      [{ id: "photos_done", title: "Done" }]);
  }

  return sendButtons(env.phoneNumberId, env.waToken, from, "Send a photo, or tap Done.", [{ id: "photos_done", title: "Done" }]);
}

async function handleConfirm(env: Env, conv: Conversation, from: string, msg: InboundMessage) {
  const choice = msg.kind === "button" ? msg.id : "";
  if (choice === "confirm_edit") {
    await resetConversation(env, conv.phone_hash);
    return sendMenu(env, from);
  }
  if (choice !== "confirm_yes") {
    return sendSummary(env, from, conv.draft);
  }

  const photoLinks = (conv.draft.photo_links ?? []).filter((l) => l !== "none");
  await sb(env, "bot_submissions", {
    method: "POST",
    body: JSON.stringify({
      phone_hash: conv.phone_hash,
      species_label: conv.draft.species_label,
      lat: conv.draft.lat,
      lng: conv.draft.lng,
      atoll: conv.draft.atoll,
      sighting_date: conv.draft.sighting_date,
      sighting_time: conv.draft.sighting_time,
      pod_size: conv.draft.pod_size,
      notes: conv.draft.notes || null,
      photo_links: photoLinks,
      ai_suggestions: conv.draft.ai_suggestions ?? null,
    }),
  });
  await resetConversation(env, conv.phone_hash);
  return sendText(env.phoneNumberId, env.waToken, from,
    "🐬 Thank you! Your sighting is recorded and will appear on the map once reviewed:\nhttps://samrao20.github.io/Cetacean_tracking-/map.html\n\nType *menu* to report another.");
}

// advanceReport() above needs the real phone_hash (it can't call hashFor());
// this wrapper is what every step handler actually calls.
async function advanceReportFor(env: Env, phoneHash: string, from: string, draft: Draft) {
  if (!draft.species_label) {
    await saveConversation(env, { phone_hash: phoneHash, state: "awaiting_species", draft });
    return sendList(env.phoneNumberId, env.waToken, from,
      "What species did you see?", "Choose species", SPECIES_ROWS);
  }
  if (draft.lat == null || draft.lng == null) {
    await saveConversation(env, { phone_hash: phoneHash, state: "awaiting_location", draft });
    return requestLocation(env.phoneNumberId, env.waToken, from,
      "Where did you see it? Tap 📎 → Location, or type the atoll/island name.");
  }
  if (!draft.sighting_date) {
    await saveConversation(env, { phone_hash: phoneHash, state: "awaiting_date", draft });
    return sendButtons(env.phoneNumberId, env.waToken, from,
      "When was this? Reply with a date, or tap Today.", [{ id: "date_today", title: "Today" }]);
  }
  if (!draft.pod_size) {
    await saveConversation(env, { phone_hash: phoneHash, state: "awaiting_podsize", draft });
    return sendButtons(env.phoneNumberId, env.waToken, from, "About how many animals?", PODSIZE_BUTTONS);
  }
  if (draft.notes === undefined) {
    await saveConversation(env, { phone_hash: phoneHash, state: "awaiting_notes", draft });
    return sendButtons(env.phoneNumberId, env.waToken, from,
      "Anything else worth noting? Type it, or skip.", [{ id: "skip_notes", title: "Skip" }]);
  }
  if (!draft.photo_links || draft.photo_links.length === 0) {
    await saveConversation(env, { phone_hash: phoneHash, state: "awaiting_photos", draft: { ...draft, photo_links: [] } });
    return sendButtons(env.phoneNumberId, env.waToken, from,
      "Got any photos? Send them now, or tap Done.", [{ id: "photos_done", title: "Done" }]);
  }
  await saveConversation(env, { phone_hash: phoneHash, state: "confirming", draft });
  return sendSummary(env, from, draft);
}
