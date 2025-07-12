-- 创建 emails 表
CREATE TABLE emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mailbox_code TEXT NOT NULL,
  message_id TEXT,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mailbox_code_received ON emails (mailbox_code, received_at DESC);

-- 创建新的 users 表
CREATE TABLE users (
  mailbox_code TEXT PRIMARY KEY NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);