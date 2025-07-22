const express = require("express")
const multer = require("multer")
const router = express.Router()
const { upload, deleteImage, getPublicIdFromUrl } = require("../../config/cloudinary")
const fs = require("fs")
const path = require("path")

// Configure multer for memory storage
const storage = multer.memoryStorage()
const fileUpload = multer({
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

// Helper functions for data parsing
const parseExistingImages = (existingImages) => {
  console.log("🔍 Parsing existingImages:", existingImages, typeof existingImages)

  if (!existingImages) return []
  if (Array.isArray(existingImages)) return existingImages

  if (typeof existingImages === "string") {
    // Handle empty string
    if (existingImages.trim() === "") return []

    // Handle JSON string
    if (existingImages.startsWith("[") || existingImages.startsWith("{")) {
      try {
        const parsed = JSON.parse(existingImages)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch (e) {
        console.error("❌ Error parsing existing images JSON:", e)
        return []
      }
    } else {
      // Handle single URL string
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

  return null
}

const parseVariants = (variants, hasVariants) => {
  console.log("🔍 Parsing variants:", variants, "hasVariants:", hasVariants)

  if (!hasVariants || hasVariants === "false") return []
  if (!variants) return []

  try {
    if (typeof variants === "string") {
      return JSON.parse(variants)
    }
    if (Array.isArray(variants)) {
      return variants
    }
  } catch (e) {
    console.error("❌ Error parsing variants:", e)
  }

  return []
}

const generateSlug = (name) => {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
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
  const dirs = ["uploads", "uploads/products"]
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
    console.log("🧪 Testing products API connection...")

    const testData = {
      hasAuth: !!req.user,
      hasTenantDB: !!req.tenantDB,
      tenantId: req.tenantId,
      storeId: req.storeId,
      userEmail: req.user?.email,
      timestamp: new Date().toISOString(),
    }

    if (req.tenantDB) {
      testData.dbState = req.tenantDB.readyState
      testData.dbName = req.tenantDB.name

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
      message: "Products API connection test passed",
      data: testData,
    })
  } catch (error) {
    console.error("❌ Test connection error:", error)
    res.status(500).json({
      success: false,
      error: "Test failed",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Get all products
router.get("/", async (req, res) => {
  try {
    console.log("🔍 Getting all products...")

    const { Product } = ensureModelsLoaded(req.tenantDB)

    // Try to get products with populate, fallback to without populate
    let products
    try {
      products = await Product.find()
        .populate("category", "name _id")
        .populate("offer", "name type value _id")
        .sort({ createdAt: -1 })
      console.log("✅ Products loaded with populate")
    } catch (populateError) {
      console.log("⚠️ Populate failed, loading without populate:", populateError.message)
      products = await Product.find().sort({ createdAt: -1 })
    }

    console.log(`✅ Found ${products.length} products`)
    res.json(products)
  } catch (error) {
    console.error("❌ Get products error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      details: "Failed to fetch products",
    })
  }
})

// Get single product
router.get("/:id", async (req, res) => {
  try {
    console.log("🔍 Getting product:", req.params.id)

    const { Product } = ensureModelsLoaded(req.tenantDB)

    // Try with populate first, fallback to without
    let product
    try {
      product = await Product.findById(req.params.id)
        .populate("category", "name _id")
        .populate("offer", "name type value _id")
    } catch (populateError) {
      console.log("⚠️ Populate failed, loading without populate")
      product = await Product.findById(req.params.id)
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      })
    }

    console.log("✅ Product found:", product.name)
    res.json(product)
  } catch (error) {
    console.error("❌ Get product error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Create product - FIXED VERSION
router.post("/", fileUpload.array("images", 10), async (req, res) => {
  try {
    console.log("📝 Creating new product...")
    console.log("📋 Request body:", req.body)
    console.log("📋 Files:", req.files?.length || 0)

    const { Product } = ensureModelsLoaded(req.tenantDB)

    const {
      name,
      sku,
      category,
      tags,
      shortDescription,
      description,
      price,
      originalPrice,
      taxPercentage,
      stock,
      lowStockAlert,
      allowBackorders,
      weight,
      dimensions,
      metaTitle,
      metaDescription,
      offer,
      hasVariants,
      variants,
      existingImages,
    } = req.body

    // Parse existing images
    let gallery = parseExistingImages(existingImages)
    console.log("📸 Parsed existing images:", gallery)

    // Handle uploaded files
    if (req.files && req.files.length > 0) {
      try {
        const uploads = await Promise.all(req.files.map((file) => upload(file.buffer, "yesp-products")))
        const newImageUrls = uploads.map((f) => f.secure_url)
        gallery = [...gallery, ...newImageUrls]
        console.log("📸 New images uploaded:", newImageUrls)
      } catch (uploadError) {
        console.error("❌ Image upload error:", uploadError)
        return res.status(400).json({
          success: false,
          error: "Failed to upload images",
          details: uploadError.message,
        })
      }
    }

    // Validate required images
    if (gallery.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one product image is required",
      })
    }

    // Parse variants if hasVariants is true
    const parsedVariants = parseVariants(variants, hasVariants)
    console.log("🔄 Parsed variants:", parsedVariants)

    // Parse dimensions
    let parsedDimensions = { length: 0, width: 0, height: 0 }
    try {
      if (dimensions) {
        parsedDimensions = typeof dimensions === "string" ? JSON.parse(dimensions) : dimensions
      }
    } catch (e) {
      console.error("❌ Error parsing dimensions:", e)
    }

    // Parse tags
    let parsedTags = []
    try {
      if (tags) {
        parsedTags =
          typeof tags === "string"
            ? tags.includes(",")
              ? tags.split(",").map((t) => t.trim())
              : [tags]
            : Array.isArray(tags)
              ? tags
              : []
      }
    } catch (e) {
      console.error("❌ Error parsing tags:", e)
    }

    // Generate slug
    const slug = generateSlug(name)

    // Create product data
    const productData = {
      name: name?.trim(),
      slug,
      sku: sku?.toUpperCase().trim(),
      category,
      tags: parsedTags,
      shortDescription: shortDescription?.trim(),
      description: description?.trim(),
      price: Number.parseFloat(price) || 0,
      originalPrice: originalPrice ? Number.parseFloat(originalPrice) : undefined,
      taxPercentage: Number.parseFloat(taxPercentage) || 0,
      stock: Number.parseInt(stock) || 0,
      lowStockAlert: Number.parseInt(lowStockAlert) || 5,
      allowBackorders: allowBackorders === "true" || allowBackorders === true,
      thumbnail: gallery[0],
      gallery,
      weight: Number.parseFloat(weight) || 0,
      dimensions: parsedDimensions,
      metaTitle: metaTitle?.trim(),
      metaDescription: metaDescription?.trim(),
      offer: parseOfferField(offer),
      hasVariants: hasVariants === "true" || hasVariants === true,
      variants: parsedVariants,
      isActive: true,
    }

    console.log("📋 Final product data:", productData)

    // Create and save product
    const product = new Product(productData)
    await product.save()

    console.log("✅ Product created successfully:", product._id)

    // Try to populate the response
    try {
      await product.populate("category", "name _id")
      await product.populate("offer", "name type value _id")
    } catch (populateError) {
      console.log("⚠️ Populate failed on response:", populateError.message)
    }

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    })
  } catch (error) {
    console.error("❌ Create product error:", error)

    if (error.name === "ValidationError") {
      const errors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
      }))
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      })
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Duplicate value",
        details: "SKU or slug already exists",
      })
    }

    res.status(500).json({
      success: false,
      error: "Failed to create product",
      details: error.message,
    })
  }
})

// Update product - FIXED VERSION
router.put("/:id", fileUpload.array("images", 10), async (req, res) => {
  try {
    console.log("📝 Updating product:", req.params.id)
    console.log("📋 Request body:", req.body)

    const { Product } = ensureModelsLoaded(req.tenantDB)

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      })
    }

    const {
      name,
      sku,
      category,
      tags,
      shortDescription,
      description,
      price,
      originalPrice,
      taxPercentage,
      stock,
      lowStockAlert,
      allowBackorders,
      weight,
      dimensions,
      metaTitle,
      metaDescription,
      offer,
      hasVariants,
      variants,
      existingImages,
    } = req.body

    // Handle image updates
    let gallery = parseExistingImages(existingImages)

    // Add new uploaded images
    if (req.files && req.files.length > 0) {
      try {
        const uploads = await Promise.all(req.files.map((file) => upload(file.buffer, "yesp-products")))
        const newImageUrls = uploads.map((f) => f.secure_url)
        gallery = [...gallery, ...newImageUrls]
      } catch (uploadError) {
        console.error("❌ Image upload error:", uploadError)
        return res.status(400).json({
          success: false,
          error: "Failed to upload images",
          details: uploadError.message,
        })
      }
    }

    // Parse and validate fields
    const parsedPrice = Number.parseFloat(price) || product.price
    let parsedOriginalPrice = originalPrice ? Number.parseFloat(originalPrice) : undefined

    // Handle originalPrice validation logic
    if (parsedOriginalPrice && parsedOriginalPrice < parsedPrice) {
      console.log("⚠️ Original price is less than current price, setting to null")
      parsedOriginalPrice = undefined
    }

    // Parse other fields
    const parsedVariants = parseVariants(variants, hasVariants)

    let parsedDimensions = product.dimensions || { length: 0, width: 0, height: 0 }
    try {
      if (dimensions) {
        parsedDimensions = typeof dimensions === "string" ? JSON.parse(dimensions) : dimensions
      }
    } catch (e) {
      console.error("❌ Error parsing dimensions:", e)
    }

    let parsedTags = []
    try {
      if (tags) {
        parsedTags =
          typeof tags === "string"
            ? tags.includes(",")
              ? tags.split(",").map((t) => t.trim())
              : [tags]
            : Array.isArray(tags)
              ? tags
              : []
      }
    } catch (e) {
      console.error("❌ Error parsing tags:", e)
      parsedTags = product.tags || []
    }

    // Generate slug if name changed
    const slug = name !== product.name ? generateSlug(name) : product.slug

    // Update product fields
    const updateData = {
      name: name?.trim() || product.name,
      slug,
      sku: sku?.toUpperCase().trim() || product.sku,
      category: category || product.category,
      tags: parsedTags,
      shortDescription: shortDescription?.trim() || product.shortDescription,
      description: description?.trim() || product.description,
      price: parsedPrice,
      originalPrice: parsedOriginalPrice,
      taxPercentage: Number.parseFloat(taxPercentage) || product.taxPercentage || 0,
      stock: Number.parseInt(stock) || product.stock || 0,
      lowStockAlert: Number.parseInt(lowStockAlert) || product.lowStockAlert || 5,
      allowBackorders: allowBackorders === "true" || allowBackorders === true,
      gallery,
      thumbnail: gallery.length > 0 ? gallery[0] : product.thumbnail,
      weight: Number.parseFloat(weight) || product.weight || 0,
      dimensions: parsedDimensions,
      metaTitle: metaTitle?.trim() || product.metaTitle,
      metaDescription: metaDescription?.trim() || product.metaDescription,
      offer: parseOfferField(offer),
      hasVariants: hasVariants === "true" || hasVariants === true,
      variants: parsedVariants,
    }

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })

    // Try to populate, but don't fail if it doesn't work
    try {
      await updatedProduct.populate("category", "name _id")
      await updatedProduct.populate("offer", "name type value _id")
    } catch (populateError) {
      console.log("⚠️ Populate failed on update:", populateError.message)
    }

    console.log("✅ Product updated successfully:", updatedProduct._id)

    res.json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    })
  } catch (error) {
    console.error("❌ Update product error:", error)

    if (error.name === "ValidationError") {
      const errors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
      }))
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      })
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Duplicate value",
        details: "SKU or slug already exists",
      })
    }

    res.status(500).json({
      success: false,
      error: "Failed to update product",
      details: error.message,
    })
  }
})

// Delete product
router.delete("/:id", async (req, res) => {
  try {
    console.log("🗑️ Deleting product:", req.params.id)

    const { Product } = ensureModelsLoaded(req.tenantDB)

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      })
    }

    // Delete images from Cloudinary
    try {
      if (product.gallery && product.gallery.length > 0) {
        for (const imageUrl of product.gallery) {
          if (imageUrl.includes("cloudinary.com")) {
            const publicId = getPublicIdFromUrl(imageUrl)
            if (publicId) {
              await deleteImage(`yesp-products/${publicId}`)
            }
          }
        }
      }
    } catch (imageError) {
      console.error("⚠️ Error deleting images:", imageError)
      // Continue with product deletion even if image deletion fails
    }

    await Product.findByIdAndDelete(req.params.id)

    console.log("✅ Product deleted successfully:", req.params.id)

    res.json({
      success: true,
      message: "Product deleted successfully",
    })
  } catch (error) {
    console.error("❌ Delete product error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to delete product",
      details: error.message,
    })
  }
})

// Upload single image endpoint
router.post("/upload-image", fileUpload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image file provided",
      })
    }

    console.log("📸 Uploading single image...")

    const result = await upload(req.file.buffer, "yesp-products")

    console.log("✅ Image uploaded successfully:", result.public_id)

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
    })
  } catch (error) {
    console.error("❌ Upload error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to upload image",
      details: error.message,
    })
  }
})

// Delete single image endpoint
router.delete("/delete-image", async (req, res) => {
  try {
    const { imageUrl } = req.body

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: "Image URL is required",
      })
    }

    console.log("🗑️ Deleting image:", imageUrl)

    const publicId = getPublicIdFromUrl(imageUrl)
    if (publicId) {
      await deleteImage(`yesp-products/${publicId}`)
    }

    console.log("✅ Image deleted successfully")

    res.json({
      success: true,
      message: "Image deleted successfully",
    })
  } catch (error) {
    console.error("❌ Delete image error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to delete image",
      details: error.message,
    })
  }
})

module.exports = router
