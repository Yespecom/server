const axios = require("axios")

// Sanitize phone to numeric string with country code (default 91 for India)
// Accepts E.164 like +911234567890 or local 10-digit numbers.
function sanitizePhone(phone) {
  let p = String(phone || "").trim()
  // Keep digits only
  p = p.replace(/\D/g, "")
  // If 10 digits, prefix with default country code
  if (p.length === 10) {
    const cc = process.env.MSG91_COUNTRY_CODE || "91"
    p = cc + p
  }
  return p
}

function hasMsg91() {
  return !!process.env.MSG91_AUTH_KEY
}

// Send OTP via MSG91 OTP API (auto-generates OTP based on your template)
async function startOtp(phone, channel = "sms", meta = {}) {
  if (!hasMsg91()) {
    throw new Error("MSG91 not configured: set MSG91_AUTH_KEY (and MSG91_OTP_TEMPLATE_ID)")
  }
  const mobile = sanitizePhone(phone)
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID
  if (!templateId) {
    throw new Error("MSG91_OTP_TEMPLATE_ID is required to send OTP")
  }

  const payload = {
    template_id: templateId,
    mobile,
    // otp_length and otp_expiry are optional; your template can define defaults.
    // Uncomment if you want to control here:
    // otp_length: 6,
    // otp_expiry: 10, // minutes
    // You can pass custom variables used in the template via 'extra_param'
    extra_param: {
      purpose: meta.purpose || "login",
      store: meta.storeName || "Store",
    },
  }

  const res = await axios.post("https://api.msg91.com/api/v5/otp", payload, {
    headers: {
      authkey: process.env.MSG91_AUTH_KEY,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  })

  // MSG91 typically returns { type: "success", message: "OTP sent successfully" }
  const ok = res.data?.type === "success" || /sent/i.test(res.data?.message || "") || res.status === 200

  if (!ok) {
    throw new Error(`MSG91 OTP send failed: ${JSON.stringify(res.data)}`)
  }

  return {
    success: true,
    provider: "msg91",
    data: res.data,
  }
}

// Verify OTP via MSG91 OTP API
async function verifyOtp(phone, otp) {
  if (!hasMsg91()) {
    throw new Error("MSG91 not configured: set MSG91_AUTH_KEY")
  }
  const mobile = sanitizePhone(phone)

  const payload = { mobile, otp }
  const res = await axios.post("https://api.msg91.com/api/v5/otp/verify", payload, {
    headers: {
      authkey: process.env.MSG91_AUTH_KEY,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  })

  // Typical: { type: "success", message: "OTP verified success" }
  const ok = res.data?.type === "success" || /verified/i.test(res.data?.message || "") || res.status === 200

  return {
    valid: !!ok,
    provider: "msg91",
    data: res.data,
  }
}

// General purpose SMS via MSG91 (Transactional route)
async function sendSmsViaMsg91(phone, message) {
  if (!hasMsg91()) {
    throw new Error("MSG91 not configured: set MSG91_AUTH_KEY")
  }
  const mobile = sanitizePhone(phone)
  const sender = process.env.MSG91_SENDER_ID || "MSGIND"
  const country = process.env.MSG91_COUNTRY_CODE || "91"

  const payload = {
    sender,
    route: "4", // Transactional
    country,
    sms: [
      {
        message,
        to: [mobile],
      },
    ],
  }

  const res = await axios.post("https://api.msg91.com/api/v2/sendsms", payload, {
    headers: {
      authkey: process.env.MSG91_AUTH_KEY,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  })

  // Success criteria: status 200 and 'type' or 'message' indicates success
  const ok = res.status === 200 && (res.data?.type === "success" || /success/i.test(res.data?.message || ""))

  if (!ok) {
    throw new Error(`MSG91 SMS send failed: ${JSON.stringify(res.data)}`)
  }

  const messageId =
    res.data?.messages?.[0]?.["message-id"] ||
    res.data?.messages?.[0]?.message ||
    res.data?.batch_id ||
    `msg91_${Date.now()}`

  return {
    success: true,
    provider: "msg91",
    messageId,
    data: res.data,
  }
}

module.exports = {
  hasMsg91,
  startOtp,
  verifyOtp,
  sendSmsViaMsg91,
  sanitizePhone,
}
