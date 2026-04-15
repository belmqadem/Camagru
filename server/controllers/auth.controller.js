const bcrypt = require("bcrypt");
const crypto = require("crypto");
const userModel = require("../models/user.model");
const { sendMail } = require("../core/mailer");
const { generate } = require("../core/csrf");
const logger = require("../core/logger");
const {
  registerHTML,
  loginHTML,
  forgotHTML,
  resetHTML,
} = require("../views/auth.templates");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const FORGOT_PASSWORD_MIN_RESPONSE_MS = 300;
const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const getLoginPageMessage = (query) => {
  if (query.verified === "1") {
    return {
      text: "Email confirmed. You can now log in.",
      type: "success",
    };
  }

  if (query.registered === "1") {
    return {
      text: "Registration successful. Check your email to confirm your account.",
      type: "success",
    };
  }

  if (query.reset === "1") {
    return {
      text: "Password reset successful. You can now log in.",
      type: "success",
    };
  }

  if (query.logged_out === "1") {
    return {
      text: "You have been logged out.",
      type: "info",
    };
  }

  return { text: "", type: "error" };
};

exports.getRegister = (req, res) => {
  res.send(registerHTML(generate(req)));
};

exports.postRegister = async (req, res) => {
  const { username, email, password } = req.body;
  const normalizedUsername = String(username || "").trim();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedUsername || !normalizedEmail || !password)
    return res
      .status(400)
      .send(registerHTML(generate(req), "All fields are required"));

  if (!EMAIL_REGEX.test(normalizedEmail))
    return res
      .status(400)
      .send(registerHTML(generate(req), "Invalid email address"));

  if (!PASSWORD_REGEX.test(password))
    return res
      .status(400)
      .send(
        registerHTML(
          generate(req),
          "Password must be 8+ chars with 1 uppercase and 1 number",
        ),
      );

  const existing = await userModel.findByEmail(normalizedEmail);
  if (existing)
    return res
      .status(400)
      .send(registerHTML(generate(req), "Email already in use"));

  const existingUser = await userModel.findByUsername(normalizedUsername);
  if (existingUser)
    return res
      .status(400)
      .send(registerHTML(generate(req), "Username already taken"));

  const passwordHash = await bcrypt.hash(password, 12);
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

  await userModel.create({
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
    verifyToken,
    verifyExpires,
  });

  const link = `${process.env.APP_URL}/verify?token=${verifyToken}`;
  await sendMail(
    normalizedEmail,
    "Confirm your Camagru account",
    `
    <h2>Welcome to Camagru, ${escapeHtml(normalizedUsername)}!</h2>
    <p>Click the link below to confirm your account:</p>
    <a href="${link}">Confirm my account</a>
  `,
  );

  res.redirect("/login?registered=1");
};

exports.getVerify = async (req, res) => {
  const { token } = req.query;
  if (!token)
    return res
      .status(400)
      .send(loginHTML(generate(req), "Missing verification token.", "error"));

  const user = await userModel.findByVerifyToken(token);
  if (!user)
    return res
      .status(400)
      .send(loginHTML(generate(req), "Invalid or expired token.", "error"));

  await userModel.verify(user.id);
  res.redirect("/login?verified=1");
};

exports.getLogin = (req, res) => {
  const { text, type } = getLoginPageMessage(req.query || {});
  res.send(loginHTML(generate(req), text, type));
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = String(username || "").trim();

  if (!normalizedUsername || !password)
    return res
      .status(400)
      .send(loginHTML(generate(req), "Username and password are required"));

  const user = await userModel.findByUsername(normalizedUsername);
  if (!user)
    return res
      .status(401)
      .send(loginHTML(generate(req), "Invalid credentials"));

  if (!user.verified)
    return res
      .status(401)
      .send(
        loginHTML(generate(req), "Please confirm your email before logging in"),
      );

  const match = await bcrypt.compare(password, user.password);
  if (!match)
    return res
      .status(401)
      .send(loginHTML(generate(req), "Invalid credentials"));

  req.session.userId = user.id;
  req.session.user = {
    id: user.id,
    username: user.username,
  };

  res.redirect("/gallery");
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err)
      return res
        .status(500)
        .send(loginHTML(generate(req), "Could not log out", "error"));
    res.clearCookie("connect.sid");
    return res.redirect("/login?logged_out=1");
  });
};

exports.getForgot = (req, res) => {
  res.send(forgotHTML(generate(req)));
};

exports.postForgot = async (req, res) => {
  const startedAt = Date.now();
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!EMAIL_REGEX.test(normalizedEmail))
    return res
      .status(400)
      .send(forgotHTML(generate(req), "Invalid email address"));

  const user = await userModel.findByEmail(normalizedEmail);

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
  const link = `${process.env.APP_URL}/reset-password?token=${token}`;

  if (user) {
    await userModel.setResetToken(user.id, token, expires);
    void sendMail(
      normalizedEmail,
      "Reset your Camagru password",
      `
    <h2>Password Reset</h2>
    <p>Click the link below (valid for 1 hour):</p>
    <a href="${link}">Reset my password</a>
  `,
    ).catch((error) => {
      logger.error("Failed to send reset password email", error);
    });
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < FORGOT_PASSWORD_MIN_RESPONSE_MS) {
    await wait(FORGOT_PASSWORD_MIN_RESPONSE_MS - elapsedMs);
  }

  res.send(
    forgotHTML(
      generate(req),
      "If that email exists, a reset link has been sent.",
      "info",
    ),
  );
};

exports.getReset = async (req, res) => {
  const { token } = req.query;
  if (!token)
    return res.status(400).send(resetHTML(generate(req), "", "Missing token"));

  const user = await userModel.findByResetToken(token);
  if (!user)
    return res
      .status(400)
      .send(resetHTML(generate(req), token, "Invalid or expired reset link"));

  res.send(resetHTML(generate(req), token));
};

exports.postReset = async (req, res) => {
  const { token, password } = req.body;
  if (!token)
    return res.status(400).send(resetHTML(generate(req), "", "Missing token"));
  if (!password)
    return res
      .status(400)
      .send(resetHTML(generate(req), token, "Password is required"));

  const user = await userModel.findByResetToken(token);
  if (!user)
    return res
      .status(400)
      .send(resetHTML(generate(req), token, "Invalid or expired reset link"));

  if (!PASSWORD_REGEX.test(password))
    return res
      .status(400)
      .send(
        resetHTML(
          generate(req),
          token,
          "Password must be 8+ chars with 1 uppercase and 1 number",
        ),
      );

  const passwordHash = await bcrypt.hash(password, 12);
  await userModel.updatePassword(user.id, passwordHash);

  res.redirect("/login?reset=1");
};
