const mongoose = require("mongoose")

let mainConnection

const getMainDb = () => {
  if (!mainConnection) {
    mainConnection = mongoose.createConnection(process.env.MAIN_DB_URI || "mongodb://localhost:27017/yesp_main", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    mainConnection.on("connected", () => console.log("📦 Main Database Connection Established"))
    mainConnection.on("error", (err) => console.error("❌ Main Database Connection Error:", err))
    mainConnection.on("disconnected", () => console.log("🔌 Main Database Disconnected"))
  }
  return mainConnection
}

module.exports = { getMainDb }
