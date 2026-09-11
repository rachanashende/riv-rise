// RISE Portal — RIV Admin/Ops endpoints (PRD §6.1/§6.2 onboarding fields,
// §7 rate overrides, §8.5–§8.7 agreements/invoices/payouts, §9 full
// visibility). Mounted at /api/admin, requireAdmin throughout.
import { Router } from "express";
import bcrypt from "bcryptjs";
import pool, { INTRODUCTION_STATUSES } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// ---------- Dashboard ----------

router.get("/summary", async (req, res, next) => {
  try {
    const { rows: statusCounts } = await pool.query("SELECT status, COUNT(*)::int AS count FROM introductions GROUP BY status");
    const { rows: pipeline } = await pool.query(
      `SELECT
         COALESCE(SUM(fee_amount_due) FILTER (WHERE status IN ('Closed - Won','Invoiced','Paid','Payout Complete')), 0) AS fees_earned,
         COALESCE(SUM(fee_amount_due) FILTER (WHERE status = 'Paid' OR status = 'Payout Complete'), 0) AS fees_collected,
         COUNT(*) FILTER (WHERE status NOT IN ('Closed - Won','Closed - Lost','Stalled','Invoiced','Paid','Payout Complete') AND status != 'Requested') AS active_in_flight
       FROM introductions`
    );
    const { rows: counts } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM partners) AS partners,
        (SELECT COUNT(*)::int FROM startups) AS startups,
        (SELECT COUNT(*)::int FROM retailers) AS retailers,
        (SELECT COUNT(*)::int FROM introductions) AS introductions
    `);
    res.json({ statusCounts, pipeline: pipeline[0], counts: counts[0], allStatuses: INTRODUCTION_STATUSES });
  } catch (err) {
    next(err);
  }
});

// ---------- Partners ----------

router.get("/partners", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.email AS login_email FROM partners p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC`
    );
    res.json({ partners: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/partners", async (req, res, next) => {
  try {
    const { fullName, company, email, phone, linkedinUrl, sectorFocus, region, riv_owner } = req.body || {};
    if (!fullName || !email) return res.status(400).json({ error: "fullName and email are required." });
    const { rows } = await pool.query(
      `INSERT INTO partners (full_name, company, email, phone, linkedin_url, sector_focus, region, riv_owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [fullName, company || null, email, phone || null, linkedinUrl || null, sectorFocus || [], region || null, riv_owner || null]
    );
    res.status(201).json({ partner: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/partners/:id", async (req, res, next) => {
  try {
    const f = req.body || {};
    const { rows } = await pool.query(
      `UPDATE partners SET
         full_name = COALESCE($2, full_name), company = COALESCE($3, company), phone = COALESCE($4, phone),
         linkedin_url = COALESCE($5, linkedin_url), sector_focus = COALESCE($6, sector_focus), region = COALESCE($7, region),
         onboarding_stage = COALESCE($8, onboarding_stage), agreement_link = COALESCE($9, agreement_link),
         agreement_signed_date = COALESCE($10, agreement_signed_date), default_payout_split = COALESCE($11, default_payout_split),
         revenue_share_override = $12, riv_owner = COALESCE($13, riv_owner), status = COALESCE($14, status),
         notes = COALESCE($15, notes), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, f.fullName, f.company, f.phone, f.linkedinUrl, f.sectorFocus, f.region,
        f.onboardingStage, f.agreementLink, f.agreementSignedDate, f.defaultPayoutSplit,
        f.revenueShareOverride ?? null, f.riv_owner, f.status, f.notes,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Partner not found." });
    res.json({ partner: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/partners/:id/provision-login — creates the partner's
// RISE Portal login (PRD §6.1 step 5).
router.post("/partners/:id/provision-login", async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 8) return res.status(400).json({ error: "A password of at least 8 characters is required." });

    const { rows: partnerRows } = await pool.query("SELECT * FROM partners WHERE id = $1", [req.params.id]);
    const partner = partnerRows[0];
    if (!partner) return res.status(404).json({ error: "Partner not found." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, company) VALUES ($1,$2,$3,'partner',$4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'partner'
       RETURNING id`,
      [partner.email, password_hash, partner.full_name, partner.company]
    );
    await pool.query(
      "UPDATE partners SET user_id = $2, portal_login_status = 'Provisioned', updated_at = now() WHERE id = $1",
      [req.params.id, userRows[0].id]
    );
    res.json({ ok: true, email: partner.email });
  } catch (err) {
    next(err);
  }
});

router.delete("/partners/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM partners WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- Startups ----------

router.get("/startups", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, u.email AS login_email FROM startups s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC`
    );
    res.json({ startups: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/startups", async (req, res, next) => {
  try {
    const { startupName, founderName, email, phone, sector, solutionSummary, riv_owner } = req.body || {};
    if (!startupName || !email) return res.status(400).json({ error: "startupName and email are required." });
    const { rows } = await pool.query(
      `INSERT INTO startups (startup_name, founder_name, email, phone, sector, solution_summary, riv_owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [startupName, founderName || null, email, phone || null, sector || null, solutionSummary || null, riv_owner || null]
    );
    res.status(201).json({ startup: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/startups/:id", async (req, res, next) => {
  try {
    const f = req.body || {};
    const { rows } = await pool.query(
      `UPDATE startups SET
         startup_name = COALESCE($2, startup_name), founder_name = COALESCE($3, founder_name), phone = COALESCE($4, phone),
         sector = COALESCE($5, sector), solution_summary = COALESCE($6, solution_summary),
         onboarding_stage = COALESCE($7, onboarding_stage), agreement_link = COALESCE($8, agreement_link),
         agreement_signed_date = COALESCE($9, agreement_signed_date), participation_fee_status = COALESCE($10, participation_fee_status),
         participation_fee_due_date = COALESCE($11, participation_fee_due_date), equity_pct = COALESCE($12, equity_pct),
         revenue_share_override = $13, riv_owner = COALESCE($14, riv_owner), status = COALESCE($15, status), notes = COALESCE($16, notes),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, f.startupName, f.founderName, f.phone, f.sector, f.solutionSummary,
        f.onboardingStage, f.agreementLink, f.agreementSignedDate, f.participationFeeStatus,
        f.participationFeeDueDate, f.equityPct, f.revenueShareOverride ?? null, f.riv_owner, f.status, f.notes,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Startup not found." });
    res.json({ startup: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/startups/:id/provision-login", async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 8) return res.status(400).json({ error: "A password of at least 8 characters is required." });

    const { rows: startupRows } = await pool.query("SELECT * FROM startups WHERE id = $1", [req.params.id]);
    const startup = startupRows[0];
    if (!startup) return res.status(404).json({ error: "Startup not found." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, company) VALUES ($1,$2,$3,'startup',$4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'startup'
       RETURNING id`,
      [startup.email, password_hash, startup.founder_name || startup.startup_name, startup.startup_name]
    );
    await pool.query(
      "UPDATE startups SET user_id = $2, portal_login_status = 'Provisioned', updated_at = now() WHERE id = $1",
      [req.params.id, userRows[0].id]
    );
    res.json({ ok: true, email: startup.email });
  } catch (err) {
    next(err);
  }
});

router.delete("/startups/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM startups WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- Retailers ----------

router.get("/retailers", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, p.full_name AS owning_partner_name FROM retailers r LEFT JOIN partners p ON p.id = r.owning_partner_id ORDER BY r.created_at DESC`
    );
    res.json({ retailers: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/retailers", async (req, res, next) => {
  try {
    const { name, category, location, networkSource, owningPartnerId, contactName, contactEmail, contactPhone, riv_owner } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required." });
    const { rows } = await pool.query(
      `INSERT INTO retailers (name, category, location, network_source, owning_partner_id, contact_name, contact_email, contact_phone, riv_owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, category || null, location || null, networkSource || "RIV Direct", owningPartnerId || null, contactName || null, contactEmail || null, contactPhone || null, riv_owner || null]
    );
    res.status(201).json({ retailer: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/retailers/:id", async (req, res, next) => {
  try {
    const f = req.body || {};
    const { rows } = await pool.query(
      `UPDATE retailers SET
         name = COALESCE($2, name), category = COALESCE($3, category), location = COALESCE($4, location),
         network_source = COALESCE($5, network_source), owning_partner_id = $6,
         contact_name = COALESCE($7, contact_name), contact_email = COALESCE($8, contact_email), contact_phone = COALESCE($9, contact_phone),
         riv_owner = COALESCE($10, riv_owner), status = COALESCE($11, status)
       WHERE id = $1 RETURNING *`,
      [req.params.id, f.name, f.category, f.location, f.networkSource, f.owningPartnerId ?? null, f.contactName, f.contactEmail, f.contactPhone, f.riv_owner, f.status]
    );
    if (!rows[0]) return res.status(404).json({ error: "Retailer not found." });
    res.json({ retailer: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/retailers/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM retailers WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- Introductions (full visibility + override) ----------

const INTRO_SELECT_ADMIN = `
  SELECT i.*, s.startup_name, r.name AS retailer_name, p.full_name AS partner_name
  FROM introductions i
  JOIN startups s ON s.id = i.startup_id
  JOIN retailers r ON r.id = i.retailer_id
  LEFT JOIN partners p ON p.id = i.partner_id
`;

router.get("/introductions", async (req, res, next) => {
  try {
    const { status } = req.query;
    const { rows } = status
      ? await pool.query(`${INTRO_SELECT_ADMIN} WHERE i.status = $1 ORDER BY i.updated_at DESC`, [status])
      : await pool.query(`${INTRO_SELECT_ADMIN} ORDER BY i.updated_at DESC`);
    res.json({ introductions: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/introductions — RIV admin makes a direct introduction.
router.post("/introductions", async (req, res, next) => {
  try {
    const { startupId, retailerId, status } = req.body || {};
    if (!startupId || !retailerId) return res.status(400).json({ error: "startupId and retailerId are required." });
    const { rows: retailerRows } = await pool.query("SELECT network_source FROM retailers WHERE id = $1", [retailerId]);
    if (!retailerRows[0]) return res.status(404).json({ error: "Retailer not found." });

    const { rows } = await pool.query(
      `INSERT INTO introductions (initiated_by, startup_id, retailer_id, network_source, status)
       VALUES ('RIV Admin', $1, $2, $3, $4) RETURNING *`,
      [startupId, retailerId, retailerRows[0].network_source, status || "Approved"]
    );
    res.status(201).json({ introduction: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/introductions/:id — admin override: any field, including
// status (full visibility + override per PRD §9).
router.put("/introductions/:id", async (req, res, next) => {
  try {
    const f = req.body || {};
    if (f.status && !INTRODUCTION_STATUSES.includes(f.status)) {
      return res.status(400).json({ error: `status must be one of: ${INTRODUCTION_STATUSES.join(", ")}` });
    }
    const { rows } = await pool.query(
      `UPDATE introductions SET
         status = COALESCE($2, status), intro_rate = COALESCE($3, intro_rate), closure_rate = COALESCE($4, closure_rate),
         engagement_stage = COALESCE($5, engagement_stage), deal_value = COALESCE($6, deal_value), fee_amount_due = COALESCE($7, fee_amount_due),
         updated_at = now(), updated_by = $8
       WHERE id = $1 RETURNING *`,
      [req.params.id, f.status, f.introRate, f.closureRate, f.engagementStage, f.dealValue, f.feeAmountDue, req.user.name]
    );
    if (!rows[0]) return res.status(404).json({ error: "Introduction not found." });
    res.json({ introduction: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------- Invoices ----------

router.get("/invoices", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT inv.*, s.startup_name FROM invoices inv JOIN startups s ON s.id = inv.startup_id ORDER BY inv.created_at DESC`);
    res.json({ invoices: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/invoices", async (req, res, next) => {
  try {
    const { startupId, introductionIds, amount, paymentTerms, dueDate, billingPeriodStart, billingPeriodEnd } = req.body || {};
    if (!startupId || !amount) return res.status(400).json({ error: "startupId and amount are required." });
    const ids = Array.isArray(introductionIds) ? introductionIds : [];

    const { rows } = await pool.query(
      `INSERT INTO invoices (startup_id, related_introduction_ids, amount, payment_terms, due_date, billing_period_start, billing_period_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [startupId, ids, amount, paymentTerms || "Net 15", dueDate || null, billingPeriodStart || null, billingPeriodEnd || null]
    );
    if (ids.length) {
      await pool.query("UPDATE introductions SET invoice_id = $2, status = 'Invoiced', updated_at = now(), updated_by = $3 WHERE id = ANY($1::int[])", [ids, rows[0].id, req.user.name]);
    }
    await notifyStartup(startupId, "Invoice issued", ids[0] || null);
    res.status(201).json({ invoice: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/invoices/:id", async (req, res, next) => {
  try {
    const { status, paidDate } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE invoices SET status = COALESCE($2, status), paid_date = COALESCE($3, paid_date) WHERE id = $1 RETURNING *`,
      [req.params.id, status || null, paidDate || null]
    );
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    if (status === "Paid" && invoice.related_introduction_ids?.length) {
      await pool.query("UPDATE introductions SET status = 'Paid', updated_at = now(), updated_by = $2 WHERE id = ANY($1::int[])", [invoice.related_introduction_ids, req.user.name]);
      await notifyStartup(invoice.startup_id, "Payment received", invoice.related_introduction_ids[0]);
    }
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
});

// ---------- Payouts ----------

router.get("/payouts", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT po.*, p.full_name AS partner_name FROM payouts po JOIN partners p ON p.id = po.partner_id ORDER BY po.created_at DESC`);
    res.json({ payouts: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/payouts — pays a GTM partner their share of one or more
// paid introductions, at that partner's payout-split field (PRD §8.7).
router.post("/payouts", async (req, res, next) => {
  try {
    const { partnerId, introductionIds, amount: overrideAmount } = req.body || {};
    if (!partnerId) return res.status(400).json({ error: "partnerId is required." });
    const ids = Array.isArray(introductionIds) ? introductionIds : [];

    const { rows: partnerRows } = await pool.query("SELECT * FROM partners WHERE id = $1", [partnerId]);
    const partner = partnerRows[0];
    if (!partner) return res.status(404).json({ error: "Partner not found." });

    let amount = 0;
    if (ids.length) {
      const { rows: feeRows } = await pool.query("SELECT COALESCE(SUM(fee_amount_due),0) AS total FROM introductions WHERE id = ANY($1::int[])", [ids]);
      amount = Number(feeRows[0].total) * (Number(partner.default_payout_split) / 100);
    }

    const { rows } = await pool.query(
      `INSERT INTO payouts (partner_id, related_introduction_ids, amount, pct_applied, status)
       VALUES ($1,$2,$3,$4,'Pending') RETURNING *`,
      [partnerId, ids, overrideAmount || amount, partner.default_payout_split]
    );
    if (ids.length) {
      await pool.query("UPDATE introductions SET payout_id = $2, updated_at = now(), updated_by = $3 WHERE id = ANY($1::int[])", [ids, rows[0].id, req.user.name]);
    }
    await notifyPartner(partnerId, "Payout issued", ids[0] || null);
    res.status(201).json({ payout: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/payouts/:id", async (req, res, next) => {
  try {
    const { status, payoutDate, paymentReference } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE payouts SET status = COALESCE($2, status), payout_date = COALESCE($3, payout_date), payment_reference = COALESCE($4, payment_reference)
       WHERE id = $1 RETURNING *`,
      [req.params.id, status || null, payoutDate || null, paymentReference || null]
    );
    if (!rows[0]) return res.status(404).json({ error: "Payout not found." });
    if (status === "Paid" && rows[0].related_introduction_ids?.length) {
      await pool.query("UPDATE introductions SET status = 'Payout Complete', updated_at = now(), updated_by = $2 WHERE id = ANY($1::int[])", [rows[0].related_introduction_ids, req.user.name]);
      await notifyPartner(rows[0].partner_id, "Payout issued", rows[0].related_introduction_ids[0]);
    }
    res.json({ payout: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Small notification-log helpers (mirrors the pair in routes/portal.js —
// duplicated rather than shared, same reasoning: a two-line insert isn't
// worth a shared module across the two route files).
async function notifyStartup(startupId, type, introId) {
  const { rows } = await pool.query("SELECT user_id FROM startups WHERE id = $1", [startupId]);
  if (rows[0]?.user_id) await notifyUserId(rows[0].user_id, type, introId);
}
async function notifyPartner(partnerId, type, introId) {
  const { rows } = await pool.query("SELECT user_id FROM partners WHERE id = $1", [partnerId]);
  if (rows[0]?.user_id) await notifyUserId(rows[0].user_id, type, introId);
}
async function notifyUserId(userId, type, introId) {
  await pool.query(
    "INSERT INTO notifications (recipient_user_id, type, related_introduction_id, message) VALUES ($1,$2,$3,$4)",
    [userId, type, introId, type]
  );
}

export default router;
