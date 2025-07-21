const mongoose = require("mongoose")

// DEPRECATED: This model is kept for legacy support only
// Use Firebase Phone Authentication instead

const customerOtpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["login", "registration"],
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
    storeId: {
      type: String,
      required: true,
    },
    deprecated: {
      type: Boolean,
      default: true, // Mark all new entries as deprecated
    },
  },
  {
    timestamps: true,
  },
)

// Index for automatic deletion of expired documents
customerOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Index for faster queries
customerOtpSchema.index({ phone: 1, purpose: 1, storeId: 1 })

// Generate 6-digit OTP
customerOtpSchema.statics.generateOTP = () => {
  console.log(`⚠️  CustomerOTP.generateOTP is deprecated. Use Firebase Phone Authentication instead.`)
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Create and save OTP for customer
customerOtpSchema.statics.createCustomerOTP = async function (phone, purpose, storeId) {
  console.log(`⚠️  CustomerOTP.createCustomerOTP is deprecated. Use Firebase Phone Authentication instead.`)

  // Remove any existing OTPs for this phone, purpose, and store
  await this.deleteMany({ phone, purpose, storeId })

  const otp = this.generateOTP()
  const otpDoc = new this({
    phone,
    otp,
    purpose,
    storeId,
    deprecated: true,
  })

  await otpDoc.save()
  return otp
}

// Verify OTP for customer
customerOtpSchema.statics.verifyCustomerOTP = async function (phone, otp, purpose, storeId) {
  console.log(`⚠️  CustomerOTP.verifyCustomerOTP is deprecated. Use Firebase Phone Authentication instead.`)

  const otpDoc = await this.findOne({
    phone,
    purpose,
    storeId,
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

  // Mark as used and delete
  await otpDoc.deleteOne()

  return { success: true, message: "OTP verified successfully" }
}

// Clean expired OTPs
customerOtpSchema.statics.cleanExpired = async function () {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
  })
  console.log(`🧹 Cleaned ${result.deletedCount} expired customer OTPs`)
  return result.deletedCount
}

module.exports = (connection) => connection.model("CustomerOTP", customerOtpSchema)
