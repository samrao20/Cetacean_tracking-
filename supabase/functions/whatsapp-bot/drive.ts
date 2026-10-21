// Uploads a WhatsApp photo into the KOAMAS Drive folder using the same
// service-account credentials scripts/import_sightings.py uses for the
// Excel workbook. IMPORTANT: a plain Google service account has no storage
// quota of its own, so DRIVE_FOLDER_ID must point into a Shared Drive (or
// wherever the account has been given upload rights) — see docs/whatsapp-bot.md.

type GoogleTokenResponse = { access_token: string; expires_in: number };

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const creds = JSON.parse(serviceAccountJson);
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc(header)}.${enc(claims)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(creds.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${sigB64}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) throw new Error(`Google token exchange failed: ${resp.status} ${await resp.text()}`);
  const data: GoogleTokenResponse = await resp.json();
  return data.access_token;
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function uploadPhoto(
  serviceAccountJson: string,
  folderId: string,
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const token = await getAccessToken(serviceAccountJson);

  const boundary = "koamas-" + crypto.randomUUID();
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    bytes.slice().buffer,
    `\r\n--${boundary}--`,
  ]);

  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!resp.ok) throw new Error(`Drive upload failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.webViewLink as string;
}
