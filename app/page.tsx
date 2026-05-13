"use client";

import Script from "next/script";

export default function HomePage() {
  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="afterInteractive" />
      <Script src="/pcdl/config.js" strategy="afterInteractive" />
      <Script src="/pcdl/auth.js" strategy="afterInteractive" />
      <Script src="/pcdl/app/media-tracking.js" strategy="afterInteractive" />
      <Script src="/pcdl/app.js" strategy="afterInteractive" />
      <Script src="/pcdl/app/data.js" strategy="afterInteractive" />
      <Script src="/pcdl/app/schema-validator.js" strategy="afterInteractive" />
      <Script src="/pcdl/app/auth-flow.js" strategy="afterInteractive" />
      <Script id="pcdl-client-error-capture" strategy="afterInteractive">{`
        (function () {
          function postError(payload) {
            fetch("/api/client-errors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }).catch(function () {});
          }

          window.addEventListener("error", function (event) {
            postError({
              source: "window.error",
              message: event.message || "Unknown client error",
              stack: event.error && event.error.stack ? event.error.stack : null,
              url: window.location.href,
              userAgent: navigator.userAgent
            });
          });

          window.addEventListener("unhandledrejection", function (event) {
            var reason = event.reason || {};
            postError({
              source: "window.unhandledrejection",
              message: reason.message || String(reason),
              stack: reason.stack || null,
              url: window.location.href,
              userAgent: navigator.userAgent
            });
          });
        })();
      `}</Script>

      <div className="app-shell" id="app">
        <header className="header" id="app-header">
          <div className="header-top">
            <div>
              <div className="brand-name">Central World Fest</div>
              <div className="brand-sub" id="header-sub">Accountability Challenge</div>
            </div>
            <div id="user-badge-area"></div>
          </div>
          <div className="tabs hidden" id="header-tabs"></div>
        </header>

        <main className="main" id="main-content"></main>
        <nav className="bottom-nav hidden" id="bottom-nav"></nav>
      </div>

      <div
        className="overlay-backdrop hidden"
        id="circle-overlay"
        onClick={(event) => (window as any).closeOverlay?.(event)}
      >
        <div className="overlay-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Edit your circle</div>
            <button
              onClick={() => (window as any).closeOverlay?.(null, true)}
              style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
          <div className="notice" style={{ marginBottom: 14 }}>
            Choose 2-3 people you want to be accountable to. They can be from any fellowship.
          </div>
          <div className="partner-grid" id="overlay-grid"></div>
          <div id="overlay-count" style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <button className="btn btn-muted" onClick={() => (window as any).closeOverlay?.(null, true)}>Cancel</button>
            <button className="btn btn-purple" onClick={() => (window as any).saveCircle?.()}>Save circle</button>
          </div>
        </div>
      </div>
    </>
  );
}
