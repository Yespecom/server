const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: false, // Made optional for phone-only registration
    },
    phone: {
      type: String,
      required: true,
      unique: true, // Ensure unique phone per tenant
    },
    password: {
      type: String,
      required: false, // Optional for backward compatibility
      minlength: 6,
    },
    firebaseUid: {
      type: String,
      sparse: true, // Allow null values but ensure uniqueness when present
      unique: true,
    },
    addresses: [
      {
        type: {
          type: String,
          enum: ["home", "work", "other"],
          default: "home",
        },
        name: {
          type: String,
          required: true,
        },
        street: {
          type: String,
          required: true,
        },
        landmark: String,
        city: {
          type: String,
          required: true,
        },
        state: {
          type: String,
          required: true,
        },
        pincode: {
          type: String,
          required: true,
        },
        country: {
          type: String,
          default: "India",
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Keep the old address field for backward compatibility
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: String,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    orderCount: {
      type: Number,
      default: 0,
    },
    lastOrderDate: Date,
    preferences: {
      notifications: {
        type: Boolean,
        default: true,
      },
      marketing: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for better performance
customerSchema.index({ phone: 1 })
customerSchema.index({ email: 1 })
customerSchema.index({ firebaseUid: 1 })
customerSchema.index({ totalSpent: -1 })
customerSchema.index({ lastOrderDate: -1 })

// Pre-save middleware to hash password
customerSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

// Pre-save middleware to ensure only one default address
customerSchema.pre("save", function (next) {
  if (this.addresses && this.addresses.length > 0) {
    const defaultAddresses = this.addresses.filter((addr) => addr.isDefault)

    // If multiple default addresses, keep only the first one
    if (defaultAddresses.length > 1) {
      this.addresses.forEach((addr, index) => {
        if (index > 0 && addr.isDefault) {
          addr.isDefault = false
        }
      })
    }

    // If no default address and we have addresses, make the first one default
    if (defaultAddresses.length === 0 && this.addresses.length > 0) {
      this.addresses[0].isDefault = true
    }
  }
  next()
})

// Instance methods
customerSchema.methods.comparePassword = async function (password) {
  if (!this.password) return false
  return bcrypt.compare(password, this.password)
}

customerSchema.methods.updateSpent = function (amount) {
  this.totalSpent += amount
  this.orderCount += 1
  this.lastOrderDate = new Date()
  return this.save()
}

customerSchema.methods.getFullAddress = function () {
  if (!this.address || !this.address.street) return null

  const { street, city, state, pincode, country } = this.address
  return `${street}, ${city}, ${state} ${pincode}${country ? `, ${country}` : ""}`
}

customerSchema.methods.getDefaultAddress = function () {
  if (!this.addresses || this.addresses.length === 0) return null

  const defaultAddr = this.addresses.find((addr) => addr.isDefault)
  return defaultAddr || this.addresses[0]
}

customerSchema.methods.addAddress = function (addressData) {
  // If this is the first address, make it default
  if (!this.addresses || this.addresses.length === 0) {
    addressData.isDefault = true
  }

  // If setting as default, unset other defaults
  if (addressData.isDefault) {
    this.addresses.forEach((addr) => {
      addr.isDefault = false
    })
  }

  this.addresses.push(addressData)
  return this.save()
}

customerSchema.methods.updateAddress = function (addressId, updateData) {
  const address = this.addresses.id(addressId)
  if (!address) return null

  // If setting as default, unset other defaults
  if (updateData.isDefault) {
    this.addresses.forEach((addr) => {
      if (addr._id.toString() !== addressId) {
        addr.isDefault = false
      }
    })
  }

  Object.assign(address, updateData)
  return this.save()
}

customerSchema.methods.removeAddress = function (addressId) {
  const address = this.addresses.id(addressId)
  if (!address) return null

  const wasDefault = address.isDefault
  address.remove()

  // If we removed the default address, make another one default
  if (wasDefault && this.addresses.length > 0) {
    this.addresses[0].isDefault = true
  }

  return this.save()
}

// Static methods
customerSchema.statics.findByPhone = function (phone) {
  return this.findOne({ phone: phone, isActive: true })
}

customerSchema.statics.findByFirebaseUid = function (uid) {
  return this.findOne({ firebaseUid: uid, isActive: true })
}

customerSchema.statics.getTopCustomers = function (limit = 10) {
  return this.find({ isActive: true }).sort({ totalSpent: -1 }).limit(limit)
}

module.exports = (connection) => connection.model("Customer", customerSchema)
