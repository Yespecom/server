const subdomain = require("express-subdomain")

// This middleware is designed to extract a subdomain and attach it to req.tenantId
// It assumes your application is hosted in a way that subdomains resolve to your server.
// For example, if your app is at app.example.com, and a store is at mystore.app.example.com,
// then 'mystore' would be extracted as the tenantId.

const subdomainMiddleware = (req, res, next) => {
  const host = req.get("host")
  const parts = host.split(".")

  // Assuming a structure like 'subdomain.domain.com' or 'subdomain.localhost'
  // This logic might need adjustment based on your actual domain setup (e.g., .co.uk)
  if (parts.length >= 3 && parts[0] !== "www" && parts[0] !== "api" && parts[0] !== "localhost") {
    req.tenantId = parts[0] // The first part is the subdomain
    console.log(`🌐 Subdomain detected: ${req.tenantId}`)
  } else if (req.params.storeId) {
    // If no subdomain, but a storeId is present in the URL path (e.g., /api/STOREID/...)
    req.tenantId = req.params.storeId
    console.log(`🌐 Tenant ID from URL path: ${req.tenantId}`)
  } else {
    req.tenantId = null // No specific tenant identified
    console.log("🌐 No specific tenant ID detected from subdomain or URL path.")
  }

  next()
}

module.exports = subdomainMiddleware
