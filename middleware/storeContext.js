const { getTenantDB } = require("../config/tenantDB")
const TenantUser = require("../models/tenant/User") // Import the tenant User model function
const SettingsModel = require("../models/tenant/Settings") // Use the function to get the model

// This middleware fetches store settings based on the tenantId derived from the subdomain.
// It makes the store settings available in req.storeSettings.
const storeContextMiddleware = async (req, res, next) => {
  // req.tenantId should be set by the subdomain middleware or from the URL parameter
  const tenantId = req.tenantId || req.params.storeId

  if (!tenantId) {
    // If no tenantId is found, it's not a tenant-specific request, or it's an error
    // For routes like /api/auth, /api/otp, /api/admin, this is expected.
    // For /api/:storeId, this would be an error if storeId is missing.
    console.log("⚠️ Store Context: No tenantId found for this request.")
    return next() // Proceed, as not all routes require a tenant context
  }

  try {
    // Establish connection to the specific tenant's database
    const tenantDbConnection = await getTenantDB(tenantId)
    req.tenantDb = tenantDbConnection // Attach the tenant DB connection to the request

    // Attach tenant-specific models to the request for convenience
    // This allows route handlers to access models like req.tenantModels.User
    req.tenantModels = {
      User: TenantUser(tenantDbConnection),
      // Add other tenant models here as needed
      Order: require("../models/tenant/Order")(tenantDbConnection),
      Product: require("../models/tenant/Product")(tenantDbConnection),
      Category: require("../models/tenant/Category")(tenantDbConnection),
      Customer: require("../models/tenant/Customer")(tenantDbConnection),
      Offer: require("../models/tenant/Offer")(tenantDbConnection),
      Payment: require("../models/tenant/Payment")(tenantDbConnection),
      Settings: SettingsModel(tenantDbConnection),
    }

    console.log(`✅ Store Context: Tenant DB and models attached for tenantId: ${tenantId}`)
    next()
  } catch (error) {
    console.error(`❌ Store Context Error for tenantId ${tenantId}:`, error)
    res.status(500).json({ error: "Could not connect to tenant database." })
  }
}

module.exports = storeContextMiddleware
