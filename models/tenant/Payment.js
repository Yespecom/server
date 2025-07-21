const mongoose = require("mongoose")

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
    },
    orderId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    method: {
      type: String,
      enum: ["razorpay", "stripe", "cod"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    gatewayResponse: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  },
)

module.exports = (connection) => connection.model("Payment", paymentSchema)
