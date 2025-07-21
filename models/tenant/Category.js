const mongoose = require("mongoose")

module.exports = (tenantDB) => {
  const categorySchema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      imageUrl: {
        type: String,
        trim: true,
      },
      isActive: {
        type: Boolean,
        default: true,
      },
    },
    { timestamps: true },
  )

  return tenantDB.model("Category", categorySchema)
}
