const express = require("express")
const router = express.Router()

// Assuming req.tenantModels.Order and req.tenantModels.Customer are available
// and authMiddleware has already run for admin routes

// Get all orders for the tenant
router.get("/", async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const orders = await Order.find({ tenantId: req.user.tenantId }).populate("customerId") // Populate customer details
    res.json(orders)
  } catch (error) {
    console.error("❌ Error fetching orders:", error)
    res.status(500).json({ error: "Failed to fetch orders" })
  }
})

// Get a single order by ID
router.get("/:id", async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const order = await Order.findById(req.params.id).populate("customerId").populate("products.productId")
    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }
    res.json(order)
  } catch (error) {
    console.error("❌ Error fetching order by ID:", error)
    res.status(500).json({ error: "Failed to fetch order" })
  }
})

// Update order status
router.put("/:id/status", async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const { status, paymentStatus } = req.body
    if (!status && !paymentStatus) {
      return res.status(400).json({ error: "Status or paymentStatus is required" })
    }

    const updateFields = {}
    if (status) updateFields.status = status
    if (paymentStatus) updateFields.paymentStatus = paymentStatus

    const updatedOrder = await Order.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
      runValidators: true,
    })
    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found" })
    }
    res.json(updatedOrder)
  } catch (error) {
    console.error("❌ Error updating order status:", error)
    res.status(500).json({ error: "Failed to update order status" })
  }
})

// Delete an order by ID (use with caution)
router.delete("/:id", async (req, res) => {
  try {
    const Order = req.tenantModels.Order
    const deletedOrder = await Order.findByIdAndDelete(req.params.id)
    if (!deletedOrder) {
      return res.status(404).json({ error: "Order not found" })
    }
    res.json({ message: "Order deleted successfully" })
  } catch (error) {
    console.error("❌ Error deleting order:", error)
    res.status(500).json({ error: "Failed to delete order" })
  }
})

module.exports = router
