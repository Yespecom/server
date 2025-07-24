const express = require("express")
const router = express.Router()

// Get all orders
router.get("/", async (req, res) => {
  try {
    // Add a log here to check req.tenantDB
    console.log("Attempting to access req.tenantDB:", req.tenantDB ? "Available" : "Not Available")

    const Order = require("../../models/tenant/Order")(req.tenantDB)
    const orders = await Order.find().populate("items.product").sort({ createdAt: -1 })
    res.json(orders)
  } catch (error) {
    // Log the full error for server-side debugging
    console.error("Error fetching orders:", error)
    res.status(500).json({ error: error.message, stack: error.stack }) // Include stack for more details
  }
})

// Get specific order
router.get("/:id", async (req, res) => {
  try {
    const Order = require("../../models/tenant/Order")(req.tenantDB)
    const order = await Order.findById(req.params.id).populate("items.product")
    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }
    res.json(order)
  } catch (error) {
    console.error(`Error fetching order ${req.params.id}:`, error)
    res.status(500).json({ error: error.message, stack: error.stack })
  }
})

// Update order status
router.put("/:id", async (req, res) => {
  try {
    const Order = require("../../models/tenant/Order")(req.tenantDB)
    const { status } = req.body
    // Validate status
    const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
        validStatuses,
      })
    }
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate("items.product")
    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }
    res.json(order)
  } catch (error) {
    console.error(`Error updating order ${req.params.id}:`, error)
    res.status(500).json({ error: error.message, stack: error.stack })
  }
})

module.exports = router
