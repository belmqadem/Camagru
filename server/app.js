require("dotenv").config();
const logger = require("./core/logger");

const onFatalError = (label, error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(`[${label}]`, err);
  process.exit(1);
};

process.on("unhandledRejection", (reason) => {
  onFatalError("Unhandled Promise Rejection", reason);
});

process.on("uncaughtException", (error) => {
  onFatalError("Uncaught Exception", error);
});

const appUrl = String(process.env.APP_URL || "").trim();
if (!appUrl) {
  onFatalError(
    "Configuration Error",
    new Error("APP_URL environment variable is required"),
  );
}

const sessionSecret = String(process.env.SESSION_SECRET || "").trim();
if (!sessionSecret) {
  onFatalError(
    "Configuration Error",
    new Error("SESSION_SECRET environment variable is required"),
  );
}

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const path = require("path");
const { pool, initDb } = require("./core/db");
const requireAuth = require("./middlewares/auth.middleware");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.locals.requestErrorMessage = null;

  res.on("finish", () => {
    const durationMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
    const result =
      res.statusCode >= 500
        ? "server_error"
        : res.statusCode >= 400
          ? "client_error"
          : "success";
    const logMeta = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      result,
      durationMs,
    };

    if (res.locals.requestErrorMessage) {
      logMeta.error = res.locals.requestErrorMessage;
    }

    if (res.statusCode >= 500) {
      logger.error("Request completed", logMeta);
    } else if (res.statusCode >= 400) {
      logger.warn("Request completed", logMeta);
    } else {
      logger.info("Request completed", logMeta);
    }
  });

  next();
});

// Static files
app.use("/public", express.static(path.join(__dirname, "public")));

// Sessions stored in PostgreSQL
app.use(
  session({
    store: new pgSession({ pool, tableName: "sessions" }),
    secret: sessionSecret,
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

app.get("/", (req, res) => {
  res.redirect("/gallery");
});

app.get("/health", (_req, res) => {
  res.send("OK");
});

// Routes
app.use("/", require("./routes/auth.routes"));
app.use("/gallery", require("./routes/gallery.routes"));
app.use("/edit", requireAuth, require("./routes/edit.routes"));
app.use("/user", requireAuth, require("./routes/user.routes"));

// 404 handler
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Global error handler
app.use((err, req, res, next) => {
  res.locals.requestErrorMessage =
    err instanceof Error ? err.message : String(err);
  logger.error(`[${req.method} ${req.path}]`, err);

  if (res.headersSent) {
    return next(err);
  }

  const status = Number.isInteger(err.status) ? err.status : 500;
  const message = status >= 500 ? "Something went wrong" : err.message;
  return res.status(status).send(message || "Request failed");
});

const startServer = async () => {
  try {
    await initDb();
    app.listen(3000, () => logger.info("Camagru running on port 3000"));
  } catch (error) {
    onFatalError("Database initialization failed", error);
  }
};

startServer();
