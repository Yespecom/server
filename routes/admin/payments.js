const express = require("express")
const router = express.Router()
const { getTenantDB } = require("../../config/tenantDB")
const Payment = require("../../models/tenant/Payment") // Payment model factory
const Order = require("../../models/tenant/Order") // Order model factory
const Customer = require("../../models/tenant/Customer") // Customer model factory

// Add logging middleware for payments routes
router.use((req, res, next) => {
  console.log(`💳 Admin Payments: ${req.method} ${req.path}`)
  console.log(`💳 Full URL: ${req.originalUrl}`)
  console.log(`💳 Has tenantDB: ${!!req.tenantDB}`)
  console.log(`💳 Tenant ID: ${req.tenantId}`)
  next()
})

// Middleware to ensure tenantDB is available
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Test endpoint to verify payments route is working
router.get("/test", (req, res) => {
  console.log("🧪 Admin payments test endpoint reached")
  res.json({
    message: "Admin payments routes are working",
    path: req.path,
    originalUrl: req.originalUrl,
    hasTenantDB: !!req.tenantDB,
    tenantId: req.tenantId,
    timestamp: new Date().toISOString(),
  })
})

// Get payment summary - MUST come before /:id route
router.get("/summary", async (req, res) => {
  try {
    console.log("📊 Fetching payment summary...")

    const PaymentModel = Payment(req.tenantDB)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)

    // Today's revenue (only successful payments)
    const todayRevenue = await PaymentModel.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: today },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])

    // This month's revenue (only successful payments)
    const monthRevenue = await PaymentModel.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: thisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])

    // Total revenue (only successful payments)
    const totalRevenue = await PaymentModel.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])

    // Additional stats for admin dashboard
    const totalPayments = await PaymentModel.countDocuments()
    const successfulPayments = await PaymentModel.countDocuments({ status: "success" })
    const failedPayments = await PaymentModel.countDocuments({ status: "failed" })
    const pendingPayments = await PaymentModel.countDocuments({ status: "pending" })

    const summary = {
      todayRevenue: todayRevenue[0]?.total || 0,
      monthRevenue: monthRevenue[0]?.total || 0,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalPayments,
      successfulPayments,
      failedPayments,
      pendingPayments,
      successRate: totalPayments > 0 ? ((successfulPayments / totalPayments) * 100).toFixed(1) : 0,
      averageOrderValue: successfulPayments > 0 ? ((totalRevenue[0]?.total || 0) / successfulPayments).toFixed(2) : 0,
    }

    console.log("✅ Payment summary:", summary)
    res.json(summary)
  } catch (error) {
    console.error("❌ Payment summary error:", error)
    res.status(500).json({
      error: "Failed to fetch payment summary",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Get all payments (including failed, pending, and successful)
router.get("/", async (req, res) => {
  try {
    console.log("💳 Fetching all payments...")

    const PaymentModel = Payment(req.tenantDB)

    // Get query parameters for filtering
    const {
      status,
      method,
      limit = 50,
      page = 1,
      sortBy = "createdAt",
      sortOrder = "desc",
      startDate,
      endDate,
    } = req.query

    // Build filter object
    const filter = { tenantId: req.user.tenantId }

    if (status && status !== "all") {
      filter.status = status
    }

    if (method && method !== "all") {
      filter.method = method
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        const endDateTime = new Date(endDate)
        endDateTime.setHours(23, 59, 59, 999) // End of day
        filter.createdAt.$lte = endDateTime
      }
    }

    // Calculate pagination
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)
    const sortDirection = sortOrder === "desc" ? -1 : 1

    // Build sort object
    const sort = {}
    sort[sortBy] = sortDirection

    console.log("🔍 Payment query:", { filter, sort, limit: Number.parseInt(limit), skip })

    // Get payments with optional filtering and pagination
    const payments = await PaymentModel.find(filter).sort(sort).limit(Number.parseInt(limit)).skip(skip).lean() // Use lean for better performance

    // Get total count for pagination
    const totalCount = await PaymentModel.countDocuments(filter)

    // Get summary stats for the filtered results
    const summaryStats = await PaymentModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ])

    console.log(`✅ Found ${payments.length} payments (${totalCount} total)`)

    res.json({
      payments,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(totalCount / Number.parseInt(limit)),
        totalCount,
        hasNext: skip + payments.length < totalCount,
        hasPrev: Number.parseInt(page) > 1,
        limit: Number.parseInt(limit),
      },
      summary: summaryStats,
      filters: {
        status,
        method,
        startDate,
        endDate,
        sortBy,
        sortOrder,
      },
    })
  } catch (error) {
    console.error("❌ Get payments error:", error)
    res.status(500).json({
      error: "Failed to fetch payments",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Get payment details - MUST come after other specific routes
router.get("/:id", async (req, res) => {
  try {
    console.log("🔍 Fetching payment details for ID:", req.params.id)

    const PaymentModel = Payment(req.tenantDB)

    // Try to find by MongoDB _id first, then by paymentId
    let payment = await PaymentModel.findById(req.params.id)
      .populate("orderId", "totalAmount status")
      .populate("customerId", "firstName lastName email")

    if (!payment) {
      payment = await PaymentModel.findOne({ paymentId: req.params.id })
        .populate("orderId", "totalAmount status")
        .populate("customerId", "firstName lastName email")
    }

    if (!payment) {
      console.log("❌ Payment not found:", req.params.id)
      return res.status(404).json({
        error: "Payment not found",
        searchedId: req.params.id,
      })
    }

    console.log("✅ Payment found:", payment.paymentId || payment._id)
    res.json(payment)
  } catch (error) {
    console.error("❌ Get payment details error:", error)

    // Handle invalid ObjectId error
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid payment ID format",
        details: error.message,
      })
    }

    res.status(500).json({
      error: "Failed to fetch payment details",
      details: error.message,
    })
  }
})

// Create a new payment (e.g., for manual entry or reconciliation)
router.post("/", async (req, res) => {
  try {
    const PaymentModel = Payment(req.tenantDB)
    const OrderModel = Order(req.tenantDB)
    const CustomerModel = Customer(req.tenantDB)

    const { orderId, customerId, amount, currency, method, transactionId, status, paymentDate, notes } = req.body

    if (!orderId || !customerId || !amount || !method) {
      return res.status(400).json({ error: "Order ID, Customer ID, Amount, and Method are required." })
    }

    const order = await OrderModel.findById(orderId)
    if (!order) {
      return res.status(404).json({ error: "Order not found." })
    }

    const customer = await CustomerModel.findById(customerId)
    if (!customer) {
      return res.status(404).json({ error: "Customer not found." })
    }

    const newPayment = new PaymentModel({
      orderId,
      customerId,
      amount,
      currency,
      method,
      transactionId,
      status,
      paymentDate,
      notes,
    })

    await newPayment.save()
    res.status(201).json(newPayment)
  } catch (error) {
    console.error("❌ Error creating payment:", error)
    if (error.code === 11000 && error.keyPattern && error.keyPattern.transactionId) {
      return res.status(409).json({ error: "Payment with this transaction ID already exists." })
    }
    res.status(500).json({ error: "Internal server error." })
  }
})

// Update payment status or details
router.put("/:id", async (req, res) => {
  try {
    const PaymentModel = Payment(req.tenantDB)
    const updatedPayment = await PaymentModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
    if (!updatedPayment) {
      return res.status(404).json({ error: "Payment not found." })
    }
    res.status(200).json(updatedPayment)
  } catch (error) {
    console.error("❌ Error updating payment:", error)
    if (error.code === 11000 && error.keyPattern && error.keyPattern.transactionId) {
      return res.status(409).json({ error: "Payment with this transaction ID already exists." })
    }
    res.status(500).json({ error: "Internal server error." })
  }
})

// Delete a payment (use with caution)
router.delete("/:id", async (req, res) => {
  try {
    const PaymentModel = Payment(req.tenantDB)
    const deletedPayment = await PaymentModel.findByIdAndDelete(req.params.id)
    if (!deletedPayment) {
      return res.status(404).json({ error: "Payment not found." })
    }
    res.status(200).json({ message: "Payment deleted successfully." })
  } catch (error) {
    console.error("❌ Error deleting payment:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get payment statistics
router.get("/stats/overview", async (req, res) => {
  try {
    console.log("📈 Fetching payment statistics...")

    const PaymentModel = Payment(req.tenantDB)

    // Get payments by status
    const statusStats = await PaymentModel.aggregate([
      {
        $match: { tenantId: req.user.tenantId },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ])

    // Get payments by method
    const methodStats = await PaymentModel.aggregate([
      {
        $match: { tenantId: req.user.tenantId },
      },
      {
        $group: {
          _id: "$method",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ])

    // Get daily revenue for last 30 days (successful payments only)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const dailyRevenue = await PaymentModel.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: thirtyDaysAgo },
          tenantId: req.user.tenantId,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          revenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ])

    // Get hourly distribution for today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const hourlyStats = await PaymentModel.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          tenantId: req.user.tenantId,
        },
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "success"] }, "$amount", 0] } },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ])

    const stats = {
      statusBreakdown: statusStats,
      methodBreakdown: methodStats,
      dailyRevenue: dailyRevenue,
      hourlyDistribution: hourlyStats,
      generatedAt: new Date().toISOString(),
    }

    console.log("✅ Payment statistics fetched")
    res.json(stats)
  } catch (error) {
    console.error("❌ Payment statistics error:", error)
    res.status(500).json({
      error: "Failed to fetch payment statistics",
      details: error.message,
    })
  }
})

module.exports = router
