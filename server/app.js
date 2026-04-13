require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const path = require("path");
const pool = require("./core/db");

const app = express();

// Body parsers
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Static files
app.use("/public", express.static(path.join(__dirname, "public")));

// Sessions stored in PostgreSQL
app.use(
  session({
    store: new pgSession({ pool, tableName: "sessions" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // XSS protection
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  }),
);

// Make session user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use("/", require("./routes/auth.routes"));
app.use("/gallery", require("./routes/gallery.routes"));
app.use("/edit", require("./routes/edit.routes"));
app.use("/user", require("./routes/user.routes"));

// 404 handler
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong");
});

app.listen(3000, () => console.log("Camagru running on port 3000"));
