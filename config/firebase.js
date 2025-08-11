const admin = require("firebase-admin")

let firebaseApp = null

// Internal: normalize private key formatting
function normalizePrivateKey(key) {
  if (!key) return key
  // Handle cases where the key might be JSON-encoded with escaped newlines
  return key.replace(/\\n/g, "\n")
}

function getAdminConfig() {
  return {
    type: process.env.FIREBASE_TYPE || "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
    token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url:
      process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  }
}

function getClientConfig() {
  // Safe to expose on client; these are not secrets
  return {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
  }
}

function isAdminEnvConfigured() {
  const cfg = getAdminConfig()
  const required = ["project_id", "private_key", "client_email"]
  const missing = required.filter((k) => !cfg[k])
  if (missing.length) {
    console.warn("⚠️ Missing Firebase Admin env:", missing)
  }
  return missing.length === 0
}

function hasWebConfig() {
  const cfg = getClientConfig()
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId)
}

function initializeFirebase() {
  try {
    if (firebaseApp) {
      return firebaseApp
    }
    if (!isAdminEnvConfigured()) {
      console.error("❌ Firebase Admin not configured. Skipping initialization.")
      return null
    }
    const adminCfg = getAdminConfig()
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(adminCfg),
      projectId: adminCfg.project_id,
    })
    console.log("✅ Firebase Admin SDK initialized")
    return firebaseApp
  } catch (err) {
    console.error("❌ Firebase Admin init error:", {
      message: err?.message,
      code: err?.code,
    })
    return null
  }
}

function getFirebaseAuth() {
  const app = initializeFirebase()
  if (!app) throw new Error("Firebase not initialized")
  return admin.auth()
}

/**
 * Strictly verify a Firebase ID token.
 * - Checks signature (Admin SDK)
 * - Enforces expected issuer and audience (project_id)
 * - Optionally require a phone_number to be present
 */
async function verifyFirebaseToken(idToken, options = { requirePhone: false }) {
  try {
    const auth = getFirebaseAuth()
    const decoded = await auth.verifyIdToken(idToken, true) // 'true' => checkRevoked if you want revoke safety

    const projectId = process.env.FIREBASE_PROJECT_ID
    const expectedIss = `https://securetoken.google.com/${projectId}`

    if (!decoded || !decoded.aud || !decoded.iss) {
      return { success: false, error: "Malformed Firebase token payload", code: "TOKEN_MALFORMED" }
    }
    if (decoded.aud !== projectId) {
      return { success: false, error: "Invalid audience (aud) for Firebase token", code: "TOKEN_AUDIENCE_MISMATCH" }
    }
    if (decoded.iss !== expectedIss) {
      return { success: false, error: "Invalid issuer (iss) for Firebase token", code: "TOKEN_ISSUER_MISMATCH" }
    }
    if (options.requirePhone && !decoded.phone_number) {
      return { success: false, error: "Phone number is required in Firebase token", code: "PHONE_REQUIRED" }
    }

    return {
      success: true,
      uid: decoded.uid,
      phone: decoded.phone_number || null,
      email: decoded.email || null,
      name: decoded.name || null,
      picture: decoded.picture || null,
      firebase: {
        tenant: decoded.firebase?.tenant || null,
        sign_in_provider: decoded.firebase?.sign_in_provider || null,
      },
      raw: decoded,
    }
  } catch (error) {
    console.error("❌ Firebase token verification error:", {
      message: error?.message,
      code: error?.code,
    })
    return {
      success: false,
      error: error?.message || "Token verification failed",
      code: error?.code || "VERIFY_ERROR",
    }
  }
}

async function createCustomToken(uid, additionalClaims = {}) {
  try {
    const auth = getFirebaseAuth()
    const token = await auth.createCustomToken(uid, additionalClaims)
    return { success: true, token }
  } catch (error) {
    console.error("❌ Firebase custom token creation error:", error)
    return { success: false, error: error.message }
  }
}

async function getUserByPhone(phoneNumber) {
  try {
    const auth = getFirebaseAuth()
    const user = await auth.getUserByPhoneNumber(phoneNumber)
    return {
      success: true,
      user: {
        uid: user.uid,
        phone: user.phoneNumber,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        disabled: user.disabled,
        metadata: user.metadata,
        customClaims: user.customClaims || {},
      },
    }
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return { success: false, error: "User not found", code: "USER_NOT_FOUND" }
    }
    console.error("❌ Firebase get user by phone error:", error)
    return { success: false, error: error.message, code: error.code }
  }
}

async function createUserWithPhone(phoneNumber, additionalData = {}) {
  try {
    const auth = getFirebaseAuth()
    const user = await auth.createUser({
      phoneNumber,
      displayName: additionalData.displayName,
      email: additionalData.email,
      photoURL: additionalData.photoURL,
      disabled: false,
    })
    return {
      success: true,
      user: {
        uid: user.uid,
        phone: user.phoneNumber,
        email: user.email,
        displayName: user.displayName,
      },
    }
  } catch (error) {
    console.error("❌ Firebase create user error:", error)
    return { success: false, error: error.message, code: error.code }
  }
}

async function updateUser(uid, updateData) {
  try {
    const auth = getFirebaseAuth()
    const user = await auth.updateUser(uid, updateData)
    return {
      success: true,
      user: {
        uid: user.uid,
        phone: user.phoneNumber,
        email: user.email,
        displayName: user.displayName,
      },
    }
  } catch (error) {
    console.error("❌ Firebase update user error:", error)
    return { success: false, error: error.message, code: error.code }
  }
}

async function deleteUser(uid) {
  try {
    const auth = getFirebaseAuth()
    await auth.deleteUser(uid)
    return { success: true, message: "User deleted successfully" }
  } catch (error) {
    console.error("❌ Firebase delete user error:", error)
    return { success: false, error: error.message, code: error.code }
  }
}

// Optional: set a custom role claim; useful if integrating with systems that inspect 'role' (e.g. Supabase)
async function setCustomRoleClaim(uid, role = "authenticated") {
  try {
    const auth = getFirebaseAuth()
    const user = await auth.getUser(uid)
    await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role })
    return { success: true }
  } catch (error) {
    console.error("❌ Firebase set custom role claim error:", error)
    return { success: false, error: error.message, code: error.code }
  }
}

function isFirebaseConfigured() {
  const configured = isAdminEnvConfigured()
  console.log("🔍 Firebase Admin configuration:", {
    configured,
    hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
  })
  return configured
}

function getFirebaseStatus() {
  return {
    isConfigured: isAdminEnvConfigured(),
    hasWebConfig: hasWebConfig(),
    adminSDK: !!firebaseApp,
    message: isAdminEnvConfigured() ? "Firebase is properly configured" : "Firebase configuration is incomplete",
  }
}

function getFirebaseClientConfig() {
  const cfg = getClientConfig()
  return cfg
}

module.exports = {
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
  getFirebaseClientConfig,
  setCustomRoleClaim,
}
