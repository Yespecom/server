const express = require("express")
const Razorpay = require("razorpay")
const crypto = require("crypto")
const router = express.Router({ mergeParams: true }) // Enable mergeParams to access :storeId

// Middleware to authenticate customer
const customerAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ error: "Access denied. Please login." })
    }

    const jwt = require("jsonwebtoken")
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")

    if (decoded.type !== "customer") {
      return res.status(401).json({ error: "Invalid token type" })
    }

    // Verify store context from token matches URL parameter
    if (decoded.storeId !== req.storeId) {
      console.error("❌ Token storeId mismatch with URL storeId:", {
        tokenStoreId: decoded.storeId,
        urlStoreId: req.storeId,
      })
      return res.status(401).json({ error: "Access denied. Token is not valid for this store." })
    }

    // req.tenantDB and req.storeId are already set by the parent storeContextMiddleware
    if (!req.tenantDB || !req.storeId) {
      return res.status(500).json({ error: "Internal server error: Store context not available." })
    }

    // Get customer from tenant database
    const Customer = require("../../models/tenant/Customer")(req.tenantDB)
    const customer = await Customer.findById(decoded.customerId)

    if (!customer) {
      return res.status(401).json({ error: "Customer not found" })
    }

    req.customer = customer
    req.customerId = customer._id

    next()
  } catch (error) {
    console.error("❌ Customer auth error:", error)
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired token" })
    }
    res.status(500).json({ error: "Authentication failed" })
  }
}

// Initialize Razorpay instance
const getRazorpayInstance = async (tenantDB) => {
  try {
    const Settings = require("../../models/tenant/Settings")(tenantDB)
    const settings = await Settings.findOne()

    if (!settings?.payment?.razorpayKeyId || !settings?.payment?.razorpayKeySecret) {
      throw new Error("Razorpay credentials not configured")
    }

    return new Razorpay({
      key_id: settings.payment.razorpayKeyId,
      key_secret: settings.payment.razorpayKeySecret,
    })
  } catch (error) {
    console.error("❌ Razorpay initialization error:", error)
    throw error
  }
}

// Create Razorpay order
router.post("/create-order", customerAuthMiddleware, async (req, res) => {
  try {
    console.log("💳 Creating Razorpay order...")

    const { amount, currency = "INR", orderId, customerInfo } = req.body

    if (!amount || !orderId) {
      return res.status(400).json({ error: "Amount and order ID are required" })
    }

    // Validate amount (should be in paise for Razorpay)
    const amountInPaise = Math.round(amount * 100)
    if (amountInPaise < 100) {
      return res.status(400).json({ error: "Minimum amount is ₹1" })
    }

    // Get Razorpay instance with store credentials
    const razorpay = await getRazorpayInstance(req.tenantDB)

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: currency,
      receipt: orderId,
      notes: {
        orderId: orderId,
        customerId: req.customerId.toString(),
        storeId: req.storeId,
        customerName: req.customer.name,
        customerEmail: req.customer.email,
        customerPhone: req.customer.phone,
      },
    })

    console.log("✅ Razorpay order created:", razorpayOrder.id)

    // Save payment record
    const Payment = require("../../models/tenant/Payment")(req.tenantDB)
    const payment = new Payment({
      paymentId: razorpayOrder.id,
      orderId: orderId,
      amount: amount,
      method: "razorpay",
      status: "pending",
      gatewayResponse: razorpayOrder,
    })

    await payment.save()

    // Get store settings for checkout
    const Settings = require("../../models/tenant/Settings")(req.tenantDB)
    const settings = await Settings.findOne()

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: currency,
      keyId: settings.payment.razorpayKeyId,
      orderId: orderId,
      customer: {
        name: req.customer.name,
        email: req.customer.email,
        contact: req.customer.phone,
      },
      notes: razorpayOrder.notes,
    })
  } catch (error) {
    console.error("❌ Create Razorpay order error:", error)
    res.status(500).json({
      error: "Failed to create payment order",
      details: error.message,
    })
  }
})

// Verify Razorpay payment
router.post("/verify-payment", customerAuthMiddleware, async (req, res) => {
  try {
    console.log("🔍 Verifying Razorpay payment...")

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({
        error: "Missing required payment verification parameters",
      })
    }

    // Get Razorpay instance
    const razorpay = await getRazorpayInstance(req.tenantDB)

    // Get settings for secret key
    const Settings = require("../../models/tenant/Settings")(req.tenantDB)
    const settings = await Settings.findOne()

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id
    const expectedSignature = crypto
      .createHmac("sha256", settings.payment.razorpayKeySecret)
      .update(body.toString())
      .digest("hex")

    const isAuthentic = expectedSignature === razorpay_signature

    if (!isAuthentic) {
      console.error("❌ Payment signature verification failed")
      return res.status(400).json({
        error: "Payment verification failed",
        code: "SIGNATURE_MISMATCH",
      })
    }

    console.log("✅ Payment signature verified")

    // Get payment details from Razorpay
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id)

    // Update payment record
    const Payment = require("../../models/tenant/Payment")(req.tenantDB)
    const payment = await Payment.findOne({ paymentId: razorpay_order_id })

    if (!payment) {
      return res.status(404).json({ error: "Payment record not found" })
    }

    payment.status = paymentDetails.status === "captured" ? "success" : "failed"
    payment.gatewayResponse = {
      ...payment.gatewayResponse,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      paymentDetails: paymentDetails,
      verifiedAt: new Date(),
    }

    await payment.save()

    // Update order status if payment successful
    if (payment.status === "success") {
      const Order = require("../../models/tenant/Order")(req.tenantDB)
      const order = await Order.findOne({ orderId: orderId })

      if (order) {
        order.status = "confirmed"
        order.paymentStatus = "success"
        order.paymentId = razorpay_payment_id
        await order.save()

        console.log(`✅ Order ${orderId} confirmed with payment ${razorpay_payment_id}`)
      }
    }

    res.json({
      success: true,
      verified: isAuthentic,
      paymentStatus: payment.status,
      paymentId: razorpay_payment_id,
      orderId: orderId,
      amount: paymentDetails.amount / 100, // Convert back to rupees
    })
  } catch (error) {
    console.error("❌ Payment verification error:", error)
    res.status(500).json({
      error: "Payment verification failed",
      details: error.message,
    })
  }
})

// Get payment status
router.get("/status/:paymentId", customerAuthMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params

    const Payment = require("../../models/tenant/Payment")(req.tenantDB)
    const payment = await Payment.findOne({ paymentId: paymentId })

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" })
    }

    res.json({
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      method: payment.method,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    })
  } catch (error) {
    console.error("❌ Get payment status error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Handle payment failure
router.post("/payment-failed", customerAuthMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, orderId, error } = req.body

    console.log("❌ Payment failed:", { razorpay_order_id, orderId, error })

    // Update payment record
    const Payment = require("../../models/tenant/Payment")(req.tenantDB)
    const payment = await Payment.findOne({ paymentId: razorpay_order_id })

    if (payment) {
      payment.status = "failed"
      payment.gatewayResponse = {
        ...payment.gatewayResponse,
        error: error,
        failedAt: new Date(),
      }
      await payment.save()
    }

    // Update order status
    const Order = require("../../models/tenant/Order")(req.tenantDB)
    const order = await Order.findOne({ orderId: orderId })

    if (order) {
      order.paymentStatus = "failed"
      await order.save()
    }

    res.json({
      success: true,
      message: "Payment failure recorded",
    })
  } catch (error) {
    console.error("❌ Payment failure handling error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get Razorpay configuration (public key only)
router.get("/config", async (req, res) => {
  try {
    const Settings = require("../../models/tenant/Settings")(req.tenantDB)
    const settings = await Settings.findOne()

    if (!settings?.payment?.razorpayKeyId) {
      return res.status(404).json({ error: "Razorpay not configured" })
    }

    res.json({
      keyId: settings.payment.razorpayKeyId,
      currency: "INR",
      enabled: true,
    })
  } catch (error) {
    console.error("❌ Get payment config error:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
