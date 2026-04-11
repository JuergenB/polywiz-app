import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { storeResetToken } from "@/lib/airtable/client"
import { sendPasswordResetEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email || typeof email !== "string") {
    // Always return success to prevent email enumeration
    return NextResponse.json({ ok: true })
  }

  const token = crypto.randomBytes(32).toString("hex")
  const stored = await storeResetToken(email.toLowerCase().trim(), token)

  if (stored) {
    await sendPasswordResetEmail(email, token)
  }

  // Always return success regardless of whether the email exists
  return NextResponse.json({ ok: true })
}
