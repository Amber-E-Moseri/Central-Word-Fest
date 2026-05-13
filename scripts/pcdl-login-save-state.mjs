#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { chromium } from "playwright";

const PROFILE_DIR = path.resolve(".local/pcdl-browser-profile");
const STORAGE_STATE_PATH = path.resolve("playwright/.auth/pcdl-state.json");
const DEFAULT_LOGIN_URL = "https://pcdl.co/login";

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  return { ...parseDotEnv(path.resolve(".env")), ...process.env };
}

async function tryCredentialFill(page, env) {
  const email = env.PCDL_EMAIL?.trim() || "";
  const password = env.PCDL_PASSWORD?.trim() || "";
  if (!email || !password) return false;

  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id*="email"]',
    'input[placeholder*="email" i]',
  ];
  const passSelectors = ['input[type="password"]', 'input[name="password"]', 'input[id*="password"]'];
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'button:has-text("Login")',
  ];

  let emailFilled = false;
  for (const sel of emailSelectors) {
    try { await page.fill(sel, email, { timeout: 2500 }); emailFilled = true; break; } catch {}
  }
  if (!emailFilled) return false;

  let passFilled = false;
  for (const sel of passSelectors) {
    try { await page.fill(sel, password, { timeout: 2500 }); passFilled = true; break; } catch {}
  }
  if (!passFilled) return false;

  for (const sel of submitSelectors) {
    try { await page.click(sel, { timeout: 2500 }); return true; } catch {}
  }
  return false;
}

async function main() {
  const env = loadEnv();
  const loginUrl = (env.PCDL_LOGIN_URL || DEFAULT_LOGIN_URL).trim();

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] || (await context.newPage());

  console.log(`Opening ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

  const autofilled = await tryCredentialFill(page, env);
  if (autofilled) {
    console.log("Credential sign-in attempted. Complete CAPTCHA/MFA if prompted.");
  } else {
    console.log("Please log in manually in the open browser window.");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  while (true) {
    const answer = await ask(
      `When login is complete, press Enter to save session state (or type "q" to quit): `
    );
    if ((answer || "").trim().toLowerCase() === "q") {
      rl.close();
      throw new Error("Login cancelled by user.");
    }

    const url = page.url();
    const onLoginPage = url.toLowerCase().includes("/login") || url.toLowerCase().includes("signin");
    if (onLoginPage) {
      console.log(`Still on login page (${url}). Finish sign-in first, then press Enter again.`);
      continue;
    }
    break;
  }
  rl.close();

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved storage state to ${STORAGE_STATE_PATH}`);
  await context.close();
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
