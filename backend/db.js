// RISE Portal — GTM Partner Introduction Workflow & Startup Introduction
// Request Workflow (PRD: "RISE Module", 10 Sep 2026).
//
// This is a standalone application with its own database, own users table,
// and own auth — it does not share infrastructure with the RIOS monorepo
// (rios.retailinnovation.ai). It's a separate app under the same parent
// company (Retail Innovation Ventures / RIV), meant to eventually live at
// rise.retailinnovation.ventures. Because it's isolated in its own repo,
// there's no naming collision to design around the way there was inside
// RIOS (which has an unrelated "Rise.RIV" startup-scouting module) — table
// and role names here are plain: partners, startups, retailers,
// introductions, invoices, payouts, notifications; roles 'admin' /
// 'partner' / 'startup'.
const pg = require("pg");

const { Pool } = pg;

// Same Supabase-vs-local SSL auto-detection as the RIOS backend, so this
// works against a local Postgres in dev and Supabase in production with no
// extra config. Override with PGSSL=true/false if pointing at something else.
function wantsSsl() {
  if (process.env.PGSSL === "true") return true;
  if (process.env.PGSSL === "false") return false;
  const url = process.env.DATABASE_URL || "";
  return url.includes("supabase.co") || url.includes("supabase.com");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: wantsSsl() ? { rejectUnauthorized: false } : false,
});

// Every status the PRD's Section 6.5 lifecycle can be in, in order. Kept as
// one exported list so routes validate transitions against the same source
// of truth instead of duplicating the string list. (PRD uses an en-dash in
// "Closed – Won" / "Closed – Lost"; a plain hyphen is used here instead so
// the value round-trips safely through JSON/SQL/URLs without encoding
// surprises — cosmetic only, same meaning.)
const INTRODUCTION_STATUSES = [
  "Requested",
  "Pending Startup Agreement",
  "Approved",
  "Introduced",
  "In Progress",
  "Closed - Won",
  "Closed - Lost",
  "Stalled",
  "Invoiced",
  "Paid",
  "Payout Complete",
];

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','partner','startup')),
      company TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- GTM Partner (PRD §8.1). user_id is nullable: RIV Ops can enter a
    -- partner (e.g. from Bigin) before RISE Portal login is provisioned.
    CREATE TABLE IF NOT EXISTS partners (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      company TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      linkedin_url TEXT,
      sector_focus TEXT[] NOT NULL DEFAULT '{}',
      region TEXT,
      onboarding_stage TEXT NOT NULL DEFAULT 'New'
        CHECK (onboarding_stage IN ('New','Agreement Sent','Signed','Onboarded')),
      agreement_link TEXT,
      agreement_signed_date DATE,
      -- % of RIV's own revenue share paid out to this partner. Default 2/3
      -- per the rate card; independently overridable per PRD §7 (different
      -- from a startup's revenue_share_override below — one answers "what
      -- the startup pays RIV", the other "what RIV pays the partner").
      default_payout_split NUMERIC NOT NULL DEFAULT 66.7,
      revenue_share_override NUMERIC,
      portal_login_status TEXT NOT NULL DEFAULT 'Not Provisioned'
        CHECK (portal_login_status IN ('Not Provisioned','Provisioned','Suspended')),
      riv_owner TEXT,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- RISE Startup (PRD §8.2) — a post-funded RISE-program startup using
    -- the introduction workflow.
    CREATE TABLE IF NOT EXISTS startups (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      startup_name TEXT NOT NULL,
      founder_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      sector TEXT,
      solution_summary TEXT,
      onboarding_stage TEXT NOT NULL DEFAULT 'New'
        CHECK (onboarding_stage IN ('New','Agreement Sent','Signed','Onboarded')),
      agreement_link TEXT,
      agreement_signed_date DATE,
      participation_fee_status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (participation_fee_status IN ('Paid','Pending')),
      participation_fee_due_date DATE,
      equity_pct NUMERIC,
      revenue_share_override NUMERIC,
      portal_login_status TEXT NOT NULL DEFAULT 'Not Provisioned'
        CHECK (portal_login_status IN ('Not Provisioned','Provisioned','Suspended')),
      riv_owner TEXT,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Retailer directory (PRD §8.3) — reference data. Contact fields are
    -- "internal only" per the PRD (never returned to partner/startup
    -- roles — enforced in routes/portal.js's SELECT column list, not just
    -- hidden in the UI).
    CREATE TABLE IF NOT EXISTS retailers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      location TEXT,
      network_source TEXT NOT NULL DEFAULT 'RIV Direct'
        CHECK (network_source IN ('RIV Direct','GTM Partner')),
      owning_partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      riv_owner TEXT,
      status TEXT NOT NULL DEFAULT 'Active in network'
        CHECK (status IN ('Active in network','Prospect')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Introduction (PRD §8.4) — the core transactional object; one row per
    -- request → agreement → introduction → proof → follow-up → sale →
    -- invoice → payout thread. invoice_id/payout_id are plain nullable
    -- integers rather than hard FKs (invoices/payouts reference *this*
    -- table, not the other way round, so a circular FK pair would need a
    -- deferred/ALTER-after-create step for no real benefit here — the app
    -- layer is the only thing that ever writes them).
    CREATE TABLE IF NOT EXISTS introductions (
      id SERIAL PRIMARY KEY,
      initiated_by TEXT NOT NULL CHECK (initiated_by IN ('GTM Partner','Startup','RIV Admin')),
      partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
      startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
      retailer_id INTEGER NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
      network_source TEXT,
      request_date DATE NOT NULL DEFAULT CURRENT_DATE,
      startup_agreed BOOLEAN NOT NULL DEFAULT false,
      startup_agreed_at TIMESTAMPTZ,
      intro_rate NUMERIC NOT NULL DEFAULT 15,
      closure_rate NUMERIC NOT NULL DEFAULT 25,
      status TEXT NOT NULL DEFAULT 'Requested',
      channel TEXT CHECK (channel IN ('Email','WhatsApp','In-person','Event')),
      introduction_date DATE,
      proof_of_introduction TEXT,
      follow_up_log JSONB NOT NULL DEFAULT '[]'::jsonb,
      engagement_stage TEXT CHECK (engagement_stage IN ('In discussion','Piloting','Stalled','Won','Lost')),
      sale_confirmation_date DATE,
      po_document TEXT,
      deal_value NUMERIC,
      fee_amount_due NUMERIC,
      invoice_id INTEGER,
      payout_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- PRD §8.4 "Last updated | Timestamp + user" — updated_at alone only
      -- gave the timestamp half of that; this carries the name of whoever
      -- (partner/startup/admin) took the action that produced the current
      -- state, so the audit trail says who as well as when.
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      startup_id INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
      related_introduction_ids INTEGER[] NOT NULL DEFAULT '{}',
      billing_period_start DATE,
      billing_period_end DATE,
      amount NUMERIC NOT NULL,
      payment_terms TEXT,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Sent','Paid','Overdue')),
      paid_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Payout, RIV -> GTM Partner (PRD §8.7).
    CREATE TABLE IF NOT EXISTS payouts (
      id SERIAL PRIMARY KEY,
      partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      related_introduction_ids INTEGER[] NOT NULL DEFAULT '{}',
      amount NUMERIC NOT NULL,
      pct_applied NUMERIC,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Paid')),
      payout_date DATE,
      payment_reference TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Notification log (PRD §8.8). v1 is in-app only — email/WhatsApp
    -- channels are recorded here for future wiring but nothing actually
    -- sends yet (open question, PRD §12).
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      recipient_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      related_introduction_id INTEGER REFERENCES introductions(id) ON DELETE CASCADE,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_ack BOOLEAN NOT NULL DEFAULT false,
      channel TEXT NOT NULL DEFAULT 'In-app',
      message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_intros_partner ON introductions(partner_id);
    CREATE INDEX IF NOT EXISTS idx_intros_startup ON introductions(startup_id);
    CREATE INDEX IF NOT EXISTS idx_intros_retailer ON introductions(retailer_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);
  `);

  // Idempotent add-column for the updated_by field above — safe to run
  // every boot, and picks up the column on any database created before
  // this field existed (the CREATE TABLE IF NOT EXISTS above only applies
  // to brand-new databases).
  await pool.query(`ALTER TABLE introductions ADD COLUMN IF NOT EXISTS updated_by TEXT;`);
}

module.exports = { pool, INTRODUCTION_STATUSES, initSchema };