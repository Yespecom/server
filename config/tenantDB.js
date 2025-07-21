const mongoose = require("mongoose")

const tenantConnections = {}

const getTenantDB = async (tenantId) => {
  if (!tenantId) {
    throw new Error("Tenant ID is required to get tenant database connection.")
  }

  if (tenantConnections[tenantId]) {
    return tenantConnections[tenantId]
  }

  const tenantDbUri = process.env.TENANT_DB_URI.replace("<tenantId>", tenantId)

  try {
    const connection = await mongoose.createConnection(tenantDbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    })

    connection.on("connected", () => {
      console.log(`✅ Tenant DB Connected: ${tenantId}`)
    })

    connection.on("error", (err) => {
      console.error(`❌ Tenant DB Connection Error for ${tenantId}:`, err)
    })

    connection.on("disconnected", () => {
      console.log(`🔌 Tenant DB Disconnected: ${tenantId}`)
      delete tenantConnections[tenantId] // Remove from cache on disconnect
    })

    tenantConnections[tenantId] = connection
    return connection
  } catch (error) {
    console.error(`❌ Failed to connect to tenant DB ${tenantId}:`, error)
    throw error
  }
}

const closeAllTenantDBs = async () => {
  console.log("Closing all tenant database connections...")
  const promises = Object.values(tenantConnections).map((conn) => {
    if (conn.readyState === 1) {
      // Check if connection is open
      return conn.close()
    }
    return Promise.resolve()
  })
  await Promise.all(promises)
  console.log("All tenant database connections closed.")
}

module.exports = { getTenantDB, closeAllTenantDBs }
