const mongoose = require("mongoose")

// Map to store active tenant connections
const tenantConnections = new Map()

/**
 * Establishes and returns a Mongoose connection for a given tenant.
 * If a connection for the tenant already exists, it returns the existing one.
 * @param {string} tenantId The unique identifier for the tenant.
 * @returns {Promise<mongoose.Connection>} A promise that resolves to the Mongoose connection.
 */
const getTenantDB = async (tenantId) => {
  if (!tenantId) {
    console.error("❌ getTenantDB: tenantId is undefined or null.")
    throw new Error("Tenant ID is required to get a tenant database connection.")
  }

  const dbUri = process.env.TENANT_DB_URI.replace("<tenantId>", tenantId)

  if (!dbUri || dbUri.includes("<tenantId>")) {
    console.error(`❌ Invalid TENANT_DB_URI for tenant ${tenantId}: ${process.env.TENANT_DB_URI}`)
    throw new Error("TENANT_DB_URI environment variable is not properly configured or missing.")
  }

  if (tenantConnections.has(tenantId)) {
    const existingConnection = tenantConnections.get(tenantId)
    if (existingConnection.readyState === 1) {
      console.log(`🔌 Reusing existing tenant DB connection for ${tenantId}`)
      return existingConnection
    } else {
      console.warn(
        `⚠️ Existing connection for ${tenantId} is not ready (${existingConnection.readyState}). Attempting to reconnect.`,
      )
      tenantConnections.delete(tenantId) // Remove stale connection
    }
  }

  console.log(`📦 Establishing new tenant DB connection for ${tenantId} at ${dbUri}`)
  try {
    const connection = await mongoose.createConnection(dbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Keep trying for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    })

    connection.on("connected", () => {
      console.log(`✅ Tenant DB connected: ${tenantId}`)
    })
    connection.on("error", (err) => {
      console.error(`❌ Tenant DB connection error for ${tenantId}:`, err)
    })
    connection.on("disconnected", () => {
      console.warn(`🔌 Tenant DB disconnected: ${tenantId}`)
      tenantConnections.delete(tenantId) // Remove from map on disconnect
    })

    tenantConnections.set(tenantId, connection)
    return connection
  } catch (error) {
    console.error(`❌ Failed to connect to tenant DB for ${tenantId}:`, error)
    throw error
  }
}

/**
 * Closes all active tenant database connections.
 * This is useful for graceful shutdown.
 */
const closeAllTenantDBs = async () => {
  console.log("Closing all tenant database connections...")
  const closePromises = []
  for (const [tenantId, connection] of tenantConnections.entries()) {
    if (connection.readyState === 1) {
      closePromises.push(
        connection
          .close()
          .then(() => {
            console.log(`🔌 Tenant DB connection closed: ${tenantId}`)
            tenantConnections.delete(tenantId)
          })
          .catch((err) => {
            console.error(`❌ Error closing tenant DB connection for ${tenantId}:`, err)
          }),
      )
    } else {
      console.log(`🔌 Tenant DB connection for ${tenantId} was not open, removing from map.`)
      tenantConnections.delete(tenantId)
    }
  }
  await Promise.all(closePromises)
  console.log("All tenant database connections closed.")
}

module.exports = { getTenantDB, closeAllTenantDBs }
