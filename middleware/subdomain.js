// This middleware is designed to extract a subdomain and attach it to req.tenantId.
// It does NOT use the 'express-subdomain' package, but implements its own logic.
// For example, if your app is at app.example.com, and a store is at mystore.app.example.com,
// then 'mystore' would be extracted as the tenantId.

const subdomainMiddleware = (req, res, next) => {
  const host = req.get("host")
  const parts = host.split(".")

  // Determine if it's a local development environment (localhost or IP)
  const isLocal = parts.length === 1 || (parts.length === 4 && parts.every((part) => !isNaN(Number.parseInt(part))))

  if (isLocal) {
    // For localhost or direct IP, check if a storeId is provided in the URL path
    // This is a common pattern for local testing of multi-tenant apps without actual subdomains
    const pathParts = req.path.split("/")
    // Example: /api/STOREID/products -> pathParts[2] would be STOREID
    if (pathParts.length > 2 && pathParts[1] === "api" && /^[A-Z0-9]{6}$/i.test(pathParts[2])) {
      req.tenantId = pathParts[2].toUpperCase() // Use uppercase for consistency with storeId
      console.log(`🌐 Local Dev: Tenant ID from URL path: ${req.tenantId}`)
    } else {
      req.tenantId = null // No specific tenant identified for local dev without path storeId
      console.log("🌐 Local Dev: No specific tenant ID detected.")
    }
  } else {
    // For production/staging environments with actual domains
    // Assuming a structure like 'subdomain.domain.com' or 'www.domain.com'
    // If parts.length is 2 (e.g., 'domain.com'), or parts[0] is 'www', it's the main domain.
    if (parts.length <= 2 || parts[0] === "www" || parts[0] === "api") {
      req.tenantId = null // Main application or API base
      console.log("🌐 Production: No specific tenant ID detected from subdomain (main domain or API base).")
    } else {
      // The first part is the subdomain
      req.tenantId = parts[0].toUpperCase() // Convert to uppercase for consistency
      console.log(`🌐 Production: Subdomain detected: ${req.tenantId}`)
    }
  }

  next()
}

module.exports = subdomainMiddleware
