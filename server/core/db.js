const requiredDbEnvVars = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
];
const missingDbEnvVars = requiredDbEnvVars.filter((key) => !process.env[key]);

if (missingDbEnvVars.length > 0) {
  throw new Error(
    `Missing database environment variables: ${missingDbEnvVars.join(", ")}`,
  );
}

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const connectWithRetry = async (retries = 5, delay = 2000) => {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log("Connected to PostgreSQL");
      return;
    } catch (err) {
      lastError = err;
      console.error(`PostgreSQL connection failed (attempt ${i + 1}):`, err);
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  const finalError = new Error(
    "Could not connect to PostgreSQL after multiple attempts",
  );
  finalError.cause = lastError;
  throw finalError;
};

let initPromise = null;
const initDb = (options = {}) => {
  if (initPromise) {
    return initPromise;
  }

  const retries = Number.isInteger(options.retries) ? options.retries : 5;
  const delay = Number.isInteger(options.delay) ? options.delay : 2000;

  initPromise = connectWithRetry(retries, delay)
    .then(() => pool)
    .catch((error) => {
      initPromise = null;
      throw error;
    });

  return initPromise;
};

module.exports = { pool, initDb };
