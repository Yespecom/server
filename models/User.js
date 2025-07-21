const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

// Export a function that takes a connection, allowing it to be used with specific connections
module.exports = (connection) => {
  const userSchema = new mongoose.Schema(
    {
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      password: {
        type: String,
        required: true,
      },
      tenantId: {
        type: String,
        required: true,
        unique: true, // Each main user is tied to a unique tenant
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      role: {
        type: String,
        enum: ["admin", "user"], // Example roles
        default: "admin",
      },
    },
    { timestamps: true },
  )

  // Hash password before saving
  userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
      return next()
    }
    try {
      const salt = await bcrypt.genSalt(12)
      this.password = await bcrypt.hash(this.password, salt)
      next()
    } catch (err) {
      next(err)
    }
  })

  // Prevent re-compiling the model if it already exists on the connection
  return connection.models.User || connection.model("User", userSchema)
}
