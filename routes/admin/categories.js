const express = require("express")
const router = express.Router()
const { getTenantDB } = require("../../config/tenantDB")
const Category = require("../../models/tenant/Category") // Category model factory

// Middleware to ensure tenantDB is available (should be set by storeContextMiddleware)
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Get all categories
router.get("/", async (req, res) => {
  try {
    const CategoryModel = Category(req.tenantDB)
    const categories = await CategoryModel.find({})
    res.status(200).json(categories)
  } catch (error) {
    console.error("❌ Error fetching categories:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get category by ID
router.get("/:id", async (req, res) => {
  try {
    const CategoryModel = Category(req.tenantDB)
    const category = await CategoryModel.findById(req.params.id)
    if (!category) {
      return res.status(404).json({ error: "Category not found." })
    }
    res.status(200).json(category)
  } catch (error) {
    console.error("❌ Error fetching category by ID:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Create a new category
router.post("/", async (req, res) => {
  try {
    const CategoryModel = Category(req.tenantDB)
    const newCategory = new CategoryModel(req.body)
    await newCategory.save()
    res.status(201).json(newCategory)
  } catch (error) {
    console.error("❌ Error creating category:", error)
    if (error.code === 11000) {
      return res.status(409).json({ error: "Category with this name already exists." })
    }
    res.status(500).json({ error: "Internal server error." })
  }
})

// Update a category by ID
router.put("/:id", async (req, res) => {
  try {
    const CategoryModel = Category(req.tenantDB)
    const updatedCategory = await CategoryModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found." })
    }
    res.status(200).json(updatedCategory)
  } catch (error) {
    console.error("❌ Error updating category:", error)
    if (error.code === 11000) {
      return res.status(409).json({ error: "Category with this name already exists." })
    }
    res.status(500).json({ error: "Internal server error." })
  }
})

// Delete a category by ID
router.delete("/:id", async (req, res) => {
  try {
    const CategoryModel = Category(req.tenantDB)
    const deletedCategory = await CategoryModel.findByIdAndDelete(req.params.id)
    if (!deletedCategory) {
      return res.status(404).json({ error: "Category not found." })
    }
    res.status(200).json({ message: "Category deleted successfully." })
  } catch (error) {
    console.error("❌ Error deleting category:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
