import { Resend } from "resend"

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PolyWiz"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3025"
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@polymash.com"

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error("RESEND_API_KEY is not set")
    _resend = new Resend(key)
  }
  return _resend
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  try {
    const { error } = await getResend().emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: email,
      subject: `Reset your ${APP_NAME} password`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">Reset your password</h2>
          <p style="color: #4a4a4a; line-height: 1.6;">
            We received a request to reset the password for your ${APP_NAME} account.
            Click the button below to choose a new password.
          </p>
          <div style="margin: 32px 0;">
            <a href="${resetUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #888; font-size: 14px; line-height: 1.5;">
            This link expires in 1 hour. If you didn't request this reset, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #aaa; font-size: 12px;">
            ${APP_NAME} by Polymash Design
          </p>
        </div>
      `,
    })

    if (error) {
      console.error("Failed to send password reset email:", error)
      return false
    }

    return true
  } catch (err) {
    console.error("Email send error:", err)
    return false
  }
}
