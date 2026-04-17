const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const userModel = require("../models/user.model");
const { generate } = require("../core/csrf");
const { sendMail } = require("../core/mailer");

const profileTemplate = fs.readFileSync(
  path.join(__dirname, "../views/profile.html"),
  "utf8",
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const normalizeUsername = (value) => String(value || "").trim();
const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getStatusMessage = (query = {}) => {
  if (query.info === "success") {
    return {
      target: "info",
      type: "success",
      text: "Profile information updated successfully.",
    };
  }

  if (query.info === "verify_sent") {
    return {
      target: "info",
      type: "success",
      text: "Profile updated. We sent a confirmation email to your new address. Please verify it.",
    };
  }

  if (query.password === "success") {
    return {
      target: "password",
      type: "success",
      text: "Password updated successfully.",
    };
  }

  if (query.preferences === "success") {
    return {
      target: "preferences",
      type: "success",
      text: "Preferences updated successfully.",
    };
  }

  const errorMessages = {
    user_not_found: "User not found.",
    info_required: "Username and email are required.",
    email_invalid: "Please enter a valid email address.",
    username_taken: "Username is already taken.",
    email_taken: "Email is already in use.",
    current_password_invalid: "Current password is incorrect.",
    password_weak:
      "New password must be at least 8 characters with 1 uppercase letter and 1 number.",
    password_mismatch: "New password and confirmation do not match.",
    email_send_failed:
      "Could not send verification email to the new address. Profile was not updated.",
  };

  if (query.error && errorMessages[query.error]) {
    const passwordErrors = new Set([
      "current_password_invalid",
      "password_weak",
      "password_mismatch",
    ]);

    return {
      target: passwordErrors.has(query.error) ? "password" : "info",
      type: "error",
      text: errorMessages[query.error],
    };
  }

  return {
    target: "",
    type: "",
    text: "",
  };
};

const renderNavAuth = ({ sessionUser, csrfToken }) => {
  if (!sessionUser) {
    return [
      '<a class="nav-link" href="/login">Login</a>',
      '<a class="nav-link" href="/register">Register</a>',
    ].join("");
  }

  return `
    <a class="nav-link nav-camera" href="/edit" aria-label="Open editor">📷</a>
    <span class="nav-user">${escapeHtml(sessionUser.username || "User")}</span>
    <details class="profile-menu">
      <summary class="avatar-button" aria-label="Profile menu">👤</summary>
      <div class="dropdown">
        <a class="dropdown-link" href="/user/profile">Profile</a>
        <form method="POST" action="/logout">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <button type="submit" class="dropdown-logout">Logout</button>
        </form>
      </div>
    </details>
  `;
};

const renderProfilePage = ({ user, sessionUser, csrfToken, message }) => {
  const checkedAttribute = user.notify_comments ? "checked" : "";

  const buildStatusClass = (target) => {
    if (!message.type || message.target !== target) {
      return "form-status hidden";
    }
    return `form-status ${message.type}`;
  };

  const buildStatusMessage = (target) =>
    message.target === target ? message.text || "" : "";

  return profileTemplate
    .replace(/{{CSRF_TOKEN}}/g, escapeHtml(csrfToken))
    .replace("{{NAV_AUTH}}", renderNavAuth({ sessionUser, csrfToken }))
    .replace(/{{USERNAME_VALUE}}/g, escapeHtml(user.username || ""))
    .replace(/{{EMAIL_VALUE}}/g, escapeHtml(user.email || ""))
    .replace(/{{NOTIFY_COMMENTS_CHECKED}}/g, checkedAttribute)
    .replace(/{{INFO_STATUS_CLASS}}/g, buildStatusClass("info"))
    .replace(/{{INFO_STATUS_MESSAGE}}/g, escapeHtml(buildStatusMessage("info")))
    .replace(/{{PASSWORD_STATUS_CLASS}}/g, buildStatusClass("password"))
    .replace(
      /{{PASSWORD_STATUS_MESSAGE}}/g,
      escapeHtml(buildStatusMessage("password")),
    )
    .replace(/{{PREFERENCES_STATUS_CLASS}}/g, buildStatusClass("preferences"))
    .replace(
      /{{PREFERENCES_STATUS_MESSAGE}}/g,
      escapeHtml(buildStatusMessage("preferences")),
    );
};

exports.getProfile = async (req, res) => {
  const user = await userModel.findById(req.session.userId);
  if (!user) {
    return res.redirect("/user/profile?error=user_not_found");
  }

  return res.send(
    renderProfilePage({
      user,
      sessionUser: req.session.user,
      csrfToken: generate(req),
      message: getStatusMessage(req.query || {}),
    }),
  );
};

exports.postProfileInfo = async (req, res) => {
  const user = await userModel.findById(req.session.userId);
  if (!user) {
    return res.redirect("/user/profile?error=user_not_found");
  }

  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);

  if (!username || !email) {
    return res.redirect("/user/profile?error=info_required");
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.redirect("/user/profile?error=email_invalid");
  }

  const existingUsername = await userModel.findByUsername(username);
  if (existingUsername && existingUsername.id !== user.id) {
    return res.redirect("/user/profile?error=username_taken");
  }

  const existingEmail = await userModel.findByEmail(email);
  if (existingEmail && existingEmail.id !== user.id) {
    return res.redirect("/user/profile?error=email_taken");
  }

  const currentEmail = normalizeEmail(user.email);
  const isEmailChanged = currentEmail !== email;

  if (isEmailChanged) {
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
    const verifyLink = `${process.env.APP_URL}/verify?token=${verifyToken}`;

    try {
      await sendMail(
        email,
        "Confirm your new Camagru email",
        `
        <h2>Confirm your new email address</h2>
        <p>Hello ${escapeHtml(username)}, click the link below to confirm your new email:</p>
        <a href="${verifyLink}">Confirm my email</a>
      `,
      );
    } catch (_error) {
      return res.redirect("/user/profile?error=email_send_failed");
    }

    await userModel.updateProfile(user.id, {
      username,
      email,
      verifyToken,
      verifyExpires,
    });

    req.session.user = {
      id: req.session.userId,
      username,
    };

    return res.redirect("/user/profile?info=verify_sent");
  }

  await userModel.updateProfile(user.id, { username, email });

  req.session.user = {
    id: req.session.userId,
    username,
  };

  return res.redirect("/user/profile?info=success");
};

exports.postProfilePassword = async (req, res) => {
  const user = await userModel.findById(req.session.userId);
  if (!user) {
    return res.redirect("/user/profile?error=user_not_found");
  }

  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password,
  );
  if (!isCurrentPasswordValid) {
    return res.redirect("/user/profile?error=current_password_invalid");
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    return res.redirect("/user/profile?error=password_weak");
  }

  if (newPassword !== confirmPassword) {
    return res.redirect("/user/profile?error=password_mismatch");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await userModel.updatePassword(user.id, passwordHash);

  return res.redirect("/user/profile?password=success");
};

exports.postProfilePreferences = async (req, res) => {
  const user = await userModel.findById(req.session.userId);
  if (!user) {
    return res.redirect("/user/profile?error=user_not_found");
  }

  const notifyComments = req.body.notify_comments === "on";
  await userModel.updatePreferences(user.id, { notifyComments });

  return res.redirect("/user/profile?preferences=success");
};
