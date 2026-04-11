import { NextRequest, NextResponse } from "next/server"
import { handlers } from "@/auth"
import { checkRateLimit } from "@/lib/rate-limit"

export const { GET } = handlers

export async function POST(request: NextRequest) {
  // Rate-limit only the credentials sign-in callback
  const url = new URL(request.url)
  if (url.pathname.includes("/callback/credentials")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"

    const { limited, retryAfterSeconds } = checkRateLimit(ip)
    if (limited) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
        }
      )
    }
  }

  return handlers.POST(request)
}
