const express = require("express")
const router = express.Router()
const customerAuthMiddleware = require("../../middleware/customerAuth") // Assuming customer auth is needed for payment actions

// Assuming req.tenantModels.Payment, req.tenantModels.Order, req.tenantModels.Customer are available
// and req.customer is available from customerAuthMiddleware

// Initiate a payment for an order (requires customer authentication)
router.post("/initiate", customerAuthMiddleware, async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const Payment = req.tenantModels.Payment
    const { orderId, amount, paymentMethod } = req.body

    if (!orderId || !amount || !paymentMethod) {
      return res.status(400).json({ error: "Order ID, amount, and payment method are required" })
    }

    const order = await Order.findOne({
      _id: orderId,
      tenantId: req.tenantId,
      customerId: req.customer.customerId,
    })
    if (!order) {
      return res.status(404).json({ error: "Order not found or does not belong to this customer" })
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ error: "Order is already paid" })
    }
    if (order.totalAmount !== amount) {
      return res.status(400).json({ error: "Payment amount does not match order total" })
    }

    // In a real application, this would integrate with a payment gateway (Stripe, PayPal, etc.)
    // For now, we'll simulate a pending payment.
    const newPayment = new Payment({
      tenantId: req.tenantId,
      orderId: order._id,
      customerId: req.customer.customerId,
      amount,
      paymentMethod,
      status: "pending", // Set to pending, will be updated by webhook or confirmation
      transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`, // Placeholder
    })
    await newPayment.save()

    // Update order payment status to pending
    order.paymentStatus = "pending"
    await order.save()

    res.status(201).json({
      message: "Payment initiated successfully",
      payment: newPayment,
      redirectUrl: "https://example.com/payment-gateway-redirect", // Placeholder for payment gateway redirect
    })
  } catch (error) {
    console.error("❌ Error initiating payment:", error)
    res.status(500).json({ error: "Failed to initiate payment" })
  }
})

// Webhook endpoint for payment gateway (example)
router.post("/webhook", async (req, res) => {
  try {
    // In a real scenario, you'd verify the webhook signature here
    const { transactionId, status, orderId } = req.body // Simplified payload

    console.log(`Received payment webhook for transaction: ${transactionId}, status: ${status}`)

    const Payment = req.tenantModels.Payment // Note: tenantId might need to be derived from webhook payload
    const Order = req.tenantModels.Order

    // Find the payment and update its status
    const payment = await Payment.findOne({ transactionId })
    if (!payment) {
      console.warn(`⚠️ Webhook: Payment with transactionId ${transactionId} not found.`)
      return res.status(404).json({ message: "Payment not found" })
    }

    payment.status = status // e.g., "completed", "failed", "refunded"
    await payment.save()

    // Update the associated order's payment status
    const order = await Order.findById(orderId || payment.orderId)
    if (order) {
      order.paymentStatus = status
      await order.save()
      console.log(`✅ Order ${order._id} payment status updated to ${status}`)
    } else {
      console.warn(`⚠️ Webhook: Order ${orderId || payment.orderId} not found for payment ${transactionId}.`)
    }

    res.status(200).json({ received: true })
  } catch (error) {
    console.error("❌ Error processing payment webhook:", error)
    res.status(500).json({ error: "Failed to process webhook" })
  }
})

// Get payment details for a specific order (requires customer authentication)
router.get("/order/:orderId", customerAuthMiddleware, async (req, res) => {
  try {
    const Payment = req.tenantModels.Payment
    const payments = await Payment.find({
      orderId: req.params.orderId,
      tenantId: req.tenantId,
      customerId: req.customer.customerId,
    }).sort({ paymentDate: -1 }) // Get most recent payment first

    if (payments.length === 0) {
      return res.status(404).json({ error: "No payments found for this order" })
    }
    res.json(payments)
  } catch (error) {
    console.error("❌ Error fetching order payments:", error)
    res.status(500).json({ error: "Failed to fetch payments for order" })
  }
})

module.exports = router
