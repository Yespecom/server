const express = require("express")
const router = express.Router()
const { getTenantDB } = require("../../config/tenantDB")
const Settings = require("../../models/tenant/Settings") // Settings model factory

// Add logging middleware for settings routes
router.use((req, res, next) => {
  console.log(`⚙️ Admin Settings: ${req.method} ${req.path}`)
  console.log(`⚙️ Full URL: ${req.originalUrl}`)
  console.log(`⚙️ Has tenantDB: ${!!req.tenantDB}`)
  console.log(`⚙️ Tenant ID: ${req.tenantId}`)
  next()
})

// Middleware to ensure tenantDB is available
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Middleware to ensure Settings model is available
const ensureSettingsModel = (req, res, next) => {
  try {
    if (!req.tenantDB) {
      console.error("❌ No tenant database connection available")
      return res.status(500).json({
        error: "Database connection not available",
        details: "Tenant database connection is missing",
      })
    }

    // Initialize Settings model
    req.SettingsModel = Settings(req.tenantDB)

    console.log("✅ Settings model initialized successfully")
    next()
  } catch (error) {
    console.error("❌ Error initializing Settings model:", error)
    return res.status(500).json({
      error: "Failed to initialize settings model",
      details: error.message,
    })
  }
}

// Apply the model middleware to all routes
router.use(ensureSettingsModel)

// Test endpoint
router.get("/test", (req, res) => {
  console.log("🧪 Admin settings test endpoint reached")
  console.log("🧪 About to send response...")

  const response = {
    message: "Admin settings routes are working",
    path: req.path,
    originalUrl: req.originalUrl,
    hasTenantDB: !!req.tenantDB,
    hasSettingsModel: !!req.SettingsModel,
    tenantId: req.tenantId,
    timestamp: new Date().toISOString(),
  }

  console.log("🧪 Sending response:", response)
  res.json(response)
  console.log("🧪 Response sent successfully")
})

// FIXED: Support both PUT and POST for payment settings
router.put("/payment", handlePaymentUpdate)
router.post("/payment", handlePaymentUpdate)

async function handlePaymentUpdate(req, res) {
  try {
    const SettingsModel = req.SettingsModel

    let settings = await SettingsModel.findOne()
    if (!settings) {
      settings = new SettingsModel({})
    }

    // Merge payment settings
    const currentPayment = settings.payment || {}
    const updatedPayment = { ...currentPayment }

    // Update each field
    Object.keys(req.body).forEach((key) => {
      if (req.body[key] !== "" && req.body[key] !== null && req.body[key] !== undefined) {
        updatedPayment[key] = req.body[key]
      }
    })

    settings.payment = updatedPayment
    await settings.save()

    // Prepare safe response (hide sensitive data)
    const safeSettings = {
      ...updatedPayment,
      razorpayKeySecret: updatedPayment.razorpayKeySecret ? "***HIDDEN***" : "",
      stripeSecretKey: updatedPayment.stripeSecretKey ? "***HIDDEN***" : "",
    }

    res.json({
      message: "Payment settings updated successfully",
      settings: safeSettings,
    })
    return
  } catch (error) {
    console.error("❌ Update payment settings error:", error)
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to update payment settings",
        details: error.message,
      })
    }
    return
  }
}

// Get all settings
router.get("/", async (req, res) => {
  try {
    console.log("📋 Getting all settings...")
    const SettingsModel = req.SettingsModel
    const settings = await SettingsModel.findOne({})
    console.log("✅ All settings retrieved")

    if (!settings) {
      return res.status(404).json({ error: "Settings not found for this tenant. Please create them." })
    }

    // Return safe version without sensitive data
    const safeSettings = {
      general: settings?.general || {},
      social: settings?.social || {},
      shipping: settings?.shipping || {},
      payment: {
        ...(settings?.payment || {}),
        razorpayKeySecret: settings?.payment?.razorpayKeySecret ? "***HIDDEN***" : "",
        stripeSecretKey: settings?.payment?.stripeSecretKey ? "***HIDDEN***" : "",
      },
    }

    res.json(safeSettings)
    return
  } catch (error) {
    console.error("❌ Get all settings error:", error)
    res.status(500).json({
      error: "Failed to get settings",
      details: error.message,
    })
    return
  }
})

// Update tenant settings (upsert)
router.put("/", async (req, res) => {
  try {
    const SettingsModel = req.SettingsModel
    const tenantId = req.tenantId
    const {
      storeName,
      contactEmail,
      contactPhone,
      address,
      currency,
      logoUrl,
      socialLinks,
      shippingPolicy,
      returnPolicy,
    } = req.body

    if (!storeName) {
      return res.status(400).json({ error: "Store name is required for settings" })
    }

    const updatedSettings = await SettingsModel.findOneAndUpdate(
      { tenantId },
      {
        storeName,
        contactEmail,
        contactPhone,
        address,
        currency,
        logoUrl,
        socialLinks,
        shippingPolicy,
        returnPolicy,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
    res.json(updatedSettings)
  } catch (error) {
    console.error("❌ Error updating tenant settings:", error)
    res.status(500).json({ error: "Failed to update settings" })
  }
})

// Get general settings
router.get("/general", async (req, res) => {
  try {
    console.log("📋 Getting general settings...")
    const SettingsModel = req.SettingsModel
    const settings = await SettingsModel.findOne({ tenantId: req.tenantId })
    console.log("✅ General settings retrieved")

    if (!settings) {
      return res.status(404).json({ error: "Settings not found for this tenant. Please create them." })
    }

    res.json(settings?.general || {})
    return
  } catch (error) {
    console.error("❌ Get general settings error:", error)
    res.status(500).json({
      error: "Failed to get general settings",
      details: error.message,
    })
    return
  }
})

// Update general settings - Support both PUT and POST
router.put("/general", handleGeneralUpdate)
router.post("/general", handleGeneralUpdate)

async function handleGeneralUpdate(req, res) {
  try {
    console.log("📝 Updating general settings...")
    const SettingsModel = req.SettingsModel

    let settings = await SettingsModel.findOne({ tenantId: req.tenantId })
    if (!settings) {
      settings = new SettingsModel({ tenantId: req.tenantId })
    }

    settings.general = { ...settings.general, ...req.body }
    await settings.save()

    console.log("✅ General settings updated")
    res.json(settings.general)
    return
  } catch (error) {
    console.error("❌ Update general settings error:", error)
    res.status(500).json({
      error: "Failed to update general settings",
      details: error.message,
    })
    return
  }
}

// Get payment settings
router.get("/payment", async (req, res) => {
  try {
    console.log("💳 Getting payment settings...")
    const SettingsModel = req.SettingsModel
    const settings = await SettingsModel.findOne({ tenantId: req.tenantId })

    // Don't expose sensitive data like API secrets
    const paymentSettings = settings?.payment || {}
    const safePaymentSettings = {
      ...paymentSettings,
      razorpayKeySecret: paymentSettings.razorpayKeySecret ? "***HIDDEN***" : "",
      stripeSecretKey: paymentSettings.stripeSecretKey ? "***HIDDEN***" : "",
    }

    console.log("✅ Payment settings retrieved")
    res.json(safePaymentSettings)
    return
  } catch (error) {
    console.error("❌ Get payment settings error:", error)
    res.status(500).json({
      error: "Failed to get payment settings",
      details: error.message,
    })
    return
  }
})

// Get social settings
router.get("/social", async (req, res) => {
  try {
    console.log("📱 Getting social settings...")
    const SettingsModel = req.SettingsModel
    const settings = await SettingsModel.findOne({ tenantId: req.tenantId })
    console.log("✅ Social settings retrieved")

    if (!settings) {
      return res.status(404).json({ error: "Settings not found for this tenant. Please create them." })
    }

    res.json(settings?.social || {})
    return
  } catch (error) {
    console.error("❌ Get social settings error:", error)
    res.status(500).json({
      error: "Failed to get social settings",
      details: error.message,
    })
    return
  }
})

// Update social settings - Support both PUT and POST
router.put("/social", handleSocialUpdate)
router.post("/social", handleSocialUpdate)

async function handleSocialUpdate(req, res) {
  try {
    console.log("📱 Updating social settings...")
    const SettingsModel = req.SettingsModel

    let settings = await SettingsModel.findOne({ tenantId: req.tenantId })
    if (!settings) {
      settings = new SettingsModel({ tenantId: req.tenantId })
    }

    settings.social = { ...settings.social, ...req.body }
    await settings.save()

    console.log("✅ Social settings updated")
    res.json(settings.social)
    return
  } catch (error) {
    console.error("❌ Update social settings error:", error)
    res.status(500).json({
      error: "Failed to update social settings",
      details: error.message,
    })
    return
  }
}

// Get shipping settings
router.get("/shipping", async (req, res) => {
  try {
    console.log("🚚 Getting shipping settings...")
    const SettingsModel = req.SettingsModel
    const settings = await SettingsModel.findOne({ tenantId: req.tenantId })
    console.log("✅ Shipping settings retrieved")

    if (!settings) {
      return res.status(404).json({ error: "Settings not found for this tenant. Please create them." })
    }

    res.json(settings?.shipping || {})
    return
  } catch (error) {
    console.error("❌ Get shipping settings error:", error)
    res.status(500).json({
      error: "Failed to get shipping settings",
      details: error.message,
    })
    return
  }
})

// Update shipping settings - Support both PUT and POST
router.put("/shipping", handleShippingUpdate)
router.post("/shipping", handleShippingUpdate)

async function handleShippingUpdate(req, res) {
  try {
    console.log("🚚 Updating shipping settings...")
    const SettingsModel = req.SettingsModel

    let settings = await SettingsModel.findOne({ tenantId: req.tenantId })
    if (!settings) {
      settings = new SettingsModel({ tenantId: req.tenantId })
    }

    settings.shipping = { ...settings.shipping, ...req.body }
    await settings.save()

    console.log("✅ Shipping settings updated")
    res.json(settings.shipping)
    return
  } catch (error) {
    console.error("❌ Update shipping settings error:", error)
    res.status(500).json({
      error: "Failed to update shipping settings",
      details: error.message,
    })
    return
  }
}

// Debug route to show all settings routes
router.get("/debug", (req, res) => {
  console.log("🔍 Settings routes debug requested")
  res.json({
    message: "Settings routes debug info",
    availableRoutes: [
      "GET /api/admin/settings/test",
      "GET /api/admin/settings/debug",
      "GET /api/admin/settings/",
      "PUT /api/admin/settings/",
      "GET /api/admin/settings/general",
      "PUT /api/admin/settings/general",
      "POST /api/admin/settings/general",
      "GET /api/admin/settings/payment",
      "PUT /api/admin/settings/payment",
      "POST /api/admin/settings/payment",
      "GET /api/admin/settings/social",
      "PUT /api/admin/settings/social",
      "POST /api/admin/settings/social",
      "GET /api/admin/settings/shipping",
      "PUT /api/admin/settings/shipping",
      "POST /api/admin/settings/shipping",
    ],
    currentPath: req.path,
    originalUrl: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  })
  return
})

module.exports = router
