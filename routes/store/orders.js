const express = require("express")
const router = express.Router()
const Order = require("../../models/tenant/Order") // Order model factory
const Product = require("../../models/tenant/Product") // Product model factory
const Customer = require("../../models/tenant/Customer") // Customer model factory
const customerAuthMiddleware = require("../../middleware/customerAuth") // Customer authentication

// Middleware to ensure tenantDB is available (should be set by storeContextMiddleware)
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Create a new order (customer-facing)
router.post("/", customerAuthMiddleware, async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const ProductModel = Product(req.tenantDB)
    const CustomerModel = Customer(req.tenantDB)

    const { products, shippingAddress, paymentInfo, notes } = req.body
    const customerId = req.customerId // From customerAuthMiddleware

    if (!products || products.length === 0) {
      return res.status(400).json({ error: "Products are required to create an order." })
    }

    const customer = await CustomerModel.findById(customerId)
    if (!customer) {
      return res.status(404).json({ error: "Customer not found." })
    }

    let totalAmount = 0
    const orderProducts = []

    for (const item of products) {
      const product = await ProductModel.findById(item.productId)
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ error: `Product ${item.productId} not found or insufficient stock.` })
      }
      totalAmount += product.price * item.quantity
      orderProducts.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
      })
      // Decrement stock
      product.stock -= item.quantity
      await product.save()
    }

    const newOrder = new OrderModel({
      customerId,
      products: orderProducts,
      totalAmount,
      shippingAddress,
      paymentInfo,
      notes,
      status: "pending", // Initial status
    })

    await newOrder.save()
    res.status(201).json(newOrder)
  } catch (error) {
    console.error("❌ Error creating customer order:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get customer's orders
router.get("/", customerAuthMiddleware, async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const orders = await OrderModel.find({ customerId: req.customerId })
      .populate("products.productId", "name price imageUrl")
      .sort({ createdAt: -1 })
    res.status(200).json(orders)
  } catch (error) {
    console.error("❌ Error fetching customer orders:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get a specific order by ID for the authenticated customer
router.get("/:id", customerAuthMiddleware, async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const order = await OrderModel.findOne({ _id: req.params.id, customerId: req.customerId }).populate(
      "products.productId",
      "name price imageUrl",
    )
    if (!order) {
      return res.status(404).json({ error: "Order not found or you do not have permission to view it." })
    }
    res.status(200).json(order)
  } catch (error) {
    console.error("❌ Error fetching specific customer order:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
