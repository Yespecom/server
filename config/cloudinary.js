const cloudinary = require("cloudinary").v2
const { CloudinaryStorage } = require("multer-storage-cloudinary")
const multer = require("multer")

// Validate Cloudinary configuration
const validateCloudinaryConfig = () => {
  const requiredVars = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
  const missing = requiredVars.filter((varName) => !process.env[varName])

  if (missing.length > 0) {
    console.error(`❌ Missing Cloudinary environment variables: ${missing.join(", ")}`)
    console.error("Please add these to your .env file:")
    missing.forEach((varName) => {
      console.error(`${varName}=your_${varName.toLowerCase()}`)
    })
    return false
  }

  return true
}

// Only configure Cloudinary if all required variables are present
if (validateCloudinaryConfig()) {
  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })

  console.log("✅ Cloudinary configured successfully")
} else {
  console.error("❌ Cloudinary configuration failed")
}

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "yesp-products", // Folder name in Cloudinary
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      { width: 1000, height: 1000, crop: "limit", quality: "auto" }, // Optimize images
    ],
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed!"), false)
    }
  },
})

// Helper function to delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    if (!validateCloudinaryConfig()) {
      throw new Error("Cloudinary not configured")
    }

    const result = await cloudinary.uploader.destroy(publicId)
    console.log("🗑️ Image deleted from Cloudinary:", result)
    return result
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error)
    throw error
  }
}

// Helper function to extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  try {
    const parts = url.split("/")
    const filename = parts[parts.length - 1]
    return filename.split(".")[0]
  } catch (error) {
    console.error("Error extracting public ID from URL:", error)
    return null
  }
}

module.exports = {
  cloudinary,
  upload,
  deleteImage,
  getPublicIdFromUrl,
  validateCloudinaryConfig,
}
