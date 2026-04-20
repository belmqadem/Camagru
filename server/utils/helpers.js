const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

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

module.exports = {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  escapeHtml,
  formatDate,
  isAjaxRequest,
};
