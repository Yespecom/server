const jwt = require("jsonwebtoken")
const { getTenantDB } = require("../config/tenantDB")
const CustomerModel = require("../models/tenant/Customer") // Use the function to get the model

const protectCustomer = async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1]

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")

      // Ensure tenantId is present in the decoded token
      if (!decoded.tenantId) {
        return res.status(401).json({ error: "Not authorized, tenant ID missing in token" })
      }

      // Get tenant DB connection
      const tenantDB = await getTenantDB(decoded.tenantId)
      const Customer = CustomerModel(tenantDB)

      // Find customer in the tenant DB
      const customer = await Customer.findById(decoded.customerId).select("-password")

      if (!customer) {
        return res.status(401).json({ error: "Not authorized, customer not found" })
      }

      req.customer = customer
      req.tenantId = decoded.tenantId // Make tenantId available for customer routes
      next()
    } catch (error) {
      console.error("Customer auth middleware error:", error)
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Not authorized, invalid token" })
      }
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Not authorized, token expired" })
      }
      res.status(401).json({ error: "Not authorized, token failed" })
    }
  }

  if (!token) {
    res.status(401).json({ error: "Not authorized, no token" })
  }
}

module.exports = { protectCustomer }
