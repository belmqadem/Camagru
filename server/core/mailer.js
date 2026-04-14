if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) {
  throw new Error("SMTP_HOST and SMTP_PORT environment variables are required");
}

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
});

transporter.verify().catch((err) => {
  console.error("SMTP transporter verification failed:", err);
});

const sendMail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: "camagru@app.com",
      to,
      subject,
      html,
    });
  } catch (err) {
    const mailError = new Error("Could not send email");
    mailError.status = 502;
    mailError.cause = err;
    throw mailError;
  }
};

module.exports = { sendMail };
