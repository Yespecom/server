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
    console.error("❌ Nodemailer SMTP configuration error:", error)
  } else {
    console.log("✅ Nodemailer SMTP server is ready to take our messages")
  }
})

const sendOTPEmail = async (to, otp, purpose) => {
  const appName = process.env.APP_NAME || "Your App"
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"

  const mailOptions = {
    from: `"${appName}" <${process.env.SMTP_USER}>`,
    to: to,
    subject: `${appName} - Your ${purpose} OTP`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #0056b3;">Your One-Time Password (OTP)</h2>
        <p>Hello,</p>
        <p>You requested a One-Time Password (OTP) for ${purpose} on ${appName}.</p>
        <p style="font-size: 24px; font-weight: bold; color: #d9534f; background-color: #f9f9f9; padding: 15px; border-radius: 5px; text-align: center;">
          ${otp}
        </p>
        <p>This OTP is valid for 10 minutes. Please do not share this code with anyone.</p>
        <p>If you did not request this, please ignore this email.</p>
        <p>For support, visit: <a href="${frontendUrl}/support" style="color: #0056b3;">${frontendUrl}/support</a></p>
        <p>Best regards,<br/>The ${appName} Team</p>
      </div>
    `,
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`✅ ${purpose} OTP email sent to ${to}`)
    return { success: true }
  } catch (error) {
    console.error(`❌ Error sending ${purpose} OTP email to ${to}:`, error)
    return { success: false, error: error.message }
  }
}

const sendWelcomeEmail = async (to, name) => {
  const appName = process.env.APP_NAME || "Your App"
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"

  const mailOptions = {
    from: `"${appName}" <${process.env.SMTP_USER}>`,
    to: to,
    subject: `Welcome to ${appName}!`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #0056b3;">Welcome, ${name || "User"}!</h2>
        <p>Thank you for registering with ${appName}. We're excited to have you on board!</p>
        <p>You can now log in and start exploring our services.</p>
        <p>Click here to get started: <a href="${frontendUrl}/login" style="color: #0056b3;">Login to ${appName}</a></p>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Best regards,<br/>The ${appName} Team</p>
      </div>
    `,
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`✅ Welcome email sent to ${to}`)
    return { success: true }
  } catch (error) {
    console.error(`❌ Error sending welcome email to ${to}:`, error)
    return { success: false, error: error.message }
  }
}

module.exports = { sendOTPEmail, sendWelcomeEmail }
