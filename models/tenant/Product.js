module.exports = (tenantDB) => {
  const mongoose = require("mongoose")

  const productSchema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      shortDescription: {
        type: String,
        trim: true,
      },
      slug: {
        type: String,
        unique: true,
        lowercase: true,
      },
      sku: {
        type: String,
        unique: true,
        sparse: true,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      originalPrice: {
        type: Number,
        min: 0,
      },
      comparePrice: {
        type: Number,
        min: 0,
      },
      costPrice: {
        type: Number,
        min: 0,
      },
      taxPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
      },
      subcategories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      offer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Offer",
        default: null,
      },
      // Updated image structure to match frontend expectations
      gallery: [String], // Array of image URLs
      thumbnail: String, // Primary image URL
      images: [
        {
          url: String,
          alt: String,
          isPrimary: {
            type: Boolean,
            default: false,
          },
        },
      ],
      // Updated inventory structure
      stock: {
        type: Number,
        default: 0,
        min: 0,
      },
      lowStockAlert: {
        type: Number,
        default: 5,
        min: 0,
      },
      allowBackorders: {
        type: Boolean,
        default: false,
      },
      inventory: {
        trackQuantity: {
          type: Boolean,
          default: true,
        },
        quantity: {
          type: Number,
          default: 0,
        },
        lowStockThreshold: {
          type: Number,
          default: 5,
        },
        allowBackorder: {
          type: Boolean,
          default: false,
        },
      },
      // Updated variants structure to match frontend
      hasVariants: {
        type: Boolean,
        default: false,
      },
      variants: [
        {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            default: () => new mongoose.Types.ObjectId(),
          },
          name: String, // e.g., "Red / Large"
          options: [String], // Array of option values
          price: String, // Keep as string to match frontend
          originalPrice: String,
          stock: String,
          sku: String,
          isActive: {
            type: Boolean,
            default: true,
          },
          image: String, // Variant-specific image URL
        },
      ],
      attributes: [
        {
          name: String,
          value: String,
        },
      ],
      weight: {
        type: Number,
        min: 0,
        default: 0,
      },
      dimensions: {
        length: {
          type: Number,
          default: 0,
        },
        width: {
          type: Number,
          default: 0,
        },
        height: {
          type: Number,
          default: 0,
        },
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      isFeatured: {
        type: Boolean,
        default: false,
      },
      tags: [String],
      // SEO fields to match frontend
      metaTitle: String,
      metaDescription: String,
      seo: {
        title: String,
        description: String,
        keywords: [String],
      },
      ratings: {
        average: {
          type: Number,
          default: 0,
          min: 0,
          max: 5,
        },
        count: {
          type: Number,
          default: 0,
        },
      },
      salesCount: {
        type: Number,
        default: 0,
      },
      viewCount: {
        type: Number,
        default: 0,
      },
    },
    {
      timestamps: true,
    },
  )

  // Indexes
  productSchema.index({ name: 1 })
  productSchema.index({ slug: 1 })
  productSchema.index({ sku: 1 })
  productSchema.index({ category: 1 })
  productSchema.index({ isActive: 1 })
  productSchema.index({ isFeatured: 1 })
  productSchema.index({ price: 1 })
  productSchema.index({ "ratings.average": -1 })
  productSchema.index({ salesCount: -1 })
  productSchema.index({ createdAt: -1 })

  // Generate slug from name
  productSchema.pre("save", function (next) {
    if (this.isModified("name") && !this.slug) {
      this.slug = this.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    }

    // Sync inventory fields
    if (this.stock !== undefined) {
      this.inventory.quantity = this.stock
    }
    if (this.lowStockAlert !== undefined) {
      this.inventory.lowStockThreshold = this.lowStockAlert
    }
    if (this.allowBackorders !== undefined) {
      this.inventory.allowBackorder = this.allowBackorders
    }

    next()
  })

  // Virtual for discount percentage
  productSchema.virtual("discountPercentage").get(function () {
    if (this.originalPrice && this.originalPrice > this.price) {
      return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100)
    }
    if (this.comparePrice && this.comparePrice > this.price) {
      return Math.round(((this.comparePrice - this.price) / this.comparePrice) * 100)
    }
    return 0
  })

  // Virtual for stock status
  productSchema.virtual("stockStatus").get(function () {
    const quantity = this.stock || this.inventory.quantity || 0
    const threshold = this.lowStockAlert || this.inventory.lowStockThreshold || 5

    if (!this.inventory.trackQuantity) return "in_stock"
    if (quantity <= 0) return "out_of_stock"
    if (quantity <= threshold) return "low_stock"
    return "in_stock"
  })

  // Method to check if product is available
  productSchema.methods.isAvailable = function (quantity = 1) {
    if (!this.isActive) return false
    if (!this.inventory.trackQuantity) return true

    const availableStock = this.stock || this.inventory.quantity || 0
    if (availableStock >= quantity) return true
    return this.allowBackorders || this.inventory.allowBackorder
  }

  // Method to update stock
  productSchema.methods.updateStock = function (quantity, operation = "subtract") {
    if (!this.inventory.trackQuantity) return

    if (operation === "subtract") {
      this.stock = Math.max(0, (this.stock || 0) - quantity)
      this.inventory.quantity = this.stock
    } else if (operation === "add") {
      this.stock = (this.stock || 0) + quantity
      this.inventory.quantity = this.stock
    }
  }

  // Ensure virtuals are included in JSON output
  productSchema.set("toJSON", { virtuals: true })
  productSchema.set("toObject", { virtuals: true })

  // Try to get existing model, create if missing
  try {
    return tenantDB.model("Product")
  } catch (e) {
    if (e.name === "MissingSchemaError") {
      return tenantDB.model("Product", productSchema)
    }
    throw e
  }
}
