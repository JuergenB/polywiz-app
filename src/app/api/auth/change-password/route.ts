import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { fetchUserByEmail, updatePasswordHash } from "@/lib/airtable/client"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { currentPassword, newPassword } = await request.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Missing current or new password" }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 })
  }

  // Verify current password
  const profile = await fetchUserByEmail(session.user.email)
  if (!profile?.passwordHash) {
    return NextResponse.json({ error: "Password not set. Use the forgot password flow." }, { status: 400 })
  }

  const valid = await bcrypt.compare(currentPassword, profile.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  // Hash and save new password
  const hash = await bcrypt.hash(newPassword, 10)
  await updatePasswordHash(profile.id, hash)

  return NextResponse.json({ ok: true })
}
