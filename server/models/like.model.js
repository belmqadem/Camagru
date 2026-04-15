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
};

module.exports = likeModel;
