import { NextResponse } from "next/server";

// Returns the server-side API key if configured.
// For private/self-hosted instances where the key is set via env var.
export async function GET() {
  const apiKey = process.env.LATE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ apiKey: null });
  }

  return NextResponse.json({ apiKey });
}
