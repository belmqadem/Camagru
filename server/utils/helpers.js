const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleString("en-GB", {
      timeZone: "Africa/Casablanca",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
};

const isAjaxRequest = (req) => {
  const requestedWith = String(req.get("x-requested-with") || "").toLowerCase();
  const accept = String(req.get("accept") || "").toLowerCase();

  return (
    requestedWith === "xmlhttprequest" || accept.includes("application/json")
  );
};

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeUsername = (value) => String(value || "").trim();

const normalizePath = (value) => {
  const raw = String(value || "/")
    .split("?")[0]
    .replace(/\/+$/, "");
  return raw || "/";
};

module.exports = {
  escapeHtml,
  formatDate,
  isAjaxRequest,
  normalizeEmail,
  normalizeUsername,
  normalizePath,
};
