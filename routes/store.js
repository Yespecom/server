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

// Get products for storefront
router.get("/products", async (req, res) => {
  try {
    console.log(`🛍️ Getting products for store: ${req.storeId}`)
    console.log(`🔍 Request context:`, {
      storeId: req.storeId,
      tenantId: req.tenantId,
      hasTenantDB: !!req.tenantDB,
      dbState: req.tenantDB?.readyState,
      dbName: req.tenantDB?.name,
      hasModels: !!req.models,
    })

    if (!req.tenantDB) {
      console.error("❌ No tenant database connection")
      return res.status(500).json({
        error: "Database connection not available",
        storeId: req.storeId,
        tenantId: req.tenantId,
      })
    }

    if (!req.models) {
      console.error("❌ Models not initialized")
      return res.status(500).json({
        error: "Database models not initialized",
        storeId: req.storeId,
        tenantId: req.tenantId,
      })
    }

    const { Product } = req.models

    // Try to get products with populate, fallback to without populate if it fails
    let products
    try {
      products = await Product.find({ isActive: true }).populate("category").populate("offer").sort({ createdAt: -1 })
      console.log(`📦 Found ${products.length} products with populate for store: ${req.storeId}`)
    } catch (populateError) {
      console.log(`⚠️ Populate failed, loading products without populate:`, populateError.message)
      try {
        products = await Product.find({ isActive: true }).sort({ createdAt: -1 })
        console.log(`📦 Found ${products.length} products without populate for store: ${req.storeId}`)
      } catch (basicError) {
        console.error("❌ Failed to load products even without populate:", basicError)
        return res.status(500).json({
          error: "Failed to load products",
          details: basicError.message,
          storeId: req.storeId,
        })
      }
    }

    res.json(products)
  } catch (error) {
    console.error("❌ Error getting products:", error)
    res.status(500).json({
      error: error.message,
      storeId: req.storeId,
      tenantId: req.tenantId,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Get product details
router.get("/products/:id", async (req, res) => {
  try {
    const { Product } = req.models

    let product
    try {
      product = await Product.findById(req.params.id).populate("category").populate("offer")
    } catch (populateError) {
      console.log(`⚠️ Populate failed for product details, loading without populate`)
      product = await Product.findById(req.params.id)
    }

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Increment product views
    try {
      await product.incrementViews()
    } catch (viewError) {
      console.error("Error incrementing views:", viewError)
      // Don't fail the request if view increment fails
    }

    res.json(product)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Search products
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query
    const { Product } = req.models

    const products = await Product.find({
      isActive: true,
      $or: [{ name: { $regex: q, $options: "i" } }, { description: { $regex: q, $options: "i" } }],
    })
      .populate("category")
      .populate("offer")

    res.json(products)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get categories
router.get("/categories", async (req, res) => {
  try {
    const { Category } = req.models
    const categories = await Category.find({ isActive: true })
    res.json(categories)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get products by category
router.get("/categories/:id/products", async (req, res) => {
  try {
    const { Product } = req.models
    const products = await Product.find({
      category: req.params.id,
      isActive: true,
    })
      .populate("category")
      .populate("offer")

    res.json(products)
  } catch (error) {
    res.status(500).json({ error: error.message })
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
