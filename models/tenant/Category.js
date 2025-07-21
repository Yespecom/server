const mongoose = require("mongoose")

module.exports = (connection) => {
  const categorySchema = new mongoose.Schema(
    {
      tenantId: { type: String, required: true },
      name: { type: String, required: true, unique: true }, // Unique within the tenant
      description: { type: String },
      imageUrl: { type: String },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  )

  return connection.models.Category || connection.model("Category", categorySchema)
}
