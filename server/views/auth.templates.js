const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const authPageHTML = ({
  title,
  subtitle,
  message = "",
  messageType = "error",
  form,
  links = [],
}) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} | Camagru</title>
    <style>
      :root {
        --bg: #f3f5f7;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #475569;
        --line: #dbe2ea;
        --primary: #2563eb;
        --primary-hover: #1d4ed8;
        --ok-bg: #ecfdf3;
        --ok-text: #166534;
        --info-bg: #eff6ff;
        --info-text: #1d4ed8;
        --success-bg: #ecfdf3;
        --success-text: #166534;
        --error-bg: #fef2f2;
        --error-text: #b91c1c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at 20% 20%, #e2e8f0 0%, var(--bg) 45%);
        color: var(--text);
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      .card {
        width: min(100%, 420px);
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 28px 24px;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      .badge {
        margin: 14px 0 0;
        padding: 10px 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
      }
      .badge-info {
        background: var(--info-bg);
        color: var(--info-text);
      }
      .badge-success {
        background: var(--success-bg);
        color: var(--success-text);
      }
      .badge-error {
        background: var(--error-bg);
        color: var(--error-text);
      }
      form {
        margin-top: 20px;
        display: grid;
        gap: 12px;
      }
      input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--line);
        font: inherit;
      }
      button {
        margin-top: 4px;
        border: 0;
        border-radius: 8px;
        padding: 11px 14px;
        background: var(--primary);
        color: #fff;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover { background: var(--primary-hover); }
      .links {
        margin-top: 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .links a {
        color: var(--primary);
        text-decoration: none;
        font-size: 14px;
      }
      .links a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${title}</h1>
      <p>${subtitle}</p>
      ${
        message
          ? `<p class="badge badge-${escapeHtml(messageType)}">${escapeHtml(message)}</p>`
          : ""
      }
      ${form}
      <div class="links">${links.join("")}</div>
    </main>
  </body>
</html>
`;

const registerHTML = (csrf, message = "", messageType = "error") =>
  authPageHTML({
    title: "Create Account",
    subtitle: "Sign up to start using Camagru.",
    message,
    messageType,
    form: `
      <form method="POST" action="/register">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="text" name="username" placeholder="Username" required>
        <input type="email" name="email" placeholder="Email" required>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit">Register</button>
      </form>
    `,
    links: ['<a href="/login">Already have an account? Log in</a>'],
  });

const loginHTML = (csrf, message = "", messageType = "error") =>
  authPageHTML({
    title: "Welcome Back",
    subtitle: "Log in to continue.",
    message,
    messageType,
    form: `
      <form method="POST" action="/login">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="text" name="username" placeholder="Username" required>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit">Login</button>
      </form>
    `,
    links: [
      '<a href="/forgot-password">Forgot password?</a>',
      '<a href="/register">Create account</a>',
    ],
  });

const forgotHTML = (csrf, message = "", messageType = "error") =>
  authPageHTML({
    title: "Reset Password",
    subtitle: "Enter your email to receive a reset link.",
    message,
    messageType,
    form: `
      <form method="POST" action="/forgot-password">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="email" name="email" placeholder="Your email" required>
        <button type="submit">Send reset link</button>
      </form>
    `,
    links: ['<a href="/login">Back to login</a>'],
  });

const resetHTML = (csrf, token, message = "", messageType = "error") =>
  authPageHTML({
    title: "Choose New Password",
    subtitle: "Set a new password for your account.",
    message,
    messageType,
    form: `
      <form method="POST" action="/reset-password">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="password" name="password" placeholder="New password" required>
        <button type="submit">Reset password</button>
      </form>
    `,
    links: ['<a href="/login">Back to login</a>'],
  });

module.exports = {
  registerHTML,
  loginHTML,
  forgotHTML,
  resetHTML,
};
