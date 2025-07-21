const subdomain = require("express-subdomain")

// This middleware is designed to handle dynamic subdomains for multi-tenant applications.
// It captures the subdomain and makes it available in req.tenantId.
// For example, if the request is to 'store1.yourdomain.com', req.tenantId will be 'store1'.
// It also ensures that requests to 'www.yourdomain.com' or 'yourdomain.com' are treated as main app requests.

const subdomainMiddleware = (req, res, next) => {
  const host = req.hostname
  const parts = host.split(".")

  // Check if it's localhost or a direct IP address
  if (parts.length === 1 || (parts.length === 4 && parts.every((part) => !isNaN(Number.parseInt(part))))) {
    req.tenantId = null // No subdomain for localhost or IP
    return next()
  }

  // Determine the base domain (e.g., 'yourdomain.com' from 'store1.yourdomain.com')
  // This assumes a TLD like .com, .org, .net. For more complex TLDs (e.g., .co.uk),
  // you might need a more sophisticated library like 'tldjs'.
  const baseDomain = parts.slice(-2).join(".") // e.g., 'yourdomain.com'

  // If the host is just the base domain (e.g., 'yourdomain.com' or 'www.yourdomain.com')
  // or if it's 'localhost', treat it as the main application.
  if (parts.length <= 2 || parts[0] === "www") {
    req.tenantId = null // Main application
  } else {
    // The first part is the subdomain
    req.tenantId = parts[0]
  }

  next()
}

module.exports = subdomainMiddleware
