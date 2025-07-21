const express = require("express")
const router = express.Router({ mergeParams: true }) // Enable mergeParams to access :storeId

// Import all store routes
const authRoutes = require("./store/auth")
const ordersRoutes = require("./store/orders")
const paymentsRoutes = require("./store/payments")

// Import the new store context middleware
const storeContextMiddleware = require("../middleware/storeContext")

// Apply the store context middleware to all routes in this router
router.use(storeContextMiddleware)

// Middleware to check if store exists
router.use((req, res, next) => {
  console.log(`🛍️ Store middleware - checking store context:`, {
    hasStoreId: !!req.storeId,
    hasTenantDB: !!req.tenantDB,
    storeId: req.storeId,
    tenantId: req.tenantId,
    path: req.path,
    method: req.method,
  })

  if (!req.tenantDB || !req.storeId) {
    console.error(`❌ Store not found - missing context:`, {
      hasStoreId: !!req.storeId,
      hasTenantDB: !!req.tenantDB,
      storeId: req.storeId,
      tenantId: req.tenantId,
      host: req.get("host"),
      path: req.path,
    })
    return res.status(404).json({ error: "Store not found" })
  }
  next()
})

// Middleware to ensure all tenant models are loaded for this database connection
router.use(async (req, res, next) => {
  try {
    if (req.tenantDB && !req.models) {
      // Only initialize if not already done
      console.log(`🔧 Initializing models for tenant: ${req.tenantId}`)

      // Initialize all required models for the tenant database
      const Product = require("../models/tenant/Product")(req.tenantDB)
      const Category = require("../models/tenant/Category")(req.tenantDB)
      const Offer = require("../models/tenant/Offer")(req.tenantDB)
      const Customer = require("../models/tenant/Customer")(req.tenantDB)
      const Order = require("../models/tenant/Order")(req.tenantDB)
      const Settings = require("../models/tenant/Settings")(req.tenantDB)
      const Payment = require("../models/tenant/Payment")(req.tenantDB)

      // Store the models in the request object for easy access
      req.models = {
        Product,
        Category,
        Offer,
        Customer,
        Order,
        Settings,
        Payment,
      }

      console.log(`✅ All models initialized for tenant: ${req.tenantId}`)
    }
    next()
  } catch (error) {
    console.error("❌ Error initializing tenant models in store router:", error)
    return res.status(500).json({
      error: "Failed to initialize database models",
      details: error.message,
    })
  }
})

// Add debugging middleware specifically for orders
router.use("/orders", (req, res, next) => {
  console.log(`📦 Orders route accessed:`, {
    method: req.method,
    path: req.path,
    fullPath: req.originalUrl,
    hasModels: !!req.models,
    hasAuth: !!req.get("authorization"),
    body: req.method === "POST" ? req.body : "N/A",
  })
  next()
})

// Mount auth routes
router.use("/auth", authRoutes)

// Mount orders routes
router.use("/orders", ordersRoutes)

// Mount payments routes
router.use("/payments", paymentsRoutes)

// Example store root route (e.g., for fetching general store info)
router.get("/", async (req, res) => {
  try {
    const Settings = req.models.Settings
    const storeSettings = await Settings.findOne({ tenantId: req.tenantId })
    if (!storeSettings) {
      return res.status(404).json({ error: "Store not found or settings not configured." })
    }
    res.json({
      message: `Welcome to ${storeSettings.storeName}!`,
      storeInfo: {
        name: storeSettings.storeName,
        logo: storeSettings.logoUrl,
        contactEmail: storeSettings.contactEmail,
        currency: storeSettings.currency,
        // ... other public settings
      },
    })
  } catch (error) {
    console.error("❌ Error fetching store info:", error)
    res.status(500).json({ error: "Failed to fetch store information" })
  }
})

// Get all products for the store (publicly accessible)
router.get("/products", async (req, res) => {
  try {
    const Product = req.models.Product
    const products = await Product.find({ tenantId: req.tenantId, isActive: true }).populate("category")
    res.json(products)
  } catch (error) {
    console.error("❌ Error fetching store products:", error)
    res.status(500).json({ error: "Failed to fetch products" })
  }
})

// Get a single product by ID for the store (publicly accessible)
router.get("/products/:id", async (req, res) => {
  try {
    const Product = req.models.Product
    const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId, isActive: true }).populate(
      "category",
    )
    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }
    res.json(product)
  } catch (error) {
    console.error("❌ Error fetching single store product:", error)
    res.status(500).json({ error: "Failed to fetch product" })
  }
})

// Get all categories for the store (publicly accessible)
router.get("/categories", async (req, res) => {
  try {
    const Category = req.models.Category
    const categories = await Category.find({ tenantId: req.tenantId, isActive: true })
    res.json(categories)
  } catch (error) {
    console.error("❌ Error fetching store categories:", error)
    res.status(500).json({ error: "Failed to fetch categories" })
  }
})

// Get a single category by ID for the store (publicly accessible)
router.get("/categories/:id", async (req, res) => {
  try {
    const Category = req.models.Category
    const category = await Category.findOne({ _id: req.params.id, tenantId: req.tenantId, isActive: true })
    if (!category) {
      return res.status(404).json({ error: "Category not found" })
    }
    res.json(category)
  } catch (error) {
    console.error("❌ Error fetching single store category:", error)
    res.status(500).json({ error: "Failed to fetch category" })
  }
})

// Get store settings (public info)
router.get("/settings", async (req, res) => {
  try {
    const { Settings } = req.models
    const settings = await Settings.findOne()

    res.json({
      storeId: req.storeId,
      storeInfo: req.storeInfo,
      general: settings?.general || {},
      social: settings?.social || {},
      shipping: settings?.shipping || {},
      payment: {
        codEnabled: settings?.payment?.codEnabled || true,
        razorpayEnabled: !!(settings?.payment?.razorpayKeyId && settings?.payment?.razorpayKeySecret),
        stripeEnabled: !!(settings?.payment?.stripePublicKey && settings?.payment?.stripeSecretKey),
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Health check for store
router.get("/health", (req, res) => {
  res.json({
    status: "Store API is running",
    storeId: req.storeId,
    tenantId: req.tenantId,
    timestamp: new Date().toISOString(),
  })
})

// Debug endpoint to check what routes are available
router.get("/debug/routes", (req, res) => {
  res.json({
    message: "Store routes debug info",
    storeId: req.storeId,
    tenantId: req.tenantId,
    availableRoutes: [
      "GET /api/:storeId/products",
      "GET /api/:storeId/products/:id",
      "GET /api/:storeId/categories",
      "GET /api/:storeId/settings",
      "GET /api/:storeId/health",
      "POST /api/:storeId/auth/register",
      "POST /api/:storeId/auth/login",
      "GET /api/:storeId/auth/profile",
      "POST /api/:storeId/orders",
      "GET /api/:storeId/orders",
      "GET /api/:storeId/orders/:orderId",
      "POST /api/:storeId/payments/create-order",
      "POST /api/:storeId/payments/verify-payment",
      "GET /api/:storeId/payments/config",
    ],
    hasModels: !!req.models,
    modelsList: req.models ? Object.keys(req.models) : [],
  })
})

module.exports = router
