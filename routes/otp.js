const express = require("express")
const OTP = require("../models/OTP")
const { sendOTPEmail } = require("../config/email")
const { sendSMS } = require("../config/sms") // Assuming you might want to send OTP via SMS too

const router = express.Router()

// Send OTP for various purposes (e.g., general verification, not specific to auth/password-reset)
router.post("/send", async (req, res) => {
  try {
    const { email, phoneNumber, purpose } = req.body

    console.log(`🔢 Send OTP request for: ${email || phoneNumber}, Purpose: ${purpose}`)

    if (!email && !phoneNumber) {
      return res.status(400).json({ error: "Email or phone number is required" })
    }
    if (!purpose) {
      return res.status(400).json({ error: "Purpose is required" })
    }

    // Basic rate limiting
    const recentOTP = await OTP.findOne({
      $or: [{ email }, { phoneNumber }], // Assuming OTP model can store phone numbers too
      purpose,
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) }, // Last 1 minute
    })

    if (recentOTP) {
      return res.status(429).json({
        error: "Please wait 1 minute before requesting a new OTP",
      })
    }

    let otpCode
    if (email) {
      otpCode = await OTP.createOTP(email, purpose)
      await sendOTPEmail(email, otpCode, purpose)
      console.log(`✅ OTP email sent for ${email}, purpose: ${purpose}`)
    }

    if (phoneNumber) {
      // You might need to adjust OTP.createOTP to handle phone numbers if not already
      // For simplicity, reusing the same OTP generation logic.
      if (!otpCode) {
        otpCode = await OTP.createOTP(phoneNumber, purpose) // Assuming email field can store phone for OTP model
      }
      const smsResult = await sendSMS(phoneNumber, `Your ${purpose} OTP is: ${otpCode}`)
      if (!smsResult.success) {
        console.warn(`⚠️ Failed to send SMS OTP to ${phoneNumber}: ${smsResult.message}`)
      } else {
        console.log(`✅ OTP SMS sent for ${phoneNumber}, purpose: ${purpose}`)
      }
    }

    res.json({
      message: "OTP sent successfully",
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Send OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Verify OTP
router.post("/verify", async (req, res) => {
  try {
    const { email, phoneNumber, otp, purpose } = req.body

    console.log(`🔍 Verify OTP request for: ${email || phoneNumber}, OTP: ${otp}, Purpose: ${purpose}`)

    if ((!email && !phoneNumber) || !otp || !purpose) {
      return res.status(400).json({ error: "Email/phone, OTP, and purpose are required" })
    }

    const identifier = email || phoneNumber // Use email or phone as identifier for OTP lookup

    const otpDoc = await OTP.verifyOTP(identifier, otp, purpose)

    if (!otpDoc) {
      console.log(`❌ Invalid or expired OTP for ${identifier}, purpose: ${purpose}`)
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    res.json({
      message: "OTP verified successfully",
      verified: true,
    })
  } catch (error) {
    console.error("❌ Verify OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
