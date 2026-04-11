import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { listUsers } from "@/lib/airtable/client"

export async function GET() {
  const session = await auth()
  const role = session?.user?.role

  if (!role || (role !== "admin" && role !== "super-admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const users = await listUsers()
  return NextResponse.json(users)
}
