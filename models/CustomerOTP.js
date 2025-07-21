const mongoose = require("mongoose")

// This model is marked as deprecated in the original project.
// It's kept here for completeness but might not be actively used.

const customerOtpSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300, // OTP expires in 5 minutes (300 seconds)
  },
  tenantId: {
    type: String,
    required: true,
  },
})

module.exports = mongoose.model("CustomerOTP", customerOtpSchema)
