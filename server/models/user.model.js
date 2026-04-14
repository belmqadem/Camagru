const pool = require("../core/db");

const userModel = {
  create: async ({
    username,
    email,
    passwordHash,
    verifyToken,
    verifyExpires,
  }) => {
    const result = await pool.query(
      `INSERT INTO users (username, email, password, verify_token, verify_expires)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, email, passwordHash, verifyToken, verifyExpires],
    );
    return result.rows[0];
  },

  findByEmail: async (email) => {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return result.rows[0] || null;
  },

  findByUsername: async (username) => {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    return result.rows[0] || null;
  },

  findByVerifyToken: async (token) => {
    const result = await pool.query(
      `SELECT * FROM users
       WHERE verify_token = $1
         AND verify_expires > NOW()`,
      [token],
    );
    return result.rows[0] || null;
  },

  verify: async (id) => {
    await pool.query(
      `UPDATE users
       SET verified = TRUE, verify_token = NULL, verify_expires = NULL
       WHERE id = $1`,
      [id],
    );
  },

  setResetToken: async (id, token, expires) => {
    await pool.query(
      "UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3",
      [token, expires, id],
    );
  },

  findByResetToken: async (token) => {
    const result = await pool.query(
      `SELECT * FROM users
       WHERE reset_token = $1 AND reset_expires > NOW()`,
      [token],
    );
    return result.rows[0] || null;
  },

  updatePassword: async (id, passwordHash) => {
    await pool.query(
      `UPDATE users
       SET password = $1, reset_token = NULL, reset_expires = NULL
       WHERE id = $2`,
      [passwordHash, id],
    );
  },

  updateProfile: async (id, { username, email }) => {
    await pool.query(
      "UPDATE users SET username = $1, email = $2 WHERE id = $3",
      [username, email, id],
    );
  },
};

module.exports = userModel;
