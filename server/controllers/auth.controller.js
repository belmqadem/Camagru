const bcrypt = require("bcrypt");
const crypto = require("crypto");
const userModel = require("../models/user.model");
const { sendMail } = require("../core/mailer");
const { generate } = require("../core/csrf");

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

exports.getRegister = (req, res) => {
  res.send(registerHTML(generate(req)));
};

exports.postRegister = async (req, res) => {
  const { username, email, password } = req.body;
  const normalizedUsername = String(username || "").trim();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedUsername || !normalizedEmail || !password)
    return res.status(400).send("All fields are required");

  if (!EMAIL_REGEX.test(normalizedEmail))
    return res.status(400).send("Invalid email address");

  if (!PASSWORD_REGEX.test(password))
    return res
      .status(400)
      .send("Password must be 8+ chars with 1 uppercase and 1 number");

  const existing = await userModel.findByEmail(normalizedEmail);
  if (existing) return res.status(400).send("Email already in use");

  const existingUser = await userModel.findByUsername(normalizedUsername);
  if (existingUser) return res.status(400).send("Username already taken");

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

  res.send(
    "Registration successful! Check your email to confirm your account.",
  );
};

exports.getVerify = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing token");

  const user = await userModel.findByVerifyToken(token);
  if (!user) return res.status(400).send("Invalid or expired token");

  await userModel.verify(user.id);
  res.redirect("/login?verified=1");
};

exports.getLogin = (req, res) => {
  const verified = req.query.verified === "1";
  res.send(loginHTML(generate(req), verified));
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = String(username || "").trim();

  if (!normalizedUsername || !password)
    return res.status(400).send("Username and password are required");

  const user = await userModel.findByUsername(normalizedUsername);
  if (!user) return res.status(401).send("Invalid credentials");

  if (!user.verified)
    return res.status(401).send("Please confirm your email before logging in");

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).send("Invalid credentials");

  req.session.userId = user.id;
  req.session.user = {
    id: user.id,
    username: user.username,
  };

  res.redirect("/gallery");
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Could not log out");
    res.clearCookie("connect.sid");
    return res.redirect("/login");
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
    return res.status(400).send("Invalid email address");

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
      console.error("Failed to send reset password email:", error);
    });
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < FORGOT_PASSWORD_MIN_RESPONSE_MS) {
    await wait(FORGOT_PASSWORD_MIN_RESPONSE_MS - elapsedMs);
  }

  res.send("If that email exists, a reset link has been sent.");
};

exports.getReset = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing token");

  const user = await userModel.findByResetToken(token);
  if (!user) return res.status(400).send("Invalid or expired reset link");

  res.send(resetHTML(generate(req), token));
};

exports.postReset = async (req, res) => {
  const { token, password } = req.body;
  if (!token) return res.status(400).send("Missing token");
  if (!password) return res.status(400).send("Password is required");

  const user = await userModel.findByResetToken(token);
  if (!user) return res.status(400).send("Invalid or expired reset link");

  if (!PASSWORD_REGEX.test(password))
    return res
      .status(400)
      .send("Password must be 8+ chars with 1 uppercase and 1 number");

  const passwordHash = await bcrypt.hash(password, 12);
  await userModel.updatePassword(user.id, passwordHash);

  res.redirect("/login");
};

// ── Minimal inline HTML helpers (replace with templates later) ─

const registerHTML = (csrf) => `
  <h2>Register</h2>
  <form method="POST" action="/register">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="text"     name="username" placeholder="Username" required><br>
    <input type="email"    name="email"    placeholder="Email"    required><br>
    <input type="password" name="password" placeholder="Password" required><br>
    <button type="submit">Register</button>
  </form>
  <a href="/login">Already have an account?</a>
`;

const loginHTML = (csrf, verified) => `
  ${verified ? '<p style="color:green">Email confirmed! You can now log in.</p>' : ""}
  <h2>Login</h2>
  <form method="POST" action="/login">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="text"     name="username" placeholder="Username" required><br>
    <input type="password" name="password" placeholder="Password" required><br>
    <button type="submit">Login</button>
  </form>
  <a href="/forgot-password">Forgot password?</a>
`;

const forgotHTML = (csrf) => `
  <h2>Forgot Password</h2>
  <form method="POST" action="/forgot-password">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="email" name="email" placeholder="Your email" required><br>
    <button type="submit">Send reset link</button>
  </form>
`;

const resetHTML = (csrf, token) => `
  <h2>Reset Password</h2>
  <form method="POST" action="/reset-password">
    <input type="hidden" name="_csrf"  value="${csrf}">
    <input type="hidden" name="token"  value="${token}">
    <input type="password" name="password" placeholder="New password" required><br>
    <button type="submit">Reset Password</button>
  </form>
`;
