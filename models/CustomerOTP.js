const mongoose = require("mongoose")

// This model is marked as deprecated in the previous chat summary.
// It's included here for completeness based on the provided file list,
// but its usage might be replaced by the main OTP model with a 'customer_login' purpose.

const CustomerOTPSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    tenantId: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
)

// Static method to create a new Customer OTP
CustomerOTPSchema.statics.createCustomerOTP = async function (email, tenantId) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString() // 6-digit OTP
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // OTP valid for 5 minutes

  // Invalidate any existing unused OTPs for the same email and tenant
  await this.updateMany({ email, tenantId, isUsed: false, expiresAt: { $gt: new Date() } }, { $set: { isUsed: true } })

  const newOTP = await this.create({
    email,
    tenantId,
    otp,
    expiresAt,
  })
  return newOTP.otp
}

// Static method to verify a Customer OTP
CustomerOTPSchema.statics.verifyCustomerOTP = async function (email, tenantId, otp) {
  const otpDoc = await this.findOne({
    email,
    tenantId,
    otp,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  })

  if (!otpDoc) {
    return null // OTP not found or expired
  }

  // OTP is valid, mark as used
  otpDoc.isUsed = true
  await otpDoc.save()
  return otpDoc
}

module.exports = mongoose.model("CustomerOTP", CustomerOTPSchema)
