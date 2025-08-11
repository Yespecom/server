const express = require("express")
const bcrypt = require("bcryptjs")
const rateLimit = require("express-rate-limit")
const AuthUtils = require("../../utils/auth")
const { verifyFirebaseToken, getFirebaseStatus, getFirebaseClientConfig } = require("../../config/firebase")
const { hasMsg91, startOtp: startMsg91Otp, verifyOtp: verifyMsg91Otp } = require("../../config/msg91")

const router = express.Router({ mergeParams: true })

// Rate limiting
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: "Too many authentication attempts",
    code: "RATE_LIMIT_EXCEEDED",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const otpRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    error: "Too many OTP requests",
    code: "OTP_RATE_LIMIT_EXCEEDED",
    retryAfter: "10 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

router.use(["/login", "/register"], authRateLimit)
router.use("/otp", otpRateLimit)

// Logging
router.use((req, _res, next) => {
  try {
    const info = AuthUtils.extractClientInfo ? AuthUtils.extractClientInfo(req) : {}
    console.log(`🔐 Store Auth: ${req.method} ${req.originalUrl}`)
    console.log(`🔐 Store: ${req.storeId} | Tenant: ${req.tenantId} | Client:`, info)
  } catch {}
  next()
})

// Health/test
router.get("/test", (req, res) => {
  res.json({
    message: "Store auth routes are working",
    storeId: req.storeId,
    tenantId: req.tenantId,
    storeName: req.storeInfo?.name || "Unknown Store",
    timestamp: new Date().toISOString(),
  })
})

/**
 * OTP via MSG91
 */
router.post("/otp/request", async (req, res) => {
  try {
    const { phone, purpose = "login" } = req.body

    if (!phone) return res.status(400).json({ error: "Phone number is required", code: "MISSING_PHONE" })
    if (!["login", "registration"].includes(purpose)) {
      return res.status(400).json({ error: "Invalid purpose. Use 'login' or 'registration'.", code: "INVALID_PURPOSE" })
    }
    if (!AuthUtils.validatePhone || !AuthUtils.validatePhone(phone)) {
      return res.status(400).json({ error: "Please enter a valid phone number", code: "INVALID_PHONE" })
    }
    if (!req.tenantId || !req.storeId) {
      return res.status(500).json({ error: "Store context not initialized", code: "STORE_CONTEXT_ERROR" })
    }

    const firebaseStatus = getFirebaseStatus()

    if (firebaseStatus === "enabled") {
      // Return Firebase config for client-side OTP handling
      const cfg = getFirebaseClientConfig()
      if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
        return res.status(500).json({
          error: "Firebase web config is not properly configured",
          code: "FIREBASE_CONFIG_MISSING",
        })
      }

      return res.json({
        message: "Use Firebase for OTP verification",
        provider: "firebase",
        purpose,
        config: cfg,
        expiresIn: "10 minutes",
      })
    }

    if (hasMsg91()) {
      const storeName = req.storeInfo?.name || "Store"
      const result = await startMsg91Otp(phone, "sms", { purpose, storeName })

      return res.json({
        message: "OTP sent via MSG91 (fallback)",
        provider: "msg91",
        purpose,
        expiresIn: "10 minutes",
        details: result.data,
      })
    }

    // Dev-mode: log a generated OTP
    const devOtp = ("" + Math.floor(100000 + Math.random() * 900000)).padStart(6, "0")
    console.log(`🧪 DEV OTP for ${phone}: ${devOtp}`)
    return res.json({
      message: "DEV MODE: OTP generated (check server logs)",
      provider: "development",
      purpose,
      dev: { code: devOtp },
      expiresIn: "10 minutes",
    })
  } catch (error) {
    const details = error?.response?.data || error.message || String(error)
    console.error("❌ Phone OTP request error:", details)
    return res.status(500).json({
      error: "Failed to send OTP",
      details: typeof details === "string" ? details : JSON.stringify(details),
      code: "OTP_REQUEST_ERROR",
    })
  }
})

router.post("/otp/verify", async (req, res) => {
  try {
    const { phone, otp, purpose = "login", name, rememberMe } = req.body

    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required", code: "MISSING_FIELDS" })
    if (!AuthUtils.validatePhone || !AuthUtils.validatePhone(phone)) {
      return res.status(400).json({ error: "Please enter a valid phone number", code: "INVALID_PHONE" })
    }
    if (!["login", "registration"].includes(purpose)) {
      return res.status(400).json({ error: "Invalid purpose. Use 'login' or 'registration'.", code: "INVALID_PURPOSE" })
    }
    if (!req.tenantDB || !req.tenantId || !req.storeId) {
      return res.status(500).json({ error: "Database or store context not initialized", code: "STORE_CONTEXT_ERROR" })
    }

    let verified = false
    if (hasMsg91()) {
      const result = await verifyMsg91Otp(phone, otp)
      verified = result.valid
      if (!verified) {
        return res.status(400).json({
          error: "OTP verification failed",
          code: "OTP_VERIFICATION_FAILED",
          details: result.data,
        })
      }
    } else {
      // Dev mode: accept 4-8 digit OTPs
      if (!/^\d{4,8}$/.test(String(otp))) {
        return res.status(400).json({ error: "Invalid OTP", code: "INVALID_OTP" })
      }
      verified = true
    }

    const Customer = require("../../models/tenant/Customer")(req.tenantDB)

    // Find existing customer by phone
    let customer = await Customer.findOne({ phone })

    if (!customer) {
      // Auto-register phone-first customer
      const fallbackName = name && name.trim().length >= 2 ? name.trim() : `Customer ${String(phone).slice(-4)}`
      customer = new Customer({
        name: fallbackName,
        phone,
        totalSpent: 0,
        totalOrders: 0,
        isActive: true,
        isVerified: true,
        emailVerified: false,
        phoneVerified: true,
        preferences: {
          notifications: true,
          marketing: false,
          newsletter: true,
          smsUpdates: !!phone,
        },
        lastLoginAt: new Date(),
      })
      await customer.save()
      console.log(`👤 Phone-first customer created for ${phone}`)
    } else {
      // Mark phone verified and update last login
      customer.phoneVerified = true
      customer.isVerified = true
      customer.lastLoginAt = new Date()
      await customer.save()
    }

    const token = customer.generateAuthToken(req.storeId, req.tenantId, !!rememberMe)
    const tokenInfo = AuthUtils.formatTokenExpiry ? AuthUtils.formatTokenExpiry(token) : undefined

    return res.json({
      message: "Login successful",
      method: "phone_otp",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        totalOrders: customer.totalOrders,
        lastOrderDate: customer.lastOrderDate,
        addresses: customer.addresses || [],
        preferences: customer.preferences || {},
        tier: customer.tier,
      },
      storeId: req.storeId,
      tenantId: req.tenantId,
      tokenInfo,
      expiresIn: rememberMe ? "365 days" : "90 days",
    })
  } catch (error) {
    const details = error?.response?.data || error.message || String(error)
    console.error("❌ Phone OTP verify error:", details)
    return res.status(500).json({
      error: "Failed to verify OTP",
      details: typeof details === "string" ? details : JSON.stringify(details),
      code: "OTP_VERIFY_ERROR",
    })
  }
})

/**
 * Firebase Phone OTP: client verifies OTP with Firebase and sends ID token here.
 */
router.get("/otp/firebase/status", (req, res) => {
  try {
    const status = getFirebaseStatus()
    res.json({ provider: "firebase", status })
  } catch (error) {
    res.status(500).json({
      error: "Failed to get Firebase status",
      details: error.message,
      code: "FIREBASE_STATUS_ERROR",
    })
  }
})

router.get("/otp/firebase/config", (req, res) => {
  try {
    const cfg = getFirebaseClientConfig()
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
      return res.status(404).json({
        error: "Firebase web config is not set on the server",
        code: "FIREBASE_WEB_CONFIG_MISSING",
      })
    }
    // Only return the safe web config fields
    res.json({
      provider: "firebase",
      config: cfg,
    })
  } catch (error) {
    res.status(500).json({
      error: "Failed to get Firebase client config",
      details: error.message,
      code: "FIREBASE_CONFIG_ERROR",
    })
  }
})

router.post("/otp/firebase/verify", async (req, res) => {
  try {
    const { idToken, name, rememberMe } = req.body

    if (!idToken) {
      return res.status(400).json({
        error: "idToken is required",
        code: "MISSING_ID_TOKEN",
      })
    }

    if (!req.tenantDB || !req.tenantId || !req.storeId) {
      return res.status(500).json({
        error: "Store context not initialized",
        code: "STORE_CONTEXT_ERROR",
      })
    }

    // Verify Firebase token using Admin SDK
    const result = await verifyFirebaseToken(idToken)
    if (!result?.success) {
      return res.status(401).json({
        error: "Invalid Firebase token",
        code: "FIREBASE_TOKEN_INVALID",
        details: result?.error || "Verification failed",
      })
    }

    const phone = result.phone
    const email = result.email
    const displayName = result.name || name

    if (!phone) {
      return res.status(400).json({
        error: "Firebase token does not contain a phone number",
        code: "NO_PHONE_IN_TOKEN",
      })
    }

    // Validate phone format for our system (expects E.164)
    if (AuthUtils.validatePhone && !AuthUtils.validatePhone(phone)) {
      return res.status(400).json({
        error: "Phone number from Firebase is not in a valid format",
        code: "INVALID_PHONE_FORMAT",
      })
    }

    const Customer = require("../../models/tenant/Customer")(req.tenantDB)

    // Find by phone
    let customer = await Customer.findOne({ phone })

    if (!customer) {
      // Try email match (if provided) to merge accounts
      if (email) {
        const emailMatch = await Customer.findOne({ email: email.toLowerCase() })
        if (emailMatch) {
          // Attach phone to existing email account if phone not already set
          if (!emailMatch.phone) {
            emailMatch.phone = phone
            emailMatch.phoneVerified = true
            emailMatch.isVerified = true
            emailMatch.lastLoginAt = new Date()
            await emailMatch.save()
            customer = emailMatch
          } else {
            // Conflicting phone; fallback to creating a phone-first account
            console.warn("⚠️ Email exists with different phone; creating phone-first account")
          }
        }
      }
    }

    if (!customer) {
      const fallbackName =
        displayName && displayName.trim().length >= 2 ? displayName.trim() : `Customer ${String(phone).slice(-4)}`
      customer = new Customer({
        name: fallbackName,
        email: email ? email.toLowerCase() : undefined,
        phone,
        totalSpent: 0,
        totalOrders: 0,
        isActive: true,
        isVerified: true,
        emailVerified: !!email, // you may choose to set false if email isn't verified in Firebase
        phoneVerified: true,
        preferences: {
          notifications: true,
          marketing: false,
          newsletter: true,
          smsUpdates: true,
        },
        lastLoginAt: new Date(),
      })
      await customer.save()
      console.log(`👤 Firebase phone customer created for ${phone}`)
    } else {
      // Update verification state and last login
      customer.phoneVerified = true
      customer.isVerified = true
      if (email && !customer.email) {
        // Only set email if not already present (avoid unique conflicts)
        customer.email = email.toLowerCase()
      }
      customer.lastLoginAt = new Date()
      await customer.save()
    }

    // Sign into our app
    const token = customer.generateAuthToken(req.storeId, req.tenantId, !!rememberMe)
    const tokenInfo = AuthUtils.formatTokenExpiry ? AuthUtils.formatTokenExpiry(token) : undefined

    res.json({
      message: "Login successful via Firebase phone",
      method: "firebase_phone",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        totalOrders: customer.totalOrders,
        addresses: customer.addresses || [],
        preferences: customer.preferences || {},
        tier: customer.tier,
      },
      storeId: req.storeId,
      tenantId: req.tenantId,
      tokenInfo,
      expiresIn: rememberMe ? "365 days" : "90 days",
    })
  } catch (error) {
    console.error("❌ Firebase OTP verify error:", error)
    res.status(500).json({
      error: "Failed to verify Firebase OTP",
      details: error.message,
      code: "FIREBASE_OTP_VERIFY_ERROR",
    })
  }
})

/**
 * Email/password register, login, and authenticated utilities
 */

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, rememberMe } = req.body
    const errors = []

    if (!name || name.trim().length < 2) errors.push("Name must be at least 2 characters long")
    if (email && (!AuthUtils.validateEmail || !AuthUtils.validateEmail(email))) errors.push("Valid email is required")
    if (!password) errors.push("Password is required")
    else {
      const pv = AuthUtils.validatePassword
        ? AuthUtils.validatePassword(password)
        : { isValid: password.length >= 6, errors: [] }
      if (!pv.isValid) errors.push(...pv.errors)
    }
    if (phone && (!AuthUtils.validatePhone || !AuthUtils.validatePhone(phone))) errors.push("Valid phone is required")

    if (errors.length) {
      return res.status(400).json({ error: "Validation failed", details: errors, code: "VALIDATION" })
    }

    if (!req.tenantDB || !req.tenantId || !req.storeId) {
      return res.status(500).json({ error: "Database or store context not initialized", code: "STORE_CONTEXT_ERROR" })
    }

    const Customer = require("../../models/tenant/Customer")(req.tenantDB)

    const existing = await Customer.findOne({
      $or: [{ email: email?.toLowerCase() }, ...(phone ? [{ phone }] : [])],
    })
    if (existing) {
      return res.status(400).json({ error: "Account already exists", code: "CUSTOMER_EXISTS" })
    }

    const hashed = await bcrypt.hash(password, 12)
    const customer = new Customer({
      name: name.trim(),
      email: email ? email.toLowerCase() : undefined,
      password: hashed,
      phone: phone || undefined,
      totalSpent: 0,
      totalOrders: 0,
      isActive: true,
      isVerified: !!email || !!phone,
      emailVerified: !!email,
      phoneVerified: !!phone,
      preferences: { notifications: true, marketing: false, newsletter: true, smsUpdates: !!phone },
    })
    await customer.save()

    const token = customer.generateAuthToken(req.storeId, req.tenantId, !!rememberMe)
    const tokenInfo = AuthUtils.formatTokenExpiry ? AuthUtils.formatTokenExpiry(token) : undefined

    res.status(201).json({
      message: "Registration successful",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        totalOrders: customer.totalOrders,
        isVerified: customer.isVerified,
        preferences: customer.preferences,
      },
      storeId: req.storeId,
      tenantId: req.tenantId,
      tokenInfo,
      expiresIn: rememberMe ? "365 days" : "90 days",
    })
  } catch (error) {
    console.error("❌ Customer registration error:", error)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field"
      return res
        .status(400)
        .json({ error: `An account with this ${field} already exists`, code: "DUPLICATE_FIELD", field })
    }
    res.status(500).json({ error: "Failed to register customer", details: error.message, code: "REGISTRATION_ERROR" })
  }
})

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body
    if (!email || !password) return res.status(400).json({ error: "Email and password are required", code: "MISSING" })
    if (!AuthUtils.validateEmail || !AuthUtils.validateEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address", code: "INVALID_EMAIL" })
    }
    if (!req.tenantDB || !req.tenantId || !req.storeId) {
      return res.status(500).json({ error: "Database not initialized", code: "DB_NOT_INITIALIZED" })
    }
    const Customer = require("../../models/tenant/Customer")(req.tenantDB)
    const customer = await Customer.findOne({ email: email.toLowerCase() })
    if (!customer) return res.status(401).json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" })
    const ok = await bcrypt.compare(password, customer.password || "")
    if (!ok) return res.status(401).json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" })

    customer.lastLoginAt = new Date()
    await customer.save()

    const token = customer.generateAuthToken(req.storeId, req.tenantId, !!rememberMe)
    const tokenInfo = AuthUtils.formatTokenExpiry ? AuthUtils.formatTokenExpiry(token) : undefined

    res.json({
      message: "Login successful",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        totalOrders: customer.totalOrders,
        addresses: customer.addresses || [],
        preferences: customer.preferences || {},
        tier: customer.tier,
      },
      storeId: req.storeId,
      tenantId: req.tenantId,
      tokenInfo,
      expiresIn: rememberMe ? "365 days" : "90 days",
    })
  } catch (error) {
    console.error("❌ Customer login error:", error)
    res.status(500).json({ error: "Failed to login", details: error.message, code: "LOGIN_ERROR" })
  }
})

/**
 * Authenticated utilities (middleware, profile, addresses, token)
 */
const authenticateCustomer = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access denied. Please login.", code: "NO_TOKEN" })
    }
    const token = authHeader.replace("Bearer ", "")
    let decoded
    try {
      decoded = AuthUtils.verifyToken(token)
    } catch (tokenError) {
      if (tokenError.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Session expired. Please login again.",
          code: "TOKEN_EXPIRED",
          expiredAt: tokenError.expiredAt,
        })
      }
      return res.status(401).json({ error: "Invalid session. Please login again.", code: "TOKEN_INVALID" })
    }
    if (decoded.type !== "customer")
      return res.status(401).json({ error: "Invalid token type", code: "INVALID_TOKEN_TYPE" })
    if (decoded.storeId !== req.storeId) {
      return res
        .status(401)
        .json({ error: "Access denied. Token is not valid for this store.", code: "INVALID_STORE_CONTEXT" })
    }
    if (!req.tenantDB) return res.status(500).json({ error: "Database not initialized", code: "DB_NOT_INITIALIZED" })

    const Customer = require("../../models/tenant/Customer")(req.tenantDB)
    const customer = await Customer.findById(decoded.customerId)
    if (!customer) return res.status(401).json({ error: "Customer not found", code: "CUSTOMER_NOT_FOUND" })
    if (!customer.isActive)
      return res.status(401).json({ error: "Account is deactivated", code: "ACCOUNT_DEACTIVATED" })

    if (customer.password && customer.passwordChangedAt && decoded.iat) {
      const pwdChangedAt = Math.floor(customer.passwordChangedAt.getTime() / 1000)
      if (pwdChangedAt > decoded.iat) {
        return res.status(401).json({ error: "Password was changed. Please login again.", code: "PASSWORD_CHANGED" })
      }
    }

    if (AuthUtils.shouldRefreshToken && AuthUtils.shouldRefreshToken(token)) {
      const newToken = customer.generateAuthToken(req.storeId, req.tenantId, false)
      res.setHeader("X-New-Token", newToken)
      res.setHeader("X-Token-Refreshed", "true")
      console.log(`🔄 Token refreshed for customer: ${customer.email || customer.phone}`)
    }

    req.customer = customer
    req.customerId = customer._id
    req.authToken = token
    req.tokenPayload = decoded
    next()
  } catch (error) {
    console.error("❌ Customer auth middleware error:", error)
    res.status(500).json({ error: "Authentication failed", code: "AUTH_ERROR" })
  }
}

router.get("/profile", authenticateCustomer, async (req, res) => {
  try {
    const c = req.customer
    const tokenInfo = AuthUtils.formatTokenExpiry ? AuthUtils.formatTokenExpiry(req.authToken) : undefined
    res.json({
      message: "Profile retrieved successfully",
      customer: {
        id: c._id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        dateOfBirth: c.dateOfBirth,
        gender: c.gender,
        totalSpent: c.totalSpent,
        totalOrders: c.totalOrders,
        loyaltyPoints: c.loyaltyPoints,
        tier: c.tier,
        lastOrderDate: c.lastOrderDate,
        addresses: c.addresses || [],
        preferences: c.preferences || {},
        isVerified: c.isVerified,
        emailVerified: c.emailVerified,
        phoneVerified: c.phoneVerified,
        createdAt: c.createdAt,
        lastLoginAt: c.lastLoginAt,
      },
      tokenInfo,
    })
  } catch (error) {
    console.error("❌ Get profile error:", error)
    res.status(500).json({ error: "Failed to get profile", details: error.message, code: "PROFILE_ERROR" })
  }
})

router.put("/profile", authenticateCustomer, async (req, res) => {
  try {
    const { name, phone, dateOfBirth, gender, preferences } = req.body
    const c = req.customer

    if (name && name.trim().length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters long", code: "INVALID_NAME" })
    }
    if (phone && (!AuthUtils.validatePhone || !AuthUtils.validatePhone(phone))) {
      return res.status(400).json({ error: "Valid phone number is required", code: "INVALID_PHONE" })
    }
    if (dateOfBirth && new Date(dateOfBirth) > new Date()) {
      return res.status(400).json({ error: "Date of birth cannot be in the future", code: "INVALID_DATE_OF_BIRTH" })
    }
    if (gender && !["male", "female", "other"].includes(gender)) {
      return res.status(400).json({ error: "Gender must be male, female, or other", code: "INVALID_GENDER" })
    }

    if (name) c.name = name.trim()
    if (phone) c.phone = phone
    if (dateOfBirth) c.dateOfBirth = new Date(dateOfBirth)
    if (gender) c.gender = gender
    if (preferences) c.preferences = { ...c.preferences, ...preferences }

    await c.save()

    res.json({
      message: "Profile updated successfully",
      customer: {
        id: c._id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        dateOfBirth: c.dateOfBirth,
        gender: c.gender,
        preferences: c.preferences,
      },
    })
  } catch (error) {
    console.error("❌ Update profile error:", error)
    res.status(500).json({ error: "Failed to update profile", details: error.message, code: "PROFILE_UPDATE_ERROR" })
  }
})

router.put("/change-password", authenticateCustomer, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const c = req.customer

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Current password and new password are required", code: "MISSING_PASSWORDS" })
    }

    const pv = AuthUtils.validatePassword
      ? AuthUtils.validatePassword(newPassword)
      : { isValid: newPassword.length >= 6, errors: [] }
    if (!pv.isValid) {
      return res
        .status(400)
        .json({ error: "New password validation failed", details: pv.errors, code: "INVALID_NEW_PASSWORD" })
    }

    const ok = await c.comparePassword(currentPassword)
    if (!ok) return res.status(401).json({ error: "Current password is incorrect", code: "INCORRECT_CURRENT_PASSWORD" })

    c.password = newPassword
    c.passwordChangedAt = new Date()
    await c.save()

    res.json({
      message: "Password changed successfully. Please login again with your new password.",
      action: "LOGIN_REQUIRED",
    })
  } catch (error) {
    console.error("❌ Change password error:", error)
    res.status(500).json({ error: "Failed to change password", details: error.message, code: "PASSWORD_CHANGE_ERROR" })
  }
})

router.get("/verify-token", authenticateCustomer, async (req, res) => {
  try {
    const c = req.customer
    const tokenInfo = AuthUtils.formatTokenExpiry ? AuthUtils.formatTokenExpiry(req.authToken) : undefined
    res.json({
      valid: true,
      customer: {
        id: c._id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        totalSpent: c.totalSpent,
        totalOrders: c.totalOrders,
        tier: c.tier,
      },
      tokenInfo,
    })
  } catch (error) {
    console.error("❌ Token verification error:", error)
    res
      .status(500)
      .json({ error: "Token verification failed", details: error.message, code: "TOKEN_VERIFICATION_ERROR" })
  }
})

router.post("/logout", authenticateCustomer, async (req, res) => {
  try {
    console.log(`🚪 Customer logged out: ${req.customer.email || req.customer.phone}`)
    res.json({ message: "Logged out successfully", action: "Please remove the token from your client storage" })
  } catch (error) {
    console.error("❌ Logout error:", error)
    res.status(500).json({ error: "Failed to logout", details: error.message, code: "LOGOUT_ERROR" })
  }
})

// Addresses
router.get("/addresses", authenticateCustomer, async (req, res) => {
  try {
    const c = req.customer
    res.json({
      message: "Addresses retrieved successfully",
      addresses: c.addresses || [],
      count: c.addresses ? c.addresses.length : 0,
    })
  } catch (error) {
    console.error("❌ Get addresses error:", error)
    res.status(500).json({ error: "Failed to get addresses", details: error.message, code: "GET_ADDRESSES_ERROR" })
  }
})

router.post("/addresses", authenticateCustomer, async (req, res) => {
  try {
    const { type, name, phone, street, city, state, zipCode, country, isDefault } = req.body
    const c = req.customer

    if (!name || !street || !city || !state || !zipCode) {
      return res
        .status(400)
        .json({ error: "Name, street, city, state, and zip code are required", code: "MISSING_ADDRESS_FIELDS" })
    }
    if (!/^\d{5,6}$/.test(String(zipCode))) {
      return res.status(400).json({ error: "Zip code must be 5-6 digits", code: "INVALID_ZIP_CODE" })
    }

    const addressData = {
      type: type || "home",
      name: name.trim(),
      phone: phone || c.phone || "",
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: String(zipCode).trim(),
      country: country || "India",
      isDefault: !!isDefault,
    }

    await c.addAddress(addressData)
    const newAddress = c.addresses[c.addresses.length - 1]
    res.status(201).json({ message: "Address added successfully", address: newAddress, count: c.addresses.length })
  } catch (error) {
    console.error("❌ Add address error:", error)
    res.status(500).json({ error: "Failed to add address", details: error.message, code: "ADD_ADDRESS_ERROR" })
  }
})

router.put("/addresses/:addressId", authenticateCustomer, async (req, res) => {
  try {
    const { addressId } = req.params
    const { type, name, phone, street, city, state, zipCode, country, isDefault } = req.body
    const c = req.customer

    if (!name || !street || !city || !state || !zipCode) {
      return res
        .status(400)
        .json({ error: "Name, street, city, state, and zip code are required", code: "MISSING_ADDRESS_FIELDS" })
    }
    if (!/^\d{5,6}$/.test(String(zipCode))) {
      return res.status(400).json({ error: "Zip code must be 5-6 digits", code: "INVALID_ZIP_CODE" })
    }

    const updateData = {
      type: type || "home",
      name: name.trim(),
      phone: phone || c.phone || "",
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: String(zipCode).trim(),
      country: country || "India",
      isDefault: !!isDefault,
    }

    const ok = await c.updateAddress(addressId, updateData)
    if (!ok) return res.status(404).json({ error: "Address not found", code: "ADDRESS_NOT_FOUND" })

    const updatedAddress = c.addresses.id(addressId)
    res.json({ message: "Address updated successfully", address: updatedAddress })
  } catch (error) {
    console.error("❌ Update address error:", error)
    res.status(500).json({ error: "Failed to update address", details: error.message, code: "UPDATE_ADDRESS_ERROR" })
  }
})

router.delete("/addresses/:addressId", authenticateCustomer, async (req, res) => {
  try {
    const { addressId } = req.params
    const c = req.customer

    if (c.addresses.length <= 1) {
      return res.status(400).json({
        error: "Cannot delete the only address. Please add another address first.",
        code: "CANNOT_DELETE_ONLY_ADDRESS",
      })
    }

    const ok = await c.removeAddress(addressId)
    if (!ok) return res.status(404).json({ error: "Address not found", code: "ADDRESS_NOT_FOUND" })

    res.json({ message: "Address deleted successfully", count: c.addresses.length })
  } catch (error) {
    console.error("❌ Delete address error:", error)
    res.status(500).json({ error: "Failed to delete address", details: error.message, code: "DELETE_ADDRESS_ERROR" })
  }
})

module.exports = router
