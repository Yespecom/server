const express = require("express")
const router = express.Router()

// Get all customers
router.get("/", async (req, res) => {
  try {
    const Customer = require("../../models/tenant/Customer")(req.tenantDB)
    const customers = await Customer.find().sort({ createdAt: -1 })
    res.json(customers)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get customer profile
router.get("/:id", async (req, res) => {
  try {
    const Customer = require("../../models/tenant/Customer")(req.tenantDB)
    const Order = require("../../models/tenant/Order")(req.tenantDB)

    const customer = await Customer.findById(req.params.id)
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    // Get customer's order history
    const orders = await Order.find({ "customer.email": customer.email })
      .populate("items.product")
      .sort({ createdAt: -1 })

    res.json({
      customer,
      orderHistory: orders,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
