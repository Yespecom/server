const express = require("express")
const router = express.Router()

// Get all orders
router.get("/", async (req, res) => {
  try {
    const Order = require("../../models/tenant/Order")(req.tenantDB)
    const orders = await Order.find().populate("items.product").sort({ createdAt: -1 })
    res.json(orders)
  } catch (error) {
    res.status(500).json({ error: error.message })
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
    res.status(500).json({ error: error.message })
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
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
