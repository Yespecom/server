const mongoose = require("mongoose")

const PendingRegistrationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "verified", "completed"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    verifiedAt: {
      type: Date,
    },
  },
  { timestamps: true },
)

// Index for faster lookup and cleanup
PendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // Automatically delete expired documents

module.exports = mongoose.model("PendingRegistration", PendingRegistrationSchema)
