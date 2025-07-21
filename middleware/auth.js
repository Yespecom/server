const jwt = require("jsonwebtoken")
const { getMainDb } = require("../db/connection")
const UserModel = require("../models/User") // Use the function to get the model
const { getTenantDB } = require("../config/tenantDB")
const TenantUserModel = require("../models/tenant/User") // Use the function to get the model

const protect = async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1]

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")

      // Get main DB connection
      const mainConnection = getMainDb()
      const User = UserModel(mainConnection)

      // Get user from the main DB (for tenantId lookup)
      const mainUser = await User.findById(decoded.userId).select("-password")

      if (!mainUser) {
        return res.status(401).json({ error: "Not authorized, user not found in main DB" })
      }

      // Get tenant DB connection
      const tenantDB = await getTenantDB(mainUser.tenantId)
      const TenantUser = TenantUserModel(tenantDB)

      // Get user from the tenant DB (for full user data)
      const tenantUser = await TenantUser.findById(decoded.userId).select("-password")

      if (!tenantUser) {
        return res.status(401).json({ error: "Not authorized, user not found in tenant DB" })
      }

      // Attach both mainUser and tenantUser to the request
      req.mainUser = mainUser
      req.user = tenantUser // This is the full user object for the tenant
      req.tenantId = mainUser.tenantId // Ensure tenantId is available
      next()
    } catch (error) {
      console.error("Auth middleware error:", error)
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

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `User role ${req.user ? req.user.role : "unknown"} is not authorized to access this route`,
      })
    }
    next()
  }
}

module.exports = { protect, authorizeRoles }
