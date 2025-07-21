const express = require("express")
const router = express.Router()

// Import individual store route modules
const storeAuthRouter = require("./store/auth")
const storeOrdersRouter = require("./store/orders")
const storePaymentsRouter = require("./store/payments")

// Middleware to ensure tenantDB is available for all store routes
router.use((req, res, next) => {
  if (!req.tenantDB) {
    console.error("❌ Store Router: Tenant database connection not established for store route.")
    return res.status(500).json({ error: "Store not configured or database connection failed." })
  }
  next()
})

// Mount individual routers
router.use("/auth", storeAuthRouter)
router.use("/orders", storeOrdersRouter)
router.use("/payments", storePaymentsRouter)

// Example store root route
router.get("/", (req, res) => {
  res.json({
    message: `Welcome to the Storefront API for store ID: ${req.storeId}`,
    storeInfo: req.storeInfo, // Information loaded by storeContextMiddleware
  })
})

// Get store settings (publicly accessible)
const Settings = require("../models/tenant/Settings")
router.get("/settings", async (req, res) => {
  try {
    const SettingsModel = Settings(req.tenantDB)
    const settings = await SettingsModel.findOne({})
    if (!settings) {
      return res.status(404).json({ error: "Store settings not found." })
    }
    res.status(200).json(settings)
  } catch (error) {
    console.error("❌ Error fetching public store settings:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get all products for the store
const Product = require("../models/tenant/Product")
router.get("/products", async (req, res) => {
  try {
    const ProductModel = Product(req.tenantDB)
    const products = await ProductModel.find({ isActive: true }).populate("category", "name")
    res.status(200).json(products)
  } catch (error) {
    console.error("❌ Error fetching store products:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get a single product by ID for the store
router.get("/products/:id", async (req, res) => {
  try {
    const ProductModel = Product(req.tenantDB)
    const product = await ProductModel.findOne({ _id: req.params.id, isActive: true }).populate("category", "name")
    if (!product) {
      return res.status(404).json({ error: "Product not found or not active." })
    }
    res.status(200).json(product)
  } catch (error) {
    console.error("❌ Error fetching single store product:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get all categories for the store
const Category = require("../models/tenant/Category")
router.get("/categories", async (req, res) => {
  try {
    const CategoryModel = Category(req.tenantDB)
    const categories = await CategoryModel.find({ isActive: true })
    res.status(200).json(categories)
  } catch (error) {
    console.error("❌ Error fetching store categories:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get a single category by ID for the store
router.get("/categories/:id", async (req, res) => {
  try {
    const CategoryModel = Category(req.tenantDB)
    const category = await CategoryModel.findOne({ _id: req.params.id, isActive: true })
    if (!category) {
      return res.status(404).json({ error: "Category not found or not active." })
    }
    res.status(200).json(category)
  } catch (error) {
    console.error("❌ Error fetching single store category:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get all offers for the store
const Offer = require("../models/tenant/Offer")
router.get("/offers", async (req, res) => {
  try {
    const OfferModel = Offer(req.tenantDB)
    // Only return active offers that are within their date range
    const offers = await OfferModel.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    })
      .populate("productIds", "name price")
      .populate("categoryIds", "name")
    res.status(200).json(offers)
  } catch (error) {
    console.error("❌ Error fetching store offers:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
