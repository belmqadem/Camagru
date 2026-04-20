const { pool } = require("../core/db");

const likeModel = {
  toggle: async ({ userId, imageId }) => {
    const result = await pool.query(
      `WITH ins AS (
      INSERT INTO likes (user_id, image_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, image_id) DO NOTHING
      RETURNING id
    )
    SELECT
      CASE WHEN EXISTS (SELECT 1 FROM ins)
        THEN 'liked'
        ELSE 'unliked'
      END AS action`,
      [userId, imageId],
    );

    if (result.rows[0].action === "unliked") {
      await pool.query(
        "DELETE FROM likes WHERE user_id = $1 AND image_id = $2",
        [userId, imageId],
      );
      return { liked: false };
    }

    return { liked: true };
  },

  countByImageId: async (imageId) => {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS total FROM likes WHERE image_id = $1",
      [imageId],
    );

    return result.rows[0]?.total || 0;
  },

  hasViewerLikedImage: async ({ userId, imageId }) => {
    if (!userId) {
      return false;
    }

    const result = await pool.query(
      `SELECT EXISTS (
			 SELECT 1
			 FROM likes
			 WHERE user_id = $1 AND image_id = $2
		 ) AS liked`,
      [userId, imageId],
    );

    return Boolean(result.rows[0]?.liked);
  },
};

module.exports = likeModel;
