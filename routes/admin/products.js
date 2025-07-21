const express = require("express")
const router = express.Router()
const { getTenantDB } = require("../../config/tenantDB")
const Product = require("../../models/tenant/Product") // Product model factory
const Category = require("../../models/tenant/Category") // Category model factory

// Middleware to ensure tenantDB is available
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Get all products
router.get("/", async (req, res) => {
  try {
    const ProductModel = Product(req.tenantDB)
    const products = await ProductModel.find({}).populate("category", "name")
    res.status(200).json(products)
  } catch (error) {
    console.error("❌ Error fetching products:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get product by ID
router.get("/:id", async (req, res) => {
  try {
    const ProductModel = Product(req.tenantDB)
    const product = await ProductModel.findById(req.params.id).populate("category", "name")
    if (!product) {
      return res.status(404).json({ error: "Product not found." })
    }
    res.status(200).json(product)
  } catch (error) {
    console.error("❌ Error fetching product by ID:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Create a new product
router.post("/", async (req, res) => {
  try {
    const ProductModel = Product(req.tenantDB)
    const CategoryModel = Category(req.tenantDB)

    const { name, description, price, category, imageUrl, stock, sku } = req.body

    // Validate category exists
    const existingCategory = await CategoryModel.findById(category)
    if (!existingCategory) {
      return res.status(400).json({ error: "Invalid category ID provided." })
    }

    const newProduct = new ProductModel({
      name,
      description,
      price,
      category,
      imageUrl,
      stock,
      sku,
    })
    await newProduct.save()
    res.status(201).json(newProduct)
  } catch (error) {
    console.error("❌ Error creating product:", error)
    if (error.code === 11000) {
      return res.status(409).json({ error: "Product with this SKU already exists." })
    }
    res.status(500).json({ error: "Internal server error." })
  }
})

// Update a product by ID
router.put("/:id", async (req, res) => {
  try {
    const ProductModel = Product(req.tenantDB)
    const CategoryModel = Category(req.tenantDB)

    const { category } = req.body
    if (category) {
      const existingCategory = await CategoryModel.findById(category)
      if (!existingCategory) {
        return res.status(400).json({ error: "Invalid category ID provided." })
      }
    }

    const updatedProduct = await ProductModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
    if (!updatedProduct) {
      return res.status(404).json({ error: "Product not found." })
    }
    res.status(200).json(updatedProduct)
  } catch (error) {
    console.error("❌ Error updating product:", error)
    if (error.code === 11000) {
      return res.status(409).json({ error: "Product with this SKU already exists." })
    }
    res.status(500).json({ error: "Internal server error." })
  }
})

// Delete a product by ID
router.delete("/:id", async (req, res) => {
  try {
    const ProductModel = Product(req.tenantDB)
    const deletedProduct = await ProductModel.findByIdAndDelete(req.params.id)
    if (!deletedProduct) {
      return res.status(404).json({ error: "Product not found." })
    }
    res.status(200).json({ message: "Product deleted successfully." })
  } catch (error) {
    console.error("❌ Error deleting product:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
