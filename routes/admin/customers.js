const express = require("express")
const router = express.Router()

// Assuming req.tenantModels.Customer is available from storeContextMiddleware
// and authMiddleware has already run for admin routes

// Get all customers for the tenant
router.get("/", async (req, res) => {
  try {
    const Customer = req.tenantModels.Customer
    const customers = await Customer.find({ tenantId: req.user.tenantId })
    res.json(customers)
  } catch (error) {
    console.error("❌ Error fetching customers:", error)
    res.status(500).json({ error: "Failed to fetch customers" })
  }
})

// Get a single customer by ID
router.get("/:id", async (req, res) => {
  try {
    const Customer = req.tenantModels.Customer
    const customer = await Customer.findById(req.params.id)
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }
    res.json(customer)
  } catch (error) {
    console.error("❌ Error fetching customer by ID:", error)
    res.status(500).json({ error: "Failed to fetch customer" })
  }
})

// Create a new customer
router.post("/", async (req, res) => {
  try {
    const Customer = req.tenantModels.Customer
    const { name, email, phone, address, isActive } = req.body
    if (!name || !email) {
      return res.status(400).json({ error: "Customer name and email are required" })
    }

    const newCustomer = new Customer({
      tenantId: req.user.tenantId,
      name,
      email,
      phone,
      address,
      isActive,
    })
    await newCustomer.save()
    res.status(201).json(newCustomer)
  } catch (error) {
    console.error("❌ Error creating customer:", error)
    res.status(500).json({ error: "Failed to create customer" })
  }
})

// Update a customer by ID
router.put("/:id", async (req, res) => {
  try {
    const Customer = req.tenantModels.Customer
    const { name, email, phone, address, isActive } = req.body
    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, address, isActive },
      { new: true, runValidators: true },
    )
    if (!updatedCustomer) {
      return res.status(404).json({ error: "Customer not found" })
    }
    res.json(updatedCustomer)
  } catch (error) {
    console.error("❌ Error updating customer:", error)
    res.status(500).json({ error: "Failed to update customer" })
  }
})

// Delete a customer by ID
router.delete("/:id", async (req, res) => {
  try {
    const Customer = req.tenantModels.Customer
    const deletedCustomer = await Customer.findByIdAndDelete(req.params.id)
    if (!deletedCustomer) {
      return res.status(404).json({ error: "Customer not found" })
    }
    res.json({ message: "Customer deleted successfully" })
  } catch (error) {
    console.error("❌ Error deleting customer:", error)
    res.status(500).json({ error: "Failed to delete customer" })
  }
})

module.exports = router
