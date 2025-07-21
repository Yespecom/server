const express = require("express")
const router = express.Router()
const bcrypt = require("bcryptjs")
const { getTenantDB } = require("../../config/tenantDB")
const Customer = require("../../models/tenant/Customer") // Customer model factory

// Middleware to ensure tenantDB is available
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Get all customers
router.get("/", async (req, res) => {
  try {
    const CustomerModel = Customer(req.tenantDB)
    const customers = await CustomerModel.find({})
    res.status(200).json(customers)
  } catch (error) {
    console.error("❌ Error fetching customers:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get customer by ID
router.get("/:id", async (req, res) => {
  try {
    const CustomerModel = Customer(req.tenantDB)
    const customer = await CustomerModel.findById(req.params.id)
    if (!customer) {
      return res.status(404).json({ error: "Customer not found." })
    }
    res.status(200).json(customer)
  } catch (error) {
    console.error("❌ Error fetching customer by ID:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Create a new customer (from admin panel)
router.post("/", async (req, res) => {
  try {
    const CustomerModel = Customer(req.tenantDB)
    const { email, password, firstName, lastName, phone, addresses } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." })
    }

    // Check if customer already exists
    const existingCustomer = await CustomerModel.findOne({ email: email.toLowerCase() })
    if (existingCustomer) {
      return res.status(409).json({ error: "Customer with this email already exists." })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newCustomer = new CustomerModel({
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      addresses,
    })

    await newCustomer.save()
    res.status(201).json(newCustomer)
  } catch (error) {
    console.error("❌ Error creating customer:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Update a customer by ID
router.put("/:id", async (req, res) => {
  try {
    const CustomerModel = Customer(req.tenantDB)
    const { password, ...updateData } = req.body

    // If password is being updated, hash it
    if (password) {
      const salt = await bcrypt.genSalt(10)
      updateData.password = await bcrypt.hash(password, salt)
    }

    const updatedCustomer = await CustomerModel.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })
    if (!updatedCustomer) {
      return res.status(404).json({ error: "Customer not found." })
    }
    res.status(200).json(updatedCustomer)
  } catch (error) {
    console.error("❌ Error updating customer:", error)
    if (error.code === 11000) {
      return res.status(409).json({ error: "Customer with this email already exists." })
    }
    res.status(500).json({ error: "Internal server error." })
  }
})

// Delete a customer by ID
router.delete("/:id", async (req, res) => {
  try {
    const CustomerModel = Customer(req.tenantDB)
    const deletedCustomer = await CustomerModel.findByIdAndDelete(req.params.id)
    if (!deletedCustomer) {
      return res.status(404).json({ error: "Customer not found." })
    }
    res.status(200).json({ message: "Customer deleted successfully." })
  } catch (error) {
    console.error("❌ Error deleting customer:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
