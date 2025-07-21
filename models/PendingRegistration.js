const mongoose = require("mongoose")

const pendingRegistrationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  storeName: {
    type: String,
    required: true,
    trim: true,
  },
  storeId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // Expires in 10 minutes (600 seconds)
  },
})

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema)
