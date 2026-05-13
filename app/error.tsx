"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "next_error_boundary",
        message: error.message,
        stack: error.stack || null,
        digest: error.digest || null
      })
    }).catch(() => {});
  }, [error]);

  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
      <p style={{ marginBottom: "1rem" }}>
        An unexpected error occurred. You can retry or refresh the page.
      </p>
      <button onClick={reset} style={{ padding: "0.6rem 1rem", cursor: "pointer" }}>
        Try again
      </button>
    </main>
  );
}

