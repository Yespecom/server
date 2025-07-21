const mongoose = require("mongoose")

module.exports = (tenantDB) => {
  const orderSchema = new mongoose.Schema(
    {
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
      },
      products: [
        {
          productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
          },
          name: String,
          price: Number,
          quantity: {
            type: Number,
            required: true,
            min: 1,
          },
        },
      ],
      totalAmount: {
        type: Number,
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
        default: "pending",
      },
      shippingAddress: {
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String,
      },
      paymentInfo: {
        method: String,
        transactionId: String,
        status: String,
      },
      notes: String,
    },
    { timestamps: true },
  )

  return tenantDB.model("Order", orderSchema)
}
