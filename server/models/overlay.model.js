const { pool } = require("../core/db");

let overlayTableName = null;

const resolveOverlayTableName = async () => {
  if (overlayTableName) {
    return overlayTableName;
  }

  const result = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY CASE table_name
       WHEN 'sqloverlays' THEN 1
       WHEN 'overlays' THEN 2
       ELSE 3
     END
     LIMIT 1`,
    [["sqloverlays", "overlays"]],
  );

  const tableName = result.rows[0]?.table_name;
  if (!tableName) {
    throw new Error(
      "Overlay table not found (expected sqloverlays or overlays)",
    );
  }

  overlayTableName = tableName;
  return overlayTableName;
};

const overlayModel = {
  findAll: async () => {
    const tableName = await resolveOverlayTableName();
    const result = await pool.query(
      `SELECT id, filename
       FROM ${tableName}
       ORDER BY id ASC`,
    );
    return result.rows;
  },

  findById: async (id) => {
    const tableName = await resolveOverlayTableName();
    const result = await pool.query(
      `SELECT id, filename
       FROM ${tableName}
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  },
};

module.exports = overlayModel;
