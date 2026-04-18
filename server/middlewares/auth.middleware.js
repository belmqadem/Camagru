const isAjaxRequest = (req) => {
  const requestedWith = String(req.get("x-requested-with") || "").toLowerCase();
  const accept = String(req.get("accept") || "").toLowerCase();

  return (
    requestedWith === "xmlhttprequest" || accept.includes("application/json")
  );
};

module.exports = (req, res, next) => {
  if (!req.session.userId) {
    if (isAjaxRequest(req)) {
      return res.status(401).json({
        error: "Please log in to continue",
        redirectTo: "/login",
      });
    }

    return res.redirect("/login");
  }

  next();
};
