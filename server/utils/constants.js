const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const FORGOT_PASSWORD_MIN_RESPONSE_MS = 300;

module.exports = {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  VERIFY_TOKEN_TTL_MS,
  FORGOT_PASSWORD_MIN_RESPONSE_MS,
};
