import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

const TOKEN_DIR = join(homedir(), ".foodpanda-mcp");
const TOKEN_FILE = join(TOKEN_DIR, "token.json");
const BROWSER_DATA_DIR = join(TOKEN_DIR, "browser-data");

interface PersistedToken {
  token: string;
  savedAt: string;
}

export function loadPersistedToken(): string | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8")) as PersistedToken;
    if (data && typeof data.token === "string" && data.token.length > 0) {
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistToken(token: string): void {
  mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  const data: PersistedToken = {
    token,
    savedAt: new Date().toISOString(),
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export async function refreshTokenViaBrowser(
  timeoutSeconds: number = 120
): Promise<string> {
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new Error(
      "Playwright is not installed. Run: npx playwright install chromium"
    );
  }

  // Use a persistent context with a real system browser so Google OAuth works.
  // Playwright's bundled Chromium is blocked by Google sign-in.
  // Try: Chrome → Edge → bundled Chromium (fallback for non-Google login).
  mkdirSync(BROWSER_DATA_DIR, { recursive: true, mode: 0o700 });

  const channels: Array<{ channel?: string; label: string }> = [
    { channel: "chrome", label: "Google Chrome" },
    { channel: "msedge", label: "Microsoft Edge" },
    { label: "Playwright Chromium" },
  ];

  let context;
  for (const { channel, label } of channels) {
    try {
      context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
        headless: false,
        ...(channel ? { channel } : {}),
      });
      break;
    } catch {
      // Try next browser
    }
  }

  if (!context) {
    throw new Error(
      "Failed to launch any browser. Install Google Chrome, Microsoft Edge, or run: npx playwright install chromium"
    );
  }

  try {
    const page = context.pages()[0] || await context.newPage();

    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Login timed out after ${timeoutSeconds} seconds. Please try again.`
          )
        );
      }, timeoutSeconds * 1000);

      page.on("request", (request) => {
        const url = request.url();
        if (!url.includes("ph.fd-api.com")) return;

        const authHeader = request.headers()["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) return;

        const token = authHeader.slice("Bearer ".length).trim();
        if (token.length === 0) return;

        // Validate JWT structure (header.payload.signature)
        if (token.split(".").length !== 3) return;

        clearTimeout(timer);
        resolve(token);
      });

      page.goto("https://www.foodpanda.ph").catch((err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to navigate to foodpanda.ph: ${(err as Error).message}`));
      });
    });
  } finally {
    await context.close().catch(() => {});
  }
}
