const mongoose = require("mongoose")

module.exports = (connection) => {
  const settingsSchema = new mongoose.Schema(
    {
      tenantId: { type: String, required: true, unique: true },
      general: {
        storeName: { type: String, required: true },
        logoUrl: { type: String },
        banner: String,
        tagline: String,
        contactEmail: { type: String },
        contactPhone: { type: String },
        address: {
          street: String,
          city: String,
          state: String,
          zip: String,
          country: String,
        },
        currency: { type: String, default: "USD" },
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
      socialLinks: {
        facebook: String,
        instagram: String,
        twitter: String,
      },
      shippingPolicy: String,
      returnPolicy: String,
    },
    { timestamps: true },
  )

  return connection.models.Settings || connection.model("Settings", settingsSchema)
}
