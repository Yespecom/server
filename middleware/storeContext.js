const { getTenantDB } = require("../config/tenantDB")
const SettingsModel = require("../models/tenant/Settings") // Use the function to get the model

// This middleware fetches store settings based on the tenantId derived from the subdomain.
// It makes the store settings available in req.storeSettings.
const storeContext = async (req, res, next) => {
  const tenantId = req.tenantId // From subdomain middleware

  if (!tenantId) {
    // If no tenantId (e.g., main domain), proceed without store context
    req.storeSettings = null
    return next()
  }

  try {
    const tenantDB = await getTenantDB(tenantId)
    const Settings = SettingsModel(tenantDB)
    const settings = await Settings.findOne({}) // Assuming one settings document per tenant

    if (!settings) {
      // If no settings found for the tenant, you might want to redirect or show a specific page
      console.warn(`No settings found for tenant: ${tenantId}`)
      req.storeSettings = null // Or handle as an error
      return res.status(404).json({ error: "Store not found or not configured." })
    }

    req.storeSettings = settings
    next()
  } catch (error) {
    console.error(`Error fetching store context for tenant ${tenantId}:`, error)
    res.status(500).json({ error: "Failed to load store context." })
  }
}

module.exports = storeContext
