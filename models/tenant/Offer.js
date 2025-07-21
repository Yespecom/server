const mongoose = require("mongoose")

module.exports = (tenantDB) => {
  const offerSchema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      discountType: {
        type: String,
        enum: ["percentage", "fixed_amount"],
        required: true,
      },
      discountValue: {
        type: Number,
        required: true,
        min: 0,
      },
      applicableTo: {
        type: String,
        enum: ["all_products", "specific_products", "specific_categories"],
        default: "all_products",
      },
      productIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
      ],
      categoryIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      minimumOrderAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      usageLimit: {
        type: Number,
        min: 0,
        default: 0, // 0 means unlimited
      },
      timesUsed: {
        type: Number,
        default: 0,
      },
    },
    { timestamps: true },
  )

  return tenantDB.model("Offer", offerSchema)
}
