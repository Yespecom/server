const express = require("express")
const router = express.Router()
const OTP = require("../models/OTP")
const { sendSMS } = require("../config/sms")
const { sendEmail } = require("../config/email")
const { generateOTP } = require("../lib/utils") // Assuming you have a utility to generate OTP

// Route to send OTP for email or phone
router.post("/send", async (req, res) => {
  const { email, phone } = req.body

  if (!email && !phone) {
    return res.status(400).json({ error: "Email or phone number is required." })
  }

  const otp = generateOTP() // Generate a 6-digit OTP

  try {
    // Delete any existing OTPs for this email/phone to ensure only one is active
    if (email) {
      await OTP.deleteMany({ email })
    }
    // If using phone, you might need a separate field or logic for phone OTPs
    // For simplicity, this example focuses on email OTPs stored by email.

    const newOTP = new OTP({ email: email ? email.toLowerCase() : undefined, otp })
    await newOTP.save()

    let sendResult

    if (email) {
      const appName = process.env.APP_NAME || "Your App"
      sendResult = await sendEmail({
        to: email,
        subject: `${otp} is your ${appName} verification code`,
        html: `<p>Your verification code for ${appName} is: <strong>${otp}</strong>. It is valid for 5 minutes.</p>`,
      })
      if (!sendResult.success) {
        console.error("❌ Failed to send OTP email:", sendResult.error)
        return res.status(500).json({ error: "Failed to send OTP email." })
      }
      console.log(`✅ OTP email sent to ${email}`)
    } else if (phone) {
      // Implement SMS sending logic here
      sendResult = await sendSMS(phone, `Your verification code is: ${otp}. It is valid for 5 minutes.`)
      if (!sendResult.success) {
        console.error("❌ Failed to send OTP SMS:", sendResult.message)
        return res.status(500).json({ error: "Failed to send OTP SMS." })
      }
      console.log(`✅ OTP SMS sent to ${phone}`)
    }

    res.status(200).json({ message: "OTP sent successfully." })
  } catch (error) {
    console.error("❌ Error sending OTP:", error)
    res.status(500).json({ error: "Internal server error while sending OTP." })
  }
})

// Route to verify OTP
router.post("/verify", async (req, res) => {
  const { email, phone, otp } = req.body

  if (!otp || (!email && !phone)) {
    return res.status(400).json({ error: "OTP and email/phone are required." })
  }

  try {
    let foundOTP
    if (email) {
      foundOTP = await OTP.findOne({ email: email.toLowerCase(), otp })
    } else if (phone) {
      // If you store phone OTPs, adjust query here
      // For this example, assuming email is the primary identifier for OTPs
      return res.status(400).json({ error: "Phone OTP verification not fully implemented." })
    }

    if (!foundOTP) {
      return res.status(400).json({ error: "Invalid or expired OTP." })
    }

    // OTP is valid, delete it to prevent reuse
    await OTP.deleteOne({ _id: foundOTP._id })

    res.status(200).json({ message: "OTP verified successfully." })
  } catch (error) {
    console.error("❌ Error verifying OTP:", error)
    res.status(500).json({ error: "Internal server error while verifying OTP." })
  }
})

module.exports = router
