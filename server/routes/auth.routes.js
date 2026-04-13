const router = require("express").Router();

router.get("/register", (req, res) => res.send("Register page — TODO"));
router.post("/register", (req, res) => res.send("Handle register — TODO"));

router.get("/login", (req, res) => res.send("Login page — TODO"));
router.post("/login", (req, res) => res.send("Handle login — TODO"));

router.get("/logout", (req, res) => res.send("Logout — TODO"));

router.get("/verify", (req, res) => res.send("Email verify — TODO"));

router.get("/forgot-password", (req, res) =>
  res.send("Forgot password — TODO"),
);
router.post("/forgot-password", (req, res) => res.send("Handle forgot — TODO"));

router.get("/reset-password", (req, res) => res.send("Reset password — TODO"));
router.post("/reset-password", (req, res) => res.send("Handle reset — TODO"));

module.exports = router;
