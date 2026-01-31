import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';
import { sendEmail } from '../utils/email.js';

const router = express.Router();

// Register
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').optional().isMobilePhone(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['job_seeker', 'job_poster', 'alumni', 'student']).withMessage('Invalid role')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, password, role } = req.body;

    try {
      // Check if user exists
      const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user
      const [result] = await db.query(
        'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        [name, email, phone, hashedPassword, role]
      );

      // Create empty profile
      await db.query('INSERT INTO profiles (user_id) VALUES (?)', [result.insertId]);

      // Send welcome email
      await sendEmail(email, '🎉 Welcome to JobPortal - Account Created!', `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to JobPortal! 🎉</h1>
          </div>
          
          <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1f2937; margin-top: 0;">Hi ${name}! 👋</h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Your JobPortal account has been created successfully! We're excited to have you join our community.
            </p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <h3 style="color: #374151; margin-top: 0; font-size: 18px;">✨ What's Next?</h3>
              <ul style="color: #6b7280; line-height: 1.8; margin: 10px 0; padding-left: 20px;">
                <li>Complete your profile to stand out</li>
                <li>Upload your resume</li>
                <li>Browse thousands of job opportunities</li>
                <li>Connect with alumni chapters</li>
                <li>Apply to jobs with one click</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/login" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Get Started →
              </a>
            </div>
            
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 4px;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>💡 Tip:</strong> Complete your profile to increase your chances of getting hired by 3x!
              </p>
            </div>
            
            <p style="color: #9ca3af; font-size: 13px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <strong>Account Details:</strong><br>
              Email: ${email}<br>
              Role: ${role.replace('_', ' ').toUpperCase()}<br>
              Registration Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
              Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} JobPortal. All rights reserved.</p>
            <p style="margin: 5px 0;">This is an automated message, please do not reply.</p>
          </div>
        </div>
      `);

      res.status(201).json({
        success: true,
        message: 'Registration successful'
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ success: false, message: 'Registration failed' });
    }
  }
);

// Login
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Find user
      const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const user = users[0];

      // Check if account is suspended
      if (user.status === 'suspended') {
        return res.status(403).json({ success: false, message: 'Account suspended' });
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Generate JWT
      const token = jwt.sign(
        { 
          userId: user.user_id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  }
);

// Forgot Password
router.post('/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required')],
  async (req, res) => {
    const { email } = req.body;

    try {
      const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'Email not found' });
      }

      // Generate reset token
      const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expires = new Date(Date.now() + 3600000); // 1 hour

      // Store token
      await db.query(
        'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
        [email, resetToken, expires]
      );

      // Send reset email
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      await sendEmail(email, '🔐 Password Reset Request - JobPortal', `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Password Reset</h1>
          </div>
          
          <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1f2937; margin-top: 0;">Reset Your Password</h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              We received a request to reset your password. Click the button below to create a new password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Reset Password →
              </a>
            </div>
            
            <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 25px 0; border-radius: 4px;">
              <p style="margin: 0; color: #991b1b; font-size: 14px;">
                <strong>⚠️ Security Notice:</strong> This link expires in <strong>1 hour</strong> (at ${new Date(Date.now() + 3600000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})
              </p>
            </div>
            
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                <strong>Didn't request this?</strong><br>
                If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
              </p>
            </div>
            
            <p style="color: #9ca3af; font-size: 13px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <strong>Request Details:</strong><br>
              Email: ${email}<br>
              Request Time: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}<br>
              Expires: ${new Date(Date.now() + 3600000).toLocaleString('en-US', { timeStyle: 'short' })}
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} JobPortal. All rights reserved.</p>
            <p style="margin: 5px 0;">This is an automated security message, please do not reply.</p>
          </div>
        </div>
      `);

      res.json({ success: true, message: 'Password reset email sent' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ success: false, message: 'Failed to process request' });
    }
  }
);

// Reset Password
router.post('/reset-password',
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    const { token, password } = req.body;

    try {
      // Find valid token
      const [resets] = await db.query(
        'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
        [token]
      );

      if (resets.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired token' });
      }

      const reset = resets[0];

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update password
      await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, reset.email]);

      // Delete used token
      await db.query('DELETE FROM password_resets WHERE token = ?', [token]);

      res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
  }
);

export default router;
