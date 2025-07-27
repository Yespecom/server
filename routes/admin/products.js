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
    if (existingImages.trim() === "") return []
    if (existingImages.startsWith("[") || existingImages.startsWith("{")) {
      try {
        const parsed = JSON.parse(existingImages)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch (e) {
        console.error("❌ Error parsing existing images JSON:", e)
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
  if (typeof offer === "string" && offer.match(/^[0-9a-fA-F]{24}$/)) {
    return offer
  }
  if (Array.isArray(offer)) {
    const validId = offer.find((id) => id && typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/))
    return validId || null
  }
  return null
}

// FIXED: Enhanced variant parsing with proper trackQuantity handling
const parseVariants = (variants, hasVariants, trackQuantity) => {
  console.log("🔍 Parsing variants:", variants, "hasVariants:", hasVariants, "trackQuantity:", trackQuantity)

  // Return empty array if variants are not enabled
  if (!hasVariants || hasVariants === "false" || hasVariants === false) {
    console.log("📝 Variants disabled, returning empty array")
    return []
  }

  if (!variants) {
    console.log("📝 No variants data provided")
    return []
  }

  try {
    let parsedVariants = []

    // Parse variants from string or use array directly
    if (typeof variants === "string") {
      parsedVariants = JSON.parse(variants)
    } else if (Array.isArray(variants)) {
      parsedVariants = variants
    } else {
      console.log("📝 Invalid variants format")
      return []
    }

    // Parse trackQuantity properly
    const shouldTrackQuantity = trackQuantity === "true" || trackQuantity === true || trackQuantity === 1
    console.log("📝 Should track quantity:", shouldTrackQuantity)

    // Validate and process each variant
    const processedVariants = parsedVariants.map((variant, index) => {
      console.log(`🔄 Processing variant ${index + 1}:`, variant)

      // Validate required fields (stock is optional if not tracking quantity)
      const requiredFields = ["name", "price", "sku"]
      if (shouldTrackQuantity) {
        requiredFields.push("stock")
      }

      const missingFields = requiredFields.filter((field) => {
        const value = variant[field]
        if (field === "stock" && !shouldTrackQuantity) {
          return false // Don't require stock if not tracking
        }
        return !value && value !== "0" && value !== 0
      })

      if (missingFields.length > 0) {
        console.error(`❌ Variant ${index + 1} missing required fields:`, missingFields)
        throw new Error(`Variant ${index + 1} is missing required fields: ${missingFields.join(", ")}`)
      }

      // Convert and validate numeric fields
      const price = Number.parseFloat(variant.price)
      const originalPrice = variant.originalPrice ? Number.parseFloat(variant.originalPrice) : undefined

      if (isNaN(price) || price < 0) {
        throw new Error(`Variant "${variant.name}" has invalid price: ${variant.price}`)
      }

      if (originalPrice !== undefined && (isNaN(originalPrice) || originalPrice < 0)) {
        throw new Error(`Variant "${variant.name}" has invalid original price: ${variant.originalPrice}`)
      }

      // Create processed variant object
      const processedVariant = {
        name: variant.name.trim(),
        options: Array.isArray(variant.options) ? variant.options : [variant.name.trim()],
        price: price.toString(), // Keep as string to match schema
        originalPrice: originalPrice ? originalPrice.toString() : undefined,
        sku: variant.sku.trim().toUpperCase(),
        isActive: variant.isActive !== undefined ? Boolean(variant.isActive) : true,
        image: variant.image || "",
      }

      // FIXED: Only include stock if quantity tracking is enabled
      if (shouldTrackQuantity) {
        if (variant.stock === undefined || variant.stock === null || variant.stock === "") {
          processedVariant.stock = "0" // Default to 0
        } else {
          const stock = Number.parseInt(variant.stock)
          if (isNaN(stock) || stock < 0) {
            throw new Error(`Variant "${variant.name}" has invalid stock: ${variant.stock}`)
          }
          processedVariant.stock = stock.toString()
        }
      }

      // Only include _id if it's a valid ObjectId (not temp ID)
      if (
        variant._id &&
        !variant._id.toString().startsWith("temp-") &&
        variant._id.toString().match(/^[0-9a-fA-F]{24}$/)
      ) {
        processedVariant._id = variant._id
      }

      console.log(`✅ Processed variant ${index + 1}:`, processedVariant)
      return processedVariant
    })

    // Check for duplicate SKUs within variants
    const skus = processedVariants.map((v) => v.sku)
    const duplicateSkus = skus.filter((sku, index) => skus.indexOf(sku) !== index)
    if (duplicateSkus.length > 0) {
      throw new Error(`Duplicate variant SKUs found: ${duplicateSkus.join(", ")}`)
    }

    console.log(`✅ Successfully processed ${processedVariants.length} variants`)
    return processedVariants
  } catch (e) {
    console.error("❌ Error parsing variants:", e)
    throw new Error(`Variant parsing failed: ${e.message}`)
  }
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
    console.log("🔍 Loading models for tenant database...")

    // Load Product model with error handling
    let Product
    try {
      const ProductModel = require("../../models/tenant/Product")
      if (typeof ProductModel === "function") {
        Product = ProductModel(tenantDB)
      } else {
        throw new Error("Product model export is not a function")
      }
      console.log("✅ Product model loaded successfully")
    } catch (productError) {
      console.error("❌ Error loading Product model:", productError)
      throw new Error(`Failed to load Product model: ${productError.message}`)
    }

    // Load Category model with fallback
    let Category
    try {
      const CategoryModel = require("../../models/tenant/Category")
      if (typeof CategoryModel === "function") {
        Category = CategoryModel(tenantDB)
      } else {
        throw new Error("Category model export is not a function")
      }
      console.log("✅ Category model loaded successfully")
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

    // Load Offer model with fallback
    let Offer
    try {
      const OfferModel = require("../../models/tenant/Offer")
      if (typeof OfferModel === "function") {
        Offer = OfferModel(tenantDB)
      } else {
        throw new Error("Offer model export is not a function")
      }
      console.log("✅ Offer model loaded successfully")
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

    console.log("✅ All models loaded successfully")
    return { Product, Category, Offer }
  } catch (error) {
    console.error("❌ Error in ensureModelsLoaded:", error)
    throw new Error(`Model loading failed: ${error.message}`)
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

ensureUploadDirs()

// Get all products
router.get("/", async (req, res) => {
  try {
    console.log("🔍 Getting all products...")
    const { Product } = ensureModelsLoaded(req.tenantDB)

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

// FIXED: Create product with proper trackQuantity handling
router.post("/", fileUpload.array("images", 10), async (req, res) => {
  try {
    console.log("📝 Creating new product...")
    console.log("📋 Request body keys:", Object.keys(req.body))
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
      trackQuantity, // NEW: Quantity tracking toggle
    } = req.body

    // FIXED: Parse trackQuantity with proper boolean conversion
    const shouldTrackQuantity = trackQuantity === "true" || trackQuantity === true || trackQuantity === 1
    console.log("🔍 Track quantity parsed:", shouldTrackQuantity, "from:", trackQuantity, typeof trackQuantity)

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Product name is required",
      })
    }

    if (!sku || !sku.trim()) {
      return res.status(400).json({
        success: false,
        error: "SKU is required",
      })
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        error: "Category is required",
      })
    }

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

    // Parse and validate variants
    let parsedVariants = []
    const isVariantProduct = hasVariants === "true" || hasVariants === true

    try {
      parsedVariants = parseVariants(variants, isVariantProduct, shouldTrackQuantity)
      console.log("🔄 Parsed variants:", parsedVariants.length)
    } catch (variantError) {
      console.error("❌ Variant parsing error:", variantError)
      return res.status(400).json({
        success: false,
        error: "Variant validation failed",
        details: variantError.message,
      })
    }

    // Validate images based on product type
    if (!isVariantProduct && gallery.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one product image is required",
      })
    }

    if (isVariantProduct) {
      if (parsedVariants.length === 0) {
        return res.status(400).json({
          success: false,
          error: "At least one variant is required when variants are enabled",
        })
      }

      // For variant products, check if at least one image exists (main or variant)
      const hasMainImages = gallery.length > 0
      const hasVariantImages = parsedVariants.some((variant) => variant.image && variant.image.trim() !== "")

      if (!hasMainImages && !hasVariantImages) {
        return res.status(400).json({
          success: false,
          error: "At least one image is required (either main product images or variant images)",
        })
      }
    }

    // FIXED: Validate non-variant product fields (stock only if tracking quantity)
    if (!isVariantProduct) {
      if (!price || Number.parseFloat(price) <= 0) {
        return res.status(400).json({
          success: false,
          error: "Price must be greater than 0",
        })
      }

      if (shouldTrackQuantity) {
        // Only validate stock if tracking is enabled
        if (stock === undefined || stock === null || stock === "") {
          // Set default stock to 0 if tracking is enabled but no stock provided
          console.log("⚠️ No stock provided, setting default to 0")
        } else if (Number.parseInt(stock) < 0) {
          return res.status(400).json({
            success: false,
            error: "Stock quantity cannot be negative when quantity tracking is enabled",
          })
        }
      }
    }

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

    // FIXED: Create product data with proper trackQuantity handling
    const productData = {
      name: name.trim(),
      slug,
      sku: sku.toUpperCase().trim(),
      category,
      tags: parsedTags,
      shortDescription: shortDescription?.trim() || "",
      description: description?.trim() || "",
      price: isVariantProduct ? 0 : Number.parseFloat(price) || 0,
      originalPrice: !isVariantProduct && originalPrice ? Number.parseFloat(originalPrice) : undefined,
      taxPercentage: Number.parseFloat(taxPercentage) || 0,
      lowStockAlert: Number.parseInt(lowStockAlert) || 5,
      allowBackorders: allowBackorders === "true" || allowBackorders === true,
      thumbnail: gallery.length > 0 ? gallery[0] : "",
      gallery,
      weight: Number.parseFloat(weight) || 0,
      dimensions: parsedDimensions,
      metaTitle: metaTitle?.trim() || "",
      metaDescription: metaDescription?.trim() || "",
      offer: parseOfferField(offer),
      hasVariants: isVariantProduct,
      variants: parsedVariants,
      trackQuantity: shouldTrackQuantity, // NEW: Set quantity tracking
      isActive: true,
    }

    // FIXED: Only set stock if tracking quantity
    if (shouldTrackQuantity) {
      if (isVariantProduct) {
        productData.stock = 0 // Variants handle their own stock
      } else {
        productData.stock = stock !== undefined && stock !== null && stock !== "" ? Number.parseInt(stock) : 0 // Default to 0 if tracking but no stock provided
      }
    }
    // If not tracking quantity, don't set stock field at all

    console.log("📋 Final product data:", {
      ...productData,
      variants: productData.variants.length > 0 ? `${productData.variants.length} variants` : "no variants",
      trackQuantity: productData.trackQuantity,
      hasStock: "stock" in productData,
      stockValue: productData.stock,
    })

    // Create and save product
    const product = new Product(productData)
    await product.save()

    console.log("✅ Product created successfully:", product._id)
    console.log("✅ Product variants saved:", product.variants.length)
    console.log("✅ Quantity tracking:", product.trackQuantity)

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
      console.error("❌ Validation errors:", errors)
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

// ENHANCED: Update product with better error handling and logging
router.put("/:id", fileUpload.array("images", 10), async (req, res) => {
  try {
    console.log("📝 Updating product:", req.params.id)
    console.log("📋 Request body keys:", Object.keys(req.body))

    const { Product } = ensureModelsLoaded(req.tenantDB)

    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      })
    }

    console.log("📋 Current product trackQuantity:", product.trackQuantity)

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
      trackQuantity, // NEW: Quantity tracking toggle
    } = req.body

    // FIXED: Parse trackQuantity with proper boolean conversion and fallback
    let shouldTrackQuantity
    if (trackQuantity !== undefined) {
      shouldTrackQuantity = trackQuantity === "true" || trackQuantity === true || trackQuantity === 1
    } else {
      // If trackQuantity is not provided, use existing value or default to true
      shouldTrackQuantity = product.trackQuantity !== undefined ? product.trackQuantity : true
    }

    console.log("🔍 Track quantity parsed:", shouldTrackQuantity, "from:", trackQuantity, typeof trackQuantity)

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

    // Parse and validate variants
    let parsedVariants = []
    const isVariantProduct = hasVariants === "true" || hasVariants === true

    try {
      if (isVariantProduct) {
        parsedVariants = parseVariants(variants, isVariantProduct, shouldTrackQuantity)
        console.log("🔄 Updated variants:", parsedVariants.length)
      } else {
        // FIXED: Ensure variants array is empty when hasVariants is false
        parsedVariants = []
        console.log("🔄 Variants disabled, clearing variants array")
      }
    } catch (variantError) {
      console.error("❌ Variant parsing error:", variantError)
      return res.status(400).json({
        success: false,
        error: "Variant validation failed",
        details: variantError.message,
      })
    }

    // Parse and validate other fields
    const parsedPrice = isVariantProduct ? 0 : Number.parseFloat(price) || product.price
    let parsedOriginalPrice = !isVariantProduct && originalPrice ? Number.parseFloat(originalPrice) : undefined

    // Handle originalPrice validation logic
    if (parsedOriginalPrice && parsedOriginalPrice < parsedPrice) {
      console.log("⚠️ Original price is less than current price, setting to null")
      parsedOriginalPrice = undefined
    }

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

    // FIXED: Update product fields with proper trackQuantity handling
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
      lowStockAlert: Number.parseInt(lowStockAlert) || product.lowStockAlert || 5,
      allowBackorders: allowBackorders === "true" || allowBackorders === true,
      gallery,
      thumbnail: gallery.length > 0 ? gallery[0] : product.thumbnail,
      weight: Number.parseFloat(weight) || product.weight || 0,
      dimensions: parsedDimensions,
      metaTitle: metaTitle?.trim() || product.metaTitle,
      metaDescription: metaDescription?.trim() || product.metaDescription,
      offer: parseOfferField(offer),
      hasVariants: isVariantProduct,
      variants: parsedVariants, // This will be [] when hasVariants is false
      trackQuantity: shouldTrackQuantity,
    }

    // FIXED: Handle stock field based on trackQuantity
    if (shouldTrackQuantity) {
      if (isVariantProduct) {
        updateData.stock = 0 // Variants handle their own stock
      } else {
        // For non-variant products with quantity tracking
        if (stock !== undefined && stock !== null && stock !== "") {
          updateData.stock = Number.parseInt(stock)
        } else {
          // Keep existing stock or default to 0
          updateData.stock = product.stock !== undefined ? product.stock : 0
        }
      }
    } else {
      // If quantity tracking is disabled, we need to unset the stock field
      updateData.$unset = { stock: 1 }
    }

    console.log("📋 Update data:", {
      ...updateData,
      variants: updateData.variants.length > 0 ? `${updateData.variants.length} variants` : "no variants",
      trackQuantity: updateData.trackQuantity,
      hasStock: "stock" in updateData,
      stockValue: updateData.stock,
      hasUnset: "$unset" in updateData,
    })

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
    console.log("✅ Product variants updated:", updatedProduct.variants.length)
    console.log("✅ Quantity tracking:", updatedProduct.trackQuantity)

    res.json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    })
  } catch (error) {
    console.error("❌ Update product error:", error)
    console.error("❌ Error stack:", error.stack)

    // Enhanced error handling with more details
    if (error.name === "ValidationError") {
      const errors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
        kind: error.errors[key].kind,
        path: error.errors[key].path,
      }))
      console.error("❌ Detailed validation errors:", errors)
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
        debugInfo: {
          errorName: error.name,
          errorMessage: error.message,
        },
      })
    }

    if (error.code === 11000) {
      console.error("❌ Duplicate key error:", error.keyPattern, error.keyValue)
      return res.status(400).json({
        success: false,
        error: "Duplicate value",
        details: "SKU or slug already exists",
        debugInfo: {
          errorCode: error.code,
          keyPattern: error.keyPattern,
          keyValue: error.keyValue,
        },
      })
    }

    res.status(500).json({
      success: false,
      error: "Failed to update product",
      details: error.message,
      debugInfo: {
        errorName: error.name,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
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
    console.log("📸 Upload image endpoint hit")

    if (!req.file) {
      console.error("❌ No file provided")
      return res.status(400).json({
        success: false,
        error: "No image file provided",
      })
    }

    // Validate file type
    if (!req.file.mimetype.startsWith("image/")) {
      console.error("❌ Invalid file type:", req.file.mimetype)
      return res.status(415).json({
        success: false,
        error: "Only image files are allowed",
      })
    }

    // Validate file size (10MB limit)
    if (req.file.size > 10 * 1024 * 1024) {
      console.error("❌ File too large:", req.file.size)
      return res.status(413).json({
        success: false,
        error: "File size must be less than 10MB",
      })
    }

    console.log("📸 Starting Cloudinary upload...")
    const result = await upload(req.file.buffer, "yesp-products")

    console.log("✅ Cloudinary upload successful:", {
      public_id: result.public_id,
      secure_url: result.secure_url,
    })

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    })
  } catch (error) {
    console.error("❌ Upload image error:", error)

    if (error.message && error.message.includes("Invalid image file")) {
      return res.status(415).json({
        success: false,
        error: "Invalid image file format",
        details: error.message,
      })
    }

    if (error.message && error.message.includes("File size too large")) {
      return res.status(413).json({
        success: false,
        error: "File size too large",
        details: error.message,
      })
    }

    res.status(500).json({
      success: false,
      error: "Failed to upload image",
      details: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
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
