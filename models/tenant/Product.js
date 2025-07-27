const mongoose = require("mongoose")

module.exports = (tenantDB) => {
  // Check if model already exists to avoid re-compilation
  if (tenantDB.models.Product) {
    return tenantDB.models.Product
  }

  // Variant subdocument schema
  const variantSchema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: [true, "Variant name is required"],
        trim: true,
        maxlength: [100, "Variant name cannot exceed 100 characters"],
      },
      options: [
        {
          type: String,
          trim: true,
        },
      ],
      price: {
        type: String,
        required: [true, "Variant price is required"],
        validate: {
          validator: (v) => {
            const price = Number.parseFloat(v)
            return !isNaN(price) && price >= 0
          },
          message: "Price must be a valid positive number",
        },
      },
      originalPrice: {
        type: String,
        validate: {
          validator: (v) => {
            if (!v) return true // Optional field
            const price = Number.parseFloat(v)
            return !isNaN(price) && price >= 0
          },
          message: "Original price must be a valid positive number",
        },
      },
      stock: {
        type: String,
        required: [true, "Variant stock is required"],
        validate: {
          validator: (v) => {
            const stock = Number.parseInt(v)
            return !isNaN(stock) && stock >= 0
          },
          message: "Stock must be a valid non-negative number",
        },
      },
      sku: {
        type: String,
        required: [true, "Variant SKU is required"],
        trim: true,
        uppercase: true,
        maxlength: [50, "SKU cannot exceed 50 characters"],
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      image: {
        type: String,
        trim: true,
        default: "",
      },
    },
    {
      timestamps: true,
      _id: true, // Allow MongoDB to auto-generate _id for variants
    },
  )

  // Dimensions subdocument schema
  const dimensionsSchema = new mongoose.Schema(
    {
      length: {
        type: Number,
        default: 0,
        min: [0, "Length cannot be negative"],
      },
      width: {
        type: Number,
        default: 0,
        min: [0, "Width cannot be negative"],
      },
      height: {
        type: Number,
        default: 0,
        min: [0, "Height cannot be negative"],
      },
    },
    { _id: false },
  )

  // Main Product schema
  const productSchema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: [true, "Product name is required"],
        trim: true,
        maxlength: [200, "Product name cannot exceed 200 characters"],
        index: true,
      },
      slug: {
        type: String,
        required: [true, "Product slug is required"],
        trim: true,
        lowercase: true,
        maxlength: [250, "Slug cannot exceed 250 characters"],
        index: true,
      },
      sku: {
        type: String,
        required: [true, "SKU is required"],
        trim: true,
        uppercase: true,
        unique: true,
        maxlength: [50, "SKU cannot exceed 50 characters"],
        index: true,
      },
      shortDescription: {
        type: String,
        required: [true, "Short description is required"],
        trim: true,
        maxlength: [500, "Short description cannot exceed 500 characters"],
      },
      description: {
        type: String,
        required: [true, "Description is required"],
        trim: true,
        maxlength: [5000, "Description cannot exceed 5000 characters"],
      },
      category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: [true, "Category is required"],
        index: true,
      },
      tags: [
        {
          type: String,
          trim: true,
          lowercase: true,
          maxlength: [50, "Tag cannot exceed 50 characters"],
        },
      ],

      // Pricing fields (for non-variant products)
      price: {
        type: Number,
        required: function () {
          return !this.hasVariants
        },
        min: [0, "Price cannot be negative"],
        validate: {
          validator: function (v) {
            if (this.hasVariants) return true // Skip validation for variant products
            return v != null && v >= 0
          },
          message: "Price is required for non-variant products",
        },
      },
      originalPrice: {
        type: Number,
        min: [0, "Original price cannot be negative"],
        validate: {
          validator: function (v) {
            if (!v || this.hasVariants) return true
            return v > this.price
          },
          message: "Original price must be greater than selling price",
        },
      },
      taxPercentage: {
        type: Number,
        default: 0,
        min: [0, "Tax percentage cannot be negative"],
        max: [100, "Tax percentage cannot exceed 100%"],
      },

      // Stock fields (for non-variant products)
      stock: {
        type: Number,
        required: function () {
          return !this.hasVariants
        },
        min: [0, "Stock cannot be negative"],
        validate: {
          validator: function (v) {
            if (this.hasVariants) return true // Skip validation for variant products
            return v != null && v >= 0
          },
          message: "Stock is required for non-variant products",
        },
        index: true,
      },
      lowStockAlert: {
        type: Number,
        default: 5,
        min: [0, "Low stock alert cannot be negative"],
      },
      allowBackorders: {
        type: Boolean,
        default: false,
      },

      // Media fields
      thumbnail: {
        type: String,
        trim: true,
        default: "",
      },
      gallery: [
        {
          type: String,
          trim: true,
        },
      ],

      // Physical properties
      weight: {
        type: Number,
        default: 0,
        min: [0, "Weight cannot be negative"],
      },
      dimensions: {
        type: dimensionsSchema,
        default: () => ({ length: 0, width: 0, height: 0 }),
      },

      // SEO fields
      metaTitle: {
        type: String,
        trim: true,
        maxlength: [60, "Meta title cannot exceed 60 characters"],
      },
      metaDescription: {
        type: String,
        trim: true,
        maxlength: [160, "Meta description cannot exceed 160 characters"],
      },

      // Offer/Discount
      offer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Offer",
        default: null,
      },

      // Variant system
      hasVariants: {
        type: Boolean,
        default: false,
        index: true,
      },
      variants: {
        type: [variantSchema],
        default: [],
        validate: {
          validator: function (variants) {
            if (!this.hasVariants) {
              return variants.length === 0
            }
            if (variants.length === 0) {
              return false // Must have at least one variant if hasVariants is true
            }

            // Check for duplicate SKUs within variants
            const skus = variants.map((v) => v.sku)
            const uniqueSkus = [...new Set(skus)]
            return skus.length === uniqueSkus.length
          },
          message: function (props) {
            if (!this.hasVariants && props.value.length > 0) {
              return "Variants should be empty when hasVariants is false"
            }
            if (this.hasVariants && props.value.length === 0) {
              return "At least one variant is required when hasVariants is true"
            }
            return "Duplicate variant SKUs are not allowed"
          },
        },
      },

      // Status and timestamps
      isActive: {
        type: Boolean,
        default: true,
        index: true,
      },

      // Computed fields
      stockStatus: {
        type: String,
        enum: ["in-stock", "low-stock", "out-of-stock", "backorderable"],
        default: "in-stock",
      },

      // Analytics fields
      viewCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      salesCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    {
      timestamps: true,
      toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
          // Convert price and stock to numbers for JSON output
          if (!ret.hasVariants) {
            ret.price = Number.parseFloat(ret.price) || 0
            ret.stock = Number.parseInt(ret.stock) || 0
          }

          // Convert variant prices and stocks to numbers
          if (ret.variants && ret.variants.length > 0) {
            ret.variants = ret.variants.map((variant) => ({
              ...variant,
              price: Number.parseFloat(variant.price) || 0,
              originalPrice: variant.originalPrice ? Number.parseFloat(variant.originalPrice) : undefined,
              stock: Number.parseInt(variant.stock) || 0,
            }))
          }

          return ret
        },
      },
      toObject: { virtuals: true },
    },
  )

  // Indexes for better performance
  productSchema.index({ name: "text", shortDescription: "text", description: "text" })
  productSchema.index({ category: 1, isActive: 1 })
  productSchema.index({ tags: 1 })
  productSchema.index({ createdAt: -1 })
  productSchema.index({ price: 1 })
  productSchema.index({ stock: 1 })
  productSchema.index({ sku: 1 }, { unique: true })
  productSchema.index({ slug: 1 }, { unique: true })

  // Virtual for discount percentage
  productSchema.virtual("discountPercentage").get(function () {
    if (this.originalPrice && this.originalPrice > this.price) {
      return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100)
    }
    return 0
  })

  // Virtual for total variant stock
  productSchema.virtual("totalVariantStock").get(function () {
    if (!this.hasVariants || !this.variants || this.variants.length === 0) {
      return 0
    }
    return this.variants.reduce((total, variant) => {
      return total + (Number.parseInt(variant.stock) || 0)
    }, 0)
  })

  // Virtual for lowest variant price
  productSchema.virtual("lowestVariantPrice").get(function () {
    if (!this.hasVariants || !this.variants || this.variants.length === 0) {
      return this.price || 0
    }
    const prices = this.variants.map((v) => Number.parseFloat(v.price) || 0)
    return Math.min(...prices)
  })

  // Pre-save middleware
  productSchema.pre("save", function (next) {
    // Generate slug if not provided
    if (!this.slug && this.name) {
      this.slug = this.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    }

    // Update stock status
    this.updateStockStatus()

    // Set thumbnail from gallery if not set
    if (!this.thumbnail && this.gallery && this.gallery.length > 0) {
      this.thumbnail = this.gallery[0]
    }

    // Validate variant-specific logic
    if (this.hasVariants) {
      // Reset main product price and stock for variant products
      this.price = 0
      this.stock = 0

      // Ensure we have variants
      if (!this.variants || this.variants.length === 0) {
        return next(new Error("At least one variant is required when hasVariants is true"))
      }

      // Validate variant SKUs are unique
      const variantSkus = this.variants.map((v) => v.sku)
      const uniqueSkus = [...new Set(variantSkus)]
      if (variantSkus.length !== uniqueSkus.length) {
        return next(new Error("Variant SKUs must be unique"))
      }

      // Check for duplicate with main product SKU
      if (variantSkus.includes(this.sku)) {
        return next(new Error("Variant SKU cannot be the same as product SKU"))
      }
    } else {
      // Clear variants for non-variant products
      this.variants = []
    }

    next()
  })

  // Instance method to update stock status
  productSchema.methods.updateStockStatus = function () {
    let currentStock = this.stock

    if (this.hasVariants) {
      currentStock = this.totalVariantStock
    }

    if (currentStock === 0) {
      this.stockStatus = this.allowBackorders ? "backorderable" : "out-of-stock"
    } else if (currentStock <= this.lowStockAlert) {
      this.stockStatus = "low-stock"
    } else {
      this.stockStatus = "in-stock"
    }
  }

  // Instance method to check if product is in stock
  productSchema.methods.isInStock = function () {
    if (this.hasVariants) {
      return this.variants.some((variant) => Number.parseInt(variant.stock) > 0)
    }
    return this.stock > 0
  }

  // Instance method to get available stock
  productSchema.methods.getAvailableStock = function (variantId = null) {
    if (this.hasVariants && variantId) {
      const variant = this.variants.id(variantId)
      return variant ? Number.parseInt(variant.stock) : 0
    }

    if (this.hasVariants) {
      return this.totalVariantStock
    }

    return this.stock
  }

  // Instance method to reduce stock
  productSchema.methods.reduceStock = function (quantity, variantId = null) {
    if (this.hasVariants && variantId) {
      const variant = this.variants.id(variantId)
      if (variant) {
        const currentStock = Number.parseInt(variant.stock)
        variant.stock = Math.max(0, currentStock - quantity).toString()
      }
    } else if (!this.hasVariants) {
      this.stock = Math.max(0, this.stock - quantity)
    }

    this.updateStockStatus()
  }

  // Static method to find products by category
  productSchema.statics.findByCategory = function (categoryId, options = {}) {
    const query = { category: categoryId, isActive: true }
    return this.find(query, null, options).populate("category", "name slug").populate("offer", "name type value")
  }

  // Static method to search products
  productSchema.statics.search = function (searchTerm, options = {}) {
    const query = {
      $and: [
        { isActive: true },
        {
          $or: [
            { name: { $regex: searchTerm, $options: "i" } },
            { shortDescription: { $regex: searchTerm, $options: "i" } },
            { tags: { $in: [new RegExp(searchTerm, "i")] } },
            { sku: { $regex: searchTerm, $options: "i" } },
          ],
        },
      ],
    }

    return this.find(query, null, options).populate("category", "name slug").populate("offer", "name type value")
  }

  // Static method to get low stock products
  productSchema.statics.getLowStockProducts = function () {
    return this.find({
      $or: [
        {
          hasVariants: false,
          stock: { $lte: this.schema.paths.lowStockAlert.default },
        },
        {
          hasVariants: true,
          "variants.stock": { $lte: this.schema.paths.lowStockAlert.default },
        },
      ],
      isActive: true,
    }).populate("category", "name")
  }

  // Create and return the model
  const Product = tenantDB.model("Product", productSchema)

  return Product
}
