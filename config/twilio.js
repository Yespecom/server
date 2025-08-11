const twilio = require("twilio")

// Normalize a phone number to E.164 where possible.
// - If already starts with "+", return as-is (basic sanity).
// - If 10 digits and starts with 6-9 (common India mobile), prefix +91.
// - If 11-15 digits, prefix "+" and let Twilio validate.
// - Otherwise return raw; Twilio will error if invalid.
function toE164(phone) {
  const raw = String(phone || "").trim()
  if (!raw) return raw
  if (raw.startsWith("+")) return raw
  const digits = raw.replace(/\D/g, "")
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`
  return raw
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  try {
    return twilio(sid, token)
  } catch (e) {
    console.error("❌ Failed to initialize Twilio client:", e.message)
    return null
  }
}

async function sendSmsViaTwilio(to, body) {
  const client = getTwilioClient()
  if (!client) {
    throw new Error("Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN")
  }

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  const from = process.env.TWILIO_FROM_NUMBER

  if (!messagingServiceSid && !from) {
    throw new Error(
      "Twilio sender is not configured. Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER in environment",
    )
  }

  const toE = toE164(to)
  const payload = {
    to: toE,
    body,
    ...(messagingServiceSid ? { messagingServiceSid } : { from }),
  }

  const msg = await client.messages.create(payload)
  return { sid: msg.sid }
}

// Twilio Verify helpers (preferred for OTP)
function hasVerify() {
  return !!(process.env.TWILIO_VERIFY_SERVICE_SID && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
}

async function startVerify(to, channel = "sms") {
  const client = getTwilioClient()
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID
  if (!client || !serviceSid) throw new Error("Twilio Verify is not configured")
  const toE = toE164(to)
  const v = await client.verify.v2.services(serviceSid).verifications.create({ to: toE, channel })
  return { sid: v.sid, status: v.status }
}

async function checkVerify(to, code) {
  const client = getTwilioClient()
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID
  if (!client || !serviceSid) throw new Error("Twilio Verify is not configured")
  const toE = toE164(to)
  const check = await client.verify.v2.services(serviceSid).verificationChecks.create({ to: toE, code })
  return { status: check.status, valid: check.status === "approved" }
}

module.exports = {
  toE164,
  getTwilioClient,
  sendSmsViaTwilio,
  hasVerify,
  startVerify,
  checkVerify,
}
