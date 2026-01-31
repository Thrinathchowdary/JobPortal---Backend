import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import db from '../config/database.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
              p.education, p.skills, p.experience, p.resume, p.bio, 
              p.linkedin, p.github, p.portfolio, p.location, p.date_of_birth, p.gender
       FROM users u
       LEFT JOIN profiles p ON u.user_id = p.user_id
       WHERE u.user_id = ?`,
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  const {
    name, phone, education, skills, experience, bio,
    linkedin, github, portfolio, location, date_of_birth, gender
  } = req.body;

  try {
    // Update user table
    await db.query(
      'UPDATE users SET name = ?, phone = ? WHERE user_id = ?',
      [name, phone, req.user.userId]
    );

    // Update profile table
    await db.query(
      `UPDATE profiles SET 
       education = ?, skills = ?, experience = ?, bio = ?,
       linkedin = ?, github = ?, portfolio = ?, location = ?, 
       date_of_birth = ?, gender = ?
       WHERE user_id = ?`,
      [education, skills, experience, bio, linkedin, github, portfolio, 
       location, date_of_birth, gender, req.user.userId]
    );

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Upload resume
router.post('/upload-resume', authenticateToken, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const resumePath = '/uploads/' + req.file.filename;

    await db.query(
      'UPDATE profiles SET resume = ? WHERE user_id = ?',
      [resumePath, req.user.userId]
    );

    res.json({
      success: true,
      message: 'Resume uploaded successfully',
      resumePath
    });
  } catch (error) {
    console.error('Upload resume error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload resume' });
  }
});

// Get user applications
router.get('/applications', authenticateToken, async (req, res) => {
  try {
    const [applications] = await db.query(
      `SELECT a.*, j.title, j.company, j.location, j.salary
       FROM applications a
       JOIN jobs j ON a.job_id = j.job_id
       WHERE a.user_id = ?
       ORDER BY a.applied_at DESC`,
      [req.user.userId]
    );

    res.json({ success: true, data: applications });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
});

export default router;
