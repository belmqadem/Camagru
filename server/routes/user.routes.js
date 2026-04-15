const router = require("express").Router();
const userController = require("../controllers/user.controller");
const csrf = require("../core/csrf");
const requireAuth = require("../middlewares/auth.middleware");
const withErrorHandling = require("../utils/withErrorHandling");

router.use(requireAuth);

router.get("/profile", withErrorHandling(userController.getProfile));

router.post(
  "/profile/info",
  csrf.verify,
  withErrorHandling(userController.postProfileInfo),
);

router.post(
  "/profile/password",
  csrf.verify,
  withErrorHandling(userController.postProfilePassword),
);

router.post(
  "/profile/preferences",
  csrf.verify,
  withErrorHandling(userController.postProfilePreferences),
);

module.exports = router;
