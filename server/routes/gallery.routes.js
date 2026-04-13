const router = require("express").Router();

router.get("/", (req, res) => res.send("Gallery — TODO"));
router.post("/:id/like", (req, res) => res.send("Like — TODO"));
router.post("/:id/comment", (req, res) => res.send("Comment — TODO"));

module.exports = router;
