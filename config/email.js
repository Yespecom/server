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

const sendEmail = async (to, subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.APP_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlContent,
    })
    console.log(`📧 Email sent to ${to} with subject: ${subject}`)
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error)
    throw new Error("Failed to send email")
  }
}

const sendOTPEmail = async (email, otp, purpose) => {
  const subject = `${process.env.APP_NAME} - Your OTP for ${purpose}`
  const htmlContent = `
    <p>Hello,</p>
    <p>Your One-Time Password (OTP) for ${purpose} is: <strong>${otp}</strong></p>
    <p>This OTP is valid for 10 minutes.</p>
    <p>If you did not request this, please ignore this email.</p>
    <p>Regards,</p>
    <p>${process.env.APP_NAME} Team</p>
  `
  await sendEmail(email, subject, htmlContent)
}

const sendWelcomeEmail = async (email, name) => {
  const subject = `Welcome to ${process.env.APP_NAME}!`
  const htmlContent = `
    <p>Hello ${name},</p>
    <p>Welcome to ${process.env.APP_NAME}! We're excited to have you on board.</p>
    <p>You can now log in and start setting up your store.</p>
    <p>Regards,</p>
    <p>${process.env.APP_NAME} Team</p>
  `
  await sendEmail(email, subject, htmlContent)
}

const sendPasswordResetEmail = async (email, resetLink) => {
  const subject = `${process.env.APP_NAME} - Password Reset Request`
  const htmlContent = `
    <p>Hello,</p>
    <p>You have requested to reset your password for your ${process.env.APP_NAME} account.</p>
    <p>Please click on the following link to reset your password:</p>
    <p><a href="${resetLink}">${resetLink}</a></p>
    <p>This link will expire in 1 hour.</p>
    <p>If you did not request a password reset, please ignore this email.</p>
    <p>Regards,</p>
    <p>${process.env.APP_NAME} Team</p>
  `
  await sendEmail(email, subject, htmlContent)
}

module.exports = { sendEmail, sendOTPEmail, sendWelcomeEmail, sendPasswordResetEmail }
