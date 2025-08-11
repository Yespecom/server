const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const AuthUtils = require("../../utils/auth")

module.exports = (tenantDB) => {
  // Check if model already exists to prevent re-compilation
  if (tenantDB.models.Customer) {
    return tenantDB.models.Customer
  }

  const addressSchema = new mongoose.Schema(
    {
      type: {
        type: String,
        enum: ["home", "work", "other"],
        default: "home",
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      phone: {
        type: String,
        required: true,
      },
      street: {
        type: String,
        required: true,
        trim: true,
      },
      city: {
        type: String,
        required: true,
        trim: true,
      },
      state: {
        type: String,
        required: true,
        trim: true,
      },
      zipCode: {
        type: String,
        required: true,
        trim: true,
      },
      country: {
        type: String,
        default: "India",
        trim: true,
      },
      isDefault: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: true,
    },
  )

  const customerSchema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100,
      },
      // Email is optional to support phone-first customers.
      email: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
        validate: {
          validator: (email) => !email || AuthUtils.validateEmail(email),
          message: "Please enter a valid email address",
        },
      },
      // Make phone unique and sparse to allow missing values and prevent duplicates.
      phone: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        validate: {
          validator: (phone) => !phone || AuthUtils.validatePhone(phone),
          message: "Please enter a valid phone number",
        },
      },
      password: {
        type: String,
        minlength: 8,
        validate: {
          validator: (password) => {
            if (!password) return true // Allow empty password for migration or phone-only users
            return AuthUtils.validatePassword(password).isValid
          },
          message: "Password must be at least 8 characters with uppercase, lowercase, number and special character",
        },
      },
      dateOfBirth: {
        type: Date,
        validate: {
          validator: (date) => !date || date < new Date(),
          message: "Date of birth cannot be in the future",
        },
      },
      gender: {
        type: String,
        enum: ["male", "female", "other"],
      },
      addresses: [addressSchema],
      totalSpent: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalOrders: {
        type: Number,
        default: 0,
        min: 0,
      },
      loyaltyPoints: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastOrderDate: {
        type: Date,
      },
      preferences: {
        notifications: {
          type: Boolean,
          default: true,
        },
        marketing: {
          type: Boolean,
          default: false,
        },
        newsletter: {
          type: Boolean,
          default: true,
        },
        smsUpdates: {
          type: Boolean,
          default: true,
        },
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      isVerified: {
        type: Boolean,
        default: false,
      },
      emailVerified: {
        type: Boolean,
        default: false,
      },
      phoneVerified: {
        type: Boolean,
        default: false,
      },
      lastLoginAt: {
        type: Date,
      },
      loginAttempts: {
        type: Number,
        default: 0,
      },
      lockUntil: {
        type: Date,
      },
      passwordChangedAt: {
        type: Date,
      },
      passwordResetToken: {
        type: String,
      },
      passwordResetExpires: {
        type: Date,
      },
      notes: {
        type: String,
        maxlength: 500,
      },

      // Optional email verification fields
      pendingEmail: { type: String, lowercase: true, trim: true },
      emailVerificationToken: { type: String },
      emailVerificationExpires: { type: Date },
    },
    {
      timestamps: true,
      toJSON: { virtuals: true },
      toObject: { virtuals: true },
    },
  )

  // Indexes for better performance and uniqueness
  customerSchema.index({ email: 1 }, { unique: true, sparse: true })
  customerSchema.index({ phone: 1 }, { unique: true, sparse: true })
  customerSchema.index({ isActive: 1 })
  customerSchema.index({ totalSpent: -1 })
  customerSchema.index({ createdAt: -1 })

  // Virtual for customer tier based on total spent
  customerSchema.virtual("tier").get(function () {
    if (this.totalSpent >= 50000) return "Platinum"
    if (this.totalSpent >= 25000) return "Gold"
    if (this.totalSpent >= 10000) return "Silver"
    return "Bronze"
  })

  // Virtual for account lock status
  customerSchema.virtual("isLocked").get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now())
  })

  // Pre-save middleware to hash password
  customerSchema.pre("save", async function (next) {
    try {
      // Only hash password if it's modified and exists
      if (!this.isModified("password") || !this.password) {
        return next()
      }

      // Hash password
      const salt = await bcrypt.genSalt(12)
      this.password = await bcrypt.hash(this.password, salt)

      console.log(`🔐 Password hashed for customer: ${this.email || this.phone}`)
      next()
    } catch (error) {
      console.error("❌ Password hashing error:", error)
      next(error)
    }
  })

  // Pre-save middleware to handle default address
  customerSchema.pre("save", function (next) {
    if (this.addresses && this.addresses.length > 0) {
      // If no default address exists, make the first one default
      const hasDefault = this.addresses.some((addr) => addr.isDefault)
      if (!hasDefault) {
        this.addresses[0].isDefault = true
      }

      // Ensure only one default address
      let defaultCount = 0
      this.addresses.forEach((addr) => {
        if (addr.isDefault) {
          defaultCount++
          if (defaultCount > 1) {
            addr.isDefault = false
          }
        }
      })
    }
    next()
  })

  // Method to compare password
  customerSchema.methods.comparePassword = async function (candidatePassword) {
    try {
      if (!this.password) {
        console.log(`❌ No password set for customer: ${this.email || this.phone}`)
        return false
      }

      const isMatch = await bcrypt.compare(candidatePassword, this.password)
      console.log(`🔐 Password comparison for ${this.email || this.phone}: ${isMatch ? "SUCCESS" : "FAILED"}`)
      return isMatch
    } catch (error) {
      console.error("❌ Password comparison error:", error)
      return false
    }
  }

  // Method to generate auth token with longer expiration
  customerSchema.methods.generateAuthToken = function (storeId, tenantId, rememberMe = false) {
    try {
      const payload = {
        customerId: this._id,
        email: this.email,
        phone: this.phone,
        name: this.name,
        storeId,
        tenantId,
        type: "customer",
        iat: Math.floor(Date.now() / 1000),
      }

      // Use longer expiration for remember me, otherwise use default long expiration
      const expiresIn = rememberMe ? "365d" : "90d"
      const token = AuthUtils.generateToken(payload, expiresIn)

      console.log(`🎫 Auth token generated for customer: ${this.email || this.phone} - Expires in: ${expiresIn}`)
      return token
    } catch (error) {
      console.error("❌ Token generation error:", error)
      throw new Error("Failed to generate authentication token")
    }
  }

  // Static method for enhanced authentication with longer token
  customerSchema.statics.authenticate = async function (email, password, storeId, tenantId) {
    try {
      console.log(`🔐 Authenticating customer: ${email}`)

      const customer = await this.findOne({
        email: email.toLowerCase(),
        isActive: true,
      })

      if (!customer) {
        console.log(`❌ Customer not found: ${email}`)
        return {
          success: false,
          error: "Invalid email or password",
          code: "INVALID_CREDENTIALS",
        }
      }

      // Check if account is locked
      if (customer.isLocked) {
        console.log(`🔒 Account locked for customer: ${email}`)
        return {
          success: false,
          error: "Account is temporarily locked due to too many failed attempts",
          code: "ACCOUNT_LOCKED",
          lockUntil: customer.lockUntil,
        }
      }

      // Check if password is set
      if (!customer.password) {
        console.log(`❌ No password set for customer: ${email}`)
        return {
          success: false,
          error: "Account exists but password is not set. Please use account migration.",
          code: "NO_PASSWORD_SET",
        }
      }

      // Verify password
      const isPasswordValid = await customer.comparePassword(password)

      if (!isPasswordValid) {
        // Increment login attempts
        customer.loginAttempts = (customer.loginAttempts || 0) + 1

        // Lock account after 5 failed attempts for 30 minutes
        if (customer.loginAttempts >= 5) {
          customer.lockUntil = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
          console.log(`🔒 Account locked after 5 failed attempts: ${email}`)
        }

        await customer.save()

        return {
          success: false,
          error: "Invalid email or password",
          code: "INVALID_CREDENTIALS",
          attemptsRemaining: Math.max(0, 5 - customer.loginAttempts),
        }
      }

      // Reset login attempts on successful login
      customer.loginAttempts = 0
      customer.lockUntil = undefined
      customer.lastLoginAt = new Date()
      await customer.save()

      // Generate token with longer expiration
      const token = customer.generateAuthToken(storeId, tenantId, false)

      console.log(`✅ Customer authentication successful: ${email}`)

      return {
        success: true,
        customer,
        token,
      }
    } catch (error) {
      console.error("❌ Customer authentication error:", error)
      return {
        success: false,
        error: "Authentication failed",
        code: "AUTH_ERROR",
      }
    }
  }

  // Method to add address
  customerSchema.methods.addAddress = async function (addressData) {
    try {
      // If this is the first address or marked as default, make it default
      if (this.addresses.length === 0 || addressData.isDefault) {
        // Remove default from other addresses
        this.addresses.forEach((addr) => {
          addr.isDefault = false
        })
        addressData.isDefault = true
      }

      this.addresses.push(addressData)
      await this.save()

      console.log(`📍 Address added for customer: ${this.email || this.phone}`)
      return true
    } catch (error) {
      console.error("❌ Add address error:", error)
      throw new Error("Failed to add address")
    }
  }

  // Method to update address
  customerSchema.methods.updateAddress = async function (addressId, updateData) {
    try {
      const address = this.addresses.id(addressId)
      if (!address) {
        return false
      }

      // If setting as default, remove default from others
      if (updateData.isDefault) {
        this.addresses.forEach((addr) => {
          if (addr._id.toString() !== addressId) {
            addr.isDefault = false
          }
        })
      }

      Object.assign(address, updateData)
      await this.save()

      console.log(`📍 Address updated for customer: ${this.email || this.phone}`)
      return true
    } catch (error) {
      console.error("❌ Update address error:", error)
      throw new Error("Failed to update address")
    }
  }

  // Method to remove address
  customerSchema.methods.removeAddress = async function (addressId) {
    try {
      const address = this.addresses.id(addressId)
      if (!address) {
        return false
      }

      const wasDefault = address.isDefault
      address.remove()

      // If removed address was default, make first remaining address default
      if (wasDefault && this.addresses.length > 0) {
        this.addresses[0].isDefault = true
      }

      await this.save()

      console.log(`📍 Address removed for customer: ${this.email || this.phone}`)
      return true
    } catch (error) {
      console.error("❌ Remove address error:", error)
      throw new Error("Failed to remove address")
    }
  }

  // Method to create password reset token
  customerSchema.methods.createPasswordResetToken = function () {
    const resetToken = AuthUtils.generateSecureRandom(32)

    this.passwordResetToken = AuthUtils.hashForLogging(resetToken)
    this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    return resetToken
  }

  // Static method to find customer by password reset token
  customerSchema.statics.findByPasswordResetToken = async function (token) {
    const hashedToken = AuthUtils.hashForLogging(token)

    return await this.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    })
  }

  // Method to update spending and order stats
  customerSchema.methods.updateOrderStats = async function (orderAmount) {
    try {
      this.totalSpent += orderAmount
      this.totalOrders += 1
      this.lastOrderDate = new Date()

      // Award loyalty points (1 point per 10 rupees spent)
      const pointsEarned = Math.floor(orderAmount / 10)
      this.loyaltyPoints += pointsEarned

      await this.save()

      console.log(
        `📊 Order stats updated for customer: ${this.email || this.phone} - Amount: ₹${orderAmount}, Points: +${pointsEarned}`,
      )
      return { pointsEarned, newTier: this.tier }
    } catch (error) {
      console.error("❌ Update order stats error:", error)
      throw new Error("Failed to update order statistics")
    }
  }

  // Email verification helpers (optional)
  customerSchema.methods.createEmailVerificationCode = function (newEmail, ttlMinutes = 10) {
    if (!newEmail || !AuthUtils.validateEmail(newEmail)) {
      throw new Error("Valid email is required for verification")
    }
    const code = ("" + Math.floor(100000 + Math.random() * 900000)).padStart(6, "0")
    this.pendingEmail = newEmail.toLowerCase().trim()
    this.emailVerificationToken = AuthUtils.hashForLogging(code)
    this.emailVerificationExpires = new Date(Date.now() + ttlMinutes * 60 * 1000)
    return code
  }

  customerSchema.methods.verifyEmailCodeAndApply = async function (code) {
    if (!this.pendingEmail || !this.emailVerificationToken || !this.emailVerificationExpires) {
      return { success: false, error: "No email verification in progress", code: "NO_PENDING_VERIFICATION" }
    }
    if (this.emailVerificationExpires <= new Date()) {
      return { success: false, error: "Verification code expired", code: "CODE_EXPIRED" }
    }
    const hashed = AuthUtils.hashForLogging(code)
    if (hashed !== this.emailVerificationToken) {
      return { success: false, error: "Invalid verification code", code: "INVALID_CODE" }
    }
    this.email = this.pendingEmail
    this.emailVerified = true
    this.pendingEmail = undefined
    this.emailVerificationToken = undefined
    this.emailVerificationExpires = undefined
    await this.save()
    return { success: true }
  }

  return tenantDB.model("Customer", customerSchema)
}
