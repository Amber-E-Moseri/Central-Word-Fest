import { NextResponse } from "next/server";

type ClientErrorPayload = {
  source?: string;
  message?: string;
  stack?: string | null;
  digest?: string | null;
  url?: string;
  userAgent?: string;
};

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  let body: ClientErrorPayload | null = null;

  try {
    body = (await request.json()) as ClientErrorPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON payload" },
      { status: 400, headers: { "x-request-id": requestId } }
    );
  }

  if (!body?.message || typeof body.message !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing error message" },
      { status: 422, headers: { "x-request-id": requestId } }
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      route: "/api/client-errors",
      requestId,
      source: body.source || "client",
      message: body.message,
      stack: body.stack || null,
      digest: body.digest || null,
      url: body.url || null,
      userAgent: body.userAgent || null
    })
  );

  return NextResponse.json({ ok: true }, { status: 202, headers: { "x-request-id": requestId } });
}

