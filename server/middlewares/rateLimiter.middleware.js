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

const createAuthLimiter = ({ windowMs, limit }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).send(renderRateLimitedPage(req));
    },
  });

const loginLimiter = createAuthLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

const registerLimiter = createAuthLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

const forgotLimiter = createAuthLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 8,
});

const resetLimiter = createAuthLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

module.exports = {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  resetLimiter,
};
