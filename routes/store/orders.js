const express = require("express")
const router = express.Router({ mergeParams: true }) // Enable mergeParams to access :storeId

// Add logging middleware for orders routes
router.use((req, res, next) => {
  console.log(`📦 Orders route: ${req.method} ${req.path}`)
  console.log(`🔍 Orders context:`, {
    storeId: req.storeId, // Now available from storeContextMiddleware
    tenantId: req.tenantId, // Now available from storeContextMiddleware
    hasTenantDB: !!req.tenantDB, // Now available from storeContextMiddleware
    hasModels: !!req.models, // Now available from storeContextMiddleware
  })

  // Log request body for POST requests
  if (req.method === "POST") {
    console.log(`📦 Order creation request body:`, {
      hasItems: !!req.body.items,
      itemsCount: req.body.items?.length || 0,
      hasShippingAddress: !!req.body.shippingAddress,
      hasAddressId: !!req.body.addressId,
      paymentMethod: req.body.paymentMethod,
      items:
        req.body.items?.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          hasProductId: !!item.productId,
        })) || [],
    })
  }

  next()
})

// Test endpoint to verify orders route is working
router.get("/test", (req, res) => {
  console.log("🧪 Orders test endpoint reached")
  res.json({
    message: "Orders route is working",
    storeId: req.storeId,
    tenantId: req.tenantId,
    hasModels: !!req.models,
    timestamp: new Date().toISOString(),
  })
})

// Middleware to authenticate customer
const customerAuthMiddleware = require("../../middleware/customerAuth") // Assuming customer auth is needed for creating/viewing orders

// Create new order
router.post("/", customerAuthMiddleware, async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const Product = req.tenantModels.Product
    const { products, shippingAddress, notes } = req.body

    if (!products || products.length === 0) {
      return res.status(400).json({ error: "Order must contain products" })
    }

    let totalAmount = 0
    const orderProducts = []

    // Validate products and calculate total amount
    for (const item of products) {
      const product = await Product.findOne({ _id: item.productId, tenantId: req.tenantId, isActive: true })
      if (!product) {
        return res.status(404).json({ error: `Product with ID ${item.productId} not found or inactive` })
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Not enough stock for product: ${product.name}` })
      }

      const itemPrice = product.price * item.quantity
      totalAmount += itemPrice
      orderProducts.push({
        productId: product._id,
        name: product.name,
        quantity: item.quantity,
        price: product.price,
      })

      // Decrease product stock (simple stock management)
      product.stock -= item.quantity
      await product.save()
    }

    const newOrder = new Order({
      tenantId: req.tenantId,
      customerId: req.customer.customerId, // From customerAuthMiddleware
      products: orderProducts,
      totalAmount,
      shippingAddress,
      notes,
      status: "pending", // Initial status
      paymentStatus: "pending", // Initial payment status
    })

    await newOrder.save()

    // Optionally update customer's total orders/spent
    const Customer = req.tenantModels.Customer
    await Customer.findByIdAndUpdate(req.customer.customerId, {
      $inc: { totalOrders: 1, totalSpent: totalAmount },
    })

    res.status(201).json(newOrder)
  } catch (error) {
    console.error("❌ Error creating order:", error)
    res.status(500).json({ error: "Failed to create order" })
  }
})

// Get customer's orders (requires customer authentication)
router.get("/", customerAuthMiddleware, async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const orders = await Order.find({
      tenantId: req.tenantId,
      customerId: req.customer.customerId,
    }).populate("products.productId")
    res.json(orders)
  } catch (error) {
    console.error("❌ Error fetching customer orders:", error)
    res.status(500).json({ error: "Failed to fetch orders" })
  }
})

// Get a single order by ID for the customer (requires customer authentication)
router.get("/:id", customerAuthMiddleware, async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      customerId: req.customer.customerId,
    }).populate("products.productId")
    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }
    res.json(order)
  } catch (error) {
    console.error("❌ Error fetching single customer order:", error)
    res.status(500).json({ error: "Failed to fetch order" })
  }
})

// Cancel order
router.put("/:orderId/cancel", customerAuthMiddleware, async (req, res) => {
  try {
    const { Order, Product } = req.models

    const order = await Order.findOne({
      orderId: req.params.orderId,
      "customer.id": req.customerId,
    })

    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }

    if (order.status === "delivered" || order.status === "cancelled") {
      return res.status(400).json({
        error: `Cannot cancel order with status: ${order.status}`,
      })
    }

    // Update order status
    order.status = "cancelled"
    order.paymentStatus = "cancelled"
    await order.save()

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity, sales: -item.quantity },
      })
    }

    // Update customer stats (subtract the amount)
    req.customer.totalSpent = Math.max(0, req.customer.totalSpent - order.totalAmount)
    req.customer.orderCount = Math.max(0, req.customer.orderCount - 1)
    await req.customer.save()

    console.log(`🚫 Order cancelled: ${order.orderId}`)

    res.json({
      message: "Order cancelled successfully",
      order: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
    })
  } catch (error) {
    console.error("❌ Cancel order error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Track order status
router.get("/:orderId/track", customerAuthMiddleware, async (req, res) => {
  try {
    const { Order } = req.models

    const order = await Order.findOne({
      orderId: req.params.orderId,
      "customer.id": req.customerId,
    }).select("orderId status paymentStatus createdAt updatedAt")

    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }

    // Define order status timeline
    const statusTimeline = [
      { status: "pending", label: "Order Placed", completed: true },
      {
        status: "confirmed",
        label: "Order Confirmed",
        completed: ["confirmed", "shipped", "delivered"].includes(order.status),
      },
      { status: "shipped", label: "Order Shipped", completed: ["shipped", "delivered"].includes(order.status) },
      { status: "delivered", label: "Order Delivered", completed: order.status === "delivered" },
    ]

    res.json({
      orderId: order.orderId,
      currentStatus: order.status,
      paymentStatus: order.paymentStatus,
      timeline: statusTimeline,
      lastUpdated: order.updatedAt,
    })
  } catch (error) {
    console.error("❌ Track order error:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
