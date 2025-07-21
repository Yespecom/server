const express = require("express")
const router = express.Router()

// Assuming req.tenantModels.Category is available from storeContextMiddleware
// and authMiddleware has already run for admin routes

// Get all categories for the tenant
router.get("/", async (req, res) => {
  try {
    const Category = req.tenantModels.Category
    const categories = await Category.find({})
    res.json(categories)
  } catch (error) {
    console.error("❌ Error fetching categories:", error)
    res.status(500).json({ error: "Failed to fetch categories" })
  }
})

// Get a single category by ID
router.get("/:id", async (req, res) => {
  try {
    const Category = req.tenantModels.Category
    const category = await Category.findById(req.params.id)
    if (!category) {
      return res.status(404).json({ error: "Category not found" })
    }
    res.json(category)
  } catch (error) {
    console.error("❌ Error fetching category by ID:", error)
    res.status(500).json({ error: "Failed to fetch category" })
  }
})

// Create a new category
router.post("/", async (req, res) => {
  try {
    const Category = req.tenantModels.Category
    const { name, description, imageUrl } = req.body
    if (!name) {
      return res.status(400).json({ error: "Category name is required" })
    }
    const newCategory = new Category({
      tenantId: req.user.tenantId, // Assuming tenantId is available from auth middleware
      name,
      description,
      imageUrl,
    })
    await newCategory.save()
    res.status(201).json(newCategory)
  } catch (error) {
    console.error("❌ Error creating category:", error)
    res.status(500).json({ error: "Failed to create category" })
  }
})

// Update a category by ID
router.put("/:id", async (req, res) => {
  try {
    const Category = req.tenantModels.Category
    const { name, description, imageUrl, isActive } = req.body
    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description, imageUrl, isActive },
      { new: true, runValidators: true },
    )
    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found" })
    }
    res.json(updatedCategory)
  } catch (error) {
    console.error("❌ Error updating category:", error)
    res.status(500).json({ error: "Failed to update category" })
  }
})

// Delete a category by ID
router.delete("/:id", async (req, res) => {
  try {
    const Category = req.tenantModels.Category
    const deletedCategory = await Category.findByIdAndDelete(req.params.id)
    if (!deletedCategory) {
      return res.status(404).json({ error: "Category not found" })
    }
    res.json({ message: "Category deleted successfully" })
  } catch (error) {
    console.error("❌ Error deleting category:", error)
    res.status(500).json({ error: "Failed to delete category" })
  }
})

module.exports = router
