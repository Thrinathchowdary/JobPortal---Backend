import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';

const router = express.Router();

// Get all chapters
router.get('/', async (req, res) => {
  const { search, college, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = "SELECT * FROM alumni_chapters WHERE status = 'active'";
    const params = [];

    if (search) {
      query += ' AND (chapter_name LIKE ? OR college_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (college) {
      query += ' AND college_name LIKE ?';
      params.push(`%${college}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [chapters] = await db.query(query, params);

    res.json({ success: true, data: chapters });
  } catch (error) {
    console.error('Get chapters error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chapters' });
  }
});

// Get single chapter
router.get('/:id', async (req, res) => {
  try {
    const [chapters] = await db.query(
      `SELECT c.*, u.name as creator_name
       FROM alumni_chapters c
       JOIN users u ON c.created_by = u.user_id
       WHERE c.chapter_id = ?`,
      [req.params.id]
    );

    if (chapters.length === 0) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }

    res.json({ success: true, data: chapters[0] });
  } catch (error) {
    console.error('Get chapter error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chapter' });
  }
});

// Create chapter
router.post('/',
  authenticateToken,
  uploadImage.single('logo'),
  [
    body('chapter_name').notEmpty().withMessage('Chapter name is required'),
    body('college_name').notEmpty().withMessage('College name is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { chapter_name, college_name, department, batch, description } = req.body;
    const logo = req.file ? '/uploads/images/' + req.file.filename : null;

    try {
      const [result] = await db.query(
        `INSERT INTO alumni_chapters (chapter_name, college_name, department, batch, description, logo, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [chapter_name, college_name, department, batch, description, logo, req.user.userId]
      );

      // Add creator as admin member
      await db.query(
        'INSERT INTO chapter_members (chapter_id, user_id, role, status) VALUES (?, ?, ?, ?)',
        [result.insertId, req.user.userId, 'admin', 'approved']
      );

      // Update member count
      await db.query(
        'UPDATE alumni_chapters SET member_count = 1 WHERE chapter_id = ?',
        [result.insertId]
      );

      res.status(201).json({
        success: true,
        message: 'Chapter created successfully',
        chapterId: result.insertId
      });
    } catch (error) {
      console.error('Create chapter error:', error);
      res.status(500).json({ success: false, message: 'Failed to create chapter' });
    }
  }
);

// Join chapter
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    // Check if already a member
    const [existing] = await db.query(
      'SELECT * FROM chapter_members WHERE chapter_id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Already requested or member' });
    }

    // Add member with pending status
    await db.query(
      'INSERT INTO chapter_members (chapter_id, user_id, status) VALUES (?, ?, ?)',
      [req.params.id, req.user.userId, 'pending']
    );

    res.status(201).json({
      success: true,
      message: 'Join request submitted successfully'
    });
  } catch (error) {
    console.error('Join chapter error:', error);
    res.status(500).json({ success: false, message: 'Failed to join chapter' });
  }
});

// Get chapter members
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const [members] = await db.query(
      `SELECT cm.*, u.name, u.email, u.role as user_role
       FROM chapter_members cm
       JOIN users u ON cm.user_id = u.user_id
       WHERE cm.chapter_id = ? AND cm.status = 'approved'
       ORDER BY cm.role DESC, cm.joined_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: members });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch members' });
  }
});

// Approve/Reject member (admin only)
router.put('/:id/members/:memberId',
  authenticateToken,
  async (req, res) => {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    try {
      // Check if user is chapter admin
      const [admins] = await db.query(
        "SELECT * FROM chapter_members WHERE chapter_id = ? AND user_id = ? AND role = 'admin'",
        [req.params.id, req.user.userId]
      );

      if (admins.length === 0 && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }

      await db.query(
        'UPDATE chapter_members SET status = ? WHERE id = ?',
        [status, req.params.memberId]
      );

      // Update member count if approved
      if (status === 'approved') {
        await db.query(
          'UPDATE alumni_chapters SET member_count = member_count + 1 WHERE chapter_id = ?',
          [req.params.id]
        );
      }

      res.json({ success: true, message: `Member ${status}` });
    } catch (error) {
      console.error('Update member status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update member status' });
    }
  }
);

// Get chapter posts
router.get('/:id/posts', authenticateToken, async (req, res) => {
  try {
    // Check if user is member
    const [membership] = await db.query(
      "SELECT * FROM chapter_members WHERE chapter_id = ? AND user_id = ? AND status = 'approved'",
      [req.params.id, req.user.userId]
    );

    if (membership.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Must be a member to view posts' });
    }

    const [posts] = await db.query(
      `SELECT cp.*, u.name as poster_name
       FROM chapter_posts cp
       JOIN users u ON cp.posted_by = u.user_id
       WHERE cp.chapter_id = ? AND cp.status = 'active'
       ORDER BY cp.created_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: posts });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});

// Create chapter post
router.post('/:id/posts',
  authenticateToken,
  [
    body('type').isIn(['job', 'internship', 'announcement', 'event', 'mentoring']),
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      // Check if user is member or admin
      const [membership] = await db.query(
        "SELECT * FROM chapter_members WHERE chapter_id = ? AND user_id = ? AND status = 'approved'",
        [req.params.id, req.user.userId]
      );

      if (membership.length === 0 && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Must be a member to post' });
      }

      const {
        type, title, description, target_audience, expiry_date,
        company, location, salary, skills
      } = req.body;

      const [result] = await db.query(
        `INSERT INTO chapter_posts 
         (chapter_id, posted_by, type, title, description, target_audience, 
          expiry_date, company, location, salary, skills)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, req.user.userId, type, title, description, target_audience,
         expiry_date, company, location, salary, skills]
      );

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        postId: result.insertId
      });
    } catch (error) {
      console.error('Create post error:', error);
      res.status(500).json({ success: false, message: 'Failed to create post' });
    }
  }
);

// Get user's chapters
router.get('/user/my-chapters', authenticateToken, async (req, res) => {
  try {
    const [chapters] = await db.query(
      `SELECT c.*, cm.role as member_role, cm.status as membership_status
       FROM alumni_chapters c
       JOIN chapter_members cm ON c.chapter_id = cm.chapter_id
       WHERE cm.user_id = ?
       ORDER BY cm.joined_at DESC`,
      [req.user.userId]
    );

    res.json({ success: true, data: chapters });
  } catch (error) {
    console.error('Get my chapters error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chapters' });
  }
});

export default router;
