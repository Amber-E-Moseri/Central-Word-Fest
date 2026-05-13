window.PCDL = window.PCDL || {};

PCDL.createMediaTracker = function createMediaTracker({
  mediaElement,
  messageItemId,
  onProgress
}) {
  const sessionId = crypto.randomUUID();
  const deviceType = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    ? "mobile"
    : "desktop";

  let lastSyncAt = 0;
  let playCounted = false;
  let completed = false;

  function getPercent() {
    if (!mediaElement.duration || !Number.isFinite(mediaElement.duration)) return 0;
    return Math.min(100, Math.max(0, (mediaElement.currentTime / mediaElement.duration) * 100));
  }

  async function sync(eventType, force = false) {
    const now = Date.now();

    if (!force && now - lastSyncAt < 15000) return;

    lastSyncAt = now;

    const watchSeconds = Math.floor(mediaElement.currentTime || 0);
    const watchPercent = Number(getPercent().toFixed(2));

    if (watchPercent >= 90) completed = true;

    if (onProgress) {
      onProgress({
        watchSeconds,
        watchPercent,
        completed
      });
    }

    const { error } = await PCDL.supabase.rpc("sync_message_watch_progress", {
      p_message_item_id: messageItemId,
      p_event_type: eventType,
      p_watch_seconds: watchSeconds,
      p_watch_percent: watchPercent,
      p_session_id: sessionId,
      p_device_type: deviceType
    });

    if (error) {
      console.warn("Watch progress sync failed:", error.message);
    }
  }

  mediaElement.addEventListener("play", () => {
    if (!playCounted) {
      playCounted = true;
      sync("play", true);
    }
  });

  mediaElement.addEventListener("pause", () => {
    sync("pause", true);
  });

  mediaElement.addEventListener("timeupdate", () => {
    sync("timeupdate", false);
  });

  mediaElement.addEventListener("seeking", () => {
    sync("seeking", true);
  });

  mediaElement.addEventListener("ended", () => {
    completed = true;
    sync("ended", true);
  });

  window.addEventListener("beforeunload", () => {
    sync("page_unload", true);
  });

  return {
    syncNow: () => sync("manual_sync", true)
  };
};
