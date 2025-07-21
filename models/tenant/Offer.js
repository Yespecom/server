const mongoose = require("mongoose")

module.exports = (connection) => {
  const offerSchema = new mongoose.Schema(
    {
      tenantId: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String },
      discountType: {
        type: String,
        enum: ["percentage", "fixed_amount"],
        required: true,
      },
      discountValue: { type: Number, required: true, min: 0 },
      minimumPurchaseAmount: { type: Number, default: 0, min: 0 },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      isActive: { type: Boolean, default: true },
      appliesTo: {
        type: String,
        enum: ["all_products", "specific_products", "specific_categories"],
        default: "all_products",
      },
      productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      usageLimit: { type: Number, default: null }, // null for unlimited
      usedCount: { type: Number, default: 0 },
    },
    { timestamps: true },
  )

  return connection.models.Offer || connection.model("Offer", offerSchema)
}
