const express = require("express")
const router = express.Router()

// Add logging middleware for settings routes
router.use((req, res, next) => {
  console.log(`⚙️ Admin Settings: ${req.method} ${req.path}`)
  console.log(`⚙️ Full URL: ${req.originalUrl}`)
  console.log(`⚙️ Has tenantDB: ${!!req.tenantDB}`)
  console.log(`⚙️ Tenant ID: ${req.tenantId}`)
  next()
})

// Middleware to ensure settings document is available and initialized
router.use(async (req, res, next) => {
  try {
    if (!req.tenantDB) {
      console.error("❌ No tenant database connection available for settings")
      return res.status(500).json({
        error: "Database connection not available",
        details: "Tenant database connection is missing for settings",
      })
    }
    const Settings = require("../../models/tenant/Settings")(req.tenantDB)
    let settings = await Settings.findOne()
    if (!settings) {
      console.log("📝 No settings document found, creating a new one.")
      settings = new Settings({}) // Initialize with default empty settings
      await settings.save()
      console.log("✅ New settings document created.")
    }
    req.settingsDoc = settings // Attach the settings document to the request
    console.log("✅ Settings document attached to request.")
    next()
  } catch (error) {
    console.error("❌ Error in ensureSettings middleware:", error)
    res.status(500).json({ error: "Failed to initialize settings document" })
  }
})

// Test endpoint
router.get("/test", (req, res) => {
  console.log("🧪 Admin settings test endpoint reached")
  console.log("🧪 About to send response...")
  const response = {
    message: "Admin settings routes are working",
    path: req.path,
    originalUrl: req.originalUrl,
    hasTenantDB: !!req.tenantDB,
    hasSettingsDoc: !!req.settingsDoc, // Check for settingsDoc instead of SettingsModel
    tenantId: req.tenantId,
    timestamp: new Date().toISOString(),
  }
  console.log("🧪 Sending response:", response)
  res.json(response)
  console.log("🧪 Response sent successfully")
})

// Handle payment settings update (supports PUT and POST)
router.put("/payment", handlePaymentUpdate)
router.post("/payment", handlePaymentUpdate)
async function handlePaymentUpdate(req, res) {
  try {
    console.log("💳 Updating payment settings...")
    const settings = req.settingsDoc // Use the attached settings document

    // Merge payment settings
    const currentPayment = settings.payment || {}
    const updatedPayment = { ...currentPayment }

    // Update each field from req.body
    Object.keys(req.body).forEach((key) => {
      // Only update if the value is explicitly provided (not empty string, null, or undefined)
      // This allows clearing fields by sending empty string if schema allows
      if (req.body[key] !== undefined) {
        updatedPayment[key] = req.body[key]
      }
    })

    settings.payment = updatedPayment
    await settings.save()
    console.log("✅ Payment settings updated.")

    // Prepare safe response (hide sensitive data)
    const safeSettings = {
      ...updatedPayment,
      razorpayKeySecret: updatedPayment.razorpayKeySecret ? "***HIDDEN***" : "",
      stripeSecretKey: updatedPayment.stripeSecretKey ? "***HIDDEN***" : "",
      phonePeSaltKey: updatedPayment.phonePeSaltKey ? "***HIDDEN***" : "", // Hide PhonePe salt key too
    }
    res.json({
      message: "Payment settings updated successfully",
      settings: safeSettings,
    })
  } catch (error) {
    console.error("❌ Update payment settings error:", error)
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to update payment settings",
        details: error.message,
      })
    }
  }
}

// Get all settings
router.get("/", async (req, res) => {
  try {
    console.log("📋 Getting all settings...")
    const settings = req.settingsDoc // Use the attached settings document
    console.log("✅ All settings retrieved")

    // Return safe version without sensitive data
    const safeSettings = {
      general: settings?.general || {},
      social: settings?.social || {},
      shipping: settings?.shipping || {},
      payment: {
        ...(settings?.payment || {}),
        razorpayKeySecret: settings?.payment?.razorpayKeySecret ? "***HIDDEN***" : "",
        stripeSecretKey: settings?.payment?.stripeSecretKey ? "***HIDDEN***" : "",
        phonePeSaltKey: settings?.payment?.phonePeSaltKey ? "***HIDDEN***" : "", // Hide PhonePe salt key
      },
    }
    res.json(safeSettings)
  } catch (error) {
    console.error("❌ Get all settings error:", error)
    res.status(500).json({
      error: "Failed to get settings",
      details: error.message,
    })
  }
})

// Get general settings
router.get("/general", async (req, res) => {
  try {
    console.log("📋 Getting general settings...")
    const settings = req.settingsDoc // Use the attached settings document
    console.log("✅ General settings retrieved")
    res.json(settings?.general || {})
  } catch (error) {
    console.error("❌ Get general settings error:", error)
    res.status(500).json({
      error: "Failed to get general settings",
      details: error.message,
    })
  }
})

// Update general settings (supports PUT and POST)
router.put("/general", handleGeneralUpdate)
router.post("/general", handleGeneralUpdate)
async function handleGeneralUpdate(req, res) {
  try {
    console.log("📝 Updating general settings...")
    const settings = req.settingsDoc // Use the attached settings document
    settings.general = { ...settings.general, ...req.body }
    await settings.save()
    console.log("✅ General settings updated")
    res.json(settings.general)
  } catch (error) {
    console.error("❌ Update general settings error:", error)
    res.status(500).json({
      error: "Failed to update general settings",
      details: error.message,
    })
  }
}

// Get payment settings
router.get("/payment", async (req, res) => {
  try {
    console.log("💳 Getting payment settings...")
    const settings = req.settingsDoc // Use the attached settings document
    // Don't expose sensitive data like API secrets
    const paymentSettings = settings?.payment || {}
    const safePaymentSettings = {
      ...paymentSettings,
      razorpayKeySecret: paymentSettings.razorpayKeySecret ? "***HIDDEN***" : "",
      stripeSecretKey: paymentSettings.stripeSecretKey ? "***HIDDEN***" : "",
      phonePeSaltKey: paymentSettings.phonePeSaltKey ? "***HIDDEN***" : "", // Hide PhonePe salt key
    }
    console.log("✅ Payment settings retrieved")
    res.json(safePaymentSettings)
  } catch (error) {
    console.error("❌ Get payment settings error:", error)
    res.status(500).json({
      error: "Failed to get payment settings",
      details: error.message,
    })
  }
})

// Get social settings
router.get("/social", async (req, res) => {
  try {
    console.log("📱 Getting social settings...")
    const settings = req.settingsDoc // Use the attached settings document
    console.log("✅ Social settings retrieved")
    res.json(settings?.social || {})
  } catch (error) {
    console.error("❌ Get social settings error:", error)
    res.status(500).json({
      error: "Failed to get social settings",
      details: error.message,
    })
  }
})

// Update social settings (supports PUT and POST)
router.put("/social", handleSocialUpdate)
router.post("/social", handleSocialUpdate)
async function handleSocialUpdate(req, res) {
  try {
    console.log("📱 Updating social settings...")
    const settings = req.settingsDoc // Use the attached settings document
    settings.social = { ...settings.social, ...req.body }
    await settings.save()
    console.log("✅ Social settings updated")
    res.json(settings.social)
  } catch (error) {
    console.error("❌ Update social settings error:", error)
    res.status(500).json({
      error: "Failed to update social settings",
      details: error.message,
    })
  }
}

// Get shipping settings
router.get("/shipping", async (req, res) => {
  try {
    console.log("🚚 Getting shipping settings...")
    const settings = req.settingsDoc // Use the attached settings document
    console.log("✅ Shipping settings retrieved")
    res.json(settings?.shipping || {})
  } catch (error) {
    console.error("❌ Get shipping settings error:", error)
    res.status(500).json({
      error: "Failed to get shipping settings",
      details: error.message,
    })
  }
})

// Update shipping settings (supports PUT and POST)
router.put("/shipping", handleShippingUpdate)
router.post("/shipping", handleShippingUpdate)
async function handleShippingUpdate(req, res) {
  try {
    console.log("🚚 Updating shipping settings...")
    const settings = req.settingsDoc // Use the attached settings document
    settings.shipping = { ...settings.shipping, ...req.body }
    await settings.save()
    console.log("✅ Shipping settings updated")
    res.json(settings.shipping)
  } catch (error) {
    console.error("❌ Update shipping settings error:", error)
    res.status(500).json({
      error: "Failed to update shipping settings",
      details: error.message,
    })
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
})

module.exports = router
