const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const loggedOutNav = [
  '<a class="nav-link" href="/login">Login</a>',
  '<a class="nav-link" href="/register">Register</a>',
].join("");

const authPageHTML = ({
  title,
  subtitle,
  csrf,
  message = "",
  messageType = "error",
  form,
  links = [],
}) => {
  const template = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="csrf-token" content="{{CSRF_TOKEN}}" />
    <title>${title} | Camagru</title>
    <link rel="stylesheet" href="/public/css/main.css" />
    <link rel="stylesheet" href="/public/css/auth.css" />
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <div class="container nav-wrap">
          <a class="brand" href="/gallery">
            <span class="brand-logo-wrap">
              <img src="/public/assets/camagru-logo.png" alt="Camagru Logo" class="logo" />
            </span>
          </a>
          <input id="nav-toggle" class="nav-toggle" type="checkbox" />
          <label class="nav-toggle-label" for="nav-toggle" aria-label="Toggle navigation">
            <span></span><span></span><span></span>
          </label>
          <nav class="site-nav">{{NAV_AUTH}}</nav>
        </div>
      </header>

      <main class="page-main auth-layout">
        <section class="auth-card">
          <h1>${title}</h1>
          <p class="subtitle">${subtitle}</p>
          ${
            message
              ? `<p class="message-banner ${escapeHtml(messageType)}">${escapeHtml(message)}</p>`
              : ""
          }
          ${form}
          <div class="auth-links">${links.join("")}</div>
        </section>
      </main>

      <footer class="site-footer">
        <p>Camagru © 2025</p>
      </footer>
    </div>
  </body>
</html>
`;

  return template
    .replace("{{CSRF_TOKEN}}", escapeHtml(csrf))
    .replace("{{NAV_AUTH}}", loggedOutNav);
};

const registerHTML = (csrf, message = "", messageType = "error") =>
  authPageHTML({
    title: "Create Account",
    subtitle: "Sign up to start using Camagru.",
    csrf,
    message,
    messageType,
    form: `
      <form class="auth-form" method="POST" action="/register">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <label class="label" for="register-username">Username</label>
        <input class="input" id="register-username" type="text" name="username" placeholder="Username" required>
        <label class="label" for="register-email">Email</label>
        <input class="input" id="register-email" type="email" name="email" placeholder="Email" required>
        <label class="label" for="register-password">Password</label>
        <input class="input" id="register-password" type="password" name="password" placeholder="Password" required>
        <button class="btn" type="submit">Register</button>
      </form>
    `,
    links: ['<a href="/login">Already have an account? Login</a>'],
  });

const loginHTML = (csrf, message = "", messageType = "error") =>
  authPageHTML({
    title: "Welcome Back",
    subtitle: "Log in to continue.",
    csrf,
    message,
    messageType,
    form: `
      <form class="auth-form" method="POST" action="/login">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <label class="label" for="login-username">Username</label>
        <input class="input" id="login-username" type="text" name="username" placeholder="Username" required>
        <label class="label" for="login-password">Password</label>
        <input class="input" id="login-password" type="password" name="password" placeholder="Password" required>
        <button class="btn" type="submit">Login</button>
      </form>
    `,
    links: [
      '<a href="/forgot-password">Forgot password?</a>',
      '<a href="/register">Don\'t have an account? Register</a>',
    ],
  });

const forgotHTML = (csrf, message = "", messageType = "error") =>
  authPageHTML({
    title: "Reset Password",
    subtitle: "Enter your email to receive a reset link.",
    csrf,
    message,
    messageType,
    form: `
      <form class="auth-form" method="POST" action="/forgot-password">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <label class="label" for="forgot-email">Email</label>
        <input class="input" id="forgot-email" type="email" name="email" placeholder="Your email" required>
        <button class="btn" type="submit">Send reset link</button>
      </form>
    `,
    links: ['<a href="/login">Already have an account? Login</a>'],
  });

const resetHTML = (csrf, token, message = "", messageType = "error") =>
  authPageHTML({
    title: "Choose New Password",
    subtitle: "Set a new password for your account.",
    csrf,
    message,
    messageType,
    form: `
      <form class="auth-form" method="POST" action="/reset-password">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <label class="label" for="reset-password">New password</label>
        <input class="input" id="reset-password" type="password" name="password" placeholder="New password" required>
        <button class="btn" type="submit">Reset password</button>
      </form>
    `,
    links: ['<a href="/login">Already have an account? Login</a>'],
  });

module.exports = {
  registerHTML,
  loginHTML,
  forgotHTML,
  resetHTML,
};
