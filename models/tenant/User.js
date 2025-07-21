const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

module.exports = (connection) => {
  const tenantUserSchema = new mongoose.Schema(
    {
      tenantId: { type: String, required: true },
      email: {
        type: String,
        required: true,
        unique: true, // Unique within the tenant's user collection
        lowercase: true,
        trim: true,
      },
      password: {
        type: String,
        required: true,
      },
      name: { type: String },
      phone: { type: String },
      role: {
        type: String,
        enum: ["admin", "staff"], // Roles within the tenant's context
        default: "admin",
      },
      hasStore: {
        type: Boolean,
        default: false,
      },
      storeInfo: {
        name: String,
        logoUrl: String,
        theme: {
          primaryColor: String,
          secondaryColor: String,
        },
        // Add other store-specific settings here
      },
      isActive: {
        type: Boolean,
        default: true,
      },
    },
    { timestamps: true },
  )

  // Hash password before saving
  tenantUserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
      return next()
    }
    try {
      const salt = await bcrypt.genSalt(12)
      this.password = await bcrypt.hash(this.password, salt)
      next()
    } catch (err) {
      next(err)
    }
  })

  return connection.models.TenantUser || connection.model("TenantUser", tenantUserSchema)
}
