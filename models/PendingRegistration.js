const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const pendingRegistrationSchema = new mongoose.Schema(
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
      trim: true,
    },
    phone: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // Expires in 10 minutes
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema)
