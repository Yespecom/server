const jwt = require("jsonwebtoken")

const customerAuthMiddleware = async (req, res, next) => {
  try {
    console.log("🔐 Customer auth middleware started")

    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      console.log("❌ No customer token provided")
      return res.status(401).json({ error: "Access denied. Please login." })
    }

    console.log("🔍 Customer token found, verifying...")
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
    console.log("✅ Customer token verified:", {
      customerId: decoded.customerId,
      email: decoded.email,
      storeId: decoded.storeId,
    })

    // Verify store context: req.tenantDB and req.storeId should already be set by storeContextMiddleware
    if (!req.tenantDB || !req.storeId) {
      console.error("❌ Customer auth middleware: Missing store context (tenantDB or storeId).")
      return res.status(500).json({ error: "Internal server error: Store context not available." })
    }

    // Crucial security check: Ensure the storeId in the token matches the storeId in the URL path
    if (decoded.storeId !== req.storeId) {
      console.error("❌ Customer auth middleware: Token storeId mismatch with URL storeId.", {
        tokenStoreId: decoded.storeId,
        urlStoreId: req.storeId,
      })
      return res.status(401).json({ error: "Access denied. Token is not valid for this store." })
    }

    // Get customer from tenant database
    const Customer = require("../models/tenant/Customer")(req.tenantDB)
    const customer = await Customer.findById(decoded.customerId)

    if (!customer) {
      console.log("❌ Customer not found for ID:", decoded.customerId)
      return res.status(401).json({ error: "Invalid token - customer not found." })
    }

    console.log("✅ Customer found:", customer.email || customer.phone)

    // Set customer info on request object
    req.customer = customer
    req.customerId = customer._id

    console.log("✅ Customer auth middleware completed successfully")
    next()
  } catch (error) {
    console.error("❌ Customer auth middleware error:", error)

    // Provide more specific error messages
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token format." })
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please login again." })
    }

    res.status(500).json({
      error: "Authentication failed.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

module.exports = customerAuthMiddleware
