const crypto = require("crypto");

const generate = () => crypto.randomBytes(32).toString("hex");
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

module.exports = { generate, hash };
