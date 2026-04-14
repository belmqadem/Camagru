const router = require("express").Router();
const auth = require("../controllers/auth.controller");
const csrf = require("../core/csrf");
const withErrorHandling = require("../utils/withErrorHandling");

router.get("/register", withErrorHandling(auth.getRegister));
router.post("/register", csrf.verify, withErrorHandling(auth.postRegister));

router.get("/login", withErrorHandling(auth.getLogin));
router.post("/login", csrf.verify, withErrorHandling(auth.postLogin));

router.post("/logout", csrf.verify, withErrorHandling(auth.logout));
router.get("/verify", withErrorHandling(auth.getVerify));

router.get("/forgot-password", withErrorHandling(auth.getForgot));
router.post(
  "/forgot-password",
  csrf.verify,
  withErrorHandling(auth.postForgot),
);

router.get("/reset-password", withErrorHandling(auth.getReset));
router.post("/reset-password", csrf.verify, withErrorHandling(auth.postReset));

module.exports = router;
