const jwt = require("jsonwebtoken")
const User = require("../models/User")
const { getTenantDB } = require("../config/tenantDB")

const authMiddleware = async (req, res, next) => {
  try {
    console.log("🔐 Auth middleware started")

    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      console.log("❌ No token provided")
      return res.status(401).json({ error: "Access denied. No token provided." })
    }

    console.log("🔍 Token found, verifying...")
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
    console.log("✅ Token verified:", { email: decoded.email, userId: decoded.userId })

    // Get main user for tenant lookup
    const mainUser = await User.findOne({ email: decoded.email })

    if (!mainUser) {
      console.log("❌ Main user not found for email:", decoded.email)
      return res.status(401).json({ error: "Invalid token - user not found." })
    }

    console.log("✅ Main user found:", {
      tenantId: mainUser.tenantId,
      storeId: mainUser.storeId,
    })

    // Get tenant database connection with proper error handling
    let tenantDB
    try {
      console.log("🔍 Getting tenant database for:", mainUser.tenantId)
      tenantDB = await getTenantDB(mainUser.tenantId)

      if (!tenantDB) {
        console.error("❌ getTenantDB returned null/undefined")
        return res.status(500).json({ error: "Database connection failed - no connection returned" })
      }

      console.log("✅ Tenant DB connection successful:", {
        readyState: tenantDB.readyState,
        name: tenantDB.name,
      })
    } catch (dbError) {
      console.error("❌ Tenant DB connection error:", dbError)
      return res.status(500).json({
        error: "Database connection failed",
        details: dbError.message,
      })
    }

    // Get tenant user data
    try {
      console.log("🔍 Loading tenant user model...")
      const TenantUser = require("../models/tenant/User")(tenantDB)

      console.log("🔍 Finding tenant user with ID:", decoded.userId)
      const tenantUser = await TenantUser.findById(decoded.userId)

      if (!tenantUser) {
        console.log("❌ Tenant user not found for ID:", decoded.userId)
        return res.status(401).json({ error: "Invalid token - tenant user not found." })
      }

      console.log("✅ Tenant user found:", tenantUser.email)

      // Set all required properties on req object
      req.user = tenantUser
      req.tenantId = mainUser.tenantId
      req.storeId = mainUser.storeId
      req.tenantDB = tenantDB

      console.log("✅ Auth middleware completed successfully")
      next()
    } catch (userError) {
      console.error("❌ Error loading tenant user:", userError)
      return res.status(500).json({
        error: "Failed to load user data",
        details: userError.message,
      })
    }
  } catch (error) {
    console.error("❌ Auth middleware error:", error)

    // Provide more specific error messages
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token format." })
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired." })
    }

    res.status(500).json({
      error: "Authentication failed.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

module.exports = authMiddleware
