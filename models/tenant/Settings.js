const mongoose = require("mongoose")

module.exports = (connection) => {
  const settingsSchema = new mongoose.Schema(
    {
      tenantId: { type: String, required: true, unique: true },
      general: {
        storeName: {
          type: String,
          required: true,
          trim: true,
        },
        logoUrl: {
          type: String,
          trim: true,
        },
        banner: String,
        tagline: String,
        contactEmail: {
          type: String,
          trim: true,
          lowercase: true,
        },
        contactPhone: {
          type: String,
          trim: true,
        },
        address: {
          street: String,
          city: String,
          state: String,
          zip: String,
          country: String,
        },
        currency: {
          type: String,
          default: "USD",
          trim: true,
        },
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
        twitter: String,
        instagram: String,
        linkedin: String,
      },
      shippingPolicy: String,
      returnPolicy: String,
      // Theme settings
      theme: {
        primaryColor: { type: String, default: "#007bff" },
        secondaryColor: { type: String, default: "#6c757d" },
        fontFamily: { type: String, default: "Arial, sans-serif" },
      },
      // Payment gateway settings (e.g., Stripe API keys, PayPal client IDs)
      paymentGateways: {
        stripe: {
          publicKey: String,
          secretKey: String,
          isActive: { type: Boolean, default: false },
        },
        paypal: {
          clientId: String,
          clientSecret: String,
          isActive: { type: Boolean, default: false },
        },
      },
      // Shipping settings
      shippingOptions: [
        {
          name: String,
          cost: Number,
          minOrderAmount: Number, // Minimum order amount for this option to be available
          isActive: { type: Boolean, default: true },
        },
      ],
      // Tax settings
      taxRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 1, // As a percentage (e.g., 0.05 for 5%)
      },
      // Other general settings
      maintenanceMode: {
        type: Boolean,
        default: false,
      },
      // Add any other global store settings here
    },
    { timestamps: true },
  )

  // Ensure only one settings document exists per tenant
  settingsSchema.index(
    { "general.storeName": 1 },
    { unique: true, partialFilterExpression: { "general.storeName": { $exists: true } } },
  )

  return connection.models.Settings || connection.model("Settings", settingsSchema)
}
