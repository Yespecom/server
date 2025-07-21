const { getMainDb } = require("../db/connection")
const User = require("../models/User") // Import the User model function

async function checkMainUsers() {
  try {
    // Ensure environment variables are loaded if this script is run standalone
    require("dotenv").config()

    if (!process.env.MAIN_DB_URI) {
      console.error("❌ MAIN_DB_URI environment variable is not set.")
      return
    }

    const mainConnection = getMainDb()
    const UserModel = User(mainConnection) // Get the User model for the main connection

    console.log("🔍 Checking users in the main database...")

    const users = await UserModel.find({})

    if (users.length === 0) {
      console.log("⚠️ No users found in the main database.")
    } else {
      console.log(`✅ Found ${users.length} user(s) in the main database:`)
      users.forEach((user) => {
        console.log(
          `  - Email: ${user.email}, Tenant ID: ${user.tenantId}, Active: ${user.isActive}, Role: ${user.role}`,
        )
        // You can also check password hash format if needed
        if (user.password && !user.password.startsWith("$2a$")) {
          console.warn(`    ⚠️ Warning: Password for ${user.email} might not be bcrypt hashed.`)
        }
      })
    }
  } catch (error) {
    console.error("❌ Error checking main users:", error)
  } finally {
    // It's good practice to close the connection if this script is meant to run and exit
    // However, if the main app is running, the connection should stay open.
    // For a standalone script, you might want to close it:
    // const mainConnection = getMainDb();
    // if (mainConnection && mainConnection.readyState === 1) {
    //   await mainConnection.close();
    //   console.log("🔌 Main database connection closed after check.");
    // }
  }
}

// Execute the function if the script is run directly
if (require.main === module) {
  checkMainUsers()
} else {
  // If imported as a module, export the function
  module.exports = checkMainUsers
}
