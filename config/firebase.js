const admin = require("firebase-admin")

// Initialize Firebase Admin SDK
let firebaseApp = null

const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (firebaseApp) {
      console.log("♻️ Firebase already initialized")
      return firebaseApp
    }

    console.log("🔥 Initializing Firebase Admin SDK...")

    // Firebase configuration from environment variables
    const firebaseConfig = {
      type: process.env.FIREBASE_TYPE || "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
      token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url:
        process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    }

    console.log("🔍 Firebase config check:", {
      hasProjectId: !!firebaseConfig.project_id,
      hasPrivateKey: !!firebaseConfig.private_key,
      hasClientEmail: !!firebaseConfig.client_email,
      privateKeyLength: firebaseConfig.private_key?.length || 0,
    })

    // Validate required Firebase configuration
    const requiredFields = ["project_id", "private_key", "client_email"]
    const missingFields = requiredFields.filter((field) => !firebaseConfig[field])

    if (missingFields.length > 0) {
      console.error(`❌ Missing Firebase configuration: ${missingFields.join(", ")}`)
      console.error("Please add these to your .env file:")
      missingFields.forEach((field) => {
        console.error(`FIREBASE_${field.toUpperCase()}=your_${field}`)
      })
      return null
    }

    // Initialize Firebase Admin
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig),
      projectId: firebaseConfig.project_id,
    })

    console.log("✅ Firebase Admin SDK initialized successfully")
    return firebaseApp
  } catch (error) {
    console.error("❌ Firebase initialization error:", error)
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
    })
    return null
  }
}

// Check if Firebase app is already initialized to prevent re-initialization errors
if (!admin.apps.length) {
  try {
    // Parse the private key from environment variable
    // Replace newline characters if they are escaped in the environment variable
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")

    admin.initializeApp({
      credential: admin.credential.cert({
        type: process.env.FIREBASE_TYPE,
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI,
        token_uri: process.env.FIREBASE_TOKEN_URI,
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      }),
      // You might need to add databaseURL if you're using Realtime Database
      // databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com"
    })
    console.log("✅ Firebase Admin SDK initialized successfully.")
  } catch (error) {
    console.error("❌ Error initializing Firebase Admin SDK:", error.message)
    // Exit process or handle error appropriately if Firebase is critical
    // process.exit(1);
  }
} else {
  console.log("✅ Firebase Admin SDK already initialized.")
}

const auth = admin.auth()
const firestore = admin.firestore()

// Get Firebase Auth instance
const getFirebaseAuth = () => {
  const app = initializeFirebase()
  if (!app) {
    throw new Error("Firebase not initialized")
  }
  return admin.auth()
}

// Verify Firebase ID token
const verifyFirebaseToken = async (idToken) => {
  try {
    console.log("🔍 Verifying Firebase token...")

    const decodedToken = await auth.verifyIdToken(idToken)

    console.log("✅ Firebase token verified successfully:", {
      uid: decodedToken.uid,
      phone: decodedToken.phone_number,
      email: decodedToken.email,
    })

    return {
      success: true,
      uid: decodedToken.uid,
      phone: decodedToken.phone_number,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    }
  } catch (error) {
    console.error("❌ Firebase token verification error:", error)
    return {
      success: false,
      error: error.message,
      code: error.code,
    }
  }
}

// Create custom token for user
const createCustomToken = async (uid, additionalClaims = {}) => {
  try {
    const customToken = await auth.createCustomToken(uid, additionalClaims)
    return {
      success: true,
      token: customToken,
    }
  } catch (error) {
    console.error("❌ Firebase custom token creation error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

// Get user by phone number
const getUserByPhone = async (phoneNumber) => {
  try {
    const userRecord = await auth.getUserByPhoneNumber(phoneNumber)
    return {
      success: true,
      user: {
        uid: userRecord.uid,
        phone: userRecord.phoneNumber,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        disabled: userRecord.disabled,
        metadata: userRecord.metadata,
      },
    }
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return {
        success: false,
        error: "User not found",
        code: "USER_NOT_FOUND",
      }
    }
    console.error("❌ Firebase get user by phone error:", error)
    return {
      success: false,
      error: error.message,
      code: error.code,
    }
  }
}

// Create user with phone number
const createUserWithPhone = async (phoneNumber, additionalData = {}) => {
  try {
    const userRecord = await auth.createUser({
      phoneNumber: phoneNumber,
      displayName: additionalData.displayName,
      email: additionalData.email,
      photoURL: additionalData.photoURL,
      disabled: false,
    })
    return {
      success: true,
      user: {
        uid: userRecord.uid,
        phone: userRecord.phoneNumber,
        email: userRecord.email,
        displayName: userRecord.displayName,
      },
    }
  } catch (error) {
    console.error("❌ Firebase create user error:", error)
    return {
      success: false,
      error: error.message,
      code: error.code,
    }
  }
}

// Update user data
const updateUser = async (uid, updateData) => {
  try {
    const userRecord = await auth.updateUser(uid, updateData)
    return {
      success: true,
      user: {
        uid: userRecord.uid,
        phone: userRecord.phoneNumber,
        email: userRecord.email,
        displayName: userRecord.displayName,
      },
    }
  } catch (error) {
    console.error("❌ Firebase update user error:", error)
    return {
      success: false,
      error: error.message,
      code: error.code,
    }
  }
}

// Delete user
const deleteUser = async (uid) => {
  try {
    await auth.deleteUser(uid)
    return {
      success: true,
      message: "User deleted successfully",
    }
  } catch (error) {
    console.error("❌ Firebase delete user error:", error)
    return {
      success: false,
      error: error.message,
      code: error.code,
    }
  }
}

// Check if Firebase is configured
const isFirebaseConfigured = () => {
  const requiredEnvVars = ["FIREBASE_PROJECT_ID", "FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL"]
  const configured = requiredEnvVars.every((envVar) => process.env[envVar])

  console.log("🔍 Firebase configuration status:", {
    configured,
    hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
  })

  return configured
}

// Get Firebase configuration status
const getFirebaseStatus = () => {
  const isConfigured = isFirebaseConfigured()
  const hasWebConfig = !!(process.env.FIREBASE_API_KEY && process.env.FIREBASE_AUTH_DOMAIN)

  return {
    isConfigured,
    hasWebConfig,
    adminSDK: !!firebaseApp,
    message: isConfigured ? "Firebase is properly configured" : "Firebase configuration is incomplete",
  }
}

module.exports = {
  auth,
  firestore,
  initializeFirebase,
  getFirebaseAuth,
  verifyFirebaseToken,
  createCustomToken,
  getUserByPhone,
  createUserWithPhone,
  updateUser,
  deleteUser,
  isFirebaseConfigured,
  getFirebaseStatus,
}
