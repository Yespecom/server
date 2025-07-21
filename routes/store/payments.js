const express = require("express")
const router = express.Router()
const Payment = require("../../models/tenant/Payment") // Payment model factory
const Order = require("../../models/tenant/Order") // Order model factory
const customerAuthMiddleware = require("../../middleware/customerAuth") // Customer authentication

// Middleware to ensure tenantDB is available (should be set by storeContextMiddleware)
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Process a new payment (e.g., from a checkout page)
router.post("/process", customerAuthMiddleware, async (req, res) => {
  try {
    const PaymentModel = Payment(req.tenantDB)
    const OrderModel = Order(req.tenantDB)

    const { orderId, amount, currency, method, transactionId, paymentDetails } = req.body
    const customerId = req.customerId // From customerAuthMiddleware

    if (!orderId || !amount || !method) {
      return res.status(400).json({ error: "Order ID, amount, and payment method are required." })
    }

    const order = await OrderModel.findById(orderId)
    if (!order || order.customerId.toString() !== customerId) {
      return res.status(404).json({ error: "Order not found or does not belong to you." })
    }

    if (order.totalAmount !== amount) {
      return res.status(400).json({ error: "Payment amount does not match order total." })
    }

    // Simulate payment gateway processing (replace with actual Stripe/PayPal integration)
    let paymentStatus = "pending"
    const actualTransactionId =
      transactionId || `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // In a real application, you'd call a payment gateway API here
    // Example: const stripeCharge = await stripe.charges.create(...)
    // Based on the gateway response, set paymentStatus to 'completed' or 'failed'

    // For demonstration, assume success
    paymentStatus = "completed"
    console.log(`✅ Simulated payment processed for Order ${orderId}. Status: ${paymentStatus}`)

    const newPayment = new PaymentModel({
      orderId,
      customerId,
      amount,
      currency: currency || order.currency || "USD", // Use order currency or default
      method,
      transactionId: actualTransactionId,
      status: paymentStatus,
      paymentDate: new Date(),
      notes: JSON.stringify(paymentDetails || {}), // Store any additional payment details
    })

    await newPayment.save()

    // Update order status based on payment result
    order.status = paymentStatus === "completed" ? "processing" : "pending"
    order.paymentInfo = {
      method,
      transactionId: actualTransactionId,
      status: paymentStatus,
    }
    await order.save()

    res.status(200).json({
      message: "Payment processed successfully.",
      payment: newPayment,
      orderStatus: order.status,
    })
  } catch (error) {
    console.error("❌ Error processing payment:", error)
    res.status(500).json({ error: "Internal server error during payment processing." })
  }
})

// Get payment details for a specific order (for authenticated customer)
router.get("/order/:orderId", customerAuthMiddleware, async (req, res) => {
  try {
    const PaymentModel = Payment(req.tenantDB)
    const OrderModel = Order(req.tenantDB)

    const order = await OrderModel.findOne({ _id: req.params.orderId, customerId: req.customerId })
    if (!order) {
      return res.status(404).json({ error: "Order not found or does not belong to you." })
    }

    const payments = await PaymentModel.find({ orderId: req.params.orderId, customerId: req.customerId })
    res.status(200).json(payments)
  } catch (error) {
    console.error("❌ Error fetching payments for order:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
