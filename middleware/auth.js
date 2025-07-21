const jwt = require("jsonwebtoken")
const { getMainDb } = require("../db/connection")
const User = require("../models/User") // Import the User model function

const authMiddleware = async (req, res, next) => {
  let token

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1]
  }

  if (!token) {
    console.log("❌ Auth middleware: No token provided.")
    return res.status(401).json({ message: "No token, authorization denied" })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded // Attach user payload (email, tenantId, userId, role) to request

    console.log(`✅ Auth middleware: Token verified for user ${decoded.email}, role: ${decoded.role}`)

    // Fetch user from main DB to ensure they are active and exist
    const mainConnection = getMainDb()
    const UserModel = User(mainConnection) // Get the User model for the main connection
    const user = await UserModel.findById(decoded.userId)

    if (!user || !user.isActive) {
      console.log(`❌ Auth middleware: User ${decoded.email} not found or inactive.`)
      return res.status(401).json({ message: "Not authorized, user not found or inactive" })
    }

    // Ensure the user's role is 'admin' for admin routes
    if (req.baseUrl.startsWith("/api/admin") && user.role !== "admin") {
      console.log(`❌ Auth middleware: User ${decoded.email} is not an admin. Role: ${user.role}`)
      return res.status(403).json({ message: "Forbidden: Not an admin user" })
    }

    next()
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message)
    res.status(401).json({ message: "Token is not valid or expired" })
  }
}

module.exports = authMiddleware
