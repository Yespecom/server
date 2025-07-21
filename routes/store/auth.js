const express = require("express")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const rateLimit = require("express-rate-limit")
const { sendOTPEmail } = require("../../config/email")
const OTP = require("../../models/OTP") // Main OTP model
const CustomerOTP = require("../../models/CustomerOTP") // Deprecated CustomerOTP model
const { getTenantDB } = require("../../config/tenantDB")
const TenantUser = require("../../models/tenant/User") // Tenant User model for customers

const router = express.Router({ mergeParams: true })

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Apply rate limiting to sensitive endpoints
router.use(["/login", "/register", "/forgot-password"], authLimiter)

// Enhanced logging middleware
router.use((req, res, next) => {
  console.log(`🔐 Store Auth: ${req.method} ${req.path}`)
  console.log(`🔐 Store ID: ${req.storeId}`)
  console.log(`🔐 Tenant ID: ${req.tenantId}`)
  console.log(`🔐 User Agent: ${req.get("user-agent")}`)
  console.log(`🔐 IP: ${req.ip}`)
  next()
})

// Validate email format
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate phone format (international)
const validatePhone = (phone) => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/
  return phoneRegex.test(phone.replace(/\s+/g, ""))
}

// Generate secure JWT token
const generateToken = (payload, expiresIn = "30d") => {
  const jwtSecret = process.env.JWT_SECRET || "your-secret-key"
  if (jwtSecret === "your-secret-key") {
    console.warn("⚠️ Using default JWT secret - please set JWT_SECRET environment variable")
  }

  return jwt.sign(payload, jwtSecret, { expiresIn })
}

// Verify JWT token
const verifyToken = (token) => {
  const jwtSecret = process.env.JWT_SECRET || "your-secret-key"
  return jwt.verify(token, jwtSecret)
}

// Enhanced debug endpoint with password testing
router.get("/debug", async (req, res) => {
  try {
    const debugInfo = {
      storeId: req.storeId,
      tenantId: req.tenantId,
      hasTenantDB: !!req.tenantDB,
      dbState: req.tenantDB?.readyState,
      dbName: req.tenantDB?.name,
      storeInfo: req.storeInfo,
      host: req.get("host"),
      userAgent: req.get("user-agent"),
      ip: req.ip,
      timestamp: new Date().toISOString(),
      jwtSecret: !!process.env.JWT_SECRET,
      nodeEnv: process.env.NODE_ENV,
    }

    // Add customer debug info if models are available
    if (req.models) {
      const { Customer } = req.models

      try {
        const customerCount = await Customer.countDocuments()
        const customers = await Customer.find({}).select("name email phone isActive createdAt").limit(5)

        debugInfo.customerInfo = {
          totalCustomers: customerCount,
          sampleCustomers: customers,
        }

        // Test specific customer if jane@example.com exists
        const janeCustomer = await Customer.findOne({ email: "jane@example.com" })
        if (janeCustomer) {
          debugInfo.janeCustomer = {
            id: janeCustomer._id,
            name: janeCustomer.name,
            email: janeCustomer.email,
            phone: janeCustomer.phone,
            hasPassword: !!janeCustomer.password,
            passwordLength: janeCustomer.password ? janeCustomer.password.length : 0,
            isActive: janeCustomer.isActive,
            createdAt: janeCustomer.createdAt,
          }

          // Test password comparison
          if (janeCustomer.password) {
            const testPasswords = ["password123", "Password123", "password", "123456"]
            debugInfo.passwordTests = {}

            for (const testPassword of testPasswords) {
              try {
                const isMatch = await bcrypt.compare(testPassword, janeCustomer.password)
                debugInfo.passwordTests[testPassword] = isMatch
              } catch (error) {
                debugInfo.passwordTests[testPassword] = `Error: ${error.message}`
              }
            }
          }
        }
      } catch (dbError) {
        debugInfo.customerError = dbError.message
      }
    }

    console.log("🔍 Store auth debug info compiled successfully")
    res.json(debugInfo)
  } catch (error) {
    console.error("❌ Debug endpoint error:", error)
    res.status(500).json({
      error: "Debug endpoint failed",
      details: error.message,
    })
  }
})

// Debug endpoint to fix customer password
router.post("/debug/fix-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and new password are required" })
    }

    if (!req.models) {
      return res.status(500).json({ error: "Database models not initialized" })
    }

    const { Customer } = req.models
    const customer = await Customer.findOne({ email: email.toLowerCase() })

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    console.log(`🔧 Fixing password for ${email}`)
    console.log(`🔧 Old password hash: ${customer.password}`)
    console.log(`🔧 New password hash: ${hashedPassword}`)

    // Update the password
    customer.password = hashedPassword
    await customer.save()

    // Test the new password
    const testResult = await bcrypt.compare(newPassword, hashedPassword)

    res.json({
      message: "Password updated successfully",
      customer: {
        id: customer._id,
        email: customer.email,
        name: customer.name,
      },
      passwordTest: testResult,
      newPasswordHash: hashedPassword,
    })
  } catch (error) {
    console.error("❌ Fix password error:", error)
    res.status(500).json({
      error: "Failed to fix password",
      details: error.message,
    })
  }
})

// Customer registration for a specific tenant store
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, phone } = req.body
    const tenantId = req.tenantId // From storeContextMiddleware

    console.log(`📝 Customer register request for: ${email} on tenant: ${tenantId}`)

    if (!email || !password || !tenantId) {
      return res.status(400).json({ error: "Email, password, and tenant ID are required" })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" })
    }

    const tenantDbConnection = await getTenantDB(tenantId)
    const CustomerModel = TenantUser(tenantDbConnection) // Use TenantUser model for customers

    // Check if customer already exists in this tenant's DB
    const existingCustomer = await CustomerModel.findOne({ email, tenantId })
    if (existingCustomer) {
      return res.status(409).json({ error: "Customer with this email already exists for this store" })
    }

    // Create new customer
    const newCustomer = new CustomerModel({
      tenantId,
      email,
      password, // Will be hashed by pre-save middleware
      name,
      phone,
      role: "customer", // Explicitly set role
    })
    await newCustomer.save()
    console.log(`✅ New customer registered: ${email} for tenant: ${tenantId}`)

    // Optionally send a welcome email
    // await sendWelcomeEmail(email, name);

    // Generate JWT token for immediate login
    const token = jwt.sign(
      { email: newCustomer.email, customerId: newCustomer._id, tenantId: newCustomer.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    )

    res.status(201).json({
      message: "Customer registration successful. Welcome!",
      token,
      customer: {
        id: newCustomer._id,
        email: newCustomer.email,
        name: newCustomer.name,
        tenantId: newCustomer.tenantId,
      },
    })
  } catch (error) {
    console.error("❌ Customer registration error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Customer login for a specific tenant store
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body
    const tenantId = req.tenantId // From storeContextMiddleware

    console.log(`🔐 Customer login attempt for: ${email} on tenant: ${tenantId}`)

    if (!email || !password || !tenantId) {
      return res.status(400).json({ error: "Email, password, and tenant ID are required" })
    }

    const tenantDbConnection = await getTenantDB(tenantId)
    const CustomerModel = TenantUser(tenantDbConnection) // Use TenantUser model for customers

    const customer = await CustomerModel.findOne({ email, tenantId })

    if (!customer) {
      console.log(`❌ Customer not found: ${email} for tenant: ${tenantId}`)
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const isMatch = await bcrypt.compare(password, customer.password)
    if (!isMatch) {
      console.log(`❌ Password mismatch for customer: ${email} on tenant: ${tenantId}`)
      return res.status(401).json({ error: "Invalid credentials" })
    }

    if (!customer.isActive) {
      console.log(`❌ Customer ${email} is inactive for tenant: ${tenantId}`)
      return res.status(403).json({ error: "Account is inactive. Please contact store support." })
    }

    // Generate JWT token
    const token = jwt.sign(
      { email: customer.email, customerId: customer._id, tenantId: customer.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    )

    console.log(`✅ Customer login successful for ${email} on tenant: ${tenantId}. JWT issued.`)

    return res.status(200).json({
      message: "Login successful",
      token,
      customer: {
        id: customer._id,
        email: customer.email,
        name: customer.name,
        tenantId: customer.tenantId,
      },
    })
  } catch (err) {
    console.error("❌ Customer login error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Request OTP for customer login (if using OTP-based login)
router.post("/request-otp", async (req, res) => {
  try {
    const { email } = req.body
    const tenantId = req.tenantId

    console.log(`🔢 Customer OTP request for: ${email} on tenant: ${tenantId}`)

    if (!email || !tenantId) {
      return res.status(400).json({ error: "Email and tenant ID are required" })
    }

    const tenantDbConnection = await getTenantDB(tenantId)
    const CustomerModel = TenantUser(tenantDbConnection)

    const customer = await CustomerModel.findOne({ email, tenantId })
    if (!customer) {
      return res.status(404).json({ error: "No customer found with this email for this store" })
    }

    // Use the main OTP model for customer login purpose
    const otp = await OTP.createOTP(email, "customer_login")
    await sendOTPEmail(email, otp, "customer login")

    res.json({
      message: "Login OTP sent to your email",
      email,
      expiresIn: "10 minutes",
    })
  } catch (error) {
    console.error("❌ Customer request OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Verify OTP for customer login
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body
    const tenantId = req.tenantId

    console.log(`🔍 Customer verify OTP for: ${email} on tenant: ${tenantId}, OTP: ${otp}`)

    if (!email || !otp || !tenantId) {
      return res.status(400).json({ error: "Email, OTP, and tenant ID are required" })
    }

    const otpDoc = await OTP.verifyOTP(email, otp, "customer_login")
    if (!otpDoc) {
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    const tenantDbConnection = await getTenantDB(tenantId)
    const CustomerModel = TenantUser(tenantDbConnection)

    const customer = await CustomerModel.findOne({ email, tenantId })
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    if (!customer.isActive) {
      return res.status(403).json({ error: "Account is inactive. Please contact store support." })
    }

    // Generate JWT token
    const token = jwt.sign(
      { email: customer.email, customerId: customer._id, tenantId: customer.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    )

    res.status(200).json({
      message: "OTP verified and login successful",
      token,
      customer: {
        id: customer._id,
        email: customer.email,
        name: customer.name,
        tenantId: customer.tenantId,
      },
    })
  } catch (error) {
    console.error("❌ Customer verify OTP error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Phone-based login (for backward compatibility)
router.post("/login-phone", async (req, res) => {
  try {
    const { phone, otp } = req.body

    console.log(`📱 Phone login for store: ${req.storeId}, phone: ${phone}`)

    if (!phone || !otp) {
      return res.status(400).json({
        error: "Phone number and OTP are required",
        code: "MISSING_CREDENTIALS",
      })
    }

    // This would integrate with your OTP verification system
    // For now, we'll return a migration message
    return res.status(400).json({
      error: "Phone-based login is deprecated. Please migrate your account to use email and password.",
      code: "DEPRECATED_LOGIN_METHOD",
      canMigrate: true,
      migrationEndpoint: `/api/${req.storeId}/auth/migrate-account`,
    })
  } catch (error) {
    console.error("❌ Phone login error:", error)
    res.status(500).json({
      error: "Failed to login with phone",
      details: error.message,
    })
  }
})

// Enhanced account migration
router.post("/migrate-account", async (req, res) => {
  try {
    const { email, phone, password, name } = req.body

    console.log(`🔄 Account migration for store: ${req.storeId}`)

    // Validation
    if (!password || password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters long for migration",
      })
    }

    if (!email && !phone) {
      return res.status(400).json({
        error: "Either email or phone is required for migration",
      })
    }

    if (email && !validateEmail(email)) {
      return res.status(400).json({ error: "Valid email address is required" })
    }

    if (phone && !validatePhone(phone)) {
      return res.status(400).json({ error: "Valid phone number is required" })
    }

    if (!req.models) {
      return res.status(500).json({ error: "Database models not initialized" })
    }

    const { Customer } = req.models

    // Find existing customer
    let customer = null
    if (email) {
      customer = await Customer.findOne({ email: email.toLowerCase() })
    } else if (phone) {
      customer = await Customer.findOne({ phone: phone })
    }

    if (!customer) {
      return res.status(404).json({
        error: "No existing account found with the provided email or phone number",
        canRegister: true,
      })
    }

    // Check if already migrated
    if (customer.password) {
      return res.status(400).json({
        error: "Account already has password authentication set up",
        canLogin: true,
      })
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Update customer
    customer.password = hashedPassword
    if (email && !customer.email) {
      customer.email = email.toLowerCase()
    }
    if (name && name.trim()) {
      customer.name = name.trim()
    }
    customer.migratedAt = new Date()

    await customer.save()
    console.log(`🔄 Account migrated successfully: ${customer.email || customer.phone}`)

    // Generate JWT token
    const token = generateToken({
      customerId: customer._id,
      email: customer.email,
      storeId: req.storeId,
      tenantId: req.tenantId,
      type: "customer",
    })

    const response = {
      message: "Account migrated successfully. You can now use email and password to login.",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        orderCount: customer.orderCount,
        lastOrderDate: customer.lastOrderDate,
      },
      storeId: req.storeId,
      tenantId: req.tenantId,
    }

    res.json(response)
  } catch (error) {
    console.error("❌ Customer migration error:", error)
    res.status(500).json({
      error: "Failed to migrate account",
      details: error.message,
    })
  }
})

// Forgot password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ error: "Valid email address is required" })
    }

    if (!req.models) {
      return res.status(500).json({ error: "Database models not initialized" })
    }

    const { Customer } = req.models
    const customer = await Customer.findOne({ email: email.toLowerCase() })

    if (!customer) {
      // Don't reveal if email exists or not for security
      return res.json({
        message: "If an account with this email exists, a password reset link has been sent.",
      })
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { customerId: customer._id, email: customer.email, type: "password_reset" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "1h" },
    )

    // In a real app, you'd send this via email
    // For now, we'll just log it
    console.log(`🔐 Password reset token for ${email}: ${resetToken}`)

    // Store reset token (you might want to save this in database)
    customer.passwordResetToken = resetToken
    customer.passwordResetExpires = new Date(Date.now() + 3600000) // 1 hour
    await customer.save()

    res.json({
      message: "Password reset instructions have been sent to your email.",
      // In development, include the token
      ...(process.env.NODE_ENV === "development" && { resetToken }),
    })
  } catch (error) {
    console.error("❌ Forgot password error:", error)
    res.status(500).json({
      error: "Failed to process password reset request",
      details: error.message,
    })
  }
})

// Reset password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Reset token and new password are required" })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" })
    }

    // Verify reset token
    let decoded
    try {
      decoded = verifyToken(token)
    } catch (error) {
      return res.status(400).json({ error: "Invalid or expired reset token" })
    }

    if (decoded.type !== "password_reset") {
      return res.status(400).json({ error: "Invalid reset token" })
    }

    if (!req.models) {
      return res.status(500).json({ error: "Database models not initialized" })
    }

    const { Customer } = req.models
    const customer = await Customer.findById(decoded.customerId)

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    // Check if token is still valid
    if (customer.passwordResetExpires && customer.passwordResetExpires < new Date()) {
      return res.status(400).json({ error: "Reset token has expired" })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    customer.password = hashedPassword
    customer.passwordResetToken = undefined
    customer.passwordResetExpires = undefined
    customer.passwordChangedAt = new Date()

    await customer.save()

    console.log(`🔐 Password reset successful for: ${customer.email}`)

    res.json({
      message: "Password reset successful. You can now login with your new password.",
    })
  } catch (error) {
    console.error("❌ Reset password error:", error)
    res.status(500).json({
      error: "Failed to reset password",
      details: error.message,
    })
  }
})

// Customer authentication middleware
const authenticateCustomer = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({
        error: "Access denied. Please login.",
        code: "NO_TOKEN",
      })
    }

    const decoded = verifyToken(token)

    if (decoded.type !== "customer") {
      return res.status(401).json({
        error: "Invalid token type",
        code: "INVALID_TOKEN_TYPE",
      })
    }

    // Verify store context
    if (decoded.storeId !== req.storeId) {
      return res.status(401).json({
        error: "Access denied. Token is not valid for this store.",
        code: "INVALID_STORE_CONTEXT",
      })
    }

    if (!req.models) {
      return res.status(500).json({ error: "Database models not initialized" })
    }

    const { Customer } = req.models
    const customer = await Customer.findById(decoded.customerId)

    if (!customer) {
      return res.status(401).json({
        error: "Customer not found",
        code: "CUSTOMER_NOT_FOUND",
      })
    }

    if (!customer.isActive) {
      return res.status(401).json({
        error: "Account is deactivated",
        code: "ACCOUNT_DEACTIVATED",
      })
    }

    req.customer = customer
    req.customerId = customer._id
    next()
  } catch (error) {
    console.error("❌ Customer auth middleware error:", error)
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Invalid or expired token",
        code: "TOKEN_INVALID",
      })
    }
    res.status(500).json({ error: "Authentication failed" })
  }
}

// Get customer profile
router.get("/profile", authenticateCustomer, async (req, res) => {
  try {
    const customer = req.customer

    res.json({
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        orderCount: customer.orderCount,
        lastOrderDate: customer.lastOrderDate,
        addresses: customer.addresses || [],
        preferences: customer.preferences || {},
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
      },
    })
  } catch (error) {
    console.error("❌ Get profile error:", error)
    res.status(500).json({
      error: "Failed to get profile",
      details: error.message,
    })
  }
})

// Update customer profile
router.put("/profile", authenticateCustomer, async (req, res) => {
  try {
    const { name, phone, preferences } = req.body
    const customer = req.customer

    // Validation
    if (name && name.trim().length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters long" })
    }

    if (phone && !validatePhone(phone)) {
      return res.status(400).json({ error: "Valid phone number is required" })
    }

    // Update fields
    if (name) customer.name = name.trim()
    if (phone) customer.phone = phone
    if (preferences) customer.preferences = { ...customer.preferences, ...preferences }

    await customer.save()

    res.json({
      message: "Profile updated successfully",
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        preferences: customer.preferences,
      },
    })
  } catch (error) {
    console.error("❌ Update profile error:", error)
    res.status(500).json({
      error: "Failed to update profile",
      details: error.message,
    })
  }
})

// Change password
router.put("/change-password", authenticateCustomer, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const customer = req.customer

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" })
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, customer.password)
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: "Current password is incorrect" })
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12)
    customer.password = hashedNewPassword
    customer.passwordChangedAt = new Date()
    await customer.save()

    console.log(`🔐 Password changed for customer: ${customer.email}`)

    res.json({
      message: "Password changed successfully",
    })
  } catch (error) {
    console.error("❌ Change password error:", error)
    res.status(500).json({
      error: "Failed to change password",
      details: error.message,
    })
  }
})

// Verify token
router.get("/verify-token", authenticateCustomer, async (req, res) => {
  try {
    const customer = req.customer

    res.json({
      valid: true,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        orderCount: customer.orderCount,
      },
    })
  } catch (error) {
    console.error("❌ Token verification error:", error)
    res.status(500).json({
      error: "Token verification failed",
      details: error.message,
    })
  }
})

// Logout (client-side token invalidation)
router.post("/logout", authenticateCustomer, async (req, res) => {
  try {
    // In a more sophisticated setup, you might maintain a blacklist of tokens
    // For now, we'll just return success and let the client handle token removal

    res.json({
      message: "Logged out successfully",
      action: "Please remove the token from your client storage",
    })
  } catch (error) {
    console.error("❌ Logout error:", error)
    res.status(500).json({
      error: "Failed to logout",
      details: error.message,
    })
  }
})

// Address management endpoints (keeping existing functionality)
router.get("/addresses", authenticateCustomer, async (req, res) => {
  try {
    const customer = req.customer
    res.json({
      addresses: customer.addresses || [],
      count: customer.addresses ? customer.addresses.length : 0,
    })
  } catch (error) {
    console.error("❌ Get addresses error:", error)
    res.status(500).json({
      error: "Failed to get addresses",
      details: error.message,
    })
  }
})

router.post("/addresses", authenticateCustomer, async (req, res) => {
  try {
    const { type, name, street, landmark, city, state, pincode, country, isDefault } = req.body
    const customer = req.customer

    // Validation
    if (!name || !street || !city || !state || !pincode) {
      return res.status(400).json({
        error: "Name, street, city, state, and pincode are required",
      })
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ error: "Pincode must be 6 digits" })
    }

    const addressData = {
      type: type || "home",
      name: name.trim(),
      street: street.trim(),
      landmark: landmark ? landmark.trim() : "",
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country || "India",
      isDefault: isDefault || false,
    }

    await customer.addAddress(addressData)
    const newAddress = customer.addresses[customer.addresses.length - 1]

    res.status(201).json({
      message: "Address added successfully",
      address: newAddress,
      count: customer.addresses.length,
    })
  } catch (error) {
    console.error("❌ Add address error:", error)
    res.status(500).json({
      error: "Failed to add address",
      details: error.message,
    })
  }
})

router.put("/addresses/:addressId", authenticateCustomer, async (req, res) => {
  try {
    const { addressId } = req.params
    const { type, name, street, landmark, city, state, pincode, country, isDefault } = req.body
    const customer = req.customer

    if (!name || !street || !city || !state || !pincode) {
      return res.status(400).json({
        error: "Name, street, city, state, and pincode are required",
      })
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ error: "Pincode must be 6 digits" })
    }

    const updateData = {
      type: type || "home",
      name: name.trim(),
      street: street.trim(),
      landmark: landmark ? landmark.trim() : "",
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country || "India",
      isDefault: isDefault || false,
    }

    const result = await customer.updateAddress(addressId, updateData)
    if (!result) {
      return res.status(404).json({ error: "Address not found" })
    }

    const updatedAddress = customer.addresses.id(addressId)
    res.json({
      message: "Address updated successfully",
      address: updatedAddress,
    })
  } catch (error) {
    console.error("❌ Update address error:", error)
    res.status(500).json({
      error: "Failed to update address",
      details: error.message,
    })
  }
})

router.delete("/addresses/:addressId", authenticateCustomer, async (req, res) => {
  try {
    const { addressId } = req.params
    const customer = req.customer

    if (customer.addresses.length <= 1) {
      return res.status(400).json({
        error: "Cannot delete the only address. Please add another address first.",
      })
    }

    const result = await customer.removeAddress(addressId)
    if (!result) {
      return res.status(404).json({ error: "Address not found" })
    }

    res.json({
      message: "Address deleted successfully",
      count: customer.addresses.length,
    })
  } catch (error) {
    console.error("❌ Delete address error:", error)
    res.status(500).json({
      error: "Failed to delete address",
      details: error.message,
    })
  }
})

module.exports = router
