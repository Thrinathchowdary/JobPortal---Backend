import express from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import db from '../config/database.js';
import { sendEmail } from '../utils/email.js';

const router = express.Router();

// Get current user's applications
router.get('/',
  authenticateToken,
  authorizeRoles('job_seeker', 'student', 'alumni', 'job_poster', 'admin'),
  async (req, res) => {
    try {
      const [applications] = await db.query(
        `SELECT a.*, j.job_id, j.title as job_title, j.company as company_name, j.location, j.job_type
         FROM applications a
         JOIN jobs j ON a.job_id = j.job_id
         WHERE a.user_id = ?
         ORDER BY a.applied_at DESC`,
        [req.user.userId]
      );

      res.json({ success: true, data: applications });
    } catch (error) {
      console.error('Get user applications error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch applications' });
    }
  }
);

// Apply for job
router.post('/apply',
  authenticateToken,
  upload.single('resume'),
  async (req, res) => {
    const { job_id, cover_letter } = req.body;

    try {
      // Check if already applied
      const [existing] = await db.query(
        'SELECT * FROM applications WHERE job_id = ? AND user_id = ?',
        [job_id, req.user.userId]
      );

      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Already applied to this job' });
      }

      // Get resume path
      let resumePath = null;
      if (req.file) {
        resumePath = '/uploads/' + req.file.filename;
      } else {
        // Use profile resume
        const [profile] = await db.query(
          'SELECT resume FROM profiles WHERE user_id = ?',
          [req.user.userId]
        );
        resumePath = profile[0]?.resume;
      }

      // Create application
      await db.query(
        'INSERT INTO applications (job_id, user_id, resume, cover_letter) VALUES (?, ?, ?, ?)',
        [job_id, req.user.userId, resumePath, cover_letter]
      );

      // Update job applications count
      await db.query(
        'UPDATE jobs SET applications_count = applications_count + 1 WHERE job_id = ?',
        [job_id]
      );

      // Send notification to job poster
      const [job] = await db.query(
        'SELECT j.title, j.company, j.user_id, u.email FROM jobs j JOIN users u ON j.user_id = u.user_id WHERE j.job_id = ?',
        [job_id]
      );

      if (job.length > 0) {
        await sendEmail(job[0].email, '📋 New Application Received - JobPortal', `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">📋 New Application!</h1>
            </div>
            
            <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1f2937; margin-top: 0;">Great News! 🎉</h2>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                A candidate has just applied for your job posting. Review their application now!
              </p>
              
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <h3 style="color: #374151; margin-top: 0; font-size: 18px;">📄 Job Details</h3>
                <p style="color: #6b7280; margin: 8px 0;"><strong>Position:</strong> ${job[0].title}</p>
                <p style="color: #6b7280; margin: 8px 0;"><strong>Company:</strong> ${job[0].company}</p>
                <p style="color: #6b7280; margin: 8px 0;"><strong>Application Time:</strong> ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/applicants" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                  View Application →
                </a>
              </div>
              
              <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 25px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1e40af; font-size: 14px;">
                  <strong>💡 Tip:</strong> Respond to applications within 24 hours to keep candidates engaged!
                </p>
              </div>
            </div>
            
            <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
              <p style="margin: 5px 0;">© ${new Date().getFullYear()} JobPortal. All rights reserved.</p>
            </div>
          </div>
        `);
      }

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully'
      });
    } catch (error) {
      console.error('Apply job error:', error);
      res.status(500).json({ success: false, message: 'Failed to submit application' });
    }
  }
);

// Withdraw application
router.delete('/:id',
  authenticateToken,
  authorizeRoles('job_seeker', 'student', 'alumni', 'job_poster', 'admin'),
  async (req, res) => {
    try {
      const [applications] = await db.query('SELECT * FROM applications WHERE application_id = ?', [req.params.id]);

      if (applications.length === 0) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const application = applications[0];

      if (application.user_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized to withdraw this application' });
      }

      await db.query('DELETE FROM applications WHERE application_id = ?', [req.params.id]);
      await db.query(
        'UPDATE jobs SET applications_count = GREATEST(applications_count - 1, 0) WHERE job_id = ?',
        [application.job_id]
      );

      res.json({ success: true, message: 'Application withdrawn successfully' });
    } catch (error) {
      console.error('Withdraw application error:', error);
      res.status(500).json({ success: false, message: 'Failed to withdraw application' });
    }
  }
);

// Get applications for a job (for job poster)
router.get('/job/:jobId',
  authenticateToken,
  authorizeRoles('job_poster', 'alumni', 'admin'),
  async (req, res) => {
    try {
      // Verify ownership
      const [jobs] = await db.query('SELECT * FROM jobs WHERE job_id = ?', [req.params.jobId]);
      if (jobs.length === 0) {
        return res.status(404).json({ success: false, message: 'Job not found' });
      }

      if (jobs[0].user_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }

      const [applications] = await db.query(
        `SELECT a.*, u.name, u.email, u.phone, p.education, p.skills, p.experience
         FROM applications a
         JOIN users u ON a.user_id = u.user_id
         LEFT JOIN profiles p ON u.user_id = p.user_id
         WHERE a.job_id = ?
         ORDER BY a.applied_at DESC`,
        [req.params.jobId]
      );

      res.json({ success: true, data: applications });
    } catch (error) {
      console.error('Get applications error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch applications' });
    }
  }
);

// Update application status
router.put('/:id/status',
  authenticateToken,
  authorizeRoles('job_poster', 'alumni', 'admin'),
  async (req, res) => {
    const { status } = req.body;

    if (!['pending', 'reviewed', 'shortlisted', 'rejected', 'accepted'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    try {
      const [applications] = await db.query(
        `SELECT a.*, j.user_id as job_poster_id, u.email, u.name, j.title
         FROM applications a
         JOIN jobs j ON a.job_id = j.job_id
         JOIN users u ON a.user_id = u.user_id
         WHERE a.application_id = ?`,
        [req.params.id]
      );

      if (applications.length === 0) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const app = applications[0];

      if (app.job_poster_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }

      await db.query(
        'UPDATE applications SET status = ? WHERE application_id = ?',
        [status, req.params.id]
      );

      // Send email to applicant
      const statusMessages = {
        reviewed: 'Your application has been reviewed',
        shortlisted: 'Congratulations! You have been shortlisted',
        rejected: 'Thank you for your application',
        accepted: 'Congratulations! Your application has been accepted'
      };

      const statusColors = {
        reviewed: '#3b82f6',
        shortlisted: '#10b981',
        rejected: '#ef4444',
        accepted: '#8b5cf6'
      };
      
      const statusEmojis = {
        reviewed: '👀',
        shortlisted: '⭐',
        rejected: '📝',
        accepted: '🎉'
      };
      
      await sendEmail(app.email, `${statusEmojis[status]} Application Update - ${app.title}`, `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, ${statusColors[status]} 0%, ${statusColors[status]}dd 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">${statusEmojis[status]} Application Status Update</h1>
          </div>
          
          <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1f2937; margin-top: 0;">Dear ${app.name},</h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              ${statusMessages[status]} for the position: <strong>${app.title}</strong>
            </p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
              <p style="color: #6b7280; margin: 0; font-size: 14px;">Status</p>
              <p style="color: ${statusColors[status]}; margin: 10px 0 0 0; font-size: 24px; font-weight: 700; text-transform: uppercase;">
                ${status}
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/applications" style="display: inline-block; background: linear-gradient(135deg, ${statusColors[status]} 0%, ${statusColors[status]}dd 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                View Details →
              </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 13px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <strong>Update Details:</strong><br>
              Position: ${app.title}<br>
              Status Changed: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} JobPortal. All rights reserved.</p>
          </div>
        </div>
      `);

      res.json({ success: true, message: 'Application status updated' });
    } catch (error) {
      console.error('Update application status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update status' });
    }
  }
);

export default router;
