const { pool } = require("../core/db");

const imageModel = {
  countAll: async () => {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS total FROM images",
    );
    return result.rows[0]?.total || 0;
  },

  findPaged: async ({ limit, offset, viewerId }) => {
    const result = await pool.query(
      `SELECT
				 i.id,
				 i.filename,
				 i.created_at,
				 i.user_id AS author_id,
				 u.username AS author_username,
				 COALESCE(lc.like_count, 0)::int AS like_count,
				 COALESCE(cc.comment_count, 0)::int AS comment_count,
				 CASE
					 WHEN $3::int IS NULL THEN FALSE
					 ELSE EXISTS (
						 SELECT 1
						 FROM likes vl
						 WHERE vl.image_id = i.id
							 AND vl.user_id = $3
					 )
				 END AS viewer_liked
			 FROM images i
			 JOIN users u ON u.id = i.user_id
			 LEFT JOIN (
				 SELECT image_id, COUNT(*) AS like_count
				 FROM likes
				 GROUP BY image_id
			 ) lc ON lc.image_id = i.id
			 LEFT JOIN (
				 SELECT image_id, COUNT(*) AS comment_count
				 FROM comments
				 GROUP BY image_id
			 ) cc ON cc.image_id = i.id
			 ORDER BY i.created_at DESC
			 LIMIT $1 OFFSET $2`,
      [limit, offset, viewerId],
    );

    return result.rows;
  },

  findCommentsByImageIds: async (imageIds) => {
    if (!imageIds.length) return [];

    const result = await pool.query(
      `SELECT
				 c.id,
				 c.image_id,
				 c.content,
				 c.created_at,
				 c.user_id AS author_id,
				 u.username AS author_username
			 FROM comments c
			 JOIN users u ON u.id = c.user_id
			 WHERE c.image_id = ANY($1::int[])
			 ORDER BY c.created_at ASC`,
      [imageIds],
    );

    return result.rows;
  },

  findByIdWithAuthor: async (id) => {
    const result = await pool.query(
      `SELECT
				 i.id,
				 i.filename,
				 i.created_at,
				 i.user_id AS author_id,
				 u.username AS author_username,
				 u.email AS author_email,
				 u.notify_comments
			 FROM images i
			 JOIN users u ON u.id = i.user_id
			 WHERE i.id = $1`,
      [id],
    );

    return result.rows[0] || null;
  },

  create: async ({ userId, filename }) => {
    const result = await pool.query(
      `INSERT INTO images (user_id, filename)
     VALUES ($1, $2)
     RETURNING id`,
      [userId, filename],
    );
    return result.rows[0];
  },

  findByUserId: async (userId) => {
    const result = await pool.query(
      `SELECT id, filename, created_at
     FROM images
     WHERE user_id = $1
     ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  },

  findByIdAndUser: async (id, userId) => {
    const result = await pool.query(
      `SELECT id, filename
     FROM images
     WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return result.rows[0] || null;
  },

  deleteById: async (id, userId) => {
    await pool.query("DELETE FROM images WHERE id = $1 AND user_id = $2", [
      id,
      userId,
    ]);
  },
};

module.exports = imageModel;
