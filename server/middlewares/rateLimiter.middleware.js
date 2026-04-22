const rateLimit = require("express-rate-limit");
const { generate } = require("../core/csrf");
const {
  registerHTML,
  loginHTML,
  forgotHTML,
  resetHTML,
} = require("../views/auth.templates");

const RATE_LIMIT_MESSAGE = "Too many attempts, please try again later.";

const getCurrentPath = (req) => `${req.baseUrl || ""}${req.path || ""}` || "/";

const renderRateLimitedPage = (req) => {
  const csrf = generate(req);
  const currentPath = getCurrentPath(req);

  if (req.path === "/register") {
    return registerHTML(csrf, RATE_LIMIT_MESSAGE, "error", currentPath);
  }

  if (req.path === "/forgot-password") {
    return forgotHTML(csrf, RATE_LIMIT_MESSAGE, "error", currentPath);
  }

  if (req.path === "/reset-password") {
    const token =
      req.body && typeof req.body.token === "string" ? req.body.token : "";
    return resetHTML(csrf, token, RATE_LIMIT_MESSAGE, "error", currentPath);
  }

  return loginHTML(csrf, RATE_LIMIT_MESSAGE, "error", currentPath);
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).send(renderRateLimitedPage(req));
  },
});

module.exports = authLimiter;
