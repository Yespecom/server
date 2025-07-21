const jwt = require("jsonwebtoken")
const { getTenantDB } = require("../config/tenantDB")
const Customer = require("../models/tenant/Customer") // Customer model factory

const customerAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Customer Auth: No token provided or invalid format.")
    return res.status(401).json({ error: "No customer token provided or invalid format." })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log("✅ Customer Auth: Token decoded successfully for customer:", decoded.email)

    // Ensure tenantId is available from a previous middleware (e.g., storeContextMiddleware)
    if (!req.tenantId) {
      console.error("❌ Customer Auth: tenantId not set in request. Store context missing.")
      return res.status(500).json({ error: "Internal server error: Store context not established." })
    }

    const tenantDB = req.tenantDB // Should be set by storeContextMiddleware
    if (!tenantDB) {
      console.error("❌ Customer Auth: Tenant DB connection not available in request.")
      return res.status(500).json({ error: "Internal server error: Tenant database not connected." })
    }

    const CustomerModel = Customer(tenantDB)
    const customer = await CustomerModel.findById(decoded.customerId)

    if (!customer || !customer.isActive) {
      console.log("❌ Customer Auth: Customer not found or inactive after token verification.")
      return res.status(401).json({ error: "Unauthorized: Customer not found or inactive." })
    }

    req.customer = customer // Attach the customer object to the request
    req.customerId = decoded.customerId
    next()
  } catch (error) {
    console.error("❌ Customer Auth: Token verification failed:", error.message)
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Unauthorized: Customer token expired." })
    }
    return res.status(401).json({ error: "Unauthorized: Invalid customer token." })
  }
}

module.exports = customerAuthMiddleware
