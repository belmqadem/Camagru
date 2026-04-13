const router = require("express").Router();

router.get("/", (req, res) => res.send("Edit page — TODO"));
router.post("/capture", (req, res) => res.send("Capture — TODO"));
router.delete("/:id", (req, res) => res.send("Delete image — TODO"));

module.exports = router;
