#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULTS = {
  loginUrl: "https://pcdl.co/auth",
  timeZone: "America/Toronto",
  days: 3,
  pageTimeoutMs: 90000,
  networkSettleMs: 8000,
  networkIdleTimeoutMs: 12000,
  backoffBaseMinutes: 30,
};

const PATHS = {
  profileDir: path.resolve(".local/pcdl-browser-profile"),
  storageState: path.resolve("playwright/.auth/pcdl-state.json"),
};

const MEDIA_URL_PATTERNS = [
  ".mp4", ".m3u8", ".mp3",
  "cloudfront.net", "cloudflare", "videodelivery.net",
  "customer-", "token=", "signature=", "expires=", "policy=",
];

const BLOCKED_CAPTURE_DOMAINS = [
  "google-analytics", "googletagmanager", "facebook.net",
  "hotjar", "intercom", "sentry", "pcdl.co/login", "pcdl.co/register",
];

function parseArgs(argv) {
  const args = {
    days: DEFAULTS.days,
    date: null,
    dryRun: false,
    headful: false,
    force: false,
    useStorageState: false,
    allowLogin: false,
  };
  for (const token of argv.slice(2)) {
    if (token.startsWith("--days=")) {
      const v = parseInt(token.slice(7), 10);
      if (Number.isFinite(v) && v > 0) args.days = v;
    } else if (token.startsWith("--date=")) {
      const v = token.slice(7);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) args.date = v;
    } else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--headful") args.headful = true;
    else if (token === "--force") args.force = true;
    else if (token === "--use-storage-state") args.useStorageState = true;
    else if (token === "--allow-login") args.allowLogin = true;
  }
  return args;
}

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

function loadConfig(args) {
  const env = { ...parseDotEnv(path.resolve(".env")), ...process.env };
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const missing = required.filter((k) => !env[k]?.trim());
  const adminToken =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.ADMIN_ACCESS_TOKEN ||
    env.SUPABASE_ACCESS_TOKEN ||
    null;
  if (!adminToken?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY|ADMIN_ACCESS_TOKEN|SUPABASE_ACCESS_TOKEN");
  if (missing.length) throw new Error(`Missing required .env keys: ${missing.join(", ")}`);

  return {
    supabaseUrl: env.SUPABASE_URL.trim(),
    supabaseAnonKey: env.SUPABASE_ANON_KEY.trim(),
    adminToken: adminToken.trim(),
    pcdlEmail: env.PCDL_EMAIL?.trim() || "",
    pcdlPassword: env.PCDL_PASSWORD?.trim() || "",
    loginUrl: (env.PCDL_LOGIN_URL || DEFAULTS.loginUrl).trim(),
    timeZone: (env.PCDL_TIME_ZONE || DEFAULTS.timeZone).trim(),
    args,
  };
}

function todayYmd(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function subtractDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

function dateRange(args, timeZone) {
  if (args.date) return { from: args.date, to: args.date };
  const today = todayYmd(timeZone);
  return { from: subtractDays(today, args.days - 1), to: today };
}

function isMediaUrl(url) {
  const lower = String(url || "").toLowerCase();
  if (!lower.startsWith("http")) return false;
  if (BLOCKED_CAPTURE_DOMAINS.some((b) => lower.includes(b))) return false;
  return MEDIA_URL_PATTERNS.some((p) => lower.includes(p));
}

function scoreUrl(url) {
  const lower = url.toLowerCase();
  let score = 0;
  if (lower.includes(".mp4")) score += 400;
  if (lower.includes(".m3u8")) score += 300;
  if (lower.includes(".mp3")) score += 250;
  if (lower.includes("cloudfront.net")) score += 150;
  if (lower.includes("customer-")) score += 140;
  if (lower.includes("videodelivery.net")) score += 130;
  if (lower.includes("cloudflare")) score += 100;
  if (lower.includes("policy=") || lower.includes("signature=")) score += 30;
  if (lower.includes("token=") || lower.includes("expires=")) score += 20;
  score += Math.min(url.length / 50, 10);
  return score;
}

function bestUrl(candidates) {
  const uniq = [...new Set(candidates)];
  return uniq.sort((a, b) => scoreUrl(b) - scoreUrl(a))[0] ?? null;
}

function parseExpiry(url) {
  try {
    const u = new URL(url);
    for (const key of ["Expires", "expires", "exp", "X-Amz-Expires"]) {
      const raw = u.searchParams.get(key);
      if (!raw) continue;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) continue;
      const ms = raw.length >= 13 ? n : n * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  } catch {}
  return null;
}

function safeLog(url) {
  if (!url) return "n/a";
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "invalid-url";
  }
}

async function fetchItems(config, range) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/daily_message_items`);
  url.searchParams.set(
    "select",
    "id,title,pcdl_url,source_page_url,temporary_media_url,media_url_expires_at,media_status,is_active,item_order,day:daily_message_days!inner(scheduled_date,day_number,day_label)"
  );
  url.searchParams.set("pcdl_url", "not.is.null");
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.append("day.scheduled_date", `gte.${range.from}`);
  url.searchParams.append("day.scheduled_date", `lte.${range.to}`);
  url.searchParams.set("order", "item_order.asc");

  const res = await fetch(url, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function startRefreshRun(config, args, range) {
  if (args.dryRun) return null;
  const payload = {
    started_at: new Date().toISOString(),
    triggered_by: args.useStorageState ? "storage_state_session" : "local_profile_session",
    run_type: args.force ? "forced_recent_days" : `recent_days_${range.from}_to_${range.to}`,
  };
  const res = await fetch(`${config.supabaseUrl}/rest/v1/media_refresh_runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to start media_refresh_run: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows?.[0]?.id || null;
}

async function completeRefreshRun(config, runId, metrics, args) {
  if (!runId || args.dryRun) return;
  const u = new URL(`${config.supabaseUrl}/rest/v1/media_refresh_runs`);
  u.searchParams.set("id", `eq.${runId}`);
  const res = await fetch(u, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      completed_at: new Date().toISOString(),
      processed_count: metrics.processed_count,
      updated_count: metrics.updated_count,
      failed_count: metrics.failed_count,
    }),
  });
  if (!res.ok) throw new Error(`Failed to complete media_refresh_run: ${res.status} ${await res.text()}`);
}

async function getLatestFailures(config) {
  const u = new URL(`${config.supabaseUrl}/rest/v1/media_refresh_failures`);
  u.searchParams.set("select", "id,message_item_id,occurred_at,retry_count");
  u.searchParams.set("order", "occurred_at.desc");
  u.searchParams.set("limit", "500");
  const res = await fetch(u, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return new Map();
  const rows = await res.json();
  const map = new Map();
  for (const r of rows || []) {
    if (!map.has(r.message_item_id)) map.set(r.message_item_id, r);
  }
  return map;
}

function shouldBackoffFailure(lastFailure) {
  if (!lastFailure) return false;
  const occurred = Date.parse(lastFailure.occurred_at || "");
  if (!Number.isFinite(occurred)) return false;
  const retryCount = Number(lastFailure.retry_count || 0);
  const waitMinutes = DEFAULTS.backoffBaseMinutes * Math.max(1, 2 ** Math.max(0, retryCount - 1));
  const elapsedMs = Date.now() - occurred;
  return elapsedMs < waitMinutes * 60 * 1000;
}

async function recordRefreshFailure(config, messageItemId, failureType, errorMessage, args) {
  if (args.dryRun) return;
  let retryCount = 0;
  try {
    const latestUrl = new URL(`${config.supabaseUrl}/rest/v1/media_refresh_failures`);
    latestUrl.searchParams.set("select", "retry_count");
    latestUrl.searchParams.set("message_item_id", `eq.${messageItemId}`);
    latestUrl.searchParams.set("order", "occurred_at.desc");
    latestUrl.searchParams.set("limit", "1");
    const latestRes = await fetch(latestUrl, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.adminToken}`,
        Accept: "application/json",
      },
    });
    if (latestRes.ok) {
      const rows = await latestRes.json();
      retryCount = Number(rows?.[0]?.retry_count || 0);
    }
  } catch {}

  const payload = {
    message_item_id: messageItemId,
    failure_type: failureType,
    error: String(errorMessage || "").slice(0, 1000),
    occurred_at: new Date().toISOString(),
    retry_count: retryCount + 1,
  };
  await fetch(`${config.supabaseUrl}/rest/v1/media_refresh_failures`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
}

async function clearRefreshFailures(config, messageItemId, args) {
  if (args.dryRun) return;
  const u = new URL(`${config.supabaseUrl}/rest/v1/media_refresh_failures`);
  u.searchParams.set("message_item_id", `eq.${messageItemId}`);
  await fetch(u, {
    method: "DELETE",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Prefer: "return=minimal",
    },
  });
}

async function updateItem(config, payload, dryRun) {
  if (dryRun) {
    console.log("  [dry-run] would send:", JSON.stringify(payload, null, 2));
    return;
  }
  const itemId = payload.message_item_id;
  if (!itemId) throw new Error("Missing message_item_id for update.");
  const patchUrl = new URL(`${config.supabaseUrl}/rest/v1/daily_message_items`);
  patchUrl.searchParams.set("id", `eq.${itemId}`);

  const body = {
    temporary_media_url: payload.temporary_media_url ?? null,
    media_url_expires_at: payload.media_url_expires_at ?? null,
    media_status: payload.media_status ?? null,
    media_error: payload.media_error ?? null,
    media_collected_at: payload.media_collected_at ?? new Date().toISOString(),
    pcdl_url: payload.pcdl_url ?? null,
    source_page_url: payload.source_page_url ?? null,
  };

  const res = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH failed: ${res.status} ${await res.text()}`);
  console.log("  Saved media refresh directly to daily_message_items.");
}

async function ensureLoggedInWithCredentials(page, config) {
  const email = config.pcdlEmail;
  const password = config.pcdlPassword;
  if (!email || !password) return false;

  await page.goto(config.loginUrl, { waitUntil: "domcontentloaded", timeout: DEFAULTS.pageTimeoutMs });
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
    try { await page.fill(sel, email, { timeout: 4000 }); emailFilled = true; break; } catch {}
  }
  if (!emailFilled) return false;

  let passFilled = false;
  for (const sel of passSelectors) {
    try { await page.fill(sel, password, { timeout: 4000 }); passFilled = true; break; } catch {}
  }
  if (!passFilled) return false;

  let submitted = false;
  for (const sel of submitSelectors) {
    try { await page.click(sel, { timeout: 4000 }); submitted = true; break; } catch {}
  }
  if (!submitted) return false;

  try {
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 20000 });
  } catch {
    return false;
  }
  return !page.url().includes("/login");
}

function looksLikeLoginUrl(url) {
  const s = String(url || "").toLowerCase();
  return s.includes("/login") || s.includes("signin");
}

async function verifyOrRestoreSession(page, config, authMode) {
  await page.goto("https://pcdl.co", { waitUntil: "domcontentloaded", timeout: DEFAULTS.pageTimeoutMs });
  if (!looksLikeLoginUrl(page.url())) return true;

  if (config.args.allowLogin) {
    const ok = await ensureLoggedInWithCredentials(page, config);
    if (!ok) {
      throw new Error(
        "Login fallback failed (possibly CAPTCHA/MFA). Run npm run pcdl:login locally, then rerun refresh."
      );
    }
    if (authMode === "persistent_profile") {
      try { await page.context().storageState({ path: PATHS.storageState }); } catch {}
    }
    return true;
  }

  throw new Error("PCDL session expired. Run npm run pcdl:login locally, then rerun refresh.");
}

async function createBrowserContext(config) {
  const headless = !config.args.headful;
  if (config.args.useStorageState) {
    if (!fs.existsSync(PATHS.storageState)) {
      throw new Error(
        `Missing storage state file: ${PATHS.storageState}. Run npm run pcdl:login first.`
      );
    }
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      storageState: PATHS.storageState,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    return {
      authMode: "storage_state",
      page,
      close: async () => {
        await context.close();
        await browser.close();
      },
    };
  }

  fs.mkdirSync(PATHS.profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(PATHS.profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] || (await context.newPage());
  return {
    authMode: "persistent_profile",
    page,
    close: async () => context.close(),
  };
}

async function extractMediaUrl(page, pcdlUrl) {
  const candidates = new Set();
  const onRequest = (req) => { if (isMediaUrl(req.url())) candidates.add(req.url()); };
  const onResponse = (res) => { if (isMediaUrl(res.url())) candidates.add(res.url()); };
  page.on("request", onRequest);
  page.on("response", onResponse);

  try {
    await page.goto(pcdlUrl, { waitUntil: "domcontentloaded", timeout: DEFAULTS.pageTimeoutMs });
    if (looksLikeLoginUrl(page.url())) {
      throw new Error("Redirected to login while opening media page.");
    }
    await page.waitForTimeout(DEFAULTS.networkSettleMs);

    for (const sel of ['button[aria-label*="play" i]', 'button[class*="play" i]', '.vjs-big-play-button', '[data-plyr="play"]']) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(3000);
          break;
        }
      } catch {}
    }

    try {
      await page.waitForLoadState("networkidle", { timeout: DEFAULTS.networkIdleTimeoutMs });
    } catch {}

    const domUrls = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll("video, audio, source").forEach((el) => {
        const s = el.src || el.getAttribute("src");
        if (s) urls.push(s);
      });
      document.querySelectorAll("[data-src],[data-url],[data-file]").forEach((el) => {
        const s = el.dataset.src || el.dataset.url || el.dataset.file;
        if (s) urls.push(s);
      });
      return urls;
    });
    for (const u of domUrls) {
      try {
        const abs = new URL(u, page.url()).toString();
        if (isMediaUrl(abs)) candidates.add(abs);
      } catch {}
    }
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }

  return [...candidates];
}

async function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig(args);
  const range = dateRange(args, config.timeZone);

  console.log("------------------------------------------------------------");
  console.log("PCDL Media Link Refresh");
  console.log(
    `Date range: ${range.from} -> ${range.to} | Dry run: ${args.dryRun} | Force: ${args.force}`
  );
  console.log(
    `Auth mode: ${args.useStorageState ? "storage state" : "local persistent profile"}`
  );
  console.log("------------------------------------------------------------");

  const runId = await startRefreshRun(config, args, range);
  const allItems = await fetchItems(config, range);
  const failureMap = await getLatestFailures(config);
  const items = args.force
    ? allItems
    : allItems.filter((item) => {
        if (shouldBackoffFailure(failureMap.get(item.id))) return false;
        if (!item.media_url_expires_at) return true;
        return new Date(item.media_url_expires_at).getTime() - Date.now() < 2 * 60 * 60 * 1000;
      });

  console.log(
    `Found ${allItems.length} items | Processing ${items.length} (${allItems.length - items.length} still fresh)`
  );
  if (!items.length) {
    console.log("Nothing to do.");
    await completeRefreshRun(
      config,
      runId,
      { processed_count: 0, updated_count: 0, failed_count: 0 },
      args
    );
    return;
  }

  const runner = await createBrowserContext(config);
  const page = runner.page;
  try {
    await verifyOrRestoreSession(page, config, runner.authMode);
  } catch (err) {
    console.error(err.message || String(err));
    await runner.close();
    process.exit(1);
  }

  const summary = { checked: 0, updated: 0, notFound: 0, errors: 0, rows: [] };
  for (const item of items) {
    summary.checked += 1;
    const label = `[${item.day?.scheduled_date} | ${item.title || item.id}]`;
    console.log(label);
    console.log(`  pcdl_url: ${item.pcdl_url}`);
    const row = {
      date: item.day?.scheduled_date || "",
      title: item.title || "",
      status: "",
      url: "",
      expires_at: "",
      error: "",
    };

    try {
      const candidates = await extractMediaUrl(page, item.pcdl_url);
      const picked = bestUrl(candidates);

      if (!picked) {
        console.log("  x No media URL found.");
        await updateItem(
          config,
          {
            message_item_id: item.id,
            message_id: item.id,
            pcdl_url: item.pcdl_url,
            source_page_url: item.source_page_url || item.pcdl_url,
            temporary_media_url: null,
            media_url_expires_at: null,
            media_status: "not_found",
            media_error: "No playable URL found.",
            media_collected_at: new Date().toISOString(),
          },
          args.dryRun
        );
        summary.notFound += 1;
        await recordRefreshFailure(config, item.id, "not_found", "No playable URL found.", args);
        row.status = "not_found";
      } else {
        const expiresAt = parseExpiry(picked);
        console.log(`  ok ${safeLog(picked)}`);
        console.log(`  expires: ${expiresAt || "unknown"}`);
        await updateItem(
          config,
          {
            message_item_id: item.id,
            message_id: item.id,
            pcdl_url: item.pcdl_url,
            source_page_url: item.source_page_url || item.pcdl_url,
            temporary_media_url: picked,
            media_url_expires_at: expiresAt,
            media_status: "fresh",
            media_error: null,
            media_collected_at: new Date().toISOString(),
          },
          args.dryRun
        );
        summary.updated += 1;
        await clearRefreshFailures(config, item.id, args);
        row.status = "updated";
        row.url = safeLog(picked);
        row.expires_at = expiresAt || "";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  x Error: ${msg}`);
      await recordRefreshFailure(config, item.id, "extract_error", msg, args);
      try {
        await updateItem(
          config,
          {
            message_item_id: item.id,
            message_id: item.id,
            pcdl_url: item.pcdl_url,
            media_status: "error",
            media_error: msg.slice(0, 500),
            media_collected_at: new Date().toISOString(),
          },
          args.dryRun
        );
      } catch {}
      summary.errors += 1;
      row.status = "error";
      row.error = msg.slice(0, 80);
    }

    summary.rows.push(row);
    console.log("");
  }

  await runner.close();
  console.log("------------------------------------------------------------");
  console.log(
    `Updated: ${summary.updated} | Not found: ${summary.notFound} | Errors: ${summary.errors}`
  );
  console.log("------------------------------------------------------------");
  console.table(summary.rows);
  await completeRefreshRun(
    config,
    runId,
    {
      processed_count: summary.checked,
      updated_count: summary.updated,
      failed_count: summary.errors + summary.notFound,
    },
    args
  );
  if (summary.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
