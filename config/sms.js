const axios = require("axios")

const sendSMS = async (phoneNumber, message) => {
  if (!process.env.FAST2SMS_API_KEY || !process.env.FAST2SMS_SENDER_ID) {
    console.warn("⚠️ SMS sending skipped: FAST2SMS_API_KEY or FAST2SMS_SENDER_ID not set.")
    return { success: false, message: "SMS service not configured." }
  }

  const url = "https://www.fast2sms.com/devUtility/sms"
  const payload = {
    variables_values: message,
    route: "otp", // Or "q" for quick transactional
    numbers: phoneNumber,
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/json",
      },
    })

    if (response.data && response.data.return === true) {
      console.log(`✅ SMS sent to ${phoneNumber}: ${message}`)
      return { success: true, data: response.data }
    } else {
      console.error(`❌ SMS sending failed to ${phoneNumber}:`, response.data)
      return { success: false, message: response.data.message || "Unknown SMS error", data: response.data }
    }
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber}:`, error.message)
    return { success: false, message: "Failed to send SMS due to network or API error.", error: error.message }
  }
}

const sendCustomerOTP = async (phone, otp, storeName = "Store") => {
  // Fast2SMS has a 160 character limit for messages
  const message = `Your OTP for ${storeName}: ${otp}. Valid for 10 minutes. Do not share.`

  // Ensure message is within character limit
  if (message.length > 160) {
    const shortMessage = `OTP for ${storeName}: ${otp}. Valid 10 min. Do not share.`
    return await sendSMS(phone, shortMessage)
  }

  return await sendSMS(phone, message)
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

// Test SMS function
const testSMS = async (phone, testMessage = "Test message from your store") => {
  try {
    console.log(`🧪 Testing SMS to ${phone}`)
    const result = await sendSMS(phone, testMessage)
    console.log(`✅ Test SMS result:`, result)
    return result
  } catch (error) {
    console.error(`❌ Test SMS failed:`, error)
    throw error
  }
}

// Validate Fast2SMS configuration - SIMPLIFIED
const validateFast2SMSConfig = () => {
  const apiKey = process.env.FAST2SMS_API_KEY
  const senderId = process.env.FAST2SMS_SENDER_ID

  if (!apiKey || !senderId) {
    return {
      valid: false,
      error: "FAST2SMS_API_KEY or FAST2SMS_SENDER_ID not found in environment variables",
      help: [
        "1. Sign up at https://www.fast2sms.com/",
        "2. Add credits to your account",
        "3. Go to Dashboard > API Keys",
        "4. Copy your API key",
        "5. Add FAST2SMS_API_KEY=your_api_key to .env file",
        "6. Sender ID is optional - Fast2SMS will use default",
      ],
    }
  }

  // Check minimum length (Fast2SMS keys are typically long)
  if (apiKey.length < 20) {
    return {
      valid: false,
      error: "Fast2SMS API key seems too short",
      help: [
        "Fast2SMS API keys are typically 50-80 characters long",
        "Please verify you copied the complete key",
        "Check Fast2SMS dashboard for the correct key",
        "Make sure your account is active and has credits",
      ],
    }
  }

  return {
    valid: true,
    message: "Fast2SMS configuration looks valid",
    keyLength: apiKey.length,
    keyPrefix: apiKey.substring(0, 10) + "...",
    senderIdRequired: false,
    note: "Sender ID is optional - Fast2SMS will use default if not provided",
  }
}

// Get SMS service status
const getSMSStatus = () => {
  const config = validateFast2SMSConfig()
  const isConfigured = !!process.env.FAST2SMS_API_KEY

  return {
    provider: "Fast2SMS",
    configured: isConfigured,
    valid: config.valid,
    apiKey: process.env.FAST2SMS_API_KEY ? process.env.FAST2SMS_API_KEY.substring(0, 10) + "..." : "Not set",
    senderId: process.env.FAST2SMS_SENDER_ID || "Default (Fast2SMS will choose)",
    senderIdRequired: false,
    supportedCountries: ["India"],
    validation: config,
    features: {
      otp: true,
      promotional: true,
      transactional: true,
      unicode: true,
    },
    limits: {
      messageLength: 160,
      dailyLimit: "Depends on your Fast2SMS plan",
    },
    setupInstructions: [
      "1. Visit https://www.fast2sms.com/",
      "2. Create account and verify your mobile number",
      "3. Add credits to your account (minimum ₹10-20)",
      "4. Go to Dashboard > API Keys",
      "5. Copy your API key (50-80 characters long)",
      "6. Add to .env: FAST2SMS_API_KEY=your_key_here",
      "7. Sender ID is optional - leave blank for default",
      "8. Restart your server",
    ],
    troubleshooting: [
      "Common issues and solutions:",
      "• 401/412 errors: Invalid or expired API key",
      "• No credits: Add money to your Fast2SMS account",
      "• Account not verified: Complete phone/email verification",
      "• API key too short: Make sure you copied the full key",
      "• Sender ID issues: Leave sender ID blank to use default",
    ],
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
