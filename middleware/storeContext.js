const { getTenantDB } = require("../config/tenantDB")
const User = require("../models/User")(require("../db/connection").getMainDb()) // Main User model
const TenantUser = require("../models/tenant/User") // Tenant User model factory
const TenantSettings = require("../models/tenant/Settings") // Tenant Settings model factory

/**
 * Middleware to establish tenant database connection and load store context.
 * This middleware should be applied to routes that require tenant-specific data.
 * It relies on `req.tenantId` being set by a preceding middleware (e.g., subdomainMiddleware).
 */
const storeContextMiddleware = async (req, res, next) => {
  const tenantId = req.tenantId // This should be set by subdomainMiddleware or similar

  if (!tenantId) {
    console.log("⚠️ Store Context: No tenant ID found. Skipping store context setup.")
    // For routes that don't require a tenant (e.g., main app routes), just proceed.
    // For store-specific routes, this might lead to a 404 or 400 later if not handled.
    return next()
  }

  console.log(`🔍 Store Context: Attempting to establish context for tenant ID: ${tenantId}`)

  try {
    // 1. Get main user to verify tenant existence and get associated storeId
    // The storeId in the main User model is the unique identifier for the store's subdomain/path
    const mainUser = await User.findOne({ storeId: tenantId })

    if (!mainUser) {
      console.error(`❌ Store Context: Main user not found for storeId: ${tenantId}`)
      return res.status(404).json({
        error: "Store not found",
        message: `No store found with ID: ${tenantId}. Please check the URL.`,
      })
    }

    // 2. Establish connection to the tenant-specific database
    const tenantDB = await getTenantDB(mainUser.tenantId) // Use tenantId from mainUser

    if (!tenantDB) {
      console.error(`❌ Store Context: Failed to get tenant DB connection for ${mainUser.tenantId}`)
      return res.status(500).json({ error: "Database connection failed for store." })
    }

    // 3. Load tenant-specific user and settings
    const TenantUserModel = TenantUser(tenantDB)
    const TenantSettingsModel = TenantSettings(tenantDB)

    const tenantUser = await TenantUserModel.findOne({ email: mainUser.email }) // Find the user within the tenant DB
    const tenantSettings = await TenantSettingsModel.findOne({}) // Get store settings

    if (!tenantUser || !tenantUser.hasStore) {
      console.error(
        `❌ Store Context: Tenant user not found or store not active for ${mainUser.email} in tenant ${mainUser.tenantId}`,
      )
      return res.status(404).json({ error: "Store not active or user not configured." })
    }

    // Attach tenant-specific data to the request object
    req.tenantDB = tenantDB
    req.storeId = tenantId // The ID used in the URL/subdomain
    req.tenantUserId = tenantUser._id // The user's ID within the tenant DB
    req.storeInfo = tenantSettings // Store settings (e.g., name, logo, theme)

    console.log(`✅ Store Context: Successfully established for store: ${req.storeId}, tenant: ${mainUser.tenantId}`)
    next()
  } catch (error) {
    console.error("❌ Store Context Middleware Error:", error)
    if (error.name === "MongooseServerSelectionError" || error.message.includes("Failed to connect")) {
      return res.status(503).json({ error: "Service Unavailable: Could not connect to store database." })
    }
    res.status(500).json({
      error: "Internal server error during store context setup",
      details: error.message,
    })
  }
}

module.exports = storeContextMiddleware
