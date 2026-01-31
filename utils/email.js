import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Resend (HTTP API - no SMTP ports needed!)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

if (resend) {
  console.log('✅ Resend email service initialized (HTTP API - works on all platforms)');
} else {
  console.warn('⚠️ RESEND_API_KEY not set - emails will not be sent');
}

// Send email function
export const sendEmail = async (to, subject, html) => {
  try {
    if (!resend) {
      console.error('❌ Email not sent - RESEND_API_KEY not configured');
      return false;
    }

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'JobPortal <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html
    });

    if (error) {
      console.error('❌ Resend error:', error);
      return false;
    }

    console.log('✅ Email sent successfully to:', to);
    console.log('📧 Email ID:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    return false;
  }
};
