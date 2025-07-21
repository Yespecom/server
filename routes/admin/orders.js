const express = require("express")
const router = express.Router()
const { getTenantDB } = require("../../config/tenantDB")
const Order = require("../../models/tenant/Order") // Order model factory
const Customer = require("../../models/tenant/Customer") // Customer model factory
const Product = require("../../models/tenant/Product") // Product model factory

// Middleware to ensure tenantDB is available
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Get all orders
router.get("/", async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const orders = await OrderModel.find({})
      .populate("customerId", "firstName lastName email")
      .populate("products.productId", "name price")
    res.status(200).json(orders)
  } catch (error) {
    console.error("❌ Error fetching orders:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get order by ID
router.get("/:id", async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const order = await OrderModel.findById(req.params.id)
      .populate("customerId", "firstName lastName email")
      .populate("products.productId", "name price")
    if (!order) {
      return res.status(404).json({ error: "Order not found." })
    }
    res.status(200).json(order)
  } catch (error) {
    console.error("❌ Error fetching order by ID:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Create a new order (typically from admin, or internal system)
router.post("/", async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const CustomerModel = Customer(req.tenantDB)
    const ProductModel = Product(req.tenantDB)

    const { customerId, products, shippingAddress, paymentInfo, notes } = req.body

    if (!customerId || !products || products.length === 0) {
      return res.status(400).json({ error: "Customer ID and products are required." })
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
      // Optionally, decrement stock here or in a separate transaction
    }

    const newOrder = new OrderModel({
      customerId,
      products: orderProducts,
      totalAmount,
      shippingAddress,
      paymentInfo,
      notes,
      status: "processing", // Default status for new orders
    })

    await newOrder.save()
    res.status(201).json(newOrder)
  } catch (error) {
    console.error("❌ Error creating order:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Update an order by ID
router.put("/:id", async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const updatedOrder = await OrderModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found." })
    }
    res.status(200).json(updatedOrder)
  } catch (error) {
    console.error("❌ Error updating order:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Delete an order by ID
router.delete("/:id", async (req, res) => {
  try {
    const OrderModel = Order(req.tenantDB)
    const deletedOrder = await OrderModel.findByIdAndDelete(req.params.id)
    if (!deletedOrder) {
      return res.status(404).json({ error: "Order not found." })
    }
    res.status(200).json({ message: "Order deleted successfully." })
  } catch (error) {
    console.error("❌ Error deleting order:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
