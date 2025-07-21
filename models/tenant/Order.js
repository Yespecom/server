const mongoose = require("mongoose")

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
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
      address: {
        name: String,
        street: {
          type: String,
          required: true,
        },
        landmark: String,
        city: {
          type: String,
          required: true,
        },
        state: {
          type: String,
          required: true,
        },
        pincode: {
          type: String,
          required: true,
        },
        country: {
          type: String,
          default: "India",
        },
      },
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        total: {
          type: Number,
          required: true,
        },
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
    totalAmount: {
      type: Number,
      required: true,
    },
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
      enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay", "stripe", "cod"],
      default: "cod",
    },
    paymentId: String,
    paymentStatus: {
      type: String,
      enum: ["pending", "processing", "success", "failed", "cancelled"],
      default: "pending",
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
orderSchema.index({ "customer.id": 1 })
orderSchema.index({ "customer.email": 1 })
orderSchema.index({ status: 1 })
orderSchema.index({ paymentStatus: 1 })
orderSchema.index({ createdAt: -1 })

// Virtual for order total items count
orderSchema.virtual("itemsCount").get(function () {
  return this.items.reduce((total, item) => total + item.quantity, 0)
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
  return this.find({ "customer.id": customerId }).sort({ createdAt: -1 })
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

module.exports = (connection) => connection.model("Order", orderSchema)
