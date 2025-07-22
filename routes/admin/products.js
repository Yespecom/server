const express = require("express")
const multer = require("multer")
const router = express.Router()
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

// Get all products
router.get("/", async (req, res) => {
  try {
    console.log("🔍 Getting all products...")

    // Ensure all models are loaded
    const { Product } = ensureModelsLoaded(req.tenantDB)

    // Try to get products with populate, fallback to without populate
    let products
    try {
      products = await Product.find().populate("category").populate("offer").sort({ createdAt: -1 })
      console.log("✅ Products loaded with populate")
    } catch (populateError) {
      console.log("⚠️ Populate failed, loading without populate:", populateError.message)
      products = await Product.find().sort({ createdAt: -1 })
    }

    console.log(`✅ Found ${products.length} products`)
    res.json(products)
  } catch (error) {
    console.error("❌ Get products error:", error)
    res.status(500).json({ error: error.message })
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
      product = await Product.findById(req.params.id).populate("category").populate("offer")
    } catch (populateError) {
      console.log("⚠️ Populate failed, loading without populate")
      product = await Product.findById(req.params.id)
    }

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    console.log("✅ Product found:", product.name)
    res.json(product)
  } catch (error) {
    console.error("❌ Get product error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Create product - FIXED VERSION


router.post("/", testUpload.array("images", 10), async (req, res) => {
  try {
    const { Product } = ensureModelsLoaded(req.tenantDB);

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
      shippingClass,
      metaTitle,
      metaDescription,
      offer,
      hasVariants,
      variants,
      existingImages,
    } = req.body;

    let gallery = [];
    if (existingImages) {
      try {
        const parsed = JSON.parse(existingImages);
        if (Array.isArray(parsed)) gallery = parsed;
      } catch (err) {
        console.warn("Invalid existingImages JSON");
      }
    }

    if (req.files && req.files.length > 0) {
      const uploads = await Promise.all(
        req.files.map(file => upload(file.buffer, "yesp-products"))
      );
      gallery = [...gallery, ...uploads.map(f => f.secure_url)];
    }

    if (gallery.length === 0) {
      return res.status(400).json({ error: "At least one product image is required" });
    }

    const slug = name.toLowerCase().replace(/\s+/g, "-");

    const product = new Product({
      name,
      slug,
      sku,
      category,
      tags: typeof tags === "string" ? tags.split(",").map(t => t.trim()) : [],
      shortDescription,
      description,
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : undefined,
      taxPercentage: parseFloat(taxPercentage) || 0,
      stock: parseInt(stock),
      lowStockAlert: parseInt(lowStockAlert) || 0,
      allowBackorders: allowBackorders === "true" || allowBackorders === true,
      thumbnail: gallery[0],
      gallery,
      weight: parseFloat(weight) || 0,
      dimensions: typeof dimensions === "string" ? JSON.parse(dimensions) : {},
      shippingClass,
      metaTitle,
      metaDescription,
      offer: offer || null,
      hasVariants: hasVariants === "true" || hasVariants === true,
      variants: hasVariants === "true" ? (Array.isArray(variants) ? variants : []) : [],
      isActive: true,
      isFeatured: false,
      status: "published",
    });

    await product.save();
    res.status(201).json({ success: true, product });
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({ error: "Failed to create product", details: err.message });
  }
});

module.exports = router;


// Update product - FIXED VERSION
router.put("/:id", upload.array("images", 10), async (req, res) => {
  try {
    console.log("📝 Updating product:", req.params.id)

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
      shippingClass,
      metaTitle,
      metaDescription,
      offer,
      hasVariants,
      variants,
      existingImages,
    } = req.body

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Handle image updates
    let gallery = []
    try {
      gallery = parseExistingImages(existingImages)
    } catch (e) {
      console.error("Error parsing existing images:", e)
      gallery = []
    }

    // Add new uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => file.path)
      gallery = [...gallery, ...newImages]
    }

    // Parse and validate price fields
    const parsedPrice = Number.parseFloat(price)
    let parsedOriginalPrice = originalPrice ? Number.parseFloat(originalPrice) : undefined

    // Handle originalPrice validation logic
    if (parsedOriginalPrice && parsedOriginalPrice < parsedPrice) {
      console.log("⚠️ Original price is less than current price, setting to null for no discount")
      parsedOriginalPrice = undefined
    }

    // Parse JSON fields safely
    let parsedTags = []
    try {
      parsedTags = tags ? (typeof tags === "string" ? JSON.parse(tags) : tags) : []
    } catch (e) {
      console.error("Error parsing tags:", e)
      parsedTags = []
    }

    let parsedDimensions = { length: 0, width: 0, height: 0 }
    try {
      parsedDimensions = dimensions
        ? typeof dimensions === "string"
          ? JSON.parse(dimensions)
          : dimensions
        : { length: 0, width: 0, height: 0 }
    } catch (e) {
      console.error("Error parsing dimensions:", e)
    }

    let parsedVariants = []
    try {
      parsedVariants =
        variants && hasVariants === "true" ? (typeof variants === "string" ? JSON.parse(variants) : variants) : []
    } catch (e) {
      console.error("Error parsing variants:", e)
      parsedVariants = []
    }

    // Parse offer field properly
    const parsedOffer = parseOfferField(offer)

    // Generate slug if name changed
    const slug = name !== product.name ? generateSlug(name) : product.slug

    // Update product fields
    const updateData = {
      name,
      slug,
      sku: sku.toUpperCase(),
      category,
      tags: parsedTags,
      shortDescription,
      description,
      price: parsedPrice,
      originalPrice: parsedOriginalPrice, // Now properly handled
      taxPercentage: taxPercentage ? Number.parseFloat(taxPercentage) : 0,
      stock: Number.parseInt(stock),
      lowStockAlert: lowStockAlert ? Number.parseInt(lowStockAlert) : 5,
      allowBackorders: allowBackorders === "true",
      gallery,
      thumbnail: gallery.length > 0 ? gallery[0] : product.thumbnail,
      weight: weight ? Number.parseFloat(weight) : 0,
      dimensions: parsedDimensions,
      shippingClass: shippingClass || "default",
      metaTitle,
      metaDescription,
      offer: parsedOffer,
      hasVariants: hasVariants === "true",
      variants: parsedVariants,
    }

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true })

    // Try to populate, but don't fail if it doesn't work
    try {
      await updatedProduct.populate("category")
      await updatedProduct.populate("offer")
    } catch (populateError) {
      console.log("⚠️ Populate failed on update:", populateError.message)
    }

    console.log("✅ Product updated successfully:", updatedProduct._id)
    res.json(updatedProduct)
  } catch (error) {
    console.error("❌ Update product error:", error)

    if (error.name === "ValidationError") {
      const errors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
      }))
      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      })
    }

    if (error.code === 11000) {
      return res.status(400).json({
        error: "Duplicate value",
        details: "SKU or slug already exists",
      })
    }

    res.status(500).json({ error: error.message })
  }
})

// Delete product
router.delete("/:id", async (req, res) => {
  try {
    const { Product } = ensureModelsLoaded(req.tenantDB)
    const product = await Product.findById(req.params.id)

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Delete images from Cloudinary
    try {
      for (const imageUrl of product.gallery) {
        if (imageUrl.includes("cloudinary.com")) {
          const publicId = getPublicIdFromUrl(imageUrl)
          if (publicId) {
            await deleteImage(`yesp-products/${publicId}`)
          }
        }
      }
    } catch (imageError) {
      console.error("Error deleting images:", imageError)
      // Continue with product deletion even if image deletion fails
    }

    await Product.findByIdAndDelete(req.params.id)
    console.log("✅ Product deleted successfully:", req.params.id)
    res.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("❌ Delete product error:", error)
    res.status(500).json({ error: error.message })
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
