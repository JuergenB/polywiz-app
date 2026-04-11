"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ArrowLeft, Copy, Check, KeyRound } from "lucide-react"
import Link from "next/link"

interface UserRecord {
  id: string
  email: string
  displayName: string
  role: string
  brandIds: string[]
}

export default function UsersPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Reset dialog state
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null)
  const [customPassword, setCustomPassword] = useState("")
  const [resetResult, setResetResult] = useState<{
    email: string
    password: string
  } | null>(null)
  const [resetting, setResetting] = useState(false)
  const [copied, setCopied] = useState(false)

  const isAdmin =
    session?.user?.role === "admin" || session?.user?.role === "super-admin"

  useEffect(() => {
    if (sessionStatus === "loading") return
    if (!isAdmin) {
      router.push("/dashboard/settings")
      return
    }
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        setUsers(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [isAdmin, sessionStatus, router])

  async function handleResetPassword() {
    if (!resetTarget) return
    setResetting(true)

    const res = await fetch("/api/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetTarget.email,
        newPassword: customPassword || undefined,
      }),
    })

    const data = await res.json()
    setResetting(false)

    if (res.ok) {
      setResetResult({ email: resetTarget.email, password: data.tempPassword })
      setResetTarget(null)
      setCustomPassword("")
    }
  }

  function copyPassword() {
    if (resetResult) {
      navigator.clipboard.writeText(resetResult.password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!isAdmin) return null

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage team members and reset passwords.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users...</p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{user.displayName}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {user.role}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetTarget(user)}
                >
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                  Reset Password
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reset result banner */}
      {resetResult && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-medium">
              Password reset for {resetResult.email}
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={resetResult.password}
                readOnly
                className="font-mono text-sm max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={copyPassword}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this password securely with the user. They can change it in
              Settings after logging in.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetResult(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Reset confirmation dialog */}
      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null)
            setCustomPassword("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Reset the password for{" "}
              <span className="font-medium text-foreground">
                {resetTarget?.displayName}
              </span>{" "}
              ({resetTarget?.email}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="customPw">
              New password{" "}
              <span className="text-muted-foreground font-normal">
                (leave blank to auto-generate)
              </span>
            </Label>
            <Input
              id="customPw"
              type="text"
              value={customPassword}
              onChange={(e) => setCustomPassword(e.target.value)}
              placeholder="Auto-generate a secure password"
              minLength={8}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword} disabled={resetting}>
              {resetting ? "Resetting..." : "Reset Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
