import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// All routes require admin role
router.use(authenticateToken);
router.use(authorizeRoles('admin'));

// Dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const [userCount] = await db.query('SELECT COUNT(*) as total FROM users');
    const [jobCount] = await db.query('SELECT COUNT(*) as total FROM jobs');
    const [chapterCount] = await db.query('SELECT COUNT(*) as total FROM alumni_chapters');
    const [applicationCount] = await db.query('SELECT COUNT(*) as total FROM applications');
    const [activeUsers] = await db.query("SELECT COUNT(*) as total FROM users WHERE status = 'active'");
    const [suspendedUsers] = await db.query("SELECT COUNT(*) as total FROM users WHERE status = 'suspended'");

    res.json({
      success: true,
      data: {
        totalUsers: userCount[0].total,
        totalJobs: jobCount[0].total,
        totalChapters: chapterCount[0].total,
        totalApplications: applicationCount[0].total,
        activeUsers: activeUsers[0].total,
        suspendedUsers: suspendedUsers[0].total
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  const { role, status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = 'SELECT user_id, name, email, phone, role, status, created_at FROM users WHERE 1=1';
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [users] = await db.query(query, params);

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Update user status
router.put('/users/:id/status', async (req, res) => {
  const { status } = req.body;

  if (!['active', 'suspended', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  try {
    await db.query('UPDATE users SET status = ? WHERE user_id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'User status updated' });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE user_id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// Get all jobs
router.get('/jobs', async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = 'SELECT j.*, u.name as poster_name FROM jobs j JOIN users u ON j.user_id = u.user_id WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND j.status = ?';
      params.push(status);
    }

    query += ' ORDER BY j.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [jobs] = await db.query(query, params);

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
  }
});

// Update job status
router.put('/jobs/:id/status', async (req, res) => {
  const { status } = req.body;

  if (!['active', 'closed', 'pending', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  try {
    await db.query('UPDATE jobs SET status = ? WHERE job_id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Job status updated' });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update job status' });
  }
});

// Delete job
router.delete('/jobs/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM jobs WHERE job_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete job' });
  }
});

// Get all chapters
router.get('/chapters', async (req, res) => {
  try {
    const [chapters] = await db.query(
      `SELECT c.*, u.name as creator_name
       FROM alumni_chapters c
       JOIN users u ON c.created_by = u.user_id
       ORDER BY c.created_at DESC`
    );

    res.json({ success: true, data: chapters });
  } catch (error) {
    console.error('Get chapters error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chapters' });
  }
});

// Update chapter status
router.put('/chapters/:id/status', async (req, res) => {
  const { status } = req.body;

  if (!['active', 'blocked', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  try {
    await db.query('UPDATE alumni_chapters SET status = ? WHERE chapter_id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Chapter status updated' });
  } catch (error) {
    console.error('Update chapter status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update chapter status' });
  }
});

// Delete chapter
router.delete('/chapters/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM alumni_chapters WHERE chapter_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Chapter deleted successfully' });
  } catch (error) {
    console.error('Delete chapter error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete chapter' });
  }
});

// Get all applications
router.get('/applications', async (req, res) => {
  try {
    const [applications] = await db.query(
      `SELECT a.*, j.title, j.company, u.name as applicant_name
       FROM applications a
       JOIN jobs j ON a.job_id = j.job_id
       JOIN users u ON a.user_id = u.user_id
       ORDER BY a.applied_at DESC
       LIMIT 100`
    );

    res.json({ success: true, data: applications });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
});

export default router;
