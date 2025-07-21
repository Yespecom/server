const mongoose = require("mongoose")

const OTPSchema = new mongoose.Schema({
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
    enum: ["registration", "password_reset", "login", "customer_registration", "customer_login"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // OTP expires in 10 minutes (600 seconds)
  },
})

OTPSchema.statics.createOTP = async function (email, purpose) {
  // Delete any existing OTPs for this email and purpose
  await this.deleteMany({ email, purpose })

  const otp = Math.floor(100000 + Math.random() * 900000).toString() // 6-digit OTP
  await this.create({ email, otp, purpose })
  return otp
}

OTPSchema.statics.verifyOTP = async function (email, otp, purpose) {
  const record = await this.findOne({ email, otp, purpose })

  if (!record) {
    return { success: false, message: "Invalid or expired OTP." }
  }

  // OTP is valid, delete it to prevent reuse
  await this.deleteOne({ _id: record._id })
  return { success: true, message: "OTP verified successfully." }
}

module.exports = mongoose.model("OTP", OTPSchema)
