const crypto = require("crypto");

// Call this in GET routes to inject token into forms
const generate = (req) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
};

// Use this as middleware on every POST route
const verify = (req, res, next) => {
  const token = req.body._csrf || req.headers["x-csrf-token"];
  if (!req.session || !req.session.csrfToken || !token) {
    return res.status(403).send("Invalid CSRF token");
  }

  try {
    const tokenBuffer = Buffer.from(String(token));
    const sessionTokenBuffer = Buffer.from(String(req.session.csrfToken));

    if (tokenBuffer.length !== sessionTokenBuffer.length) {
      return res.status(403).send("Invalid CSRF token");
    }

    const isValid = crypto.timingSafeEqual(tokenBuffer, sessionTokenBuffer);
    if (!isValid) {
      return res.status(403).send("Invalid CSRF token");
    }
  } catch (error) {
    return res.status(403).send("Invalid CSRF token");
  }

  next();
};

module.exports = { generate, verify };
