const mongoose = require("mongoose")

module.exports = (connection) => {
  const paymentSchema = new mongoose.Schema(
    {
      tenantId: { type: String, required: true },
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
      amount: { type: Number, required: true, min: 0 },
      paymentMethod: {
        type: String,
        enum: ["credit_card", "paypal", "cash_on_delivery", "bank_transfer", "other"],
        required: true,
      },
      transactionId: { type: String, unique: true, sparse: true }, // Unique if present
      status: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded"],
        default: "pending",
      },
      paymentDate: { type: Date, default: Date.now },
      notes: String,
    },
    { timestamps: true },
  )

  return connection.models.Payment || connection.model("Payment", paymentSchema)
}
