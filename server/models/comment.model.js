const { pool } = require("../core/db");

const commentModel = {
  create: async ({ userId, imageId, content }) => {
    const result = await pool.query(
      `INSERT INTO comments (user_id, image_id, content)
			 VALUES ($1, $2, $3)
			 RETURNING id, user_id, image_id, content, created_at`,
      [userId, imageId, content],
    );

    return result.rows[0];
  },
};

module.exports = commentModel;
