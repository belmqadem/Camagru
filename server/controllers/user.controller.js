const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const userModel = require("../models/user.model");
const { generate } = require("../core/csrf");
const { sendMail } = require("../core/mailer");
const tokens = require("../core/tokens");
const {
  escapeHtml,
  normalizeEmail,
  normalizeUsername,
  normalizePath,
} = require("../utils/helpers");
const {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  VERIFY_TOKEN_TTL_MS,
} = require("../utils/constants");
const renderNavAuth = require("../utils/renderNavAuth");
const logger = require("../core/logger");

const profileTemplate = fs.readFileSync(
  path.join(__dirname, "../views/profile.html"),
  "utf8",
);

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
    info_required: "All fields are required.",
    email_invalid: "Please enter a valid email address.",
    username_taken: "Username is already taken.",
    email_taken: "Email is already in use.",
    current_password_invalid: "Current password is incorrect.",
    password_weak:
      "New password must be at least 8 characters with 1 uppercase letter and 1 number.",
    password_mismatch: "New password and confirmation do not match.",
    password_same: "New password must be different from the current password.",
    email_send_failed:
      "Could not send verification email to the new address. Profile was not updated.",
    verify_send_failed:
      "Profile updated but confirmation email could not be sent. Please contact support.",
  };

  if (query.error && errorMessages[query.error]) {
    const passwordErrors = new Set([
      "current_password_invalid",
      "password_weak",
      "password_mismatch",
      "password_same",
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

const renderProfilePage = ({
  user,
  sessionUser,
  csrfToken,
  message,
  currentPath,
}) => {
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
    .replace(
      "{{NAV_AUTH}}",
      renderNavAuth({ currentUser: sessionUser, csrfToken, currentPath }),
    )
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
      currentPath: normalizePath(`${req.baseUrl}${req.path}`),
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

  const isEmailChanged = normalizeEmail(user.email) !== email;

  if (isEmailChanged) {
    const rawToken = tokens.generate();
    const hashedToken = tokens.hash(rawToken);
    const verifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
    const verifyLink = `${process.env.APP_URL}/verify?token=${rawToken}`;

    await userModel.updateProfile(user.id, {
      username,
      email,
      verifyToken: hashedToken,
      verifyExpires,
    });

    logger.info(
      `User changed email: ${user.username} → ${email} (pending verification)`,
    );

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
      logger.error(`Failed to send verification email to ${email}`);
      await new Promise((resolve, reject) =>
        req.session.destroy((err) => (err ? reject(err) : resolve())),
      );
      res.clearCookie("camagru.sid");
      return res.redirect("/login?email_changed=1");
    }

    // Force logout so the user verify the new email
    await new Promise((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );

    res.clearCookie("camagru.sid");
    return res.redirect("/login?email_changed=1");
  }

  await userModel.updateProfile(user.id, { username, email });

  req.session.user = {
    id: req.session.userId,
    username,
  };

  logger.info(`User updated profile: ${username} (${email})`);

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

  if (!newPassword || !currentPassword || !confirmPassword)
    return res.redirect("/user/profile?error=info_required");

  if (currentPassword === newPassword)
    return res.redirect("/user/profile?error=password_same");

  if (!PASSWORD_REGEX.test(newPassword))
    return res.redirect("/user/profile?error=password_weak");

  if (newPassword !== confirmPassword)
    return res.redirect("/user/profile?error=password_mismatch");

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password,
  );
  if (!isCurrentPasswordValid)
    return res.redirect("/user/profile?error=current_password_invalid");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await userModel.updatePassword(user.id, passwordHash);

  logger.info(`User updated password: ${user.username} (${user.email})`);

  return res.redirect("/user/profile?password=success");
};

exports.postProfilePreferences = async (req, res) => {
  const user = await userModel.findById(req.session.userId);
  if (!user) {
    return res.redirect("/user/profile?error=user_not_found");
  }

  const notifyComments = req.body.notify_comments === "on";
  await userModel.updatePreferences(user.id, { notifyComments });

  logger.info(
    `User updated preferences: ${user.username}, notify_comments=${notifyComments}`,
  );

  return res.redirect("/user/profile?preferences=success");
};
