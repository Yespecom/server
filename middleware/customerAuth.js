const jwt = require("jsonwebtoken")
const { getTenantDB } = require("../config/tenantDB")
const TenantUser = require("../models/tenant/User") // Import the tenant User model function

const customerAuthMiddleware = async (req, res, next) => {
  let token

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1]
  }

  if (!token) {
    console.log("❌ Customer Auth middleware: No token provided.")
    return res.status(401).json({ message: "No token, authorization denied" })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.customer = decoded // Attach customer payload (email, customerId, tenantId) to request

    console.log(`✅ Customer Auth middleware: Token verified for customer ${decoded.email}`)

    // Ensure tenantId is available from the request context (set by storeContextMiddleware)
    const tenantId = req.tenantId || decoded.tenantId // Fallback to token's tenantId if not set by context
    if (!tenantId) {
      console.log("❌ Customer Auth middleware: Tenant ID not found in request or token.")
      return res.status(400).json({ message: "Tenant ID is missing." })
    }

    // Get the tenant-specific User model
    const tenantDbConnection = await getTenantDB(tenantId)
    const CustomerModel = TenantUser(tenantDbConnection) // Assuming TenantUser model is used for customers

    // Fetch customer from tenant DB to ensure they are active
    const customer = await CustomerModel.findById(decoded.customerId)

    if (!customer || !customer.isActive) {
      console.log(`❌ Customer Auth middleware: Customer ${decoded.email} not found or inactive in tenant DB.`)
      return res.status(401).json({ message: "Not authorized, customer not found or inactive" })
    }

    next()
  } catch (err) {
    console.error("❌ Customer Auth middleware error:", err.message)
    res.status(401).json({ message: "Customer token is not valid or expired" })
  }
}

module.exports = customerAuthMiddleware
