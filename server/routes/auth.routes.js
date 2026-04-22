const router = require("express").Router();
const auth = require("../controllers/auth.controller");
const csrf = require("../core/csrf");
const withErrorHandling = require("../utils/withErrorHandling");
const authLimiter = require("../middlewares/rateLimiter.middleware");

router.get("/register", withErrorHandling(auth.getRegister));
router.post(
  "/register",
  authLimiter,
  csrf.verify,
  withErrorHandling(auth.postRegister),
);

router.get("/login", withErrorHandling(auth.getLogin));
router.post(
  "/login",
  authLimiter,
  csrf.verify,
  withErrorHandling(auth.postLogin),
);

router.post("/logout", csrf.verify, withErrorHandling(auth.logout));
router.get("/verify", withErrorHandling(auth.getVerify));

router.get("/forgot-password", withErrorHandling(auth.getForgot));
router.post(
  "/forgot-password",
  authLimiter,
  csrf.verify,
  withErrorHandling(auth.postForgot),
);

router.get("/reset-password", withErrorHandling(auth.getReset));
router.post(
  "/reset-password",
  authLimiter,
  csrf.verify,
  withErrorHandling(auth.postReset),
);

module.exports = router;
