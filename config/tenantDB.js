const mongoose = require("mongoose")

const tenantConnections = {}

const getTenantDB = async (tenantId) => {
  if (tenantConnections[tenantId]) {
    return tenantConnections[tenantId]
  }

  const uri = process.env.TENANT_DB_URI.replace("<tenantId>", tenantId)
  try {
    const connection = await mongoose.createConnection(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    tenantConnections[tenantId] = connection
    console.log(`✅ Tenant DB connected: ${tenantId}`)
    return connection
  } catch (error) {
    console.error(`❌ Error connecting to tenant DB ${tenantId}:`, error)
    throw new Error(`Failed to connect to tenant database: ${error.message}`)
  }
}

module.exports = { getTenantDB }
