"use client"

import { useState } from "react"
import Link from "next/link"
import { Logo } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const form = new FormData(e.currentTarget)
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email") }),
    })

    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center space-y-1 pb-2">
          <Logo size="lg" />
          <p className="text-sm text-muted-foreground">Reset your password</p>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-foreground">
                  If an account exists with that email, we&apos;ve sent a
                  password reset link. Check your inbox.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Didn&apos;t receive it? Check your spam folder or{" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                  onClick={() => setSubmitted(false)}
                >
                  try again
                </button>
                .
              </p>
              <Link
                href="/login"
                className="text-sm text-primary underline underline-offset-4 hover:text-primary/80 block"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your email address and we&apos;ll send you a link to reset
                your password.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <Link
                href="/login"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground block text-center"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
