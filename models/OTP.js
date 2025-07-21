const mongoose = require("mongoose")

const OTPSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["registration", "password_reset", "customer_login"], // Define purposes
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
)

// Static method to create a new OTP
OTPSchema.statics.createOTP = async function (email, purpose) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString() // 6-digit OTP
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // OTP valid for 10 minutes

  // Invalidate any existing unused OTPs for the same email and purpose
  await this.updateMany(
    { email, purpose, isUsed: false, expiresAt: { $gt: new Date() } },
    { $set: { isUsed: true } }, // Mark as used or expired
  )

  const newOTP = await this.create({
    email,
    otp,
    purpose,
    expiresAt,
  })
  return newOTP.otp // Return the OTP string
}

// Static method to verify an OTP
OTPSchema.statics.verifyOTP = async function (email, otp, purpose) {
  const otpDoc = await this.findOne({
    email,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() }, // Must not be expired
  })

  if (!otpDoc) {
    return null // OTP not found or expired
  }

  if (otpDoc.attempts >= 3) {
    // Too many attempts, invalidate OTP
    otpDoc.isUsed = true
    await otpDoc.save()
    return null
  }

  if (otpDoc.otp !== otp) {
    otpDoc.attempts += 1
    await otpDoc.save()
    return null // OTP mismatch
  }

  // OTP is valid, mark as used
  otpDoc.isUsed = true
  await otpDoc.save()
  return otpDoc
}

module.exports = mongoose.model("OTP", OTPSchema)
