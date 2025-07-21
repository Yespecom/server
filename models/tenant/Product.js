const mongoose = require("mongoose")

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Product name cannot exceed 200 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [50, "SKU cannot exceed 50 characters"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (tags) => tags.length <= 20,
        message: "Cannot have more than 20 tags",
      },
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
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      validate: {
        validator: (price) => price > 0,
        message: "Price must be greater than 0",
      },
    },
    originalPrice: {
      type: Number,
      min: [0, "Original price cannot be negative"],
      validate: {
        validator: function (originalPrice) {
          // Only validate if originalPrice is provided and not null/undefined
          if (originalPrice != null && originalPrice !== 0) {
            // If originalPrice is set, it should be >= current price for discount logic
            if (this.price != null) {
              return originalPrice >= this.price
            }
          }
          return true
        },
        message: "Original price should be greater than or equal to current price (for discount calculation)",
      },
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: [0, "Tax percentage cannot be negative"],
      max: [100, "Tax percentage cannot exceed 100"],
    },
    stock: {
      type: Number,
      required: [true, "Stock quantity is required"],
      min: [0, "Stock cannot be negative"],
      default: 0,
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
    thumbnail: {
      type: String,
      trim: true,
      validate: {
        validator: (thumbnail) => {
          // Allow empty string or valid URL/path
          if (!thumbnail) return true
          return thumbnail.length > 0
        },
        message: "Thumbnail must be a valid URL or path",
      },
    },
    gallery: {
      type: [String],
      default: [],
      validate: {
        validator: (gallery) => gallery.length <= 20,
        message: "Cannot have more than 20 images in gallery",
      },
    },
    weight: {
      type: Number,
      default: 0,
      min: [0, "Weight cannot be negative"],
    },
    dimensions: {
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
    shippingClass: {
      type: String,
      default: "default",
      enum: {
        values: ["default", "express", "free", "heavy", "fragile"],
        message: "Invalid shipping class",
      },
    },
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
    offer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
      validate: {
        validator: (offerId) => {
          // Allow null/undefined or valid ObjectId
          if (!offerId) return true
          return mongoose.Types.ObjectId.isValid(offerId)
        },
        message: "Invalid offer ID",
      },
    },
    hasVariants: {
      type: Boolean,
      default: false,
    },
    variants: [
      {
        name: {
          type: String,
          required: [true, "Variant name is required"],
          trim: true,
        },
        options: {
          type: [String],
          required: [true, "Variant options are required"],
          validate: {
            validator: (options) => options && options.length > 0,
            message: "Variant must have at least one option",
          },
        },
        price: {
          type: Number,
          min: [0, "Variant price cannot be negative"],
        },
        stock: {
          type: Number,
          min: [0, "Variant stock cannot be negative"],
          default: 0,
        },
        sku: {
          type: String,
          trim: true,
          uppercase: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
      min: [0, "Views cannot be negative"],
    },
    sales: {
      type: Number,
      default: 0,
      min: [0, "Sales cannot be negative"],
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: [0, "Rating cannot be negative"],
        max: [5, "Rating cannot exceed 5"],
      },
      count: {
        type: Number,
        default: 0,
        min: [0, "Rating count cannot be negative"],
      },
    },
    seoKeywords: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ["draft", "published", "archived", "out_of_stock"],
        message: "Invalid product status",
      },
      default: "published",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Virtual fields
productSchema.virtual("isOnSale").get(function () {
  return this.originalPrice && this.originalPrice > this.price
})

productSchema.virtual("discountPercentage").get(function () {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100)
  }
  return 0
})

productSchema.virtual("isLowStock").get(function () {
  return this.stock <= this.lowStockAlert
})

productSchema.virtual("isOutOfStock").get(function () {
  return this.stock === 0 && !this.allowBackorders
})

productSchema.virtual("totalVariantStock").get(function () {
  if (!this.hasVariants || !this.variants.length) return this.stock
  return this.variants.reduce((total, variant) => total + (variant.stock || 0), 0)
})

// Pre-save middleware to generate slug
productSchema.pre("save", function (next) {
  if (this.isModified("name") || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")

    // Ensure slug is not empty
    if (!this.slug) {
      this.slug = `product-${Date.now()}`
    }
  }

  // Set thumbnail to first gallery image if not set
  if (!this.thumbnail && this.gallery && this.gallery.length > 0) {
    this.thumbnail = this.gallery[0]
  }

  // Auto-generate meta title if not set
  if (!this.metaTitle) {
    this.metaTitle = this.name.substring(0, 60)
  }

  // Auto-generate meta description if not set
  if (!this.metaDescription) {
    this.metaDescription = this.shortDescription.substring(0, 160)
  }

  next()
})

// Pre-save middleware to handle variants
productSchema.pre("save", function (next) {
  if (this.hasVariants && this.variants && this.variants.length > 0) {
    // Generate SKUs for variants if not provided
    this.variants.forEach((variant, index) => {
      if (!variant.sku) {
        variant.sku = `${this.sku}-V${index + 1}`
      }
    })
  }
  next()
})

// Instance methods
productSchema.methods.incrementViews = function () {
  this.views += 1
  return this.save()
}

productSchema.methods.incrementSales = function (quantity = 1) {
  this.sales += quantity
  return this.save()
}

productSchema.methods.updateStock = function (quantity, operation = "subtract") {
  if (operation === "subtract") {
    this.stock = Math.max(0, this.stock - quantity)
  } else if (operation === "add") {
    this.stock += quantity
  }
  return this.save()
}

productSchema.methods.getDiscountedPrice = function () {
  if (this.offer && this.offer.isActive) {
    // This would need the offer to be populated
    return this.price // Simplified - would calculate based on offer
  }
  return this.price
}

// Static methods
productSchema.statics.findActive = function () {
  return this.find({ isActive: true, status: "published" })
}

productSchema.statics.findByCategory = function (categoryId) {
  return this.find({ category: categoryId, isActive: true, status: "published" })
}

productSchema.statics.findLowStock = function () {
  return this.find({
    $expr: { $lte: ["$stock", "$lowStockAlert"] },
    isActive: true,
  })
}

productSchema.statics.findFeatured = function () {
  return this.find({ isFeatured: true, isActive: true, status: "published" })
}

// Indexes for better performance
productSchema.index({ name: "text", description: "text", shortDescription: "text" })
productSchema.index({ category: 1, isActive: 1 })
productSchema.index({ isActive: 1, status: 1 })
productSchema.index({ slug: 1 }, { unique: true })
productSchema.index({ sku: 1 }, { unique: true })
productSchema.index({ price: 1 })
productSchema.index({ createdAt: -1 })
productSchema.index({ sales: -1 })
productSchema.index({ views: -1 })
productSchema.index({ "rating.average": -1 })
productSchema.index({ isFeatured: 1, isActive: 1 })
productSchema.index({ tags: 1 })

// Compound indexes
productSchema.index({ category: 1, price: 1 })
productSchema.index({ isActive: 1, status: 1, createdAt: -1 })
productSchema.index({ category: 1, isActive: 1, status: 1 })

module.exports = (connection) => connection.model("Product", productSchema)
