const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { getMainDb } = require("../db/connection")
const PendingRegistration = require("../models/PendingRegistration")
const OTP = require("../models/OTP")
const User = require("../models/User") // Import the User model function
const { sendOTPEmail } = require("../config/email")

const router = express.Router()

// Helper to generate a unique tenant ID
const generateTenantId = () => {
  return `tenant_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

// Initiate registration (send OTP)
router.post("/register/initiate", async (req, res) => {
  try {
    const { email } = req.body

    console.log(`📝 Register initiate request for: ${email}`)

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" })
    }

    const mainConnection = getMainDb()
    const UserModel = User(mainConnection) // Get User model for main connection

    // Check if user already exists in main DB
    const existingUser = await UserModel.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: "User with this email already exists" })
    }

    // Check for existing pending registration
    let pendingReg = await PendingRegistration.findOne({ email })
    if (pendingReg && pendingReg.createdAt > new Date(Date.now() - 5 * 60 * 1000)) {
      // If a pending registration exists and is less than 5 minutes old,
      // just resend OTP without creating a new one.
      console.log(`⚠️ Existing pending registration found for ${email}, resending OTP.`)
    } else {
      // Create or update pending registration
      pendingReg = await PendingRegistration.findOneAndUpdate(
        { email },
        { email, status: "pending", expiresAt: new Date(Date.now() + 10 * 60 * 1000) }, // Expires in 10 mins
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      console.log(`✅ Pending registration created/updated for ${email}`)
    }

    // Generate and save OTP
    const otp = await OTP.createOTP(email, "registration")
    console.log(`🔢 Generated registration OTP for ${email}: ${otp}`)

    // Send OTP via email
    await sendOTPEmail(email, otp, "registration")

    res.json({
      message: "Registration code sent to your email",
      email,
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Register initiate error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Verify registration OTP
router.post("/register/verify", async (req, res) => {
  try {
    const { email, otp } = req.body

    console.log(`🔍 Register verify request for: ${email}, OTP: ${otp}`)

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" })
    }

    // Verify OTP
    const otpDoc = await OTP.verifyOTP(email, otp, "registration")
    if (!otpDoc) {
      console.log(`❌ Invalid or expired OTP for ${email}`)
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    // Update pending registration status
    const pendingReg = await PendingRegistration.findOneAndUpdate(
      { email },
      { status: "verified", verifiedAt: new Date() },
      { new: true },
    )

    if (!pendingReg) {
      console.log(`❌ No pending registration found for ${email} after OTP verification.`)
      return res.status(404).json({ error: "No pending registration found" })
    }

    console.log(`✅ Registration OTP verified for ${email}. Status: ${pendingReg.status}`)

    res.json({
      message: "Email verified successfully. You can now complete your registration.",
      email,
      verified: true,
    })
  } catch (error) {
    console.error("❌ Register verify error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Complete registration (set password and create user)
router.post("/register/complete", async (req, res) => {
  try {
    const { email, password } = req.body

    console.log(`📝 Register complete request for: ${email}`)

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" })
    }

    // Check pending registration status
    const pendingReg = await PendingRegistration.findOne({ email, status: "verified" })

    if (!pendingReg) {
      console.log(`❌ Registration not verified or already completed for ${email}`)
      return res.status(400).json({
        error: "Registration not verified or already completed. Please initiate registration again.",
      })
    }

    const mainConnection = getMainDb()
    const UserModel = User(mainConnection) // Get User model for main connection

    // Check if user already exists (double-check to prevent race conditions)
    const existingUser = await UserModel.findOne({ email })
    if (existingUser) {
      console.log(`⚠️ User already exists during complete registration for ${email}`)
      await PendingRegistration.deleteOne({ email }) // Clean up pending registration
      return res.status(409).json({ error: "User with this email already exists" })
    }

    // Generate a unique tenantId
    const tenantId = generateTenantId()
    console.log(`Generated tenantId for ${email}: ${tenantId}`)

    // Create user in main DB
    const newUser = new UserModel({
      email,
      password, // Password will be hashed by pre-save middleware in User model
      tenantId,
      role: "admin", // Default role for the main user of a tenant
    })
    await newUser.save()
    console.log(`✅ Main user created for ${email} with tenantId: ${tenantId}`)

    // Clean up pending registration
    await PendingRegistration.deleteOne({ email })
    console.log(`🗑️ Pending registration deleted for ${email}`)

    // Generate JWT token for immediate login
    const token = jwt.sign(
      { email: newUser.email, tenantId: newUser.tenantId, userId: newUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    )

    res.status(201).json({
      message: "Registration successful. Welcome!",
      token,
      user: {
        email: newUser.email,
        tenantId: newUser.tenantId,
        role: newUser.role,
      },
    })
  } catch (error) {
    console.error("❌ Register complete error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Login handler
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    console.log(`🔐 Login attempt for: ${email}`)
    console.log(`📦 Request Body:`, {
      email,
      password: password ? "[HIDDEN]" : "undefined",
    }) // Hide password in logs

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    const mainConnection = getMainDb()
    const UserModel = User(mainConnection) // Get User model for main connection

    const mainUser = await UserModel.findOne({ email: email.toLowerCase().trim() })

    if (!mainUser) {
      console.log(`❌ User not found in main DB: ${email}`)
      return res.status(401).json({ error: "Invalid credentials" })
    }

    console.log(`✅ Found main user: ${mainUser.email}, tenantId: ${mainUser.tenantId}`)

    const isMatch = await bcrypt.compare(password, mainUser.password)
    console.log(`🔑 Password comparison result: ${isMatch}`)

    if (!isMatch) {
      console.log(`❌ Password mismatch for user: ${mainUser.email}`)
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Check if user is active
    if (!mainUser.isActive) {
      console.log(`❌ User ${mainUser.email} is inactive.`)
      return res.status(403).json({ error: "Account is inactive. Please contact support." })
    }

    // JWT creation
    const token = jwt.sign(
      { email: mainUser.email, tenantId: mainUser.tenantId, userId: mainUser._id, role: mainUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    )

    console.log(`✅ Login successful for ${mainUser.email}. JWT issued.`)

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        email: mainUser.email,
        tenantId: mainUser.tenantId,
        role: mainUser.role,
      },
    })
  } catch (err) {
    console.error("❌ Login error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Resend registration OTP
router.post("/resend-registration-otp", async (req, res) => {
  try {
    const { email } = req.body

    console.log(`🔄 Resend registration OTP request for: ${email}`)

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Check rate limiting for OTP resend
    const recentOTP = await OTP.findOne({
      email,
      purpose: "registration",
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) }, // Last 1 minute
    })

    if (recentOTP) {
      return res.status(429).json({
        error: "Please wait 1 minute before requesting a new OTP",
      })
    }

    const mainConnection = getMainDb()
    const UserModel = User(mainConnection)

    // Ensure user does not already exist
    const existingUser = await UserModel.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: "User with this email already exists" })
    }

    // Ensure there's a pending registration
    const pendingReg = await PendingRegistration.findOne({ email })
    if (!pendingReg) {
      return res.status(404).json({ error: "No pending registration found for this email." })
    }

    // Generate and send new OTP
    const otp = await OTP.createOTP(email, "registration")
    console.log(`🔄 Resent registration OTP for ${email}: ${otp}`)

    await sendOTPEmail(email, otp, "registration")

    res.json({
      message: "New registration code sent successfully",
      email,
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Resend registration OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
