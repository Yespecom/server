const axios = require("axios")
const { sendSmsViaTwilio, getTwilioClient } = require("./twilio")

// Prefer Twilio SMS for all messages if configured.
// Fallback to Fast2SMS (for India) if configured.
// Otherwise dev-mode logs.

const sendSMS = async (phone, message) => {
  try {
    console.log(`📱 Sending SMS to ${phone}: ${message}`)

    // 1) Twilio preferred
    const twilioClient = getTwilioClient()
    if (twilioClient && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)) {
      try {
        const res = await sendSmsViaTwilio(phone, message)
        console.log("📱 Twilio SMS SID:", res.sid)
        return {
          success: true,
          provider: "twilio",
          messageId: res.sid,
        }
      } catch (twErr) {
        console.error("❌ Twilio SMS error:", twErr.message)
        // Try Fast2SMS (if available) before dev mode
      }
    }

    // 2) Fast2SMS fallback (mostly for India)
    if (process.env.FAST2SMS_API_KEY) {
      const fast2smsUrl = "https://www.fast2sms.com/dev/bulkV2"

      // Clean phone number (remove spaces)
      let cleanPhone = String(phone).replace(/\s+/g, "").replace(/^\+/, "")

      // Remove +91 if present with 12 digits
      if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
        cleanPhone = cleanPhone.substring(2)
      }

      // Validate Indian mobile number (10 digits starting with 6-9)
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        throw new Error(`Invalid Indian mobile number format for Fast2SMS: ${cleanPhone}`)
      }

      const payload = {
        authorization: process.env.FAST2SMS_API_KEY,
        message: message,
        language: "english",
        route: "q",
        numbers: cleanPhone,
      }

      if (process.env.FAST2SMS_SENDER_ID) {
        payload.sender_id = process.env.FAST2SMS_SENDER_ID
      }

      const response = await axios.post(fast2smsUrl, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      })

      if (response.data.return === true) {
        return {
          success: true,
          messageId: response.data.request_id,
          provider: "fast2sms",
          details: response.data,
        }
      } else {
        throw new Error(`Fast2SMS Error: ${response.data.message || "Unknown error"}`)
      }
    }

    // 3) Dev mode
    console.log(`📱 DEV MODE - SMS to ${phone}: ${message}`)
    console.log(`ℹ️ Configure Twilio or Fast2SMS to send real SMS.`)
    return {
      success: true,
      messageId: `dev_${Date.now()}`,
      provider: "development",
      devMode: true,
    }
  } catch (error) {
    console.error("❌ SMS sending error:", error.message || error)
    throw error
  }
}

const sendCustomerOTP = async (phone, otp, storeName = "Store") => {
  const message = `Your OTP for ${storeName}: ${otp}. Valid for 10 minutes. Do not share.`
  const finalMessage = message.length > 160 ? `OTP for ${storeName}: ${otp}. Valid 10 min. Do not share.` : message
  return await sendSMS(phone, finalMessage)
}

const sendWelcomeSMS = async (phone, customerName, storeName = "Store") => {
  const message = `Welcome to ${storeName}, ${customerName}! Thank you for joining us.`
  return await sendSMS(phone, message)
}

const sendOrderConfirmationSMS = async (phone, orderNumber, storeName = "Store") => {
  const message = `Order #${orderNumber} confirmed at ${storeName}. Thank you!`
  return await sendSMS(phone, message)
}

const sendOrderStatusSMS = async (phone, orderNumber, status, storeName = "Store") => {
  const statusMessages = {
    confirmed: `Order #${orderNumber} confirmed at ${storeName}`,
    shipped: `Order #${orderNumber} shipped from ${storeName}`,
    delivered: `Order #${orderNumber} delivered. Thank you for shopping with ${storeName}!`,
    cancelled: `Order #${orderNumber} cancelled at ${storeName}`,
  }
  const message = statusMessages[status] || `Order #${orderNumber} status: ${status}`
  return await sendSMS(phone, message)
}

const testSMS = async (phone, testMessage = "Test message from your store") => {
  const result = await sendSMS(phone, testMessage)
  return result
}

const validateFast2SMSConfig = () => {
  const apiKey = process.env.FAST2SMS_API_KEY
  if (!apiKey) {
    return {
      valid: false,
      error: "FAST2SMS_API_KEY not found in environment variables",
      help: [
        "1. Optionally configure Fast2SMS for fallback in India",
        "2. Prefer Twilio: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN",
      ],
    }
  }
  if (apiKey.length < 20) {
    return {
      valid: false,
      error: "Fast2SMS API key seems too short",
      help: ["Fast2SMS API keys are typically 50-80 characters long"],
    }
  }
  return { valid: true, message: "Fast2SMS configuration looks valid" }
}

const getSMSStatus = () => {
  const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  const fast2smsConfigured = !!process.env.FAST2SMS_API_KEY

  return {
    providerPreferred: twilioConfigured ? "Twilio" : fast2smsConfigured ? "Fast2SMS" : "Development",
    twilio: {
      configured: twilioConfigured,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ? "Set" : "Not set",
      fromNumber: process.env.TWILIO_FROM_NUMBER || "Not set",
      verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID ? "Set" : "Not set",
    },
    fast2sms: {
      configured: fast2smsConfigured,
      apiKey: process.env.FAST2SMS_API_KEY ? process.env.FAST2SMS_API_KEY.substring(0, 10) + "..." : "Not set",
    },
    status: validateFast2SMSConfig(),
  }
}

module.exports = {
  sendSMS,
  sendCustomerOTP,
  sendWelcomeSMS,
  sendOrderConfirmationSMS,
  sendOrderStatusSMS,
  testSMS,
  getSMSStatus,
  validateFast2SMSConfig,
}
