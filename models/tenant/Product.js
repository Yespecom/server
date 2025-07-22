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
      comparePrice: {
        type: Number,
        min: 0,
      },
      costPrice: {
        type: Number,
        min: 0,
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
      variants: [
        {
          name: String,
          value: String,
          price: Number,
          sku: String,
          quantity: Number,
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
      },
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
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
    next()
  })

  // Virtual for discount percentage
  productSchema.virtual("discountPercentage").get(function () {
    if (this.comparePrice && this.comparePrice > this.price) {
      return Math.round(((this.comparePrice - this.price) / this.comparePrice) * 100)
    }
    return 0
  })

  // Virtual for stock status
  productSchema.virtual("stockStatus").get(function () {
    if (!this.inventory.trackQuantity) return "in_stock"
    if (this.inventory.quantity <= 0) return "out_of_stock"
    if (this.inventory.quantity <= this.inventory.lowStockThreshold) return "low_stock"
    return "in_stock"
  })

  // Method to check if product is available
  productSchema.methods.isAvailable = function (quantity = 1) {
    if (!this.isActive) return false
    if (!this.inventory.trackQuantity) return true
    if (this.inventory.quantity >= quantity) return true
    return this.inventory.allowBackorder
  }

  // Method to update stock
  productSchema.methods.updateStock = function (quantity, operation = "subtract") {
    if (!this.inventory.trackQuantity) return

    if (operation === "subtract") {
      this.inventory.quantity = Math.max(0, this.inventory.quantity - quantity)
    } else if (operation === "add") {
      this.inventory.quantity += quantity
    }
  }

  return tenantDB.models.Product || tenantDB.model("Product", productSchema)
}
