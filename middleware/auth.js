const jwt = require("jsonwebtoken")
const { getMainDb } = require("../db/connection")
const User = require("../models/User")(getMainDb()) // Pass the main DB connection

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Auth: No token provided or invalid format.")
    return res.status(401).json({ error: "No token provided or invalid format." })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log("✅ Auth: Token decoded successfully for user:", decoded.email)

    // Fetch user from the main database to ensure they are still active
    const user = await User.findById(decoded.userId)

    if (!user || !user.isActive) {
      console.log("❌ Auth: User not found or inactive after token verification.")
      return res.status(401).json({ error: "Unauthorized: User not found or inactive." })
    }

    req.user = user // Attach the user object to the request
    req.userId = decoded.userId
    req.tenantId = decoded.tenantId // Attach tenantId from JWT for convenience
    next()
  } catch (error) {
    console.error("❌ Auth: Token verification failed:", error.message)
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Unauthorized: Token expired." })
    }
    return res.status(401).json({ error: "Unauthorized: Invalid token." })
  }
}

module.exports = authMiddleware
