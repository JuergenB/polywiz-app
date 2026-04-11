import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { auth } from "@/auth"
import { updatePasswordHash, fetchUserByEmail } from "@/lib/airtable/client"

export async function POST(request: NextRequest) {
  const session = await auth()
  const role = session?.user?.role

  if (!role || (role !== "admin" && role !== "super-admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { email, newPassword } = await request.json()

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }

  const profile = await fetchUserByEmail(email)
  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // If no password provided, generate a random one
  const password = newPassword || crypto.randomBytes(12).toString("base64url")
  const hash = await bcrypt.hash(password, 10)
  await updatePasswordHash(profile.id, hash)

  return NextResponse.json({ ok: true, tempPassword: password })
}
