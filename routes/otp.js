const express = require("express")
const OTP = require("../models/OTP")
const User = require("../models/User")
const { sendOTPEmail } = require("../config/email")
const router = express.Router()

// Send OTP
router.post("/send", async (req, res) => {
  try {
    const { email, purpose = "registration" } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" })
    }

    // Check if user exists based on purpose
    const existingUser = await User.findOne({ email })

    if (purpose === "registration" && existingUser) {
      return res.status(400).json({ error: "User already exists with this email" })
    }

    if ((purpose === "login" || purpose === "password_reset") && !existingUser) {
      return res.status(404).json({ error: "User not found with this email" })
    }

    // Generate and save OTP
    const otp = await OTP.createOTP(email, purpose)
    console.log(`🔢 Generated OTP for ${email}: ${otp} (Purpose: ${purpose})`)

    // Send OTP via email
    await sendOTPEmail(email, otp, purpose)

    res.json({
      message: "OTP sent successfully to your email",
      email,
      purpose,
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
    const { email, otp, purpose = "registration" } = req.body

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" })
    }

    // Verify OTP
    const verification = await OTP.verifyOTP(email, otp, purpose)

    if (!verification.success) {
      return res.status(400).json({ error: verification.message })
    }

    console.log(`✅ OTP verified for ${email} (Purpose: ${purpose})`)

    res.json({
      message: verification.message,
      verified: true,
      email,
      purpose,
    })
  } catch (error) {
    console.error("❌ Verify OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Resend OTP
router.post("/resend", async (req, res) => {
  try {
    const { email, purpose = "registration" } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Check rate limiting (optional)
    const recentOTP = await OTP.findOne({
      email,
      purpose,
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) }, // Last 1 minute
    })

    if (recentOTP) {
      return res.status(429).json({
        error: "Please wait 1 minute before requesting a new OTP",
      })
    }

    // Generate and send new OTP
    const otp = await OTP.createOTP(email, purpose)
    console.log(`🔄 Resent OTP for ${email}: ${otp} (Purpose: ${purpose})`)

    await sendOTPEmail(email, otp, purpose)

    res.json({
      message: "New OTP sent successfully",
      email,
      purpose,
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Resend OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get OTP status (for debugging - remove in production)
router.get("/status/:email", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" })
    }

    const { email } = req.params
    const { purpose = "registration" } = req.query

    const otpDoc = await OTP.findOne({
      email,
      purpose,
      isUsed: false,
    }).select("otp attempts expiresAt createdAt")

    if (!otpDoc) {
      return res.json({ message: "No active OTP found" })
    }

    const isExpired = otpDoc.expiresAt < new Date()

    res.json({
      email,
      purpose,
      otp: otpDoc.otp, // Remove this in production!
      attempts: otpDoc.attempts,
      expiresAt: otpDoc.expiresAt,
      createdAt: otpDoc.createdAt,
      isExpired,
      timeRemaining: isExpired ? 0 : Math.max(0, Math.floor((otpDoc.expiresAt - new Date()) / 1000)),
    })
  } catch (error) {
    console.error("❌ OTP status error:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
