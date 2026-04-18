const { pool } = require("../core/db");

const likeModel = {
  toggle: async ({ userId, imageId }) => {
    const existing = await pool.query(
      "SELECT id FROM likes WHERE user_id = $1 AND image_id = $2",
      [userId, imageId],
    );

    if (existing.rows.length > 0) {
      await pool.query(
        "DELETE FROM likes WHERE user_id = $1 AND image_id = $2",
        [userId, imageId],
      );
      return { liked: false };
    }

    await pool.query("INSERT INTO likes (user_id, image_id) VALUES ($1, $2)", [
      userId,
      imageId,
    ]);
    return { liked: true };
  },

  countByImageId: async (imageId) => {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS total FROM likes WHERE image_id = $1",
      [imageId],
    );

    return result.rows[0]?.total || 0;
  },
};

module.exports = likeModel;
