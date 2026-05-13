import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const payload = {
    status: "ok",
    service: "pcdl-platform",
    timestamp: new Date().toISOString()
  };

  console.info(JSON.stringify({ level: "info", route: "/api/health", requestId, payload }));
  return NextResponse.json(payload, { headers: { "x-request-id": requestId } });
}
