const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
});

const sendMail = (to, subject, html) =>
  transporter.sendMail({ from: "camagru@app.com", to, subject, html });

module.exports = { sendMail };
