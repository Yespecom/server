const express = require("express")
const router = express.Router()
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { sendEmail } = require("../config/email")
const { generateOTP } = require("../lib/utils") // Assuming you have a utility to generate OTP
const { getMainDb } = require("../db/connection")
const User = require("../models/User")(getMainDb()) // Main User model
const OTP = require("../models/OTP") // Re-using OTP model for password reset

// Request password reset (send OTP)
router.post("/request", async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: "Email is required." })
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      // For security, always return a generic message even if user not found
      return res
        .status(200)
        .json({ message: "If an account with that email exists, a password reset OTP has been sent." })
    }

    const otp = generateOTP() // Generate a 6-digit OTP

    // Delete any existing OTPs for this email to ensure only one is active
    await OTP.deleteMany({ email: email.toLowerCase() })

    const newOTP = new OTP({ email: email.toLowerCase(), otp })
    await newOTP.save()

    const appName = process.env.APP_NAME || "Your App"
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?email=${encodeURIComponent(email)}&otp=${otp}` // Example frontend link

    const sendResult = await sendEmail({
      to: email,
      subject: `${otp} is your ${appName} password reset code`,
      html: `<p>Your password reset code for ${appName} is: <strong>${otp}</strong>. It is valid for 5 minutes.</p>
             <p>Alternatively, you can click this link to reset your password: <a href="${resetLink}">${resetLink}</a></p>
             <p>If you did not request a password reset, please ignore this email.</p>`,
    })

    if (!sendResult.success) {
      console.error("❌ Failed to send password reset email:", sendResult.error)
      return res.status(500).json({ error: "Failed to send password reset email." })
    }

    console.log(`✅ Password reset OTP sent to ${email}`)
    res.status(200).json({ message: "If an account with that email exists, a password reset OTP has been sent." })
  } catch (error) {
    console.error("❌ Error requesting password reset:", error)
    res.status(500).json({ error: "Internal server error while requesting password reset." })
  }
})

// Verify OTP and reset password
router.post("/reset", async (req, res) => {
  const { email, otp, newPassword } = req.body

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: "Email, OTP, and new password are required." })
  }

  try {
    const foundOTP = await OTP.findOne({ email: email.toLowerCase(), otp })

    if (!foundOTP) {
      return res.status(400).json({ error: "Invalid or expired OTP." })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(404).json({ error: "User not found." })
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10)
    user.password = await bcrypt.hash(newPassword, salt)
    await user.save()

    // Delete the OTP after successful reset
    await OTP.deleteOne({ _id: foundOTP._id })

    console.log(`✅ Password successfully reset for ${email}`)
    res.status(200).json({ message: "Password reset successfully." })
  } catch (error) {
    console.error("❌ Error resetting password:", error)
    res.status(500).json({ error: "Internal server error while resetting password." })
  }
})

module.exports = router
