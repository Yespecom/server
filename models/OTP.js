const mongoose = require("mongoose")

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["registration", "login", "password_reset", "email_change"],
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      max: 3,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    },
  },
  {
    timestamps: true,
  },
)

// Index for automatic deletion of expired documents
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Index for faster queries
otpSchema.index({ email: 1, purpose: 1 })

// Generate 6-digit OTP
otpSchema.statics.generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

// Create and save OTP
otpSchema.statics.createOTP = async function (email, purpose) {
  // Remove any existing OTPs for this email and purpose
  await this.deleteMany({ email, purpose })

  const otp = this.generateOTP()
  const otpDoc = new this({
    email,
    otp,
    purpose,
  })

  await otpDoc.save()
  return otp
}

// Verify OTP (for registration - consumes the OTP)
otpSchema.statics.verifyOTP = async function (email, otp, purpose) {
  const otpDoc = await this.findOne({
    email,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  })

  if (!otpDoc) {
    return { success: false, message: "Invalid or expired OTP" }
  }

  // Check attempts
  if (otpDoc.attempts >= 3) {
    await otpDoc.deleteOne()
    return { success: false, message: "Too many failed attempts. Please request a new OTP." }
  }

  // Check OTP match
  if (otpDoc.otp !== otp) {
    otpDoc.attempts += 1
    await otpDoc.save()
    return {
      success: false,
      message: `Invalid OTP. ${3 - otpDoc.attempts} attempts remaining.`,
    }
  }

  // Mark as used and delete (only for registration)
  if (purpose === "registration") {
    await otpDoc.deleteOne()
  }

  return { success: true, message: "OTP verified successfully" }
}

// Check OTP without consuming it (for password reset verification step)
otpSchema.statics.checkOTP = async function (email, otp, purpose) {
  const otpDoc = await this.findOne({
    email,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  })

  if (!otpDoc) {
    return { success: false, message: "Invalid or expired OTP" }
  }

  // Check attempts
  if (otpDoc.attempts >= 3) {
    await otpDoc.deleteOne()
    return { success: false, message: "Too many failed attempts. Please request a new OTP." }
  }

  // Check OTP match
  if (otpDoc.otp !== otp) {
    otpDoc.attempts += 1
    await otpDoc.save()
    return {
      success: false,
      message: `Invalid OTP. ${3 - otpDoc.attempts} attempts remaining.`,
    }
  }

  return { success: true, message: "OTP verified successfully" }
}

// Clean expired OTPs (optional manual cleanup)
otpSchema.statics.cleanExpired = async function () {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
  })
  console.log(`🧹 Cleaned ${result.deletedCount} expired OTPs`)
  return result.deletedCount
}

module.exports = mongoose.model("OTP", otpSchema)
