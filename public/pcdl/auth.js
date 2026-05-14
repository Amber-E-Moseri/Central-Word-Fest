const PCDL = window.PCDL || {};
window.PCDL = PCDL;

const AUTH_CONFIG_ERROR_MESSAGE = "App configuration error: Supabase credentials are not set. Contact the site administrator.";

function hasInvalidSupabaseConfig(config) {
  const url = String(config?.SUPABASE_URL || "").trim();
  const key = String(config?.SUPABASE_ANON_KEY || "").trim();
  const invalidUrl = !url || url.includes("YOUR_PROJECT_REF");
  const invalidKey = !key || key.includes("YOUR_SUPABASE_ANON_KEY");
  return invalidUrl || invalidKey;
}

function renderConfigErrorBanner(message) {
  const existing = document.getElementById("pcdl-config-error-banner");
  if (existing) return;

  const banner = document.createElement("div");
  banner.id = "pcdl-config-error-banner";
  banner.textContent = message;
  banner.style.position = "fixed";
  banner.style.top = "0";
  banner.style.left = "0";
  banner.style.right = "0";
  banner.style.width = "100%";
  banner.style.zIndex = "9999";
  banner.style.background = "#b00020";
  banner.style.color = "#ffffff";
  banner.style.padding = "14px 16px";
  banner.style.fontSize = "14px";
  banner.style.fontWeight = "700";
  banner.style.textAlign = "center";
  banner.style.boxShadow = "0 2px 12px rgba(0,0,0,0.35)";

  const mountTarget = document.getElementById("main-content") || document.body || document.documentElement;
  mountTarget.prepend(banner);
}

if (hasInvalidSupabaseConfig(window.PCDL_CONFIG)) {
  console.error(AUTH_CONFIG_ERROR_MESSAGE);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => renderConfigErrorBanner(AUTH_CONFIG_ERROR_MESSAGE), { once: true });
  } else {
    renderConfigErrorBanner(AUTH_CONFIG_ERROR_MESSAGE);
  }
} else {
  PCDL.supabase = window.supabase.createClient(
    window.PCDL_CONFIG.SUPABASE_URL,
    window.PCDL_CONFIG.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        storageKey: "pcdl-auth",
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

const SCHEMA_CACHE = new Map();
let schemaProbeWarned = false;

const KNOWN_COLUMNS = {
  profiles: ["id", "email", "full_name", "role", "fellowship_id", "is_active"],
  daily_message_days: ["id", "day_number", "scheduled_date", "day_label", "other_label", "is_active"],
  daily_message_items: [
    "id",
    "day_id",
    "item_order",
    "title",
    "source_type",
    "media_url",
    "temporary_media_url",
    "pcdl_url",
    "source_page_url",
    "media_expires_at",
    "media_url_expires_at",
    "media_collected_at",
    "media_status",
    "media_error",
    "fallback_status",
    "fallback_url_verified_at",
    "thumbnail_url",
    "admin_notes",
    "is_required",
    "is_active"
  ],
  message_progress: [
    "user_id",
    "message_id",
    "message_item_id",
    "completed",
    "completed_at",
    "watch_seconds",
    "watch_percent",
    "completion_percent",
    "points_earned",
    "play_count",
    "last_watched_at",
    "first_played_at"
  ],
  message_watch_events: [
    "id",
    "user_id",
    "message_item_id",
    "event_type",
    "watch_seconds",
    "watch_percent",
    "session_id",
    "device_type",
    "created_at"
  ],
  reflections: ["id", "user_id", "message_id", "day_id", "message_item_id", "reflection_text", "visibility", "created_at"],
  activity_log: ["id", "user_id", "activity_type", "metadata", "created_at"]
};

function parseSupabaseProjectRef(url) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || null;
  } catch {
    return null;
  }
}

function parseSupabaseRefFromAnonKey(jwt) {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    return json?.ref || null;
  } catch {
    return null;
  }
}

function logSupabaseConfigValidation() {
  if (hasInvalidSupabaseConfig(window.PCDL_CONFIG)) return;
  const url = window.PCDL_CONFIG?.SUPABASE_URL || "";
  const key = window.PCDL_CONFIG?.SUPABASE_ANON_KEY || "";
  const urlRef = parseSupabaseProjectRef(url);
  const keyRef = parseSupabaseRefFromAnonKey(key);
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") { console.log("Supabase URL:", PCDL.supabase.supabaseUrl); }
  if (urlRef && keyRef && urlRef !== keyRef) {
    console.warn(
      `[Config warning] Supabase URL project (${urlRef}) does not match anon key project (${keyRef}). ` +
      "Check config.js / .env values."
    );
  }
}

logSupabaseConfigValidation();

async function getTableColumns(tableName) {
  if (SCHEMA_CACHE.has(tableName)) return SCHEMA_CACHE.get(tableName);
  const known = KNOWN_COLUMNS[tableName];
  if (!known) {
    if (!schemaProbeWarned) {
      schemaProbeWarned = true;
      console.warn(
        "[Schema compatibility] Runtime column introspection is disabled; unknown table checks are optimistic."
      );
    }
    const optimistic = new Set();
    SCHEMA_CACHE.set(tableName, optimistic);
    return optimistic;
  }
  const cols = new Set(known);
  SCHEMA_CACHE.set(tableName, cols);
  return cols;
}

function parseMissingColumn(err) {
  const msg = String(err?.message || "");
  const m = msg.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  if (m?.[1]) return m[1];
  const m2 = msg.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
  return m2?.[1] || null;
}

function pickPresentColumns(payload, availableColumns) {
  const out = {};
  const missing = [];
  for (const [k, v] of Object.entries(payload)) {
    if (availableColumns.has(k)) out[k] = v;
    else missing.push(k);
  }
  return { out, missing };
}

function schemaError(table, missingColumns, context) {
  return new Error(
    `[Schema mismatch:${table}] Missing columns: ${missingColumns.join(", ")}. ` +
    `Operation: ${context}. Run latest additive migrations.`
  );
}

PCDL.getSession = async function () {
  const { data, error } = await PCDL.supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

PCDL.signUp = async function (email, password, fullName) {
  const { data, error } = await PCDL.supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
};

PCDL.signIn = async function (email, password) {
  const { data, error } = await PCDL.supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

PCDL.requestPasswordReset = async function (email) {
  const redirectTo = window.location.origin;
  const { data, error } = await PCDL.supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
  return data;
};

PCDL.signOut = async function () {
  const { error } = await PCDL.supabase.auth.signOut();
  if (error) throw error;
  window.location.reload();
};

PCDL.getMyProfile = async function () {
  const session = await PCDL.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data, error } = await PCDL.supabase
    .from("profiles")
    .select("id, full_name, email, role, fellowship_id, fellowship:fellowships(id, name)")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data;
};

PCDL.getTodaysMessage = async function () {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await PCDL.supabase
    .from("daily_messages")
    .select("*")
    .eq("scheduled_date", today)
    .maybeSingle();
  if (error) throw error;
  return data;
};

PCDL.loadMessageDayByNumber = async function (dayNumber) {
  const day = Number(dayNumber);
  if (!Number.isFinite(day) || day < 1) throw new Error("Invalid day number.");

  const { data: dayRow, error: dayError } = await PCDL.supabase
    .from("daily_message_days")
    .select("*")
    .eq("day_number", day)
    .maybeSingle();
  if (dayError) throw dayError;
  if (!dayRow) return null;

  const { data: items, error: itemsError } = await PCDL.supabase
    .from("daily_message_items")
    .select("*")
    .eq("day_id", dayRow.id)
    .order("item_order", { ascending: true });
  if (itemsError) throw itemsError;

  return { day: dayRow, items: items || [] };
};

PCDL.loadMessageDayByDate = async function (scheduledDate) {
  const { data: dayRow, error: dayError } = await PCDL.supabase
    .from("daily_message_days")
    .select("*")
    .eq("scheduled_date", scheduledDate)
    .maybeSingle();
  if (dayError) throw dayError;
  if (!dayRow) return null;

  const { data: items, error: itemsError } = await PCDL.supabase
    .from("daily_message_items")
    .select("*")
    .eq("day_id", dayRow.id)
    .order("item_order", { ascending: true });
  if (itemsError) throw itemsError;

  return { day: dayRow, items: items || [] };
};

PCDL.saveMessageDay = async function (dayId, payload) {
  if (!dayId) throw new Error("Missing day id.");
  const cols = await getTableColumns("daily_message_days");
  const { out, missing } = pickPresentColumns(
    {
      scheduled_date: payload.scheduled_date,
      day_label: payload.day_label,
      other_label: payload.other_label,
      is_active: payload.is_active
    },
    cols
  );
  if (missing.length) throw schemaError("daily_message_days", missing, "saveMessageDay");
  const { error } = await PCDL.supabase.from("daily_message_days").update(out).eq("id", dayId);
  if (error) throw error;
  return true;
};

PCDL.saveMessageItem = async function (itemId, payload) {
  if (!itemId) throw new Error("Missing item id.");
  const cols = await getTableColumns("daily_message_items");
  const { out, missing } = pickPresentColumns(
    {
      title: payload.title,
      source_type: payload.source_type,
      pcdl_url: payload.pcdl_url,
      temporary_media_url: payload.temporary_media_url,
      media_collected_at: payload.media_collected_at,
      media_error: payload.media_error,
      fallback_url_verified_at: payload.fallback_url_verified_at,
      fallback_status: payload.fallback_status,
      media_url: payload.media_url,
      source_page_url: payload.source_page_url,
      media_expires_at: payload.media_expires_at,
      media_url_expires_at: payload.media_url_expires_at,
      media_status: payload.media_status,
      thumbnail_url: payload.thumbnail_url,
      admin_notes: payload.admin_notes,
      is_required: payload.is_required,
      is_active: payload.is_active
    },
    cols
  );
  if (missing.length) throw schemaError("daily_message_items", missing, "saveMessageItem");
  const { error } = await PCDL.supabase.from("daily_message_items").update(out).eq("id", itemId);
  if (error) throw error;
  return true;
};

PCDL.addMessageItem = async function (dayId) {
  if (!dayId) throw new Error("Missing day id.");
  const { data: last, error: maxError } = await PCDL.supabase
    .from("daily_message_items")
    .select("item_order")
    .eq("day_id", dayId)
    .order("item_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw maxError;
  const nextOrder = (last?.item_order || 0) + 1;

  const insertPayload = {
    day_id: dayId,
    item_order: nextOrder,
    title: `Message ${nextOrder}`,
    source_type: "direct_video",
    pcdl_url: "",
    temporary_media_url: "",
    media_collected_at: null,
    media_error: "",
    fallback_url_verified_at: null,
    fallback_status: "unknown",
    media_url: "",
    source_page_url: "",
    media_expires_at: null,
    media_status: "needs_refresh",
    thumbnail_url: "",
    admin_notes: "",
    is_required: true,
    is_active: true
  };
  const cols = await getTableColumns("daily_message_items");
  const { out, missing } = pickPresentColumns(insertPayload, cols);
  if (missing.length) throw schemaError("daily_message_items", missing, "addMessageItem");
  const { data, error } = await PCDL.supabase.from("daily_message_items").insert(out).select("*").single();
  if (error) throw error;
  return data;
};

PCDL.deleteOrDeactivateMessageItem = async function (itemId) {
  if (!itemId) throw new Error("Missing item id.");
  const cols = await getTableColumns("daily_message_items");
  if (!cols.has("is_active")) throw schemaError("daily_message_items", ["is_active"], "deleteOrDeactivateMessageItem");
  const { error } = await PCDL.supabase.from("daily_message_items").update({ is_active: false }).eq("id", itemId);
  if (error) throw error;
  return true;
};

PCDL.loadTodayMediaConfig = async function () {
  const today = new Date().toISOString().slice(0, 10);
  const payload = await PCDL.loadMessageDayByDate(today);
  const msg = payload?.items?.[0] || null;
  if (!msg) return null;
  return {
    id: msg.id || null,
    dayNumber: payload?.day?.day_number || null,
    title: msg.title || "Today's Message",
    mediaUrl: msg.temporary_media_url || msg.media_url || msg.video_url || msg.audio_url || "",
    thumbnailUrl: msg.thumbnail_url || "",
    sourceType: msg.source_type || "Web link",
    adminNotes: msg.admin_notes || ""
  };
};

PCDL.loadDailyMessageByDay = async function (selectedDay) {
  const day = Number(selectedDay);
  if (!Number.isFinite(day) || day < 1) throw new Error("Invalid day number.");
  const payload = await PCDL.loadMessageDayByNumber(day);
  if (!payload) throw new Error(`Day ${day} not found.`);
  const data = payload.items?.[0];
  if (!data) throw new Error(`Day ${day} has no message items.`);
  return {
    id: data.id || null,
    dayNumber: payload.day?.day_number || day,
    title: data.title || "",
    otherLabel: payload.day?.other_label || "",
    mediaUrl: data.temporary_media_url || data.media_url || "",
    thumbnailUrl: data.thumbnail_url || "",
    sourceType: data.source_type || "Web link",
    adminNotes: data.admin_notes || ""
  };
};

PCDL.saveTodayMediaConfig = async function (config) {
  const today = new Date().toISOString().slice(0, 10);
  const payload = await PCDL.loadMessageDayByDate(today);
  const item = payload?.items?.[0];
  if (!item?.id) throw new Error("No daily_message_items row exists for today.");
  await PCDL.saveMessageItem(item.id, {
    title: config.title,
    media_url: config.mediaUrl,
    source_type: config.sourceType,
    thumbnail_url: config.thumbnailUrl,
    admin_notes: config.adminNotes
  });
  return true;
};

PCDL.saveDailyMessageByDay = async function (selectedDay, config) {
  const day = Number(selectedDay);
  if (!Number.isFinite(day) || day < 1) throw new Error("Invalid day number.");
  const payload = await PCDL.loadMessageDayByNumber(day);
  const item = payload?.items?.[0];
  if (!item?.id) throw new Error(`No daily_message_items row exists for day ${day}.`);
  await PCDL.saveMessageDay(payload.day.id, { other_label: config.otherLabel });
  await PCDL.saveMessageItem(item.id, {
    title: config.title,
    media_url: config.mediaUrl,
    source_type: config.sourceType,
    thumbnail_url: config.thumbnailUrl,
    admin_notes: config.adminNotes
  });
  return true;
};

PCDL.markComplete = async function (messageId, messageItemId = null) {
  const session = await PCDL.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("You must be signed in.");

  const fullPayload = {
    user_id: userId,
    message_id: messageId,
    message_item_id: messageItemId,
    completed: true,
    completed_at: new Date().toISOString(),
    watch_seconds: 0,
    completion_percent: 100,
    points_earned: 5
  };
  const cols = await getTableColumns("message_progress");
  const { out: payload, missing } = pickPresentColumns(fullPayload, cols);
  if (!("user_id" in payload) || !("completed" in payload)) {
    throw schemaError("message_progress", ["user_id", "completed"], "markComplete");
  }
  if (!("message_item_id" in payload) && !("message_id" in payload)) {
    throw schemaError("message_progress", ["message_item_id|message_id"], "markComplete target");
  }
  if (missing.length) {
    console.warn(`[Schema mismatch:message_progress] Optional columns missing: ${missing.join(", ")}`);
  }

  const conflict = ("message_item_id" in payload && payload.message_item_id)
    ? "user_id,message_item_id"
    : "user_id,message_id";
  const { error } = await PCDL.supabase
    .from("message_progress")
    .upsert(payload, { onConflict: conflict });

  if (error) throw error;

  const activityCols = await getTableColumns("activity_log");
  const activityPayload = { user_id: userId, activity_type: "message_completed" };
  const { out: activityInsert, missing: activityMissing } = pickPresentColumns(activityPayload, activityCols);
  if (!("user_id" in activityInsert) || !("activity_type" in activityInsert)) {
    throw schemaError("activity_log", ["user_id", "activity_type"], "log message_completed");
  }
  if (activityMissing.length) {
    console.warn(`[Schema mismatch:activity_log] Missing columns: ${activityMissing.join(", ")}`);
  }
  await PCDL.supabase.from("activity_log").insert(activityInsert);
};

PCDL.logMessageWatchEvent = async function (eventPayload) {
  const session = await PCDL.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("You must be signed in.");
  const cols = await getTableColumns("message_watch_events");
  const fullPayload = {
    user_id: userId,
    message_item_id: eventPayload.message_item_id,
    event_type: eventPayload.event_type,
    watch_seconds: eventPayload.watch_seconds || 0,
    watch_percent: eventPayload.watch_percent || 0,
    session_id: eventPayload.session_id || null,
    device_type: eventPayload.device_type || null
  };
  const { out, missing } = pickPresentColumns(fullPayload, cols);
  if (missing.length) throw schemaError("message_watch_events", missing, "logMessageWatchEvent");
  const { error } = await PCDL.supabase.from("message_watch_events").insert(out);
  if (error) throw error;
  return true;
};

PCDL.upsertMessageProgress = async function (progressPayload) {
  const session = await PCDL.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("You must be signed in.");
  const cols = await getTableColumns("message_progress");
  const fullPayload = {
    user_id: userId,
    message_item_id: progressPayload.message_item_id || null,
    message_id: progressPayload.message_id || null,
    play_count: progressPayload.play_count || 0,
    watch_seconds: progressPayload.watch_seconds || 0,
    watch_percent: progressPayload.watch_percent || 0,
    completed: !!progressPayload.completed,
    completed_at: progressPayload.completed_at || null,
    last_watched_at: progressPayload.last_watched_at || new Date().toISOString(),
    first_played_at: progressPayload.first_played_at || null,
    points_earned: progressPayload.points_earned || 0,
    completion_percent: progressPayload.watch_percent || progressPayload.completion_percent || 0
  };
  const { out, missing } = pickPresentColumns(fullPayload, cols);
  if (missing.length) {
    const requiredMissing = missing.filter((c) => ["user_id", "message_item_id"].includes(c));
    if (requiredMissing.length) throw schemaError("message_progress", requiredMissing, "upsertMessageProgress");
  }
  const conflict = ("message_item_id" in out && out.message_item_id)
    ? "user_id,message_item_id"
    : "user_id,message_id";
  const { error } = await PCDL.supabase.from("message_progress").upsert(out, { onConflict: conflict });
  if (error) throw error;
  return true;
};

PCDL.getMyMessageProgressForDay = async function (dayId) {
  const session = await PCDL.getSession();
  const userId = session?.user?.id;
  if (!userId || !dayId) return [];
  const { data, error } = await PCDL.supabase
    .from("message_progress")
    .select("message_item_id, play_count, watch_seconds, watch_percent, completed, completed_at, last_watched_at, first_played_at, points_earned")
    .eq("user_id", userId)
    .not("message_item_id", "is", null);
  if (error) throw error;
  return data || [];
};

PCDL.saveReflection = async function (messageId, reflectionText, visibility, dayId = null, messageItemId = null) {
  const session = await PCDL.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("You must be signed in.");
  if (!reflectionText.trim()) throw new Error("Reflection cannot be empty.");

  const reflectionCols = await getTableColumns("reflections");
  const fullReflectionPayload = {
    user_id: userId,
    message_id: messageId || null,
    day_id: dayId,
    message_item_id: messageItemId,
    reflection_text: reflectionText.trim(),
    visibility
  };
  const { out: reflectionPayload, missing: reflectionMissing } = pickPresentColumns(fullReflectionPayload, reflectionCols);
  if (!("user_id" in reflectionPayload) || !("reflection_text" in reflectionPayload)) {
    throw schemaError("reflections", ["user_id", "reflection_text"], "saveReflection");
  }
  if (reflectionMissing.length) {
    throw schemaError("reflections", reflectionMissing, "saveReflection optional field(s)");
  }
  const { error } = await PCDL.supabase.from("reflections").insert(reflectionPayload);
  if (error) throw error;

  const activityCols = await getTableColumns("activity_log");
  const fullActivityPayload = {
    user_id: userId,
    activity_type: "reflection_posted",
    metadata: { visibility }
  };
  const { out: activityPayload, missing: activityMissing } = pickPresentColumns(fullActivityPayload, activityCols);
  if (!("user_id" in activityPayload) || !("activity_type" in activityPayload)) {
    throw schemaError("activity_log", ["user_id", "activity_type"], "log reflection_posted");
  }
  if (activityMissing.includes("metadata")) {
    console.warn("[Schema mismatch:activity_log] metadata column missing; visibility metadata not persisted.");
  }
  await PCDL.supabase.from("activity_log").insert(activityPayload);
};

PCDL.updateMyProfileForSignup = async function (userId, profilePatch) {
  const cols = await getTableColumns("profiles");
  const { out: payload, missing } = pickPresentColumns(profilePatch, cols);
  if (!Object.keys(payload).length) {
    throw schemaError("profiles", Object.keys(profilePatch), "updateMyProfileForSignup");
  }
  if (missing.length) {
    throw schemaError("profiles", missing, "updateMyProfileForSignup");
  }
  const { error } = await PCDL.supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId);
  if (error) throw error;
  return true;
};

PCDL.getCommunityReflections = async function () {
  const { data, error } = await PCDL.supabase
    .from("reflections")
    .select("id, reflection_text, visibility, created_at, profiles(full_name, role, fellowships(name))")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
};

PCDL.getMyAccountabilityCircle = async function () {
  const session = await PCDL.getSession();
  const userId = session?.user?.id;
  if (!userId) return { accountableTo: [], accountableFrom: [], pending: [] };

  const { data, error } = await PCDL.supabase
    .from("accountability_relationships")
    .select("id,from_user_id,to_user_id,status,created_at,updated_at")
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id]).filter(Boolean)));
  let profileMap = new Map();
  if (ids.length) {
    const { data: profiles, error: pErr } = await PCDL.supabase
      .from("profiles")
      .select("id,full_name,role,fellowship_id,fellowship:fellowships(name)")
      .in("id", ids);
    if (pErr) throw pErr;
    profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  }

  const accepted = rows.filter((r) => (r.status || "").toLowerCase() === "accepted");
  const pending = rows.filter((r) => (r.status || "").toLowerCase() !== "accepted");

  return {
    accountableTo: accepted.filter((r) => r.from_user_id === userId).map((r) => ({
      relationship_id: r.id,
      status: r.status,
      profile: profileMap.get(r.to_user_id) || null
    })),
    accountableFrom: accepted.filter((r) => r.to_user_id === userId).map((r) => ({
      relationship_id: r.id,
      status: r.status,
      profile: profileMap.get(r.from_user_id) || null
    })),
    pending: pending.map((r) => ({
      relationship_id: r.id,
      status: r.status,
      from_user_id: r.from_user_id,
      to_user_id: r.to_user_id,
      from_profile: profileMap.get(r.from_user_id) || null,
      to_profile: profileMap.get(r.to_user_id) || null
    }))
  };
};

PCDL.getAlerts = async function () {
  const { data, error } = await PCDL.supabase
    .from("inactivity_alerts")
    .select("*")
    .order("days_inactive", { ascending: false });
  if (error) throw error;
  return data || [];
};

PCDL.getMediaRefreshRuns = async function (limit = 20) {
  const { data, error } = await PCDL.supabase
    .from("media_refresh_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

PCDL.getMediaRefreshHealth = async function () {
  const { data, error } = await PCDL.supabase
    .from("media_refresh_health_view")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

PCDL.getMediaRefreshFailures = async function (limit = 100) {
  const { data, error } = await PCDL.supabase
    .from("media_refresh_failures")
    .select("id,message_item_id,failure_type,error,occurred_at,retry_count,daily_message_items(title,day_id,pcdl_url)")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

PCDL.getMediaOpsWarnings = async function () {
  const nowIso = new Date().toISOString();
  const plus6hIso = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  const [expiringRes, missingRes, failRes] = await Promise.all([
    PCDL.supabase
      .from("daily_message_items")
      .select("id,title,media_url_expires_at,media_status")
      .eq("is_active", true)
      .not("media_url_expires_at", "is", null)
      .gt("media_url_expires_at", nowIso)
      .lte("media_url_expires_at", plus6hIso),
    PCDL.supabase
      .from("daily_message_items")
      .select("id,title")
      .eq("is_active", true)
      .or("pcdl_url.is.null,pcdl_url.eq."),
    PCDL.supabase
      .from("media_refresh_failures")
      .select("message_item_id,retry_count,occurred_at,daily_message_items(title)")
      .gte("retry_count", 3)
      .order("occurred_at", { ascending: false })
      .limit(50)
  ]);

  if (expiringRes.error) throw expiringRes.error;
  if (missingRes.error) throw missingRes.error;
  if (failRes.error) throw failRes.error;

  return {
    expiringSoon: expiringRes.data || [],
    missingPcdl: missingRes.data || [],
    repeatedFailures: failRes.data || []
  };
};

PCDL.retryMediaRefreshFailure = async function (failureRow) {
  if (!failureRow?.id || !failureRow?.message_item_id) throw new Error("Invalid failure row.");
  const retryCount = Number(failureRow.retry_count || 0) + 1;
  const nowIso = new Date().toISOString();

  const { error: failErr } = await PCDL.supabase
    .from("media_refresh_failures")
    .update({ retry_count: retryCount, occurred_at: nowIso })
    .eq("id", failureRow.id);
  if (failErr) throw failErr;

  const { error: itemErr } = await PCDL.supabase
    .from("daily_message_items")
    .update({
      media_status: "needs_refresh",
      media_error: `Queued for retry at ${nowIso}`
    })
    .eq("id", failureRow.message_item_id);
  if (itemErr) throw itemErr;
  return true;
};
}

