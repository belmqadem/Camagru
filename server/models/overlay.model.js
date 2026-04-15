const { pool } = require("../core/db");

const overlayModel = {
  findAll: async () => {
    const result = await pool.query(
      "SELECT id, filename FROM overlays ORDER BY id ASC",
    );
    return result.rows;
  },

  findById: async (id) => {
    const result = await pool.query(
      "SELECT id, filename FROM overlays WHERE id = $1",
      [id],
    );
    return result.rows[0] || null;
  },
};

module.exports = overlayModel;
