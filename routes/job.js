import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';

const router = express.Router();

// Get all jobs (with filters)
router.get('/', async (req, res) => {
  const { search, location, job_type, experience_level, category, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = "SELECT * FROM jobs WHERE status = 'active'";
    const params = [];

    if (search) {
      query += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (location) {
      query += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }

    if (job_type) {
      query += ' AND job_type = ?';
      params.push(job_type);
    }

    if (experience_level) {
      query += ' AND experience_level = ?';
      params.push(experience_level);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [jobs] = await db.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM jobs WHERE status = 'active'";
    const [countResult] = await db.query(countQuery);

    res.json({
      success: true,
      data: jobs,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
  }
});

// Get single job
router.get('/:id', async (req, res) => {
  try {
    const [jobs] = await db.query(
      `SELECT j.*, u.name as poster_name, u.email as poster_email
       FROM jobs j
       JOIN users u ON j.user_id = u.user_id
       WHERE j.job_id = ?`,
      [req.params.id]
    );

    if (jobs.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Increment view count
    await db.query('UPDATE jobs SET views = views + 1 WHERE job_id = ?', [req.params.id]);

    res.json({ success: true, data: jobs[0] });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch job' });
  }
});

// Create job (job_poster, alumni, admin)
router.post('/',
  authenticateToken,
  authorizeRoles('job_poster', 'alumni', 'admin'),
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('company').notEmpty().withMessage('Company name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('job_type').isIn(['full_time', 'part_time', 'contract', 'internship', 'freelance'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      title, company, salary, location, description, skills,
      job_type, experience_level, category, deadline
    } = req.body;

    try {
      const [result] = await db.query(
        `INSERT INTO jobs (user_id, title, company, salary, location, description, 
         skills, job_type, experience_level, category, deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.userId, title, company, salary, location, description,
         skills, job_type, experience_level, category, deadline]
      );

      res.status(201).json({
        success: true,
        message: 'Job posted successfully',
        jobId: result.insertId
      });
    } catch (error) {
      console.error('Create job error:', error);
      res.status(500).json({ success: false, message: 'Failed to post job' });
    }
  }
);

// Update job
router.put('/:id',
  authenticateToken,
  authorizeRoles('job_poster', 'alumni', 'admin'),
  async (req, res) => {
    const {
      title, company, salary, location, description, skills,
      job_type, experience_level, category, deadline, status
    } = req.body;

    try {
      // Check ownership
      const [jobs] = await db.query('SELECT * FROM jobs WHERE job_id = ?', [req.params.id]);
      if (jobs.length === 0) {
        return res.status(404).json({ success: false, message: 'Job not found' });
      }

      if (jobs[0].user_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }

      await db.query(
        `UPDATE jobs SET title = ?, company = ?, salary = ?, location = ?, 
         description = ?, skills = ?, job_type = ?, experience_level = ?, 
         category = ?, deadline = ?, status = ?
         WHERE job_id = ?`,
        [title, company, salary, location, description, skills, job_type,
         experience_level, category, deadline, status, req.params.id]
      );

      res.json({ success: true, message: 'Job updated successfully' });
    } catch (error) {
      console.error('Update job error:', error);
      res.status(500).json({ success: false, message: 'Failed to update job' });
    }
  }
);

// Delete job
router.delete('/:id',
  authenticateToken,
  authorizeRoles('job_poster', 'alumni', 'admin'),
  async (req, res) => {
    try {
      // Check ownership
      const [jobs] = await db.query('SELECT * FROM jobs WHERE job_id = ?', [req.params.id]);
      if (jobs.length === 0) {
        return res.status(404).json({ success: false, message: 'Job not found' });
      }

      if (jobs[0].user_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }

      await db.query('DELETE FROM jobs WHERE job_id = ?', [req.params.id]);

      res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
      console.error('Delete job error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete job' });
    }
  }
);

// Get jobs posted by user
router.get('/user/my-jobs', authenticateToken, async (req, res) => {
  try {
    const [jobs] = await db.query(
      'SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
  }
});

export default router;
