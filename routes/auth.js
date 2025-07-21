const express = require("express")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const User = require("../models/User")
const PendingRegistration = require("../models/PendingRegistration")
const { getTenantDB } = require("../config/tenantDB")
const router = express.Router()
const OTP = require("../models/OTP")
const { sendWelcomeEmail, sendOTPEmail } = require("../config/email")

// Add request logging middleware
router.use((req, res, next) => {
  console.log(`📍 AUTH ROUTE: ${req.method} ${req.path}`)
  console.log(`🔍 Host: ${req.get("host")}`)
  console.log(`🔍 Headers:`, {
    host: req.get("host"),
    authorization: req.get("authorization") || "None",
    "content-type": req.get("content-type"),
    "user-agent": req.get("user-agent"),
  })

  // Log request body for POST requests
  if (req.method === "POST" && req.body) {
    console.log(`📦 Request Body:`, {
      ...req.body,
      password: req.body.password ? "[HIDDEN]" : undefined,
    })
  }

  next()
})

// Helper function to generate 6-digit unique store ID
const generateStoreId = async () => {
  let storeId
  let isUnique = false
  while (!isUnique) {
    storeId = Math.random().toString(36).substring(2, 8).toUpperCase()
    const existingUser = await User.findOne({ storeId: storeId })
    if (!existingUser) {
      isUnique = true
    }
  }
  return storeId
}

// Helper function to generate tenant ID
const generateTenantId = () => {
  return `tenant_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

// Validate email format
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Step 1: Initiate Registration (Send OTP)
router.post("/register/initiate", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body
    console.log(`📝 Initiate registration request for: ${email}`)

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email, and password are required",
      })
    }

    // Validate name
    if (name.trim().length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters long" })
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" })
    }

    // Validate password
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" })
    }

    // Check if user already exists in main DB
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email" })
    }

    // Check if there's a pending registration for this email
    const existingPending = await PendingRegistration.findOne({ email })
    if (existingPending) {
      // If a pending registration exists and is not expired, resend OTP
      if (existingPending.expiresAt > new Date()) {
        const otp = await OTP.createOTP(email, "registration")
        await sendOTPEmail(email, otp, "registration")
        console.log(`🔄 Resent OTP for existing pending registration: ${email}`)
        return res.json({
          message: "An active registration attempt exists. New OTP sent to your email.",
          email,
          expiresIn: "10 minutes",
        })
      } else {
        // If expired, delete and create new
        await PendingRegistration.deleteOne({ email })
        await OTP.deleteMany({ email, purpose: "registration" })
        console.log(`🗑️ Cleaned up expired pending registration for: ${email}`)
      }
    }

    // Create or update pending registration
    const pendingRegistration = new PendingRegistration({
      name,
      email,
      phone: phone || "",
      password, // Password will be hashed by pre-save middleware
    })
    await pendingRegistration.save()
    console.log(`⏳ Pending registration created for: ${email}`)

    // Generate and send OTP
    const otp = await OTP.createOTP(email, "registration")
    await sendOTPEmail(email, otp, "registration")
    console.log(`🔢 Generated and sent OTP for ${email}: ${otp}`)

    res.json({
      message: "OTP sent successfully to your email. Please verify to complete registration.",
      email,
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Initiate registration error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Step 2: Complete Registration (Verify OTP and Create User)
router.post("/register/complete", async (req, res) => {
  try {
    const { email, otp } = req.body
    console.log(`✅ Complete registration request for: ${email}`)

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" })
    }

    // Verify OTP
    const otpVerification = await OTP.verifyOTP(email, otp, "registration")
    if (!otpVerification.success) {
      return res.status(400).json({ error: otpVerification.message })
    }

    // Retrieve pending registration details
    const pendingRegistration = await PendingRegistration.findOne({ email })
    if (!pendingRegistration) {
      return res.status(400).json({
        error: "No pending registration found or it has expired. Please initiate registration again.",
      })
    }

    // Check if user already exists in main DB (double check to prevent race conditions)
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      // Clean up pending registration if user already exists
      await PendingRegistration.deleteOne({ email })
      return res.status(400).json({ error: "User already exists with this email" })
    }

    const { name, phone, password: hashedPassword } = pendingRegistration // Get hashed password

    // Generate tenant ID
    const tenantId = generateTenantId()
    console.log(`🏗️ Creating tenant: ${tenantId} for user: ${email}`)

    try {
      // Create tenant database connection
      const tenantDB = await getTenantDB(tenantId)
      console.log(`✅ Tenant DB created: ${tenantId}`)

      // Initialize all tenant models
      const TenantUser = require("../models/tenant/User")(tenantDB)
      const Product = require("../models/tenant/Product")(tenantDB)
      const Order = require("../models/tenant/Order")(tenantDB)
      const Category = require("../models/tenant/Category")(tenantDB)
      const Customer = require("../models/tenant/Customer")(tenantDB)
      const Offer = require("../models/tenant/Offer")(tenantDB)
      const Payment = require("../models/tenant/Payment")(tenantDB)
      const Settings = require("../models/tenant/Settings")(tenantDB)
      console.log(`📋 Models initialized for tenant: ${tenantId}`)

      // Create user in tenant DB with full data
      const tenantUser = new TenantUser({
        name,
        email,
        phone,
        password: hashedPassword, // Use the already hashed password
        role: "owner",
        hasStore: false,
      })
      await tenantUser.save()
      console.log(`👤 Tenant user created: ${email}`)

      // Create user in main DB for authentication lookup
      const mainUser = new User({
        email,
        password: hashedPassword, // Use the already hashed password
        tenantId,
      })
      await mainUser.save()
      console.log(`🔑 Main user created for auth: ${email}`)

      // Create default settings
      const defaultSettings = new Settings({
        general: {
          storeName: "",
          logo: "",
          banner: "",
          tagline: "Welcome to our store",
          supportEmail: email,
          supportPhone: phone,
        },
        payment: {
          codEnabled: true,
        },
        social: {
          instagram: "",
          whatsapp: phone,
          facebook: "",
        },
        shipping: {
          deliveryTime: "2-3 business days",
          charges: 50,
          freeShippingAbove: 500,
        },
      })
      await defaultSettings.save()
      console.log(`⚙️ Default settings created for tenant: ${tenantId}`)

      // Create default category
      const defaultCategory = new Category({
        name: "General",
        description: "General products category",
        isActive: true,
      })
      await defaultCategory.save()
      console.log(`🗂️ Default category created for tenant: ${tenantId}`)

      // Send welcome email
      try {
        await sendWelcomeEmail(email, name)
      } catch (emailError) {
        console.error("❌ Welcome email failed:", emailError)
        // Don't fail registration if email fails
      }

      // Delete the pending registration record
      await PendingRegistration.deleteOne({ email })
      console.log(`🗑️ Pending registration deleted for: ${email}`)

      // Generate JWT with tenant info
      const token = jwt.sign(
        {
          userId: tenantUser._id,
          tenantId: tenantId,
          email: email,
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "7d" },
      )

      res.status(201).json({
        message: "User registered successfully",
        token,
        tenantId,
        status: "no_store",
      })
    } catch (dbError) {
      console.error(`❌ Tenant setup error for ${tenantId}:`, dbError)
      throw new Error(`Failed to setup tenant: ${dbError.message}`)
    }
  } catch (error) {
    console.error("❌ Complete registration error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Login Route
router.post("/login", async (req, res) => {
  try {
    console.log("🔐 Login attempt started")

    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      console.log("❌ Missing email or password")
      return res.status(400).json({ error: "Email and password are required" })
    }

    console.log(`🔍 Looking for user: ${email}`)

    // Find user in main DB for auth
    const mainUser = await User.findOne({ email: email.toLowerCase().trim() })
    if (!mainUser) {
      console.log(`❌ User not found in main DB: ${email}`)
      return res.status(400).json({ error: "Invalid credentials" })
    }

    console.log(`✅ Found main user: ${email}, tenantId: ${mainUser.tenantId}`)

    // Use direct bcrypt comparison for reliability
    try {
      console.log(`🔍 Comparing password for user: ${email}`)

      const isMatch = await bcrypt.compare(password, mainUser.password)
      console.log(`🔑 Password comparison result: ${isMatch}`)

      if (!isMatch) {
        console.log(`❌ Password mismatch for user: ${email}`)
        return res.status(400).json({ error: "Invalid credentials" })
      }
    } catch (passwordError) {
      console.error(`❌ Password comparison error:`, passwordError)
      return res.status(500).json({ error: "Authentication error" })
    }

    console.log(`✅ Password verified for user: ${email}`)

    // Get tenant DB and user data
    try {
      const tenantDB = await getTenantDB(mainUser.tenantId)
      console.log(`✅ Connected to tenant DB: ${mainUser.tenantId}`)

      const TenantUser = require("../models/tenant/User")(tenantDB)
      const tenantUser = await TenantUser.findOne({ email: email.toLowerCase().trim() })

      if (!tenantUser) {
        console.log(`❌ Tenant user not found: ${email}`)
        return res.status(400).json({ error: "User data not found" })
      }

      console.log(`✅ Found tenant user: ${email}`)

      // Generate JWT
      const token = jwt.sign(
        {
          userId: tenantUser._id,
          tenantId: mainUser.tenantId,
          email: email,
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "7d" },
      )

      console.log(`✅ JWT generated for user: ${email}`)

      // Prepare response
      const response = {
        token,
        tenantId: mainUser.tenantId,
        storeId: mainUser.storeId || null,
        hasStore: tenantUser.hasStore || false,
        user: {
          name: tenantUser.name,
          email: tenantUser.email,
          phone: tenantUser.phone || "",
          role: tenantUser.role,
        },
      }

      console.log(`✅ Login successful for: ${email}`)

      res.json(response)
    } catch (tenantError) {
      console.error(`❌ Tenant DB error for ${mainUser.tenantId}:`, tenantError)
      return res.status(500).json({ error: "Failed to access user data" })
    }
  } catch (error) {
    console.error("❌ Login error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Login with OTP (optional secure login)
router.post("/login-otp", async (req, res) => {
  try {
    const { email, otp } = req.body

    // Verify OTP
    const otpVerification = await OTP.verifyOTP(email, otp, "login")
    if (!otpVerification.success) {
      return res.status(400).json({ error: otpVerification.message })
    }

    // Find user in main DB
    const mainUser = await User.findOne({ email })
    if (!mainUser) {
      return res.status(400).json({ error: "User not found" })
    }

    // Get tenant DB and user data
    const tenantDB = await getTenantDB(mainUser.tenantId)
    const TenantUser = require("../models/tenant/User")(tenantDB)
    const tenantUser = await TenantUser.findOne({ email })

    if (!tenantUser) {
      return res.status(400).json({ error: "User data not found" })
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: tenantUser._id,
        tenantId: mainUser.tenantId,
        email: email,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    )

    res.json({
      token,
      tenantId: mainUser.tenantId,
      storeId: mainUser.storeId || null,
      hasStore: tenantUser.hasStore,
      user: {
        name: tenantUser.name,
        email: tenantUser.email,
        phone: tenantUser.phone,
        role: tenantUser.role,
      },
    })
  } catch (error) {
    console.error("❌ OTP Login error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Setup Store
router.post("/setup-store", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return res.status(401).json({ error: "Access denied" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")

    // Get main user for tenant lookup
    const mainUser = await User.findOne({ email: decoded.email })
    if (!mainUser) {
      return res.status(404).json({ error: "User not found" })
    }

    // Get tenant user
    const tenantDB = await getTenantDB(mainUser.tenantId)
    const TenantUser = require("../models/tenant/User")(tenantDB)
    const tenantUser = await TenantUser.findById(decoded.userId)

    if (!tenantUser) {
      return res.status(404).json({ error: "Tenant user not found" })
    }

    if (tenantUser.hasStore) {
      return res.status(400).json({ error: "Store already exists for this user" })
    }

    const { storeName, logo, banner, industry } = req.body

    // Generate unique 6-digit store ID
    const storeId = await generateStoreId()
    console.log(`🏪 Setting up store with ID: ${storeId} for tenant: ${mainUser.tenantId}`)

    // Update tenant user with store info
    tenantUser.hasStore = true
    tenantUser.storeInfo = {
      name: storeName,
      logo: logo || "",
      banner: banner || "",
      storeId: storeId,
      industry: industry || "General",
      isActive: true,
    }
    await tenantUser.save()

    // Update main user with store ID
    mainUser.storeId = storeId
    await mainUser.save()

    // Update settings with store info
    const Settings = require("../models/tenant/Settings")(tenantDB)
    const settings = await Settings.findOne()
    if (settings) {
      settings.general.storeName = storeName
      settings.general.logo = logo || ""
      settings.general.banner = banner || ""
      await settings.save()
    }

    console.log(`✅ Store setup completed for: ${storeName} (${storeId})`)

    // Dynamically construct the base URL from the request
    const baseUrl = `${req.protocol}://${req.get("host")}`

    res.json({
      message: "Store setup completed successfully",
      tenantId: mainUser.tenantId,
      storeId,
      storeUrl: `${baseUrl}/api/${storeId.toLowerCase()}`,
      adminUrl: `${baseUrl}/api/admin`,
    })
  } catch (error) {
    console.error("❌ Store setup error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get user status - MOVED TO CORRECT LOCATION
router.get("/user/status", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." })
    }

    console.log("🔍 Getting user status...")

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
    console.log("✅ Token decoded:", { email: decoded.email, tenantId: decoded.tenantId })

    // Get main user for tenant lookup
    const mainUser = await User.findOne({ email: decoded.email })
    if (!mainUser) {
      console.log("❌ Main user not found")
      return res.status(404).json({ error: "User not found" })
    }

    console.log("✅ Main user found:", { tenantId: mainUser.tenantId, storeId: mainUser.storeId })

    // Get tenant user data
    const tenantDB = await getTenantDB(mainUser.tenantId)
    const TenantUser = require("../models/tenant/User")(tenantDB)
    const tenantUser = await TenantUser.findById(decoded.userId).select("-password")

    if (!tenantUser) {
      console.log("❌ Tenant user not found")
      return res.status(404).json({ error: "Tenant user not found" })
    }

    console.log("✅ Tenant user found:", { hasStore: tenantUser.hasStore })

    res.json({
      user: {
        id: tenantUser._id,
        name: tenantUser.name,
        email: tenantUser.email,
        phone: tenantUser.phone,
        role: tenantUser.role,
        hasStore: tenantUser.hasStore,
        storeInfo: tenantUser.storeInfo || null,
      },
      hasStore: tenantUser.hasStore,
      tenantId: mainUser.tenantId,
      storeId: mainUser.storeId || null,
    })
  } catch (error) {
    console.error("❌ User status error:", error)
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" })
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" })
    }
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
