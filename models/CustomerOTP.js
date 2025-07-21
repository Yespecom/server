const mongoose = require("mongoose")

// This model is deprecated as OTP.js now handles customer OTPs as well.
// Keeping it for reference if needed, but it's not actively used in the current setup.

const CustomerOTPSchema = new mongoose.Schema({
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
    enum: ["registration", "login"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // OTP expires in 10 minutes (600 seconds)
  },
})

CustomerOTPSchema.statics.createOTP = async function (phone, purpose) {
  await this.deleteMany({ phone, purpose }) // Delete any existing OTPs
  const otp = Math.floor(100000 + Math.random() * 900000).toString() // 6-digit OTP
  await this.create({ phone, otp, purpose })
  return otp
}

CustomerOTPSchema.statics.verifyOTP = async function (phone, otp, purpose) {
  const record = await this.findOne({ phone, otp, purpose })
  if (!record) {
    return { success: false, message: "Invalid or expired OTP." }
  }
  await this.deleteOne({ _id: record._id }) // Delete after successful verification
  return { success: true, message: "OTP verified successfully." }
}

module.exports = mongoose.model("CustomerOTP", CustomerOTPSchema)
