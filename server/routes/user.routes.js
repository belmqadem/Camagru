const router = require("express").Router();

router.get("/profile", (req, res) => res.send("Profile — TODO"));
router.post("/profile", (req, res) => res.send("Update profile — TODO"));

module.exports = router;
