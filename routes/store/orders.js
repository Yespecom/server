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
      console.error("❌ Missing store context in orders route (should be set by parent middleware):", {
        hasTenantDB: !!req.tenantDB,
        storeId: req.storeId,
        tenantId: req.tenantId,
      })
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

// Generate unique order ID
const generateOrderId = () => {
  const timestamp = Date.now().toString()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `ORD-${timestamp.slice(-6)}${random}`
}

// Create new order
router.post("/", customerAuthMiddleware, async (req, res) => {
  try {
    console.log(`📦 Creating order for customer: ${req.customer.email}`)

    const { items, shippingAddress, addressId, paymentMethod = "cod", offerId } = req.body

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error("❌ No items provided in order")
      return res.status(400).json({ error: "Order items are required" })
    }

    // Validate each item has required fields
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.productId) {
        console.error(`❌ Item ${i} missing productId:`, item)
        return res.status(400).json({
          error: `Item ${i + 1} is missing product ID`,
          item: item,
        })
      }
      if (!item.quantity || item.quantity <= 0) {
        console.error(`❌ Item ${i} invalid quantity:`, item)
        return res.status(400).json({
          error: `Item ${i + 1} has invalid quantity`,
          item: item,
        })
      }
    }

    // Handle shipping address - either from addressId or direct address object
    let finalShippingAddress = null

    if (addressId) {
      // Use existing address from customer's saved addresses
      const customerAddress = req.customer.addresses.id(addressId)
      if (!customerAddress) {
        return res.status(400).json({ error: "Selected address not found" })
      }
      finalShippingAddress = {
        name: customerAddress.name,
        street: customerAddress.street,
        landmark: customerAddress.landmark,
        city: customerAddress.city,
        state: customerAddress.state,
        pincode: customerAddress.pincode,
        country: customerAddress.country,
      }
    } else if (shippingAddress) {
      // Use provided address object
      if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.pincode) {
        return res.status(400).json({
          error: "Complete shipping address is required (street, city, state, pincode)",
        })
      }
      finalShippingAddress = {
        name: shippingAddress.name || req.customer.name,
        street: shippingAddress.street,
        landmark: shippingAddress.landmark || "",
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode,
        country: shippingAddress.country || "India",
      }
    } else {
      // Use customer's default address
      const defaultAddress = req.customer.getDefaultAddress()
      if (!defaultAddress) {
        return res.status(400).json({
          error: "No shipping address provided and no saved addresses found. Please add an address first.",
        })
      }
      finalShippingAddress = {
        name: defaultAddress.name,
        street: defaultAddress.street,
        landmark: defaultAddress.landmark,
        city: defaultAddress.city,
        state: defaultAddress.state,
        pincode: defaultAddress.pincode,
        country: defaultAddress.country,
      }
    }

    const { Product, Order, Offer } = req.models

    // Validate and calculate order items
    const orderItems = []
    let subtotal = 0

    for (const item of items) {
      console.log(`🔍 Processing item with productId: ${item.productId}`)

      const product = await Product.findById(item.productId)
      if (!product) {
        console.error(`❌ Product not found: ${item.productId}`)
        return res.status(404).json({ error: `Product not found: ${item.productId}` })
      }

      console.log(`✅ Found product: ${product.name}`)

      if (!product.isActive) {
        return res.status(400).json({ error: `Product is not available: ${product.name}` })
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
        })
      }

      const itemTotal = product.price * item.quantity
      subtotal += itemTotal

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        total: itemTotal,
      })
    }

    console.log(`💰 Order calculation: subtotal=${subtotal}, items=${orderItems.length}`)

    // Apply offer if provided
    let discount = 0
    let appliedOffer = null

    if (offerId) {
      const offer = await Offer.findById(offerId)
      if (offer && offer.isActive) {
        const currentDate = new Date()
        if (currentDate >= offer.validFrom && currentDate <= offer.validTo) {
          if (subtotal >= offer.minOrderAmount) {
            if (offer.type === "percentage") {
              discount = (subtotal * offer.value) / 100
              if (offer.maxDiscount && discount > offer.maxDiscount) {
                discount = offer.maxDiscount
              }
            } else if (offer.type === "flat") {
              discount = offer.value
            }
            appliedOffer = {
              id: offer._id,
              name: offer.name,
              type: offer.type,
              value: offer.value,
              discount: Math.round(discount),
            }
          }
        }
      }
    }

    // Calculate shipping (get from settings)
    const Settings = require("../../models/tenant/Settings")(req.tenantDB)
    const settings = await Settings.findOne()
    let shippingCharges = settings?.shipping?.charges || 50

    // Free shipping check
    if (settings?.shipping?.freeShippingAbove && subtotal >= settings.shipping.freeShippingAbove) {
      shippingCharges = 0
    }

    const totalAmount = Math.round(subtotal - discount + shippingCharges)

    // Generate order ID
    const orderId = generateOrderId()

    console.log(`📦 Creating order with ID: ${orderId}`)

    // Create order with updated address structure
    const order = new Order({
      orderId,
      customer: {
        id: req.customer._id,
        name: req.customer.name,
        email: req.customer.email,
        phone: req.customer.phone,
        address: finalShippingAddress,
      },
      items: orderItems,
      subtotal: Math.round(subtotal),
      discount: Math.round(discount),
      shippingCharges,
      totalAmount,
      appliedOffer,
      paymentMethod,
      status: paymentMethod === "cod" ? "confirmed" : "pending",
      paymentStatus: paymentMethod === "cod" ? "pending" : "pending",
    })

    await order.save()
    console.log(`✅ Order saved with ID: ${order._id}`)

    // Update product stock
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity, sales: item.quantity },
      })
    }

    // Update customer stats
    await req.customer.updateSpent(totalAmount)

    // Update offer usage if applied
    if (appliedOffer) {
      await Offer.findByIdAndUpdate(offerId, {
        $inc: { usedCount: 1 },
      })
    }

    console.log(`✅ Order created successfully: ${orderId}`)

    // Send order confirmation (if SMS/Email is configured)
    try {
      const { sendOrderConfirmationSMS } = require("../../config/sms")
      if (req.customer.phone) {
        await sendOrderConfirmationSMS(req.customer.phone, orderId, req.storeInfo?.name || "Store")
      }
    } catch (smsError) {
      console.error("SMS sending failed:", smsError)
      // Don't fail the order if SMS fails
    }

    res.status(201).json({
      message: "Order created successfully",
      order: {
        id: order._id,
        orderId: order.orderId,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        shippingAddress: finalShippingAddress,
        createdAt: order.createdAt,
      },
    })
  } catch (error) {
    console.error("❌ Create order error:", error)
    res.status(500).json({
      error: "Failed to create order",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Get customer orders
router.get("/", customerAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query
    const { Order } = req.models

    const query = { "customer.id": req.customerId }
    if (status) {
      query.status = status
    }

    const orders = await Order.find(query)
      .populate("items.product", "name thumbnail")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Order.countDocuments(query)

    res.json({
      orders,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("❌ Get orders error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get specific order details
router.get("/:orderId", customerAuthMiddleware, async (req, res) => {
  try {
    const { Order } = req.models

    const order = await Order.findOne({
      orderId: req.params.orderId,
      "customer.id": req.customerId,
    }).populate("items.product", "name thumbnail slug")

    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }

    res.json(order)
  } catch (error) {
    console.error("❌ Get order details error:", error)
    res.status(500).json({ error: error.message })
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
