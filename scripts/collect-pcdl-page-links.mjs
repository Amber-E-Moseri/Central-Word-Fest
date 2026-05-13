#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULTS = {
  loginUrl: "https://pcdl.co/auth",
  libraryUrl: "https://pcdl.co/browse",
  searchUrl: "https://pcdl.co/browse",
  pageTimeoutMs: 90000,
  mode: "hybrid",
};

const PATHS = {
  profileDir: path.resolve(".local/pcdl-browser-profile"),
  storageState: path.resolve("playwright/.auth/pcdl-state.json"),
  debugDir: path.resolve(".local"),
};

function parseArgs(argv) {
  const args = {
    limit: null,
    force: false,
    dryRun: false,
    headful: false,
    useStorageState: false,
    mode: DEFAULTS.mode,
    csv: "pcdl_links.csv",
    debug: false,
    forceSearch: false,
    forceConfirmed: false,
  };
  for (const token of argv.slice(2)) {
    if (token.startsWith("--limit=")) {
      const v = parseInt(token.slice(8), 10);
      if (Number.isFinite(v) && v > 0) args.limit = v;
    } else if (token === "--force") args.force = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--headful") args.headful = true;
    else if (token === "--use-storage-state") args.useStorageState = true;
    else if (token.startsWith("--mode=")) {
      const v = token.slice(7).trim().toLowerCase();
      if (["library", "search", "csv", "hybrid"].includes(v)) args.mode = v;
    } else if (token.startsWith("--csv=")) args.csv = token.slice(6).trim();
    else if (token === "--debug") args.debug = true;
    else if (token === "--force-search") args.forceSearch = true;
    else if (token === "--force-confirmed") args.forceConfirmed = true;
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

function parseCsvUrls(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadConfig(args) {
  const merged = { ...parseDotEnv(path.resolve(".env")), ...process.env };
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const missing = required.filter((k) => !merged[k]?.trim());
  const adminToken =
    merged.SUPABASE_SERVICE_ROLE_KEY ||
    merged.ADMIN_ACCESS_TOKEN ||
    merged.SUPABASE_ACCESS_TOKEN ||
    null;
  if (!adminToken?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY|ADMIN_ACCESS_TOKEN|SUPABASE_ACCESS_TOKEN");
  if (missing.length) throw new Error(`Missing required .env keys: ${missing.join(", ")}`);

  const primaryLibrary = (merged.PCDL_LIBRARY_URL || DEFAULTS.libraryUrl).trim();
  const libraryList = parseCsvUrls(merged.PCDL_LIBRARY_URLS);
  const libraryUrls = libraryList.length ? libraryList : [primaryLibrary];
  return {
    supabaseUrl: merged.SUPABASE_URL.trim(),
    supabaseAnonKey: merged.SUPABASE_ANON_KEY.trim(),
    adminToken: adminToken.trim(),
    libraryUrls,
    searchUrl: (merged.PCDL_SEARCH_URL || DEFAULTS.searchUrl).trim(),
    loginUrl: (merged.PCDL_LOGIN_URL || DEFAULTS.loginUrl).trim(),
    args,
  };
}

function looksLikeLoginUrl(url) {
  const s = String(url || "").toLowerCase();
  return s.includes("/login") || s.includes("/auth") || s.includes("signin");
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bvol(?:ume)?\.?\b/g, " volume ")
    .replace(/\bpt(?:art)?\.?\b/g, " part ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SOFT_PREFIX_PHRASES = [
  "an expose on",
  "expose on",
  "introduction to",
  "teaching on",
  "message on",
];

function stripSoftPrefixPhrase(norm) {
  let out = norm;
  for (const p of SOFT_PREFIX_PHRASES) {
    if (out.startsWith(`${p} `)) {
      out = out.slice(p.length + 1).trim();
      break;
    }
  }
  return out;
}

function getPcdlContentKind(href) {
  try {
    const u = new URL(href);
    const p = u.pathname.toLowerCase();
    if (p.includes("/watch/")) return "watch";
    if (p.includes("/listen/")) return "listen";
  } catch {}
  return "";
}

function getPcdlSlugTitle(href) {
  try {
    const u = new URL(href);
    const parts = u.pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] || "").replace(/-/g, " ").trim();
  } catch {
    return "";
  }
}

function isGenericTitleText(s) {
  const t = normalizeText(s);
  return !t || ["watch", "play", "open", "view", "listen"].includes(t);
}

function cleanDisplayTitle(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/\b(?:watch|play|open|view|listen)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(itemTitle, candidateText, href) {
  const a = normalizeText(itemTitle);
  const b = normalizeText(candidateText);
  const aStripped = stripSoftPrefixPhrase(a);
  const bStripped = stripSoftPrefixPhrase(b);
  if (!a) return 0;
  let score = 0;
  if (a === b) score += 1500;
  if (aStripped && bStripped && aStripped === bStripped && a !== b) score += 350;
  if (b.includes(a)) score += 400 + a.length;
  if (a.includes(b) && a !== b) score += 120;
  const words = a.split(" ").filter(Boolean);
  for (const w of words) if (b.includes(w)) score += 45;
  const slug = normalizeText(String(href || ""));
  const finalSlug = normalizeText(getPcdlSlugTitle(href));
  for (const w of words) if (slug.includes(w)) score += 25;
  for (const w of words) if (finalSlug.includes(w)) score += 35;
  const coverage = words.length ? words.filter((w) => b.includes(w)).length / words.length : 0;
  score += Math.round(coverage * 200);
  if (finalSlug && finalSlug === a) score += 180;

  // Penalize major leading qualifiers for non-exact matches.
  if (a !== b) {
    const prefixHit = SOFT_PREFIX_PHRASES.some((p) => b.startsWith(`${p} `));
    if (prefixHit && !SOFT_PREFIX_PHRASES.some((p) => a.startsWith(`${p} `))) {
      score -= 420;
    }
    if (b.includes(a) && b.length >= a.length + 12) {
      score -= 260;
    }
    if (a.includes(b) && a.length >= b.length + 12) {
      score -= 220;
    }
  }
  return score;
}

function confidenceForScore(score) {
  if (score >= 850) return "high";
  if (score >= 520) return "medium";
  return "low";
}

function extractNumericVolumePartFromText(s) {
  const norm = normalizeText(s);
  const vol = norm.match(/\bvolume\s+(\d+)\b/i);
  const part = norm.match(/\bpart\s+(\d+[a-z]?)\b/i);
  return {
    volume: vol ? parseInt(vol[1], 10) : null,
    part: part ? part[1].toUpperCase() : null,
  };
}

// ─── Series-title parsing ─────────────────────────────────────────────────────

function parseSeriesParts(title) {
  const s = String(title || "");
  const VOL_RX = /\(?\s*(?:vol(?:ume)?\.?)\s+(\d+)/i;
  const PART_RX = /\b(?:pt(?:art)?\.?|part)\s+(\d+[A-Za-z]?)/i;
  const volMatch = s.match(VOL_RX);
  const partMatch = s.match(PART_RX);
  if (!volMatch && !partMatch) return { isSeries: false, baseName: s.trim(), volume: null, part: null };
  const volCut = s.search(/\s*\(?\s*(?:vol(?:ume)?\.?)\s+\d/i);
  const partCut = s.search(/\s*\(?\s*(?:pt(?:art)?\.?|part)\s+\d/i);
  const cuts = [volCut, partCut].filter((n) => n >= 0);
  const cutIdx = cuts.length ? Math.min(...cuts) : s.length;
  const baseName = s.slice(0, cutIdx).trim().replace(/[,\s(]+$/, "").trim();
  const volume = volMatch ? parseInt(volMatch[1], 10) : null;
  const part = partMatch ? partMatch[1].toUpperCase() : null;
  return { isSeries: true, baseName, volume, part };
}

function parsePartString(s) {
  const m = String(s || "").trim().match(/^(\d+)([A-Za-z]?)$/);
  if (!m) return null;
  return { num: parseInt(m[1], 10), suffix: m[2].toUpperCase() };
}

function scoreEpisodeCard(card, parsed) {
  const { volume, part, baseName } = parsed;
  let score = 0;
  const reasons = [];
  const allRaw = [card.cardText, card.title, card.aria, card.sectionText, card.parentText].join(" ");
  const allNorm = normalizeText(allRaw);
  const sectionNorm = normalizeText(card.sectionText || "");

  const baseNorm = normalizeText(baseName || "");
  if (baseNorm && allNorm.includes(baseNorm)) { score += 150; reasons.push("base_name"); }

  if (volume !== null) {
    const sectionVols = [...sectionNorm.matchAll(/\bvolume\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
    const allVols = [...allNorm.matchAll(/\bvolume\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
    if (sectionVols.length) {
      if (sectionVols.includes(volume)) { score += 500; reasons.push(`sec_vol=${volume}`); }
      else { score -= 800; reasons.push(`sec_vol_mismatch(${sectionVols}!=${volume})`); }
    } else if (allVols.length) {
      if (allVols.includes(volume)) { score += 350; reasons.push(`vol=${volume}`); }
      else { score -= 600; reasons.push(`vol_mismatch(${allVols}!=${volume})`); }
    }
  }

  if (part !== null) {
    const target = parsePartString(part);
    if (target) {
      const partMatches = [...allNorm.matchAll(/\bpart\s+(\d+)([a-z]?)/g)].map((m) => ({
        num: parseInt(m[1], 10),
        suffix: (m[2] || "").toUpperCase(),
      }));
      if (partMatches.length) {
        const exact = partMatches.find((p) => p.num === target.num && p.suffix === target.suffix);
        const numOnly = partMatches.find((p) => p.num === target.num && p.suffix !== target.suffix);
        if (exact) {
          score += 600; reasons.push(`part_exact=${target.num}${target.suffix}`);
        } else if (numOnly) {
          score -= 700; reasons.push(`part_suffix_mismatch(${numOnly.num}${numOnly.suffix}!=${target.num}${target.suffix})`);
        } else {
          score -= 800; reasons.push(`part_num_mismatch(found=${partMatches[0].num}${partMatches[0].suffix},want=${target.num}${target.suffix})`);
        }
      }
    }
  }
  return { score, reasons };
}

async function fetchItems(config, args) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/daily_message_items`);
  url.searchParams.set(
    "select",
    "id,title,pcdl_url,is_active,item_order,day:daily_message_days!inner(scheduled_date,day_number)"
  );
  url.searchParams.set("is_active", "eq.true");
  if (!args.force) url.searchParams.set("pcdl_url", "is.null");
  url.searchParams.set("order", "item_order.asc");
  if (args.limit) url.searchParams.set("limit", String(args.limit));

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

async function updateItem(config, itemId, patch, dryRun) {
  if (dryRun) {
    console.log("  [dry-run] would PATCH:", itemId, JSON.stringify(patch));
    return;
  }
  const patchUrl = new URL(`${config.supabaseUrl}/rest/v1/daily_message_items`);
  patchUrl.searchParams.set("id", `eq.${itemId}`);
  const res = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.adminToken}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase PATCH failed: ${res.status} ${await res.text()}`);
}

async function createBrowserContext(config) {
  const headless = !config.args.headful;
  if (config.args.useStorageState) {
    if (!fs.existsSync(PATHS.storageState)) {
      throw new Error(`Missing storage state file: ${PATHS.storageState}. Run npm run pcdl:login first.`);
    }
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      storageState: PATHS.storageState,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    return { page, close: async () => { await context.close(); await browser.close(); } };
  }

  fs.mkdirSync(PATHS.profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(PATHS.profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] || (await context.newPage());
  return { page, close: async () => context.close() };
}

async function ensureSession(page, config) {
  await page.goto(config.libraryUrls[0], { waitUntil: "domcontentloaded", timeout: DEFAULTS.pageTimeoutMs });
  if (looksLikeLoginUrl(page.url())) {
    throw new Error("PCDL session expired. Run npm run pcdl:login locally, then rerun collect.");
  }
}

function isPcdlContentLink(href) {
  if (!href) return false;
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (!host.includes("pcdl")) return false;
    const p = u.pathname.toLowerCase();
    return (p.includes("/watch/") || p.includes("/listen/")) && !p.includes("/login") && !p.includes("/auth");
  } catch {
    return false;
  }
}

function absolutizeUrl(base, href) {
  try { return new URL(href, base).toString(); } catch { return ""; }
}

async function expandAndScroll(page) {
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(() => {
      const clickables = Array.from(document.querySelectorAll("button, [role='button'], summary, .accordion, .expand, .toggle"));
      for (const el of clickables) {
        const txt = (el.textContent || "").toLowerCase();
        if (txt.includes("vol") || txt.includes("volume") || txt.includes("part") || txt.includes("show") || txt.includes("more")) {
          try { el.click(); } catch {}
        }
      }
    });
    await page.waitForTimeout(350);
  }

  for (let i = 0; i < 18; i += 1) {
    await page.evaluate(() => window.scrollBy(0, Math.max(350, Math.floor(window.innerHeight * 0.8))));
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function expandSeriesAccordions(page) {
  for (let pass = 0; pass < 6; pass += 1) {
    const expanded = await page.evaluate(() => {
      let count = 0;
      const els = Array.from(document.querySelectorAll(
        'button,[role="button"],summary,[aria-expanded="false"],' +
        '[class*="accordion"],[class*="collapse"],[class*="expand"]'
      ));
      for (const el of els) {
        const txt = (el.textContent || el.getAttribute("aria-label") || "").toLowerCase();
        const isTarget = /\b(vol|volume|season|part|show|more|expand|see.all)\b/.test(txt);
        const isCollapsed = el.getAttribute("aria-expanded") === "false";
        if (isTarget || isCollapsed) {
          try { el.click(); count += 1; } catch {}
        }
      }
      return count;
    });
    await page.waitForTimeout(500);
    if (expanded === 0 && pass > 1) break;
  }
  for (let i = 0; i < 10; i += 1) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function extractPcdlContentCandidates(page) {
  const currentUrl = page.url();
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]")).map((a) => ({
      href: a.getAttribute("href") || "",
      text: (a.textContent || "").trim(),
      title: (a.getAttribute("title") || "").trim(),
      aria: (a.getAttribute("aria-label") || "").trim(),
      parent: ((a.parentElement && a.parentElement.textContent) || "").trim(),
    }))
  );

  const out = [];
  for (const l of links) {
    const href = absolutizeUrl(currentUrl, l.href);
    if (!isPcdlContentLink(href)) continue;
    const kind = getPcdlContentKind(href);
    out.push({
      href,
      kind,
      slugTitle: getPcdlSlugTitle(href),
      text: `${l.text} ${l.title} ${l.aria} ${l.parent}`.trim(),
    });
  }
  return out;
}

async function extractSeriesEpisodeCards(page) {
  const currentUrl = page.url();
  return page.evaluate((base) => {
    const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
    const GENERIC = new Set(["watch", "play", "open", "view", "listen"]);
    function normalizeLocal(s) {
      return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    }
    function isGenericLocal(s) {
      const t = normalizeLocal(s);
      return !t || GENERIC.has(t);
    }
    function cleanLocal(s) {
      return String(s || "")
        .replace(/\b(?:watch|play|open|view|listen)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    function nearestCard(el) {
      let cur = el;
      for (let i = 0; i < 8 && cur; i += 1) {
        if (
          cur.matches?.("article,[role='article'],li,[class*='card'],[class*='item'],[class*='episode'],[data-testid*='card']")
        ) return cur;
        cur = cur.parentElement;
      }
      return el.parentElement || el;
    }
    function closestSectionText(el) {
      let cur = el;
      for (let depth = 0; depth < 10; depth += 1) {
        const parent = cur.parentElement;
        if (!parent) break;
        let sib = cur.previousElementSibling;
        while (sib) {
          if (HEADING_TAGS.has(sib.tagName.toLowerCase())) return (sib.textContent || "").trim();
          for (const h of sib.querySelectorAll("h1,h2,h3,h4,h5,h6")) return (h.textContent || "").trim();
          const sibTxt = (sib.textContent || "").toLowerCase();
          if (/\b(vol|volume)\s+\d/.test(sibTxt)) return (sib.textContent || "").trim().slice(0, 100);
          sib = sib.previousElementSibling;
        }
        if (HEADING_TAGS.has(parent.tagName.toLowerCase())) return (parent.textContent || "").trim();
        const aria = parent.getAttribute("aria-label") || "";
        if (/\b(vol|volume)\s+\d/i.test(aria)) return aria.trim();
        cur = parent;
      }
      return "";
    }
    function candidateTextsFromCard(card, anchor) {
      const out = [];
      for (const h of card.querySelectorAll("h1,h2,h3,h4,h5,strong,b")) {
        out.push((h.textContent || "").trim());
      }
      out.push((anchor.getAttribute("aria-label") || "").trim());
      out.push((anchor.getAttribute("title") || "").trim());
      for (const img of card.querySelectorAll("img[alt]")) out.push((img.getAttribute("alt") || "").trim());
      for (const p of card.querySelectorAll("p,span,div")) {
        const t = (p.textContent || "").trim();
        if (t && t.length >= 8 && t.length <= 220) out.push(t);
      }
      let sib = anchor.previousSibling;
      while (sib) {
        if (sib.nodeType === Node.TEXT_NODE) {
          const t = (sib.textContent || "").trim();
          if (t) out.push(t);
        }
        sib = sib.previousSibling;
      }
      return out;
    }
    return Array.from(document.querySelectorAll("a[href]")).flatMap((a) => {
      const href = a.getAttribute("href") || "";
      if (!href) return [];
      let abs;
      try { abs = new URL(href, base).toString(); } catch { return []; }
      try {
        const u = new URL(abs);
        if (!u.hostname.includes("pcdl")) return [];
        const p = u.pathname.toLowerCase();
        if (!p.includes("/watch/") || /\/(auth|login)/.test(p)) return [];
      } catch { return []; }
      const card = nearestCard(a);
      const rawCandidates = candidateTextsFromCard(card, a);
      const meaningful = rawCandidates
        .map((t) => cleanLocal(t))
        .filter((t) => t && !isGenericLocal(t));
      meaningful.sort((x, y) => y.length - x.length);
      const displayTitle = meaningful[0] || cleanLocal((a.textContent || "").trim());
      const snippet = (card.outerHTML || "").replace(/\s+/g, " ").slice(0, 320);
      return [{
        href: abs,
        kind: abs.toLowerCase().includes("/watch/") ? "watch" : "listen",
        slugTitle: (() => {
          try {
            const parts = new URL(abs).pathname.split("/").filter(Boolean);
            return (parts[parts.length - 1] || "").replace(/-/g, " ").trim();
          } catch { return ""; }
        })(),
        cardText: (a.textContent || "").trim(),
        title: (a.getAttribute("title") || "").trim(),
        aria: (a.getAttribute("aria-label") || "").trim(),
        parentText: ((a.parentElement && a.parentElement.textContent) || "").trim().slice(0, 300),
        sectionText: closestSectionText(a),
        displayTitle,
        rawTitleCandidates: rawCandidates,
        cardSnippet: snippet,
      }];
    });
  }, currentUrl);
}

async function scanLibraryPages(page, config) {
  const all = [];
  for (let i = 0; i < config.libraryUrls.length; i += 1) {
    const src = config.libraryUrls[i];
    console.log(`Scanning source page: ${src}`);
    await page.goto(src, { waitUntil: "domcontentloaded", timeout: DEFAULTS.pageTimeoutMs });
    if (looksLikeLoginUrl(page.url())) throw new Error("Redirected to login during library scan.");
    await expandAndScroll(page);
    const cands = await extractPcdlContentCandidates(page);
    console.log(`  content links found: ${cands.length}`);
    if (config.args.debug) {
      fs.mkdirSync(PATHS.debugDir, { recursive: true });
      fs.writeFileSync(
        path.resolve(PATHS.debugDir, `pcdl-debug-library-${i + 1}.html`),
        await page.content(),
        "utf8"
      );
      await page.screenshot({
        path: path.resolve(PATHS.debugDir, `pcdl-debug-library-${i + 1}.png`),
        fullPage: true,
      });
    }
    all.push(...cands);
  }
  return all;
}

function rankCandidates(itemTitle, candidates, parsed) {
  const itemNorm = normalizeText(itemTitle);
  const itemSlug = itemNorm.replace(/\s+/g, "-");
  const targetPart = parsed?.part || null;
  const targetVolume = parsed?.volume ?? null;
  return candidates
    .map((c) => {
      const candidateTitle = cleanDisplayTitle(c.displayTitle || c.text || c.cardText || c.title || c.aria || "");
      const score = titleScore(itemTitle, candidateTitle, c.href);
      const meta = extractNumericVolumePartFromText(`${candidateTitle} ${c.href || ""}`);
      const exactPartMatch = Boolean(targetPart && meta.part && meta.part === targetPart);
      const exactVolumeMatch = Number.isInteger(targetVolume) && Number.isInteger(meta.volume) && targetVolume === meta.volume;
      const slugMatch = itemSlug ? normalizeText(c.href || "").includes(itemSlug) : false;
      const meaningfulLength = normalizeText(candidateTitle).length;
      return {
        ...c,
        _targetTitle: itemTitle,
        kind: c.kind || getPcdlContentKind(c.href),
        slugTitle: c.slugTitle || getPcdlSlugTitle(c.href),
        candidateTitle,
        score,
        exactPartMatch,
        exactVolumeMatch,
        slugMatch,
        meaningfulLength,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (normalizeText(a.slugTitle || "") === normalizeText(b.slugTitle || "") && a.kind !== b.kind) {
        if (a.kind === "watch") return -1;
        if (b.kind === "watch") return 1;
      }
      if (b.exactPartMatch !== a.exactPartMatch) return Number(b.exactPartMatch) - Number(a.exactPartMatch);
      if (b.exactVolumeMatch !== a.exactVolumeMatch) return Number(b.exactVolumeMatch) - Number(a.exactVolumeMatch);
      if (b.meaningfulLength !== a.meaningfulLength) return b.meaningfulLength - a.meaningfulLength;
      if (b.slugMatch !== a.slugMatch) return Number(b.slugMatch) - Number(a.slugMatch);
      return String(a.href || "").localeCompare(String(b.href || ""));
    });
}

function decideTopCandidate(ranked, isSeries, forceConfirmed) {
  if (!ranked.length) return { selected: null, reason: "no_candidates" };
  const top = ranked[0];
  const second = ranked[1] || null;
  const minGap = isSeries ? 200 : 100;
  if (top.score <= 0) return { selected: null, reason: "top_non_positive", top, second };
  if (second && top.score === second.score && top.href !== second.href) {
    return { selected: null, reason: "score_tie_conflict", top, second };
  }
  if (second && top.score - second.score < minGap && !forceConfirmed) {
    return { selected: null, reason: `score_gap_too_small(${top.score - second.score}<${minGap})`, top, second };
  }
  if (!isSeries) {
    const targetNorm = normalizeText(top._targetTitle || "");
    const candNorm = normalizeText(top.candidateTitle || "");
    const exactNorm = Boolean(targetNorm && candNorm && targetNorm === candNorm);
    const prefixQualified = SOFT_PREFIX_PHRASES.some((p) => candNorm.startsWith(`${p} `))
      && !SOFT_PREFIX_PHRASES.some((p) => targetNorm.startsWith(`${p} `));
    const majorContainmentExtra =
      (candNorm.includes(targetNorm) && candNorm.length >= targetNorm.length + 12) ||
      (targetNorm.includes(candNorm) && targetNorm.length >= candNorm.length + 12);
    if (!exactNorm && (prefixQualified || majorContainmentExtra) && !forceConfirmed) {
      return { selected: null, reason: "non_series_overmatch_review", top, second };
    }
  }
  const confidence = confidenceForScore(top.score || 0);
  const saveBlocked = confidence !== "high" && !(confidence === "medium" && forceConfirmed);
  if (saveBlocked) return { selected: null, reason: `confidence_${confidence}`, top, second };
  return { selected: top, reason: "selected", top, second, confidence };
}

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function loadCsvMap(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return new Map();
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const tIdx = header.indexOf("title");
  const uIdx = header.indexOf("pcdl_url");
  if (tIdx < 0 || uIdx < 0) throw new Error("CSV must contain headers: title,pcdl_url");

  const map = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const title = (row[tIdx] || "").trim();
    const link = (row[uIdx] || "").trim();
    if (!title || !link || !isPcdlContentLink(link)) continue;
    map.set(normalizeText(title), link);
  }
  return map;
}

async function collectSearchCandidates(page, config, title) {
  return searchPcdlHeader(page, config, title);
}

async function clickFirstVisible(page, selectors, timeout = 1500) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        const visible = await loc.isVisible().catch(() => false);
        if (!visible) continue;
        await loc.click({ timeout });
        return sel;
      }
    } catch {}
  }
  return null;
}

async function openHeaderSearch(page, config) {
  const debug = config.args.debug;
  fs.mkdirSync(PATHS.debugDir, { recursive: true });

  const inputSelectors = [
    'input[type="search"]',
    'input[placeholder*="Search" i]',
    'input[name*="search" i]',
  ];

  // Step 1: return early if a search input is already visible
  for (const sel of inputSelectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) && (await loc.isVisible().catch(() => false))) {
        if (debug) console.log(`  header search already visible via: ${sel}`);
        return { inputSelector: sel, triggerSelector: "(already visible)" };
      }
    } catch {}
  }

  // Step 7: screenshot before attempting to open search
  await page.screenshot({
    path: path.resolve(PATHS.debugDir, "pcdl-header-before-search-click.png"),
  });

  const REJECT_TEXTS = ["more", "browse", "affiliate", "kids", "pcdl search"];
  const viewportSize = page.viewportSize();
  const halfWidth = viewportSize ? viewportSize.width / 2 : 640;

  // Steps 2, 3, 6: collect all header candidates, score, and mark the winner
  // — all in one evaluate so the el reference stays live for marking
  const result = await page.evaluate(
    ({ rejectTexts, vwHalf }) => {
      const SELECTORS = [
        'button[aria-label*="search" i]',
        '[role="button"][aria-label*="search" i]',
        'button:has(svg)',
        'i[class*="search" i]',
        '[class*="search" i] button',
        'button',
      ];
      const header = document.querySelector("header") || document.body;
      const seen = new WeakSet();
      const entries = [];

      for (const sel of SELECTORS) {
        let els;
        try { els = header.querySelectorAll(sel); } catch { continue; }
        for (const el of els) {
          if (seen.has(el)) continue;
          seen.add(el);
          // Reject if inside a dropdown / menu overlay
          if (el.closest('[role="menu"], [role="listbox"], details')) continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const text = (el.innerText || el.textContent || "").trim();
          const rejected = rejectTexts.some((r) => text.toLowerCase().includes(r));
          const inRight = rect.x + rect.width / 2 > vwHalf;
          const isSmall = rect.width < 80 && rect.height < 80;
          const hasAriaSearch = /search/i.test(el.getAttribute("aria-label") || "");
          const score = rejected
            ? -1
            : (inRight ? 10 : 0) + (isSmall ? 5 : 0) + (hasAriaSearch ? 20 : 0);
          entries.push({
            el,
            meta: {
              tagName: el.tagName.toLowerCase(),
              text,
              ariaLabel: el.getAttribute("aria-label") || "",
              className: typeof el.className === "string" ? el.className : "",
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              rejected,
              inRight,
              isSmall,
              hasAriaSearch,
              score,
              matchedSel: sel,
            },
          });
        }
      }

      const accepted = entries
        .filter((e) => !e.meta.rejected)
        .sort((a, b) => b.meta.score - a.meta.score);
      const winner = accepted[0] || null;
      if (winner) winner.el.setAttribute("data-pcdl-search-target", "true");

      return { winner: winner ? winner.meta : null, allMeta: entries.map((e) => e.meta) };
    },
    { rejectTexts: REJECT_TEXTS, vwHalf: halfWidth }
  );

  // Step 6: debug — print every candidate with accepted/rejected reason
  if (debug) {
    console.log("  === Header search candidates ===");
    for (const m of result.allMeta) {
      const reason = m.rejected
        ? `REJECTED (text="${m.text}")`
        : `accepted score=${m.score} (rightHalf=${m.inRight}, small=${m.isSmall}, ariaSearch=${m.hasAriaSearch})`;
      console.log(
        `  [${m.matchedSel}] tag=${m.tagName} text="${m.text}" aria="${m.ariaLabel}" ` +
        `class="${m.className}" bbox={x:${m.x},y:${m.y},w:${m.width},h:${m.height}} => ${reason}`
      );
    }
  }

  // Step 5: no safe icon found
  if (!result.winner) {
    throw new Error(
      "Could not find safe header search icon. Run with --debug and inspect .local/pcdl-search-debug.png"
    );
  }

  if (debug) {
    const w = result.winner;
    console.log(
      `  clicking: tag=${w.tagName} text="${w.text}" aria="${w.ariaLabel}" ` +
      `bbox={x:${w.x},y:${w.y},w:${w.width},h:${w.height}} score=${w.score}`
    );
  }

  // Click via the injected attribute (Playwright mechanics, not JS .click())
  const targetLoc = page.locator('[data-pcdl-search-target="true"]');
  await targetLoc.click({ timeout: 3000 });
  await page.evaluate(() => {
    document.querySelector('[data-pcdl-search-target="true"]')?.removeAttribute("data-pcdl-search-target");
  });

  // Step 8: screenshot after click
  await page.screenshot({
    path: path.resolve(PATHS.debugDir, "pcdl-header-after-search-click.png"),
  });

  // Step 4: wait for a search input to appear
  for (const sel of inputSelectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ timeout: 5000, state: "visible" });
      if (debug) console.log(`  search input appeared: ${sel}`);
      return { inputSelector: sel, triggerSelector: result.winner.matchedSel };
    } catch {}
  }

  throw new Error("Header search opened, but search input did not become visible.");
}

async function findFirstContentLink(page) {
  const base = page.url();
  const hrefs = await page.evaluate(() => {
    const NAV_TAGS = new Set(["header", "footer", "nav"]);
    return Array.from(document.querySelectorAll("a[href]"))
      .filter((a) => {
        let el = a.parentElement;
        while (el) {
          if (NAV_TAGS.has(el.tagName.toLowerCase())) return false;
          if (el.getAttribute("role") === "navigation") return false;
          el = el.parentElement;
        }
        return true;
      })
      .map((a) => a.getAttribute("href") || "")
      .filter(Boolean);
  });

  for (const href of hrefs) {
    const abs = absolutizeUrl(base, href);
    try {
      const u = new URL(abs);
      if (!u.hostname.includes("pcdl")) continue;
      const p = u.pathname;
      if (!p || p === "/" || /\/(auth|login|browse|signup|register)/i.test(p)) continue;
      return abs;
    } catch {}
  }
  return null;
}

async function findBestSeriesPageLink(page, baseName) {
  const base = page.url();
  const entries = await page.evaluate(() => {
    const NAV = new Set(["header", "footer", "nav"]);
    const REJECT = new Set(["more", "browse", "affiliate", "kids", "profile", "home", "pcdl search"]);
    return Array.from(document.querySelectorAll("a[href]"))
      .filter((a) => {
        let el = a.parentElement;
        while (el) {
          if (NAV.has(el.tagName.toLowerCase())) return false;
          if (el.getAttribute("role") === "navigation") return false;
          el = el.parentElement;
        }
        const txt = (a.textContent || "").trim().toLowerCase();
        return !REJECT.has(txt);
      })
      .map((a) => ({
        href: a.getAttribute("href") || "",
        text: (a.textContent || "").trim(),
        title: (a.getAttribute("title") || "").trim(),
        aria: (a.getAttribute("aria-label") || "").trim(),
      }));
  });
  let bestHref = null;
  let bestScore = 100;
  for (const e of entries) {
    const abs = absolutizeUrl(base, e.href);
    if (!abs) continue;
    try {
      const u = new URL(abs);
      if (!u.hostname.includes("pcdl")) continue;
      const p = u.pathname;
      if (!p || p === "/" || /\/(auth|login|signup|register|browse)$/i.test(p)) continue;
    } catch { continue; }
    const score = titleScore(baseName, `${e.text} ${e.title} ${e.aria}`, e.href);
    if (score > bestScore) { bestScore = score; bestHref = abs; }
  }
  return bestHref;
}

function scoreAndSelectCard(cards, parsed, sourcePageUrl, debug, forceConfirmed) {
  const scored = cards.map((card) => {
    const { score, reasons } = scoreEpisodeCard(card, parsed);
    const displayTitle = cleanDisplayTitle(card.displayTitle || card.cardText || card.title || card.aria || "");
    return { ...card, score, reasons, displayTitle };
  }).sort((a, b) => b.score - a.score);

  if (debug) {
    console.log("  [series] episode candidates (top 10):");
    for (const c of scored.slice(0, 10)) {
      console.log(`    score=${c.score} kind=${c.kind || getPcdlContentKind(c.href)} slug="${c.slugTitle || getPcdlSlugTitle(c.href)}" href=${c.href}`);
      console.log(`      section="${c.sectionText || ""}" title="${(c.displayTitle || "").slice(0, 120)}"`);
      console.log(`      reasons=${(c.reasons || []).join(", ")}`);
      if (c.rawTitleCandidates?.length) console.log(`      raw title candidates=${JSON.stringify(c.rawTitleCandidates.slice(0, 10))}`);
      if (c.cardSnippet) console.log(`      card snippet=${c.cardSnippet}`);
    }
  }
  const decision = decideTopCandidate(scored, true, forceConfirmed);
  const best = decision.selected;
  if (!best || !isPcdlContentLink(best.href)) {
    if (debug && decision.top) {
      console.log(`  [series] no auto-select: ${decision.reason}`);
    }
    return null;
  }
  return {
    href: best.href,
    kind: best.kind || getPcdlContentKind(best.href),
    slugTitle: best.slugTitle || getPcdlSlugTitle(best.href),
    text: `${best.displayTitle || ""} ${best.sectionText || ""}`.trim(),
    displayTitle: best.displayTitle || "",
    score: best.score,
    sourcePageUrl,
  };
}

async function resolveSeriesItem(page, config, parsed, args) {
  const { baseName } = parsed;
  const debug = args.debug;

  await page.goto(config.searchUrl || config.libraryUrls[0], {
    waitUntil: "domcontentloaded",
    timeout: DEFAULTS.pageTimeoutMs,
  });
  if (looksLikeLoginUrl(page.url())) throw new Error("Redirected to login in series search.");
  if (debug) console.log(`  [series] searching with baseName: "${baseName}"`);

  const { inputSelector } = await openHeaderSearch(page, config);
  const input = page.locator(inputSelector).first();
  await input.fill("");
  await input.fill(baseName);
  await input.press("Enter");
  await page.waitForTimeout(1200);
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}

  if (debug) {
    fs.mkdirSync(PATHS.debugDir, { recursive: true });
    console.log(`  [series] search results URL: ${page.url()}`);
    await page.screenshot({ path: path.resolve(PATHS.debugDir, "pcdl-search-results.png"), fullPage: true });
  }

  let watchCandidates = await extractPcdlContentCandidates(page);
  if (debug) console.log(`  [series] content links on search results: ${watchCandidates.length}`);
  let seriesPageUrl = page.url();

  if (!watchCandidates.length) {
    const seriesHref = await findBestSeriesPageLink(page, baseName);
    if (!seriesHref) {
      if (debug) console.log("  [series] no series card found");
      return null;
    }
    if (debug) console.log(`  [series] navigating to series page: ${seriesHref}`);
    await page.goto(seriesHref, { waitUntil: "domcontentloaded", timeout: DEFAULTS.pageTimeoutMs });
    await page.waitForTimeout(800);
    try { await page.waitForLoadState("networkidle", { timeout: 6000 }); } catch {}
    seriesPageUrl = page.url();
    if (debug) console.log(`  [series] series page URL: ${seriesPageUrl}`);

    await expandSeriesAccordions(page);
    if (debug) {
      await page.screenshot({ path: path.resolve(PATHS.debugDir, "pcdl-series-page.png"), fullPage: true });
    }

    const episodeCards = await extractSeriesEpisodeCards(page);
    if (debug) console.log(`  [series] episode cards found: ${episodeCards.length}`);

    if (episodeCards.length) {
      return scoreAndSelectCard(episodeCards, parsed, seriesPageUrl, debug, args.forceConfirmed);
    }
    watchCandidates = await extractPcdlContentCandidates(page);
    if (!watchCandidates.length) return null;
  }

  const cardCandidates = watchCandidates.map((c) => ({
    href: c.href,
    cardText: c.text,
    title: "",
    aria: "",
    sectionText: "",
    parentText: "",
  }));
  return scoreAndSelectCard(cardCandidates, parsed, seriesPageUrl, debug, args.forceConfirmed);
}

async function searchPcdlHeader(page, config, query) {
  await page.goto(config.searchUrl || config.libraryUrls[0], {
    waitUntil: "domcontentloaded",
    timeout: DEFAULTS.pageTimeoutMs,
  });
  if (looksLikeLoginUrl(page.url())) throw new Error("Redirected to login in search mode.");

  const { inputSelector, triggerSelector } = await openHeaderSearch(page, config);
  if (config.args.debug) console.log(`  using search input selector: ${inputSelector}`);

  const input = page.locator(inputSelector).first();
  await input.fill("");
  await input.fill(query);
  await input.press("Enter");

  await page.waitForTimeout(1200);
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}

  if (config.args.debug) {
    fs.mkdirSync(PATHS.debugDir, { recursive: true });
    console.log(`  search results URL: ${page.url()}`);
    await page.screenshot({
      path: path.resolve(PATHS.debugDir, "pcdl-search-debug.png"),
      fullPage: true,
    });
    const slug = normalizeText(query).replace(/\s+/g, "-").slice(0, 48) || "untitled";
    fs.writeFileSync(path.resolve(PATHS.debugDir, `pcdl-debug-search-${slug}.html`), await page.content(), "utf8");
    if (triggerSelector) console.log(`  debug trigger selector used: ${triggerSelector}`);
  }

  let out = await extractPcdlContentCandidates(page);
  if (config.args.debug) console.log(`  content links on results page: ${out.length}`);

  // Results page shows a card/thumbnail — no content links until we click through
  if (!out.length) {
    const contentHref = await findFirstContentLink(page);
    if (contentHref) {
      if (config.args.debug) console.log(`  clicking first content result: ${contentHref}`);
      await page.goto(contentHref, { waitUntil: "domcontentloaded", timeout: DEFAULTS.pageTimeoutMs });
      await page.waitForTimeout(800);
      try { await page.waitForLoadState("networkidle", { timeout: 6000 }); } catch {}
      if (config.args.debug) {
        console.log(`  episode page URL: ${page.url()}`);
        await page.screenshot({
          path: path.resolve(PATHS.debugDir, "pcdl-search-episode.png"),
          fullPage: true,
        });
      }
      out = await extractPcdlContentCandidates(page);
      if (config.args.debug) console.log(`  content links after click-through: ${out.length}`);
    } else {
      if (config.args.debug) console.log("  no content link found to click through");
    }
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig(args);
  console.log("------------------------------------------------------------");
  console.log("PCDL Permanent Link Collector");
  console.log(
    `Mode: ${args.mode} | Dry run: ${args.dryRun} | Force: ${args.force} | Limit: ${args.limit || "none"}`
  );
  console.log("------------------------------------------------------------");

  const items = await fetchItems(config, args);
  items.sort((a, b) => {
    const da = a.day?.scheduled_date || "";
    const db = b.day?.scheduled_date || "";
    if (da !== db) return da.localeCompare(db);
    return (a.item_order || 0) - (b.item_order || 0);
  });
  console.log(`Found up to ${args.limit || items.length} items...`);
  console.log(`Items to check: ${items.length}`);
  if (!items.length) return;

  const csvMap = loadCsvMap(path.resolve(args.csv));
  if (args.mode === "csv" || args.mode === "hybrid") {
    console.log(`CSV mappings loaded: ${csvMap.size}`);
  }

  let runner = null;
  let page = null;
  let libraryCandidates = [];
  const summary = { checked: 0, updated: 0, notFound: 0, skipped: 0, errors: 0, reviewNeeded: 0 };

  try {
    const needsBrowser = ["library", "search", "hybrid"].includes(args.mode);
    if (needsBrowser) {
      runner = await createBrowserContext(config);
      page = runner.page;
      await ensureSession(page, config);
      if (args.mode === "library" || args.mode === "hybrid") {
        libraryCandidates = await scanLibraryPages(page, config);
      }
    }

    for (const item of items) {
      summary.checked += 1;
      const label = `[${item.day?.scheduled_date || ""} | ${item.title || item.id}]`;
      console.log(label);

      if (!args.force && item.pcdl_url) {
        summary.skipped += 1;
        console.log("  skipped (already has pcdl_url)");
        continue;
      }

      try {
        const itemTitle = item.title || "";
        const parsed = parseSeriesParts(itemTitle);
        if (args.debug) {
          console.log(`  parsed: isSeries=${parsed.isSeries}, baseName="${parsed.baseName}", vol=${parsed.volume}, part=${parsed.part}`);
        }
        let chosen = null;
        let chosenSource = "";
        let blockedReason = "";

        if ((args.mode === "csv" || args.mode === "hybrid") && !args.forceSearch) {
          const csvLink = csvMap.get(normalizeText(itemTitle));
          if (csvLink) {
            chosen = { href: csvLink, text: "csv", score: 9999 };
            chosenSource = "csv";
          }
        }

        if (!chosen && (args.mode === "library" || args.mode === "hybrid")) {
          const ranked = rankCandidates(itemTitle, libraryCandidates, parsed);
          if (args.debug && ranked.length) {
            console.log("  [library] ranked candidates:");
            ranked.slice(0, 5).forEach((c, i) => {
              console.log(
                `    ${i + 1}. score=${c.score} kind=${c.kind || "unknown"} slugTitle="${c.slugTitle || ""}" part=${c.exactPartMatch} vol=${c.exactVolumeMatch} len=${c.meaningfulLength} slug=${c.slugMatch}`
              );
              console.log(`       ${c.candidateTitle || "(no title)"}`);
              console.log(`       ${c.href}`);
            });
          }
          const decision = decideTopCandidate(ranked, Boolean(parsed.isSeries), args.forceConfirmed);
          chosen = decision.selected;
          blockedReason = decision.selected ? "" : decision.reason;
          chosenSource = chosen ? "library" : "";
        }

        if (!chosen && (args.mode === "search" || args.mode === "hybrid")) {
          if (parsed.isSeries) {
            chosen = await resolveSeriesItem(page, config, parsed, args);
            chosenSource = chosen ? "search-series" : chosenSource;
          } else {
            const searchCandidates = await collectSearchCandidates(page, config, itemTitle);
            console.log(`  search content links found: ${searchCandidates.length}`);
            const ranked = rankCandidates(itemTitle, searchCandidates, parsed);
            if (args.debug && ranked.length) {
              console.log("  [search] ranked candidates:");
              ranked.slice(0, 5).forEach((c, i) => {
                console.log(
                  `    ${i + 1}. score=${c.score} kind=${c.kind || "unknown"} slugTitle="${c.slugTitle || ""}" part=${c.exactPartMatch} vol=${c.exactVolumeMatch} len=${c.meaningfulLength} slug=${c.slugMatch}`
                );
                console.log(`       ${c.candidateTitle || "(no title)"}`);
                console.log(`       ${c.href}`);
              });
            }
            const decision = decideTopCandidate(ranked, false, args.forceConfirmed);
            chosen = decision.selected;
            blockedReason = decision.selected ? "" : decision.reason;
            chosenSource = chosen ? "search" : chosenSource;
          }
        }

        if (!chosen || !isPcdlContentLink(chosen.href)) {
          if (blockedReason) {
            summary.reviewNeeded += 1;
            await updateItem(
              config,
              item.id,
              {
                fallback_status: "review_needed",
                media_error: `Candidate requires review: ${blockedReason}`,
              },
              args.dryRun
            );
            console.log(`  review_needed (${blockedReason})`);
            continue;
          }
          summary.notFound += 1;
          await updateItem(
            config,
            item.id,
            {
              fallback_status: "not_found",
              media_error: "No stable PCDL content link (/watch or /listen) found.",
            },
            args.dryRun
          );
          console.log("  not found");
          continue;
        }

        const confidence = confidenceForScore(chosen.score || 0);
        if (confidence !== "high" && !(confidence === "medium" && args.forceConfirmed)) {
          summary.reviewNeeded += 1;
          console.log(`  review_needed (${confidence}) -> ${chosen.href} (score=${chosen.score || 0})`);
          await updateItem(
            config,
            item.id,
            {
              fallback_status: "review_needed",
              media_error: `${confidence} confidence (${chosen.score || 0}) from ${chosenSource}. Candidate: ${chosen.href}`,
            },
            args.dryRun
          );
          continue;
        }

        await updateItem(
          config,
          item.id,
          {
            pcdl_url: chosen.href,
            source_type:
              (chosen.kind || getPcdlContentKind(chosen.href)) === "watch"
                ? "pcdl_watch"
                : (chosen.kind || getPcdlContentKind(chosen.href)) === "listen"
                ? "pcdl_listen"
                : null,
            source_page_url: chosen.sourcePageUrl || chosen.href,
            fallback_status: "available",
            fallback_url_verified_at: new Date().toISOString(),
            media_error: null,
          },
          args.dryRun
        );
        summary.updated += 1;
        console.log(`  updated (${chosenSource}, ${confidence}, kind=${chosen.kind || getPcdlContentKind(chosen.href)}) -> ${chosen.href}`);
      } catch (err) {
        summary.errors += 1;
        console.log(`  error -> ${err.message || String(err)}`);
        try {
          await updateItem(
            config,
            item.id,
            { fallback_status: "not_found", media_error: String(err.message || err).slice(0, 500) },
            args.dryRun
          );
        } catch {}
      }
    }
  } finally {
    if (runner) await runner.close();
  }

  console.log("------------------------------------------------------------");
  console.log(
    `checked=${summary.checked} updated=${summary.updated} review_needed=${summary.reviewNeeded} not_found=${summary.notFound} skipped=${summary.skipped} errors=${summary.errors}`
  );
  console.log("------------------------------------------------------------");
  if (summary.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err.message || String(err));
  process.exit(1);
});
