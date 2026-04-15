const router = require("express").Router();
const csrf = require("../core/csrf");
const requireAuth = require("../middlewares/auth.middleware");
const uploadImage = require("../middlewares/upload.middleware");
const editController = require("../controllers/edit.controller");
const withErrorHandling = require("../utils/withErrorHandling");

router.use(requireAuth);

router.get("/", withErrorHandling(editController.getEditPage));

router.post(
  "/capture",
  uploadImage,
  csrf.verify,
  withErrorHandling(editController.postCapture),
);

router.delete(
  "/:id",
  csrf.verify,
  withErrorHandling(editController.deleteImage),
);

module.exports = router;
