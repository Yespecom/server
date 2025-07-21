const mongoose = require("mongoose")

const settingsSchema = new mongoose.Schema(
  {
    general: {
      storeName: String,
      logo: String,
      banner: String,
      tagline: String,
      supportEmail: String,
      supportPhone: String,
    },
    payment: {
      razorpayKeyId: String,
      razorpayKeySecret: String,
      stripePublicKey: String,
      stripeSecretKey: String,
      codEnabled: {
        type: Boolean,
        default: true,
      },
    },
    social: {
      instagram: String,
      whatsapp: String,
      facebook: String,
    },
    shipping: {
      deliveryTime: String,
      charges: Number,
      freeShippingAbove: Number,
      availabilityArea: [String],
    },
  },
  {
    timestamps: true,
  },
)

module.exports = (connection) => connection.model("Settings", settingsSchema)
