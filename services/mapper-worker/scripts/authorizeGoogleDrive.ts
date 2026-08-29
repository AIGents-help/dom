// One-time, interactive Google Drive OAuth authorization for the DOM
// owner's own Google account. Run this once per Google account (or
// whenever the refresh token is rotated/revoked); the worker and the main
// app then use the printed refresh token for unattended access.
//
// Usage:
//   cd services/mapper-worker
//   npx tsx scripts/authorizeGoogleDrive.ts
//
// Requires GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET already
// set in .env.local (from a "Desktop app" OAuth client you create once in
// Google Cloud Console — see README.md's "Google Drive setup"). This
// script never writes any file and never commits anything -- it only ever
// prints the refresh token to your terminal for you to paste into
// .env.local yourself.
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { google } from "googleapis";

function loadEnvLocal() {
  const path = resolve(__dirname, "..", ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const m = s.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnvLocal();

const PORT = Number(process.env.GOOGLE_DRIVE_AUTHORIZE_PORT || 53682);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/drive"];

function openInBrowser(url: string) {
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {}); // best-effort only -- the URL is printed either way
}

async function main() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "Missing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET in services/mapper-worker/.env.local.\n" +
        "Create a Desktop app OAuth client in Google Cloud Console first — see README.md's \"Google Drive setup\"."
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // forces a fresh refresh_token even if this account already authorized before
    scope: SCOPES,
  });

  console.log("\n1. Open this URL and sign in with the Google account DOM's Drive archive should live in:\n");
  console.log(`   ${authUrl}\n`);
  console.log(`Waiting for authorization at ${REDIRECT_URI} ...\n`);
  openInBrowser(authUrl);

  const code = await new Promise<string>((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const authCode = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(error ? "<h1>Authorization failed</h1><p>You can close this tab.</p>" : "<h1>Authorized</h1><p>You can close this tab and return to the terminal.</p>");
      server.close();
      if (error || !authCode) rejectPromise(new Error(error ?? "No authorization code received."));
      else resolvePromise(authCode);
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "\nGoogle did not return a refresh_token. This usually means this account already has an active grant for this " +
        'OAuth client without offline access. Revoke access at https://myaccount.google.com/permissions and run this script again.'
    );
    process.exit(1);
  }

  console.log("\nAuthorization succeeded. Add this to services/mapper-worker/.env.local AND the main app's env (Vercel/`.env.local`):\n");
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log("This value is a credential -- never commit it, never paste it anywhere but your own .env.local / secret manager.\n");
}

main().catch((err) => {
  console.error("\nAuthorization failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
