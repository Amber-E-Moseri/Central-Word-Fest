(() => {
  const REQUIRED_TABLES = [
    "profiles",
    "reflections",
    "message_progress",
    "activity_log",
    "daily_message_days",
    "daily_message_items",
    "message_watch_events"
  ];

  const LEGACY_TABLES = ["daily_messages"];

  function isMissingTableError(error) {
    const code = error?.code || "";
    const msg = String(error?.message || "").toLowerCase();
    return code === "PGRST205" || msg.includes("could not find the table");
  }

  async function tableExists(tableName) {
    const { error } = await PCDL.supabase.from(tableName).select("*").limit(1);
    if (!error) return true;
    if (isMissingTableError(error)) return false;
    return true;
  }

  async function run() {
    try {
      const missingRequired = [];
      for (const table of REQUIRED_TABLES) {
        const exists = await tableExists(table);
        if (!exists) missingRequired.push(table);
      }

      const legacyStatus = {};
      for (const table of LEGACY_TABLES) {
        legacyStatus[table] = await tableExists(table);
      }

      if (missingRequired.length) {
        console.warn(
          `[Schema validator] Missing required tables: ${missingRequired.join(", ")}. ` +
          "App will continue in degraded mode. Apply latest additive migrations."
        );
      } else {
        console.info("[Schema validator] Canonical item-based media schema active.");
      }

      if (legacyStatus.daily_messages) {
        console.info("[Schema validator] Legacy daily_messages detected (fallback enabled).");
      } else {
        console.info("[Schema validator] Legacy daily_messages not detected (fallback optional).");
      }

      return { missingRequired, legacyStatus };
    } catch (err) {
      console.warn(
        `[Schema validator] Validation skipped due to connectivity/permissions issue: ${err.message || "unknown"}. ` +
        "App boot continues in degraded mode."
      );
      return { missingRequired: [], legacyStatus: {}, degraded: true };
    }
  }

  window.PCDLSchemaValidator = { run };
})();

