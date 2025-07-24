const express = require("express")
const router = express.Router()

// Get all customers
router.get("/", async (req, res) => {
  try {
    const Customer = require("../../models/tenant/Customer")(req.tenantDB)
    const customers = await Customer.find().sort({ createdAt: -1 })
    res.json(customers)
  } catch (error) {
    console.error("Error fetching all customers:", error)
    res.status(500).json({ error: error.message, stack: error.stack })
  }
})

// Get specific customer profile and their order history
router.get("/:id", async (req, res) => {
  try {
    const Customer = require("../models/tenant/Customer")(req.tenantDB)
    const Order = require("../models/tenant/Order")(req.tenantDB)
    const Product = require("../models/tenant/Product")(req.tenantDB) // <-- Added: Import Product model

    const customer = await Customer.findById(req.params.id)
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    // Get customer's order history
    // Corrected: Query by customerId and populate items.productId
    const orders = await Order.find({ customerId: customer._id })
      .populate("items.productId") // <-- Corrected: Populate productId
      .sort({ createdAt: -1 })

    res.json({
      customer,
      orderHistory: orders,
    })
  } catch (error) {
    console.error(`Error fetching customer profile ${req.params.id}:`, error)
    res.status(500).json({ error: error.message, stack: error.stack })
  }
})

module.exports = router
