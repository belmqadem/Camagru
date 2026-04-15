const router = require("express").Router();
const gallery = require("../controllers/gallery.controller");
const csrf = require("../core/csrf");
const authMiddleware = require("../middlewares/auth.middleware");
const withErrorHandling = require("../utils/withErrorHandling");

router.get("/", withErrorHandling(gallery.getGallery));

router.post(
  "/:id/like",
  authMiddleware,
  csrf.verify,
  withErrorHandling(gallery.postToggleLike),
);

router.post(
  "/:id/comment",
  authMiddleware,
  csrf.verify,
  withErrorHandling(gallery.postComment),
);

module.exports = router;
