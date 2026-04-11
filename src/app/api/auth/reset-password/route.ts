import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { validateResetToken, updatePasswordHash } from "@/lib/airtable/client"

export async function POST(request: NextRequest) {
  const { token, password } = await request.json()

  if (!token || !password || typeof password !== "string") {
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const result = await validateResetToken(token)
  if (!result) {
    return NextResponse.json(
      { error: "Invalid or expired reset link. Please request a new one." },
      { status: 400 }
    )
  }

  const hash = await bcrypt.hash(password, 10)
  await updatePasswordHash(result.recordId, hash)

  return NextResponse.json({ ok: true })
}
