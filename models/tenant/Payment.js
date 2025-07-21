const mongoose = require("mongoose")

module.exports = (tenantDB) => {
  const paymentSchema = new mongoose.Schema(
    {
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
      },
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
      },
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        required: true,
        default: "USD",
      },
      method: {
        type: String,
        required: true,
        enum: ["credit_card", "paypal", "stripe", "cash_on_delivery", "other"],
      },
      transactionId: {
        type: String,
        unique: true,
        sparse: true, // Allows null values to not violate unique constraint
      },
      status: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded"],
        default: "pending",
      },
      paymentDate: {
        type: Date,
        default: Date.now,
      },
      notes: String,
    },
    { timestamps: true },
  )

  return tenantDB.model("Payment", paymentSchema)
}
