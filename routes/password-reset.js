const express = require("express")
const bcrypt = require("bcryptjs")
const User = require("../models/User")
const OTP = require("../models/OTP")
const { getTenantDB } = require("../config/tenantDB")
const { sendOTPEmail } = require("../config/email")
const router = express.Router()

// Send OTP for password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body

    console.log(`🔐 Password reset request for: ${email}`)

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" })
    }

    // Check if user exists in main DB
    const existingUser = await User.findOne({ email })
    if (!existingUser) {
      return res.status(404).json({ error: "No account found with this email address" })
    }

    // Generate and save OTP
    const otp = await OTP.createOTP(email, "password_reset")
    console.log(`🔐 Generated password reset OTP for ${email}: ${otp}`)

    // Send OTP via email
    await sendOTPEmail(email, otp, "password reset")

    res.json({
      message: "Password reset code sent to your email",
      email,
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Forgot password error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Verify OTP for password reset (without consuming the OTP)
router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { email, otp } = req.body

    console.log(`🔍 Verifying reset OTP for: ${email}, OTP: ${otp}`)

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" })
    }

    // Find OTP without consuming it
    const otpDoc = await OTP.findOne({
      email,
      purpose: "password_reset",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    })

    if (!otpDoc) {
      console.log(`❌ No valid OTP found for ${email}`)
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    // Check attempts
    if (otpDoc.attempts >= 3) {
      await otpDoc.deleteOne()
      return res.status(400).json({ error: "Too many failed attempts. Please request a new OTP." })
    }

    // Check OTP match
    if (otpDoc.otp !== otp) {
      console.log(`❌ OTP mismatch for ${email}. Expected: ${otpDoc.otp}, Received: ${otp}`)
      otpDoc.attempts += 1
      await otpDoc.save()
      return res.status(400).json({
        error: `Invalid OTP. ${3 - otpDoc.attempts} attempts remaining.`,
      })
    }

    // Check if user still exists
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    console.log(`✅ Password reset OTP verified for ${email} (OTP not consumed)`)

    // DON'T delete the OTP here - we need it for the password reset step
    res.json({
      message: "OTP verified successfully. You can now reset your password.",
      verified: true,
      email,
    })
  } catch (error) {
    console.error("❌ Verify reset OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Reset password with OTP verification
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body

    console.log(`🔐 Password reset attempt for: ${email}`)
    console.log(`📝 Request body:`, {
      email,
      otp: otp ? "***" : "missing",
      newPassword: newPassword ? "***" : "missing",
    })

    if (!email || !otp || !newPassword) {
      console.log(`❌ Missing required fields: email=${!!email}, otp=${!!otp}, newPassword=${!!newPassword}`)
      return res.status(400).json({ error: "Email, OTP, and new password are required" })
    }

    if (newPassword.length < 6) {
      console.log(`❌ Password too short: ${newPassword.length} characters`)
      return res.status(400).json({ error: "Password must be at least 6 characters long" })
    }

    // Find and verify OTP
    const otpDoc = await OTP.findOne({
      email,
      purpose: "password_reset",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    })

    if (!otpDoc) {
      console.log(`❌ No valid OTP found for ${email}`)
      return res.status(400).json({ error: "Invalid or expired OTP. Please request a new password reset code." })
    }

    // Check attempts
    if (otpDoc.attempts >= 3) {
      await otpDoc.deleteOne()
      return res.status(400).json({ error: "Too many failed attempts. Please request a new OTP." })
    }

    // Verify OTP matches
    if (otpDoc.otp !== otp) {
      console.log(`❌ OTP mismatch for ${email}. Expected: ${otpDoc.otp}, Received: ${otp}`)
      otpDoc.attempts += 1
      await otpDoc.save()

      if (otpDoc.attempts >= 3) {
        await otpDoc.deleteOne()
        return res.status(400).json({ error: "Too many failed attempts. Please request a new OTP." })
      }

      return res.status(400).json({
        error: `Invalid OTP. ${3 - otpDoc.attempts} attempts remaining.`,
      })
    }

    // Find user in main DB
    const mainUser = await User.findOne({ email })
    if (!mainUser) {
      console.log(`❌ User not found in main DB: ${email}`)
      return res.status(404).json({ error: "User not found" })
    }

    console.log(`👤 Found user in main DB: ${email}, tenantId: ${mainUser.tenantId}`)

    // Update password in main DB
    mainUser.password = newPassword // This will be hashed by the pre-save middleware
    await mainUser.save()
    console.log(`✅ Password updated in main DB for ${email}`)

    // Update password in tenant DB as well
    try {
      const tenantDB = await getTenantDB(mainUser.tenantId)
      const TenantUser = require("../models/tenant/User")(tenantDB)
      const tenantUser = await TenantUser.findOne({ email })

      if (tenantUser) {
        tenantUser.password = newPassword // This will be hashed by the pre-save middleware
        await tenantUser.save()
        console.log(`✅ Password updated in tenant DB for ${email}`)
      } else {
        console.log(`⚠️ Tenant user not found for ${email}`)
      }
    } catch (tenantError) {
      console.error("❌ Error updating tenant password:", tenantError)
      // Don't fail the request if tenant update fails
    }

    // NOW delete the OTP after successful password reset
    await otpDoc.deleteOne()
    console.log(`🗑️ OTP deleted for ${email}`)

    console.log(`✅ Password reset completed for ${email}`)

    res.json({
      message: "Password reset successfully. You can now login with your new password.",
      success: true,
    })
  } catch (error) {
    console.error("❌ Reset password error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Resend password reset OTP
router.post("/resend-reset-otp", async (req, res) => {
  try {
    const { email } = req.body

    console.log(`🔄 Resend reset OTP request for: ${email}`)

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Check rate limiting
    const recentOTP = await OTP.findOne({
      email,
      purpose: "password_reset",
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) }, // Last 1 minute
    })

    if (recentOTP) {
      return res.status(429).json({
        error: "Please wait 1 minute before requesting a new OTP",
      })
    }

    // Check if user exists
    const existingUser = await User.findOne({ email })
    if (!existingUser) {
      return res.status(404).json({ error: "No account found with this email address" })
    }

    // Generate and send new OTP
    const otp = await OTP.createOTP(email, "password_reset")
    console.log(`🔄 Resent password reset OTP for ${email}: ${otp}`)

    await sendOTPEmail(email, otp, "password reset")

    res.json({
      message: "New password reset code sent successfully",
      email,
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Resend reset OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
