const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const tenantUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "staff"],
      default: "owner",
    },
    hasStore: {
      type: Boolean,
      default: false,
    },
    storeInfo: {
      name: String,
      logo: String,
      banner: String,
      storeId: String,
      industry: String,
      isActive: {
        type: Boolean,
        default: false,
      },
    },
    permissions: {
      products: { type: Boolean, default: true },
      orders: { type: Boolean, default: true },
      customers: { type: Boolean, default: true },
      offers: { type: Boolean, default: true },
      categories: { type: Boolean, default: true },
      settings: { type: Boolean, default: true },
      payments: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  },
)

tenantUserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

tenantUserSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password)
}

module.exports = (connection) => connection.model("TenantUser", tenantUserSchema)
