const { isAjaxRequest } = require("../utils/helpers");

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
