-- JobPortal Database Schema
-- Version 1.0

-- Note: Using existing database (defaultdb for Aiven or jobportal for local)
-- No need to create database, just use the existing one

-- Table: users
CREATE TABLE IF NOT EXISTS users (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(15),
  password VARCHAR(255) NOT NULL,
  role ENUM('job_seeker', 'job_poster', 'alumni', 'student', 'admin') NOT NULL,
  status ENUM('active', 'suspended', 'pending') DEFAULT 'active',
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: profiles
CREATE TABLE IF NOT EXISTS profiles (
  profile_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  education TEXT,
  skills TEXT,
  experience TEXT,
  resume VARCHAR(255),
  bio TEXT,
  linkedin VARCHAR(255),
  github VARCHAR(255),
  portfolio VARCHAR(255),
  location VARCHAR(100),
  date_of_birth DATE,
  gender ENUM('male', 'female', 'other'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: jobs
CREATE TABLE IF NOT EXISTS jobs (
  job_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  company VARCHAR(150) NOT NULL,
  salary VARCHAR(50),
  location VARCHAR(100),
  description TEXT NOT NULL,
  skills TEXT,
  job_type ENUM('full_time', 'part_time', 'contract', 'internship', 'freelance') DEFAULT 'full_time',
  experience_level VARCHAR(50),
  category VARCHAR(100),
  deadline DATE,
  status ENUM('active', 'closed', 'pending', 'rejected') DEFAULT 'active',
  views INT DEFAULT 0,
  applications_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_job_type (job_type),
  INDEX idx_location (location),
  FULLTEXT idx_search (title, company, description, skills)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: applications
CREATE TABLE IF NOT EXISTS applications (
  application_id INT PRIMARY KEY AUTO_INCREMENT,
  job_id INT NOT NULL,
  user_id INT NOT NULL,
  resume VARCHAR(255),
  cover_letter TEXT,
  status ENUM('pending', 'reviewed', 'shortlisted', 'rejected', 'accepted') DEFAULT 'pending',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY unique_application (job_id, user_id),
  INDEX idx_job (job_id),
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: alumni_chapters
CREATE TABLE IF NOT EXISTS alumni_chapters (
  chapter_id INT PRIMARY KEY AUTO_INCREMENT,
  chapter_name VARCHAR(200) NOT NULL,
  college_name VARCHAR(200) NOT NULL,
  department VARCHAR(100),
  batch VARCHAR(20),
  description TEXT,
  logo VARCHAR(255),
  created_by INT NOT NULL,
  status ENUM('active', 'blocked', 'pending') DEFAULT 'active',
  member_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_creator (created_by),
  INDEX idx_college (college_name),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: chapter_members
CREATE TABLE IF NOT EXISTS chapter_members (
  id INT PRIMARY KEY AUTO_INCREMENT,
  chapter_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('admin', 'member') DEFAULT 'member',
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES alumni_chapters(chapter_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY unique_membership (chapter_id, user_id),
  INDEX idx_chapter (chapter_id),
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: chapter_posts
CREATE TABLE IF NOT EXISTS chapter_posts (
  post_id INT PRIMARY KEY AUTO_INCREMENT,
  chapter_id INT NOT NULL,
  posted_by INT NOT NULL,
  type ENUM('job', 'internship', 'announcement', 'event', 'mentoring') NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  target_audience VARCHAR(100),
  expiry_date DATE,
  company VARCHAR(150),
  location VARCHAR(100),
  salary VARCHAR(50),
  skills TEXT,
  status ENUM('active', 'expired', 'removed') DEFAULT 'active',
  views INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES alumni_chapters(chapter_id) ON DELETE CASCADE,
  FOREIGN KEY (posted_by) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_chapter (chapter_id),
  INDEX idx_poster (posted_by),
  INDEX idx_type (type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: notifications
CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: password_resets
CREATE TABLE IF NOT EXISTS password_resets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(100) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table: interview_practice
CREATE TABLE IF NOT EXISTS interview_practice (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  duration INT,
  score INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

