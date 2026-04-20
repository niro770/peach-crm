-- Peach CRM Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (staff / admins)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'staff' CHECK (role IN ('admin','staff','telemarketer')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Donors
CREATE TABLE IF NOT EXISTS donors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id VARCHAR(50),
  short_id SERIAL,

  -- Personal
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  mothers_name VARCHAR(100),
  marital_status VARCHAR(30),
  children_names TEXT,
  language VARCHAR(20) DEFAULT 'hebrew',
  id_number VARCHAR(20),

  -- Contact
  mobile VARCHAR(30),
  home_phone VARCHAR(30),
  extra_phone VARCHAR(30),
  email VARCHAR(255),
  whatsapp BOOLEAN DEFAULT false,

  -- Address
  city VARCHAR(100),
  neighborhood VARCHAR(100),
  street VARCHAR(100),
  building_number VARCHAR(20),
  apartment_number VARCHAR(20),
  zip_code VARCHAR(20),
  mail_address TEXT,

  -- Business
  business_name VARCHAR(150),
  business_city VARCHAR(100),
  business_neighborhood VARCHAR(100),
  business_street VARCHAR(100),
  business_building VARCHAR(20),

  -- Donation info
  payment_method VARCHAR(50),
  monthly_standing_order NUMERIC(10,2),
  monthly_payment NUMERIC(10,2),
  standing_order_active BOOLEAN DEFAULT false,
  receipts_dispatch VARCHAR(50),
  donation_amount NUMERIC(10,2),
  charge_date VARCHAR(30),

  -- Bank
  bank_name VARCHAR(100),
  bank_branch VARCHAR(50),
  account_number VARCHAR(50),
  bank_account_name VARCHAR(100),

  -- CRM
  groups TEXT[],
  tags TEXT[],
  is_ambassador BOOLEAN DEFAULT false,
  ambassador_id VARCHAR(50),
  display_type VARCHAR(30),
  assigned_telemarketer UUID REFERENCES users(id),
  last_assigned_at TIMESTAMPTZ,
  eligibility_status VARCHAR(50),

  -- Stats (computed/cached)
  total_donations NUMERIC(12,2) DEFAULT 0,
  total_payments NUMERIC(12,2) DEFAULT 0,
  last_donation_amount NUMERIC(10,2),
  last_donation_date DATE,
  last_payment_amount NUMERIC(10,2),
  last_payment_date DATE,
  last_transaction_amount NUMERIC(10,2),
  last_transaction_date DATE,
  highest_single_donation NUMERIC(10,2),
  highest_standing_order NUMERIC(10,2),
  donations_this_year NUMERIC(12,2) DEFAULT 0,

  -- Call tracking
  last_call_date TIMESTAMPTZ,
  last_call_status VARCHAR(50),
  last_call_substatus VARCHAR(50),
  last_call_telemarketer UUID REFERENCES users(id),
  last_call_notes TEXT,
  callback_date DATE,
  last_donation_via_telemarketer NUMERIC(10,2),

  -- Misc
  receipt_name VARCHAR(150),
  general_notes TEXT,
  call_notes TEXT,
  calendar_id VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dedications (הקדשות)
CREATE TABLE IF NOT EXISTS dedications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_id UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  hebrew_date VARCHAR(50),
  gregorian_date DATE,
  dedication_text TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions / Payments
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_id UUID NOT NULL REFERENCES donors(id) ON DELETE RESTRICT,
  type VARCHAR(30) CHECK (type IN ('standing_order','one_time','check','cash','bank_transfer','bit')),
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'ILS',
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','success','failed','refunded','cancelled')),
  payment_method VARCHAR(50),
  charge_date DATE,
  processed_at TIMESTAMPTZ,
  receipt_sent BOOLEAN DEFAULT false,
  receipt_sent_at TIMESTAMPTZ,
  receipt_number VARCHAR(50),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  campaign_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call Log
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_id UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  outcome VARCHAR(50) CHECK (outcome IN ('donation','interested_callback','not_answered','not_interested','wrong_number','other')),
  donation_amount NUMERIC(10,2),
  transaction_id UUID REFERENCES transactions(id),
  script_used TEXT,
  notes TEXT,
  callback_date DATE
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  type VARCHAR(30) DEFAULT 'fundraising' CHECK (type IN ('fundraising','crowdfunding','recurring','event')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  goal_amount NUMERIC(12,2),
  raised_amount NUMERIC(12,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  page_url TEXT,
  image_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Donations (link transactions to campaigns)
CREATE TABLE IF NOT EXISTS campaign_donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES donors(id)
);

-- Mailing / Messaging
CREATE TABLE IF NOT EXISTS mailings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(20) CHECK (type IN ('sms','email','whatsapp')),
  subject VARCHAR(300),
  body TEXT NOT NULL,
  audience_filter JSONB,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  open_count INT DEFAULT 0,
  click_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_via VARCHAR(20),
  sent_to VARCHAR(255),
  pdf_url TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_donors_mobile ON donors(mobile);
CREATE INDEX IF NOT EXISTS idx_donors_email ON donors(email);
CREATE INDEX IF NOT EXISTS idx_donors_last_name ON donors(last_name);
CREATE INDEX IF NOT EXISTS idx_transactions_donor ON transactions(donor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(charge_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_donor ON call_logs(donor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_donor ON tasks(donor_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER donors_updated_at BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Default admin user (password: Admin1234! — change immediately)
INSERT INTO users (name, email, password_hash, role)
VALUES ('מנהל מערכת', 'admin@peach-crm.local',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG', 'admin')
ON CONFLICT (email) DO NOTHING;
