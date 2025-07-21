const express = require("express")
const multer = require("multer")
const router = express.Router()
const cloudinary = require("../../config/cloudinary") // Assuming cloudinary config is available
const { upload, deleteImage, getPublicIdFromUrl } = require("../../config/cloudinary")
const fs = require("fs")
const path = require("path")

// Configure multer for memory storage
const storage = multer.memoryStorage()
const testUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed!"), false)
    }
  },
})

const uploadSingle = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
})

// Helper functions for data parsing
const parseExistingImages = (existingImages) => {
  if (!existingImages) return []
  if (Array.isArray(existingImages)) return existingImages
  if (typeof existingImages === "string") {
    if (existingImages.startsWith("[") || existingImages.startsWith("{")) {
      try {
        return JSON.parse(existingImages)
      } catch (e) {
        console.error("Error parsing existing images JSON:", e)
        return []
      }
    } else {
      return [existingImages]
    }
  }
  return []
}

const parseOfferField = (offer) => {
  console.log("🔍 Parsing offer field:", offer, typeof offer)

  if (!offer || offer === "none" || offer === "" || offer === "null" || offer === "undefined") {
    return null
  }

  // If it's already a valid ObjectId string
  if (typeof offer === "string" && offer.match(/^[0-9a-fA-F]{24}$/)) {
    return offer
  }

  // If it's an array, take the first valid ObjectId
  if (Array.isArray(offer)) {
    const validId = offer.find((id) => id && typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/))
    return validId || null
  }

  // If it's a string that looks like an array
  if (typeof offer === "string" && (offer.includes("[") || offer.includes("'"))) {
    try {
      const parsed = JSON.parse(offer.replace(/'/g, '"'))
      if (Array.isArray(parsed)) {
        const validId = parsed.find((id) => id && typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/))
        return validId || null
      }
      return parsed && typeof parsed === "string" && parsed.match(/^[0-9a-fA-F]{24}$/) ? parsed : null
    } catch (e) {
      console.error("Error parsing offer string:", e)
      return null
    }
  }

  return null
}

const generateSlug = (name) => {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

const getImageUrl = (filename, req) => {
  const protocol = req.protocol
  const host = req.get("host")
  return `${protocol}://${host}/uploads/test/${filename}`
}

// Helper function to ensure all required models are loaded
const ensureModelsLoaded = (tenantDB) => {
  try {
    // Load all required models for this tenant database
    const Product = require("../../models/tenant/Product")(tenantDB)

    // Try to load Category model
    let Category
    try {
      Category = require("../../models/tenant/Category")(tenantDB)
      console.log("✅ Category model loaded")
    } catch (categoryError) {
      console.log("⚠️ Category model not found, creating basic schema")
      // Create a basic Category schema if it doesn't exist
      const mongoose = require("mongoose")
      const categorySchema = new mongoose.Schema(
        {
          name: { type: String, required: true },
          slug: { type: String, required: true },
          description: String,
          isActive: { type: Boolean, default: true },
        },
        { timestamps: true },
      )
      Category = tenantDB.model("Category", categorySchema)
    }

    // Try to load Offer model
    let Offer
    try {
      Offer = require("../../models/tenant/Offer")(tenantDB)
      console.log("✅ Offer model loaded")
    } catch (offerError) {
      console.log("⚠️ Offer model not found, creating basic schema")
      // Create a basic Offer schema if it doesn't exist
      const mongoose = require("mongoose")
      const offerSchema = new mongoose.Schema(
        {
          name: { type: String, required: true },
          type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
          value: { type: Number, required: true },
          isActive: { type: Boolean, default: true },
        },
        { timestamps: true },
      )
      Offer = tenantDB.model("Offer", offerSchema)
    }

    return { Product, Category, Offer }
  } catch (error) {
    console.error("❌ Error loading models:", error)
    throw error
  }
}

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = ["uploads", "uploads/test", "uploads/products"]
  dirs.forEach((dir) => {
    const dirPath = path.join(process.cwd(), dir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
      console.log(`✅ Created directory: ${dir}`)
    }
  })
}

// Call this when the module loads
ensureUploadDirs()

// Test connection endpoint
router.get("/test-connection", async (req, res) => {
  try {
    console.log("🧪 Testing admin connection...")

    const testData = {
      hasAuth: !!req.user,
      hasTenantDB: !!req.tenantDB,
      tenantId: req.tenantId,
      storeId: req.storeId,
      userEmail: req.user?.email,
      timestamp: new Date().toISOString(),
    }

    console.log("🧪 Test data:", testData)

    if (req.tenantDB) {
      testData.dbState = req.tenantDB.readyState
      testData.dbName = req.tenantDB.name
      console.log("🧪 Database state:", testData.dbState)

      // Test if we can load all models
      try {
        const models = ensureModelsLoaded(req.tenantDB)
        testData.modelsLoaded = {
          Product: !!models.Product,
          Category: !!models.Category,
          Offer: !!models.Offer,
        }
        console.log("✅ All models loaded successfully")
      } catch (modelError) {
        testData.modelsLoaded = false
        testData.modelError = modelError.message
        console.error("❌ Model load error:", modelError)
      }
    }

    res.json({
      success: true,
      message: "Connection test passed",
      data: testData,
    })
  } catch (error) {
    console.error("❌ Test connection error:", error)
    res.status(500).json({
      error: "Test failed",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Get all products for the tenant
router.get("/", async (req, res) => {
  try {
    const Product = req.tenantModels.Product
    const products = await Product.find({ tenantId: req.user.tenantId }).populate("category")
    res.json(products)
  } catch (error) {
    console.error("❌ Error fetching products:", error)
    res.status(500).json({ error: "Failed to fetch products" })
  }
})

// Get a single product by ID
router.get("/:id", async (req, res) => {
  try {
    const Product = req.tenantModels.Product
    const product = await Product.findById(req.params.id).populate("category")
    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }
    res.json(product)
  } catch (error) {
    console.error("❌ Error fetching product by ID:", error)
    res.status(500).json({ error: "Failed to fetch product" })
  }
})

// Create product - FIXED VERSION
router.post("/", uploadSingle.single("image"), async (req, res) => {
  try {
    const Product = req.tenantModels.Product
    const { name, description, price, category, stock, sku, isActive } = req.body
    let imageUrl = null

    if (!name || !price || !category || stock === undefined) {
      return res.status(400).json({ error: "Missing required product fields" })
    }

    // Upload image to Cloudinary if provided
    if (req.file) {
      const result = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        {
          folder: `yesp-studio/tenants/${req.user.tenantId}/products`,
        },
      )
      imageUrl = result.secure_url
      console.log(`✅ Image uploaded to Cloudinary: ${imageUrl}`)
    }

    const newProduct = new Product({
      tenantId: req.user.tenantId,
      name,
      description,
      price,
      category,
      imageUrl,
      stock,
      sku,
      isActive: isActive === "true" || isActive === true, // Handle boolean from form-data
    })
    await newProduct.save()
    res.status(201).json(newProduct)
  } catch (error) {
    console.error("❌ Error creating product:", error)
    res.status(500).json({ error: "Failed to create product" })
  }
})

// Update product - FIXED VERSION
router.put("/:id", uploadSingle.single("image"), async (req, res) => {
  try {
    console.log("📝 Updating product:", req.params.id)

    const Product = req.tenantModels.Product
    const { name, description, price, category, stock, sku, isActive } = req.body
    let imageUrl = req.body.imageUrl // Keep existing image if not new one

    // Upload new image to Cloudinary if provided
    if (req.file) {
      const result = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        {
          folder: `yesp-studio/tenants/${req.user.tenantId}/products`,
        },
      )
      imageUrl = result.secure_url
      console.log(`✅ New image uploaded to Cloudinary: ${imageUrl}`)
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        price,
        category,
        imageUrl,
        stock,
        sku,
        isActive: isActive === "true" || isActive === true,
      },
      { new: true, runValidators: true },
    )
    if (!updatedProduct) {
      return res.status(404).json({ error: "Product not found" })
    }
    res.json(updatedProduct)
  } catch (error) {
    console.error("❌ Error updating product:", error)
    res.status(500).json({ error: "Failed to update product" })
  }
})

// Delete product
router.delete("/:id", async (req, res) => {
  try {
    const Product = req.tenantModels.Product
    const deletedProduct = await Product.findByIdAndDelete(req.params.id)
    if (!deletedProduct) {
      return res.status(404).json({ error: "Product not found" })
    }
    // Optionally delete image from Cloudinary here if imageUrl is stored
    res.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("❌ Error deleting product:", error)
    res.status(500).json({ error: "Failed to delete product" })
  }
})

// Upload single image endpoint
router.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" })
    }

    console.log("✅ Image uploaded successfully:", req.file.filename)
    res.json({
      success: true,
      imageUrl: req.file.path,
      publicId: req.file.filename,
    })
  } catch (error) {
    console.error("❌ Upload error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Delete single image endpoint
router.delete("/delete-image", async (req, res) => {
  try {
    const { imageUrl } = req.body

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" })
    }

    const publicId = getPublicIdFromUrl(imageUrl)
    await deleteImage(`yesp-products/${publicId}`)

    res.json({ success: true, message: "Image deleted successfully" })
  } catch (error) {
    console.error("❌ Delete image error:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
