import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Analyze resume and provide suggestions
router.post('/analyze-resume', authenticateToken, async (req, res) => {
  const { resumeText } = req.body;

  if (!resumeText || resumeText.trim().length < 20) {
    return res.status(400).json({
      success: false,
      message: 'Please provide resume text (minimum 20 characters)'
    });
  }

  try {
    // Simple keyword analysis
    const keywords = [
      'leadership', 'managed', 'developed', 'implemented', 'achieved',
      'increased', 'reduced', 'improved', 'collaborated', 'designed',
      'led', 'created', 'launched', 'optimized', 'scaled'
    ];

    const metricPatterns = /\d+%|\$\d+|[\d,]+\s*(users|customers|revenue|growth|reduction|increase)/gi;
    const hasMetrics = metricPatterns.test(resumeText);
    
    const lowerText = resumeText.toLowerCase();
    const foundKeywords = keywords.filter(kw => lowerText.includes(kw));
    const missingKeywords = keywords.filter(kw => !lowerText.includes(kw));

    const tips = [];

    // Generate personalized tips
    if (!hasMetrics) {
      tips.push('Add quantifiable metrics (e.g., "increased sales by 35%" or "managed team of 8 engineers")');
    }

    if (foundKeywords.length < 3) {
      tips.push(`Include action verbs like: ${missingKeywords.slice(0, 5).join(', ')}`);
    }

    if (resumeText.length < 150) {
      tips.push('Expand your experience with specific examples and results achieved');
    }

    if (!lowerText.includes('project') && !lowerText.includes('initiative')) {
      tips.push('Highlight specific projects or initiatives you led or contributed to');
    }

    if (tips.length === 0) {
      tips.push('Strong foundation! Consider adding technical skills or certifications relevant to your target role');
      tips.push('Include links to portfolio, GitHub, or LinkedIn for additional context');
      tips.push('Tailor each bullet point to match keywords from the job description');
    }

    // Calculate basic score
    const score = Math.min(100, 
      (foundKeywords.length * 8) + 
      (hasMetrics ? 25 : 0) + 
      (resumeText.length > 150 ? 15 : 0) +
      20
    );

    res.json({
      success: true,
      data: {
        score,
        tips,
        foundKeywords: foundKeywords.slice(0, 5),
        hasMetrics
      }
    });
  } catch (error) {
    console.error('Resume analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze resume'
    });
  }
});

// Save mock interview response
router.post('/mock-interview', authenticateToken, async (req, res) => {
  const { prompt, response, duration } = req.body;

  if (!prompt || !response) {
    return res.status(400).json({
      success: false,
      message: 'Prompt and response are required'
    });
  }

  try {
    // Simple scoring based on response length and structure
    const wordCount = response.trim().split(/\s+/).length;
    const hasSituation = /situation|context|background/i.test(response);
    const hasTask = /task|goal|objective|challenge/i.test(response);
    const hasAction = /action|did|implemented|executed|performed/i.test(response);
    const hasResult = /result|outcome|impact|achieved|accomplished/i.test(response);

    const starScore = (hasSituation ? 25 : 0) + 
                     (hasTask ? 25 : 0) + 
                     (hasAction ? 25 : 0) + 
                     (hasResult ? 25 : 0);

    const lengthScore = Math.min(30, Math.floor(wordCount / 10) * 5);
    const totalScore = Math.min(100, starScore + lengthScore + 10);

    // Store the interview practice
    await db.query(
      `INSERT INTO interview_practice 
       (user_id, prompt, response, duration, score, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [req.user.userId, prompt, response, duration || null, totalScore]
    );

    const feedback = [];
    if (!hasSituation) feedback.push('Add context: Describe the situation or background');
    if (!hasTask) feedback.push('Clarify the task: What was your goal or challenge?');
    if (!hasAction) feedback.push('Detail your action: What specific steps did you take?');
    if (!hasResult) feedback.push('Share the result: What was the outcome or impact?');
    
    if (wordCount < 50) {
      feedback.push('Expand your response with more details and specific examples');
    }

    if (feedback.length === 0) {
      feedback.push('Great STAR structure! Keep practicing to improve confidence and delivery');
      feedback.push('Consider varying your tone and pacing for better engagement');
    }

    res.json({
      success: true,
      data: {
        score: totalScore,
        feedback,
        wordCount,
        starComponents: {
          situation: hasSituation,
          task: hasTask,
          action: hasAction,
          result: hasResult
        }
      }
    });
  } catch (error) {
    console.error('Mock interview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save interview practice'
    });
  }
});

// Get user's interview practice history
router.get('/interview-history', authenticateToken, async (req, res) => {
  try {
    const [history] = await db.query(
      `SELECT prompt, score, duration, created_at 
       FROM interview_practice 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [req.user.userId]
    );

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Interview history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch interview history'
    });
  }
});

// Get career progress stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Get interview practice count and average score
    const [interviewStats] = await db.query(
      `SELECT COUNT(*) as count, AVG(score) as avgScore 
       FROM interview_practice 
       WHERE user_id = ?`,
      [req.user.userId]
    );

    // Get application stats
    const [appStats] = await db.query(
      `SELECT COUNT(*) as totalApps,
       SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
       SUM(CASE WHEN status = 'shortlisted' THEN 1 ELSE 0 END) as shortlisted
       FROM applications 
       WHERE user_id = ?`,
      [req.user.userId]
    );

    // Calculate confidence pulse (0-100)
    const interviewCount = interviewStats[0].count || 0;
    const avgScore = interviewStats[0].avgScore || 0;
    const totalApps = appStats[0].totalApps || 0;
    
    const interviewWeight = Math.min(40, interviewCount * 8);
    const scoreWeight = Math.min(30, avgScore * 0.3);
    const activityWeight = Math.min(30, totalApps * 3);
    
    const confidencePulse = Math.round(interviewWeight + scoreWeight + activityWeight);

    res.json({
      success: true,
      data: {
        confidencePulse,
        interviewPracticeCount: interviewCount,
        averageInterviewScore: Math.round(avgScore),
        totalApplications: totalApps,
        acceptedApplications: appStats[0].accepted || 0,
        shortlistedApplications: appStats[0].shortlisted || 0
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch career stats'
    });
  }
});

export default router;
