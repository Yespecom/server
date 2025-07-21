const mongoose = require("mongoose")

const orderSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    customer: {
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
    },
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    shippingCharges: {
      type: Number,
      default: 0,
    },
    totalAmount: { type: Number, required: true, min: 0 },
    appliedOffer: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Offer",
      },
      name: String,
      type: String,
      value: Number,
      discount: Number,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    shippingAddress: {
      street: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    },
    notes: String,
    trackingNumber: String,
  },
  {
    timestamps: true,
  },
)

// Indexes for better performance
orderSchema.index({ orderId: 1 })
orderSchema.index({ customerId: 1 })
orderSchema.index({ status: 1 })
orderSchema.index({ paymentStatus: 1 })
orderSchema.index({ createdAt: -1 })

// Virtual for order total items count
orderSchema.virtual("itemsCount").get(function () {
  return this.products.reduce((total, product) => total + product.quantity, 0)
})

// Instance methods
orderSchema.methods.updateStatus = function (newStatus) {
  this.status = newStatus
  return this.save()
}

orderSchema.methods.updatePaymentStatus = function (newStatus, paymentId = null) {
  this.paymentStatus = newStatus
  if (paymentId) {
    this.paymentId = paymentId
  }
  return this.save()
}

// Static methods
orderSchema.statics.findByCustomer = function (customerId) {
  return this.find({ customerId }).sort({ createdAt: -1 })
}

orderSchema.statics.findByStatus = function (status) {
  return this.find({ status }).sort({ createdAt: -1 })
}

orderSchema.statics.getTotalRevenue = function () {
  return this.aggregate([
    { $match: { status: { $in: ["confirmed", "shipped", "delivered"] } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ])
}

module.exports = (connection) => connection.models.Order || connection.model("Order", orderSchema)
