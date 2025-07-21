const nodemailer = require("nodemailer")

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Nodemailer transporter verification failed:", error)
  } else {
    console.log("✅ Nodemailer transporter ready to send emails.")
  }
})

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("⚠️ Email sending skipped: SMTP environment variables not fully set.")
    return { success: false, message: "Email service not configured." }
  }

  try {
    const info = await transporter.sendMail({
      from: `"${process.env.APP_NAME || "Your App"}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    })
    console.log(`✅ Email sent to ${to}: ${subject}. Message ID: ${info.messageId}`)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error)
    return { success: false, error: error.message }
  }
}

module.exports = { sendEmail }
