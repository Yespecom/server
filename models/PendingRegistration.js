const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const pendingRegistrationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: false, // Phone can be optional if registration is email-centric
    },
    password: {
      type: String,
      required: true,
    },
    otpSentAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 15 * 60 * 1000), // Expires in 15 minutes
    },
  },
  {
    timestamps: true,
  },
)

// Index for automatic deletion of expired documents
pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Pre-save middleware to hash password
pendingRegistrationSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12)
  }
  next()
})

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema)
