import React, { useState, useEffect, useCallback } from "react";
import {
  LogOut, Loader2, AlertCircle, Users, Building2, ArrowRight, Plus, X,
  FileText, DollarSign, Send, Briefcase, Handshake, ClipboardList,
} from "lucide-react";
import {
  api, getStoredUser, setSession, clearSession,
} from "./api.js";
import { BRAND } from "./brand.js";

// RISE Portal — GTM Partner Introduction Workflow & Startup Introduction
// Request Workflow (PRD: "RISE Module", 10 Sep 2026). This is the root
// component of a standalone application (own repo, own backend, own
// database) — a separate app from the RIOS monorepo, under the same
// parent company (Retail Innovation Ventures / RIV), meant to live at
// rise.retailinnovation.ventures.

const FONT = "'Poppins',sans-serif";

// Same list as INTRODUCTION_STATUSES in backend/db.js — kept as a literal
// here (rather than fetched) since it's small and static.
const STATUS_COLORS = {
  "Requested": { bg: "#F3F1EE", fg: "#8A857F" },
  "Pending Startup Agreement": { bg: "#FFF4E0", fg: "#B8790A" },
  "Approved": { bg: "#E8F0FE", fg: BRAND.blue },
  "Introduced": { bg: "#E8F0FE", fg: BRAND.blue },
  "In Progress": { bg: "#FFF4E0", fg: "#B8790A" },
  "Closed - Won": { bg: "#E6F4EA", fg: "#1E7A34" },
  "Closed - Lost": { bg: "#FBEAEA", fg: BRAND.coralDark },
  "Stalled": { bg: "#F3F1EE", fg: "#8A857F" },
  "Invoiced": { bg: "#EFE9FB", fg: "#6B3FBF" },
  "Paid": { bg: "#E6F4EA", fg: "#1E7A34" },
  "Payout Complete": { bg: "#E6F4EA", fg: "#1E7A34" },
};

/* =========================================================================
   UI PRIMITIVES
   ========================================================================= */
function PrimaryButton({ children, onClick, disabled, style, icon: Icon, type = "button" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13.5, background: disabled ? "#E7B4B4" : BRAND.coral,
      color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px",
      cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", ...style,
    }}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}
function GhostButton({ children, onClick, style, icon: Icon, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13, background: "#fff",
      color: disabled ? "#B7B2AE" : BRAND.ink, border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "9px 16px",
      cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", ...style,
    }}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}
function Card({ children, style, onClick }) {
  return <div onClick={onClick} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 14, background: "#fff", ...style }}>{children}</div>;
}
function Field({ label, children, required, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, marginBottom: 6 }}>
        {label}{required && <span style={{ color: BRAND.coral }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 5 }}>{hint}</div>}
    </label>
  );
}
const inputStyle = {
  width: "100%", fontFamily: FONT, fontSize: 13.5, padding: "10px 12px",
  borderRadius: 9, border: `1px solid ${BRAND.line}`, background: "#fff", color: BRAND.ink,
};
function ErrorBanner({ text }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, background: "#FBEAEA", border: "1px solid #F3C6C6", marginBottom: 16 }}>
      <AlertCircle size={15} color={BRAND.coralDark} />
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>{text}</div>
    </div>
  );
}
function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "60px 20px", fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>
      <Loader2 size={16} className="gtm-portal-spin" /> {label || "Loading…"}
    </div>
  );
}
function EmptyState({ icon: Icon, title, text }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", border: `1px dashed ${BRAND.line}`, borderRadius: 14 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: BRAND.cream, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", border: `1px solid ${BRAND.line}` }}>
        <Icon size={20} color={BRAND.coral} />
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink }}>{title}</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 6, maxWidth: 360, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#F3F1EE", fg: "#8A857F" };
  return (
    <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 11, padding: "4px 10px", borderRadius: 999, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(39,37,37,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: BRAND.ink }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B958F" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function money(n) {
  if (n === null || n === undefined || n === "") return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}
function dateStr(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* =========================================================================
   LOGIN
   ========================================================================= */
function LoginView({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { token, user } = await api.login(email.trim(), password);
      if (!["partner", "startup", "admin"].includes(user.role)) {
        throw new Error("This login doesn't have RISE Portal access.");
      }
      setSession(token, user);
      onAuthed(user);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.cream, padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>RISE Portal</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginTop: 6 }}>GTM partner & startup introductions</div>
        </div>
        <Card style={{ padding: 26 }}>
          <form onSubmit={submit}>
            <ErrorBanner text={error} />
            <Field label="Email" required>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            <Field label="Password" required>
              <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <PrimaryButton type="submit" disabled={loading} style={{ width: "100%", padding: "12px 18px" }}>
              {loading ? "Signing in…" : "Sign in"}
            </PrimaryButton>
          </form>
        </Card>
        <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 11.5, color: "#B7B2AE", marginTop: 18 }}>
          Demo logins — Partner: partner@rise-gtm.demo / partner123 · Startup: startup@rise-gtm.demo / startup123
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   NAV
   ========================================================================= */
function NavBar({ view, setView, user, onLogout }) {
  const items =
    user.role === "partner" ? [
      { id: "startups", label: "Startups" }, { id: "retailers", label: "Retailers" }, { id: "introductions", label: "My Introductions" },
    ] : user.role === "startup" ? [
      { id: "retailers", label: "Retailer Directory" }, { id: "introductions", label: "My Introductions" },
    ] : [
      { id: "overview", label: "Overview" }, { id: "partners", label: "Partners" }, { id: "startups", label: "Startups" },
      { id: "retailers", label: "Retailers" }, { id: "introductions", label: "Introductions" },
      { id: "invoices", label: "Invoices" }, { id: "payouts", label: "Payouts" },
    ];
  return (
    <div style={{ borderBottom: `1px solid ${BRAND.line}`, background: "#fff", position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: BRAND.ink }}>RISE Portal</div>
          <div style={{ display: "flex", gap: 4 }}>
            {items.map((it) => (
              <button key={it.id} onClick={() => setView(it.id)} style={{
                fontFamily: FONT, fontWeight: 600, fontSize: 13, padding: "8px 12px", borderRadius: 8,
                border: "none", cursor: "pointer",
                background: view === it.id ? BRAND.cream : "transparent",
                color: view === it.id ? BRAND.coral : "#7A756F",
              }}>
                {it.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A756F" }}>{user.name}</div>
          <GhostButton onClick={onLogout} icon={LogOut} style={{ padding: "8px 12px" }}>Log out</GhostButton>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   SHARED: introduction cards + detail drawer
   ========================================================================= */
function IntroCard({ intro, onOpen }) {
  return (
    <Card onClick={() => onOpen(intro)} style={{ padding: 16, cursor: "pointer", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>
            {intro.startup_name} <ArrowRight size={12} style={{ margin: "0 4px", verticalAlign: "middle" }} /> {intro.retailer_name}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 4 }}>
            {intro.partner_name ? `via ${intro.partner_name}` : "RIV direct"} · Requested {dateStr(intro.request_date)}
            {intro.deal_value ? ` · Deal ${money(intro.deal_value)}` : ""}
          </div>
        </div>
        <StatusBadge status={intro.status} />
      </div>
    </Card>
  );
}

function IntroDetailModal({ intro, user, onClose, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proof, setProof] = useState("");
  const [channel, setChannel] = useState("Email");
  const [followUpNote, setFollowUpNote] = useState("");
  const [engagementStage, setEngagementStage] = useState(intro.engagement_stage || "");
  const [dealValue, setDealValue] = useState("");
  const [poDocument, setPoDocument] = useState("");

  const isPartner = user.role === "partner";
  const isStartup = user.role === "startup";
  const isAdmin = user.role === "admin";

  async function run(fn) {
    setError(""); setBusy(true);
    try { await fn(); await onRefresh(); onClose(); }
    catch (err) { setError(err.message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`${intro.startup_name} → ${intro.retailer_name}`} onClose={onClose} width={560}>
      <ErrorBanner text={error} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <StatusBadge status={intro.status} />
        <span style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>
          {intro.partner_name ? `Partner: ${intro.partner_name}` : "RIV direct"} · Intro rate {intro.intro_rate}% / Closure rate {intro.closure_rate}%
        </span>
      </div>

      {intro.deal_value && (
        <div style={{ display: "flex", gap: 20, marginBottom: 18, padding: "12px 14px", background: BRAND.cream, borderRadius: 10 }}>
          <div><div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>Deal value</div><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14 }}>{money(intro.deal_value)}</div></div>
          <div><div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>Fee due to RIV</div><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14 }}>{money(intro.fee_amount_due)}</div></div>
        </div>
      )}

      {intro.proof_of_introduction && (
        <div style={{ marginBottom: 14, fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>
          <strong>Proof of introduction</strong> ({intro.channel}, {dateStr(intro.introduction_date)}): {intro.proof_of_introduction}
        </div>
      )}

      {!!intro.follow_up_log?.length && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.ink, marginBottom: 8 }}>Follow-up log</div>
          {intro.follow_up_log.map((f, i) => (
            <div key={i} style={{ fontFamily: FONT, fontSize: 12, color: "#7A756F", padding: "8px 0", borderTop: i ? `1px solid ${BRAND.line}` : "none" }}>
              <span style={{ color: "#B7B2AE" }}>{dateStr(f.date)} — {f.author}:</span> {f.note}
            </div>
          ))}
        </div>
      )}

      {/* Startup agrees to a partner-proposed introduction */}
      {isStartup && intro.status === "Pending Startup Agreement" && (
        <Card style={{ padding: 14, marginBottom: 14, background: "#FFF9F0" }}>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, marginBottom: 10, lineHeight: 1.6 }}>
            {intro.partner_name} wants to introduce you to <strong>{intro.retailer_name}</strong>. Agreeing confirms you accept RIV's charge — {intro.intro_rate}% on introduction, {intro.closure_rate}% on closure.
          </div>
          <PrimaryButton disabled={busy} onClick={() => run(() => api.agreeIntroduction(intro.id))}>I agree to the charge</PrimaryButton>
        </Card>
      )}

      {/* Partner logs proof once approved */}
      {isPartner && intro.status === "Approved" && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, marginBottom: 10 }}>Log the introduction</div>
          <Field label="Channel">
            <select style={inputStyle} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option>Email</option><option>WhatsApp</option><option>In-person</option><option>Event</option>
            </select>
          </Field>
          <Field label="Proof of introduction" required hint="Forwarded email, screenshot link, or a short note.">
            <textarea style={{ ...inputStyle, minHeight: 70 }} value={proof} onChange={(e) => setProof(e.target.value)} />
          </Field>
          <PrimaryButton disabled={busy || !proof} onClick={() => run(() => api.logIntroduction(intro.id, { channel, proofOfIntroduction: proof }))}>Log introduction</PrimaryButton>
        </Card>
      )}

      {/* Follow-up (either party, once Introduced/In Progress) */}
      {(isPartner || isStartup) && ["Introduced", "In Progress"].includes(intro.status) && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, marginBottom: 10 }}>Add a follow-up</div>
          <Field label="Engagement stage">
            <select style={inputStyle} value={engagementStage} onChange={(e) => setEngagementStage(e.target.value)}>
              <option value="">— unchanged —</option>
              <option>In discussion</option><option>Piloting</option><option>Stalled</option><option>Won</option><option>Lost</option>
            </select>
          </Field>
          <Field label="Note" required>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryButton disabled={busy || !followUpNote} onClick={() => run(() => api.followUpIntroduction(intro.id, { note: followUpNote, engagementStage: engagementStage || undefined }))}>Save follow-up</PrimaryButton>
            <GhostButton disabled={busy} onClick={() => run(() => api.closeIntroduction(intro.id, { outcome: "Lost" }))}>Mark lost</GhostButton>
            <GhostButton disabled={busy} onClick={() => run(() => api.closeIntroduction(intro.id, { outcome: "Stalled" }))}>Mark stalled</GhostButton>
          </div>
        </Card>
      )}

      {/* Startup confirms the sale */}
      {isStartup && ["Introduced", "In Progress"].includes(intro.status) && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, marginBottom: 10 }}>Confirm a closed sale</div>
          <Field label="Deal value (₹)" required>
            <input style={inputStyle} type="number" min="0" value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
          </Field>
          <Field label="PO / sale document" required hint="Paste a link, reference number, or short description.">
            <input style={inputStyle} value={poDocument} onChange={(e) => setPoDocument(e.target.value)} />
          </Field>
          <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginBottom: 12 }}>
            RIV's closure fee ({intro.closure_rate}%) will apply: {dealValue ? money(Number(dealValue) * intro.closure_rate / 100) : "—"}
          </div>
          <PrimaryButton disabled={busy || !dealValue || !poDocument} onClick={() => run(() => api.confirmSale(intro.id, { dealValue: Number(dealValue), poDocument }))}>Confirm sale — Closed, Won</PrimaryButton>
        </Card>
      )}

      {intro.status === "Closed - Won" && (
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#1E7A34", padding: "10px 14px", background: "#E6F4EA", borderRadius: 10 }}>
          Deal closed — invoicing and payout are handled by RIV Admin.
        </div>
      )}
    </Modal>
  );
}

/* =========================================================================
   PARTNER VIEWS
   ========================================================================= */
function PartnerStartupsView({ onIntroduce }) {
  const [startups, setStartups] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.getStartups().then((r) => setStartups(r.startups)).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBanner text={error} />;
  if (!startups) return <Spinner />;
  if (!startups.length) return <EmptyState icon={Briefcase} title="No onboarded startups yet" text="RIV Admin onboards RISE startups before they appear here." />;
  return (
    <div>
      {startups.map((s) => (
        <Card key={s.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{s.startup_name}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>{s.sector}</div>
            <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A756F", marginTop: 6, maxWidth: 480 }}>{s.solution_summary}</div>
          </div>
          <PrimaryButton icon={Handshake} onClick={() => onIntroduce(s)} style={{ flexShrink: 0 }}>Introduce</PrimaryButton>
        </Card>
      ))}
    </div>
  );
}

function NewIntroductionModal({ startup, onClose, onCreated }) {
  const [retailers, setRetailers] = useState(null);
  const [retailerId, setRetailerId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.getRetailers().then((r) => setRetailers(r.retailers)).catch((e) => setError(e.message)); }, []);

  async function submit() {
    setError(""); setBusy(true);
    try {
      await api.createIntroduction({ startupId: startup.id, retailerId: Number(retailerId) });
      await onCreated();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Introduce ${startup.startup_name}`} onClose={onClose}>
      <ErrorBanner text={error} />
      <Field label="Retailer" required>
        {retailers ? (
          <select style={inputStyle} value={retailerId} onChange={(e) => setRetailerId(e.target.value)}>
            <option value="">Select a retailer…</option>
            {retailers.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.category}</option>)}
          </select>
        ) : <Spinner />}
      </Field>
      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginBottom: 14 }}>
        {startup.startup_name} will be notified and must agree to RIV's charge before you can log the introduction.
      </div>
      <PrimaryButton disabled={busy || !retailerId} onClick={submit} style={{ width: "100%" }}>Propose introduction</PrimaryButton>
    </Modal>
  );
}

/* =========================================================================
   STARTUP VIEWS
   ========================================================================= */
function RequestIntroductionModal({ retailer, onClose, onCreated }) {
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(""); setBusy(true);
    try {
      await api.createIntroduction({ retailerId: retailer.id, agreeToCharges: agree });
      await onCreated();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Request introduction to ${retailer.name}`} onClose={onClose}>
      <ErrorBanner text={error} />
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A756F", lineHeight: 1.6, marginBottom: 14 }}>
        {retailer.network_source === "GTM Partner"
          ? "This retailer is in a GTM partner's network — they'll be notified and will make the introduction."
          : "This retailer is in RIV's direct network — RIV Admin will make the introduction."}
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18, cursor: "pointer" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, lineHeight: 1.6 }}>
          I agree to RIV's introduction/closure charge on this introduction (15% on introduction, 25% on closure, unless a different rate has been agreed with RIV).
        </span>
      </label>
      <PrimaryButton disabled={busy || !agree} onClick={submit} style={{ width: "100%" }}>Submit request</PrimaryButton>
    </Modal>
  );
}

function RetailerDirectoryView({ user, onRequest }) {
  const [retailers, setRetailers] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.getRetailers().then((r) => setRetailers(r.retailers)).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBanner text={error} />;
  if (!retailers) return <Spinner />;
  if (!retailers.length) return <EmptyState icon={Building2} title="No retailers in the directory yet" text="RIV Admin maintains the retailer directory." />;
  return (
    <div>
      {retailers.map((r) => (
        <Card key={r.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{r.name}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>{r.category} · {r.location}</div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", marginTop: 5 }}>{r.network_source === "GTM Partner" ? "Partner network" : "RIV direct"}</div>
          </div>
          {user.role === "startup" && <PrimaryButton icon={Send} onClick={() => onRequest(r)} style={{ flexShrink: 0 }}>Request intro</PrimaryButton>}
        </Card>
      ))}
    </div>
  );
}

function IntroductionsListView({ onOpen, refreshKey }) {
  const [intros, setIntros] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.getIntroductions().then((r) => setIntros(r.introductions)).catch((e) => setError(e.message)); }, [refreshKey]);
  if (error) return <ErrorBanner text={error} />;
  if (!intros) return <Spinner />;
  if (!intros.length) return <EmptyState icon={ClipboardList} title="No introductions yet" text="Introductions you make or request will show up here with live status." />;
  return <div>{intros.map((i) => <IntroCard key={i.id} intro={i} onOpen={onOpen} />)}</div>;
}

/* =========================================================================
   ADMIN VIEWS
   ========================================================================= */
function AdminOverview() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.getSummary().then(setSummary).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBanner text={error} />;
  if (!summary) return <Spinner />;
  const cards = [
    { label: "Partners", value: summary.counts.partners, icon: Users },
    { label: "Startups", value: summary.counts.startups, icon: Briefcase },
    { label: "Retailers", value: summary.counts.retailers, icon: Building2 },
    { label: "Introductions", value: summary.counts.introductions, icon: Handshake },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: 16 }}>
            <c.icon size={16} color={BRAND.coral} />
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginTop: 8 }}>{c.value}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>{c.label}</div>
          </Card>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>Fees earned</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: BRAND.ink, marginTop: 4 }}>{money(summary.pipeline.fees_earned)}</div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>Fees collected</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: "#1E7A34", marginTop: 4 }}>{money(summary.pipeline.fees_collected)}</div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>Active in flight</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: BRAND.ink, marginTop: 4 }}>{summary.pipeline.active_in_flight}</div>
        </Card>
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, color: BRAND.ink, marginBottom: 10 }}>By status</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {summary.statusCounts.map((s) => (
          <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1px solid ${BRAND.line}`, borderRadius: 10 }}>
            <StatusBadge status={s.status} /> <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600 }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminPartnersView() {
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ fullName: "", company: "", email: "", phone: "", region: "" });
  const [provisioning, setProvisioning] = useState(null);
  const [pwField, setPwField] = useState("");

  const load = useCallback(() => api.listPartners().then((r) => setPartners(r.partners)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function createPartner() {
    setError("");
    try { await api.createPartner(form); setShowNew(false); setForm({ fullName: "", company: "", email: "", phone: "", region: "" }); load(); }
    catch (e) { setError(e.message); }
  }
  async function provision(p) {
    setError("");
    try { await api.provisionPartnerLogin(p.id, pwField); setProvisioning(null); setPwField(""); load(); }
    catch (e) { setError(e.message); }
  }

  if (error) return <ErrorBanner text={error} />;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <PrimaryButton icon={Plus} onClick={() => setShowNew(true)}>New partner</PrimaryButton>
      </div>
      {!partners ? <Spinner /> : !partners.length ? (
        <EmptyState icon={Users} title="No GTM partners yet" text="Add a partner to get started." />
      ) : partners.map((p) => (
        <Card key={p.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{p.full_name}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>{p.email} · {p.company || "—"} · {p.region || "—"}</div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", marginTop: 5 }}>Payout split {p.default_payout_split}% · Stage: {p.onboarding_stage} · Login: {p.portal_login_status}</div>
          </div>
          {p.portal_login_status !== "Provisioned" && (
            provisioning === p.id ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, width: 150 }} placeholder="Temp password" value={pwField} onChange={(e) => setPwField(e.target.value)} />
                <PrimaryButton onClick={() => provision(p)} disabled={pwField.length < 8}>Provision</PrimaryButton>
              </div>
            ) : <GhostButton onClick={() => setProvisioning(p.id)}>Provision login</GhostButton>
          )}
        </Card>
      ))}
      {showNew && (
        <Modal title="New GTM partner" onClose={() => setShowNew(false)}>
          <ErrorBanner text={error} />
          <Field label="Full name" required><input style={inputStyle} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Company"><input style={inputStyle} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
          <Field label="Email" required><input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Region"><input style={inputStyle} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></Field>
          <PrimaryButton onClick={createPartner} disabled={!form.fullName || !form.email} style={{ width: "100%" }}>Create partner</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminStartupsView() {
  const [startups, setStartups] = useState(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ startupName: "", founderName: "", email: "", sector: "", solutionSummary: "" });
  const [provisioning, setProvisioning] = useState(null);
  const [pwField, setPwField] = useState("");

  const load = useCallback(() => api.listStartups().then((r) => setStartups(r.startups)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function createStartup() {
    setError("");
    try { await api.createStartup(form); setShowNew(false); setForm({ startupName: "", founderName: "", email: "", sector: "", solutionSummary: "" }); load(); }
    catch (e) { setError(e.message); }
  }
  async function provision(s) {
    setError("");
    try { await api.provisionStartupLogin(s.id, pwField); setProvisioning(null); setPwField(""); load(); }
    catch (e) { setError(e.message); }
  }

  if (error) return <ErrorBanner text={error} />;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <PrimaryButton icon={Plus} onClick={() => setShowNew(true)}>New startup</PrimaryButton>
      </div>
      {!startups ? <Spinner /> : !startups.length ? (
        <EmptyState icon={Briefcase} title="No RISE startups yet" text="Add a startup to get started." />
      ) : startups.map((s) => (
        <Card key={s.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{s.startup_name}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>{s.email} · {s.sector || "—"}</div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", marginTop: 5 }}>Stage: {s.onboarding_stage} · Fee: {s.participation_fee_status} · Login: {s.portal_login_status}</div>
          </div>
          {s.portal_login_status !== "Provisioned" && (
            provisioning === s.id ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, width: 150 }} placeholder="Temp password" value={pwField} onChange={(e) => setPwField(e.target.value)} />
                <PrimaryButton onClick={() => provision(s)} disabled={pwField.length < 8}>Provision</PrimaryButton>
              </div>
            ) : <GhostButton onClick={() => setProvisioning(s.id)}>Provision login</GhostButton>
          )}
        </Card>
      ))}
      {showNew && (
        <Modal title="New RISE startup" onClose={() => setShowNew(false)}>
          <ErrorBanner text={error} />
          <Field label="Startup name" required><input style={inputStyle} value={form.startupName} onChange={(e) => setForm({ ...form, startupName: e.target.value })} /></Field>
          <Field label="Founder name"><input style={inputStyle} value={form.founderName} onChange={(e) => setForm({ ...form, founderName: e.target.value })} /></Field>
          <Field label="Email" required><input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Sector"><input style={inputStyle} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} /></Field>
          <Field label="Solution summary"><textarea style={{ ...inputStyle, minHeight: 70 }} value={form.solutionSummary} onChange={(e) => setForm({ ...form, solutionSummary: e.target.value })} /></Field>
          <PrimaryButton onClick={createStartup} disabled={!form.startupName || !form.email} style={{ width: "100%" }}>Create startup</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminRetailersView() {
  const [retailers, setRetailers] = useState(null);
  const [partners, setPartners] = useState([]);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", location: "", networkSource: "RIV Direct", owningPartnerId: "", contactName: "", contactEmail: "", contactPhone: "" });

  const load = useCallback(() => api.listRetailersAdmin().then((r) => setRetailers(r.retailers)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); api.listPartners().then((r) => setPartners(r.partners)).catch(() => {}); }, [load]);

  async function createRetailer() {
    setError("");
    try {
      await api.createRetailer({ ...form, owningPartnerId: form.owningPartnerId || null });
      setShowNew(false);
      setForm({ name: "", category: "", location: "", networkSource: "RIV Direct", owningPartnerId: "", contactName: "", contactEmail: "", contactPhone: "" });
      load();
    } catch (e) { setError(e.message); }
  }

  if (error) return <ErrorBanner text={error} />;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <PrimaryButton icon={Plus} onClick={() => setShowNew(true)}>New retailer</PrimaryButton>
      </div>
      {!retailers ? <Spinner /> : !retailers.length ? (
        <EmptyState icon={Building2} title="No retailers yet" text="Add a retailer to build out the directory." />
      ) : retailers.map((r) => (
        <Card key={r.id} style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{r.name}</div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>{r.category} · {r.location} · {r.network_source}{r.owning_partner_name ? ` (${r.owning_partner_name})` : ""}</div>
          <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", marginTop: 5 }}>Contact: {r.contact_name || "—"} · {r.contact_email || "—"} · {r.contact_phone || "—"}</div>
        </Card>
      ))}
      {showNew && (
        <Modal title="New retailer" onClose={() => setShowNew(false)}>
          <ErrorBanner text={error} />
          <Field label="Name" required><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category"><input style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="Location"><input style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Network source">
            <select style={inputStyle} value={form.networkSource} onChange={(e) => setForm({ ...form, networkSource: e.target.value })}>
              <option>RIV Direct</option><option>GTM Partner</option>
            </select>
          </Field>
          {form.networkSource === "GTM Partner" && (
            <Field label="Owning partner">
              <select style={inputStyle} value={form.owningPartnerId} onChange={(e) => setForm({ ...form, owningPartnerId: e.target.value })}>
                <option value="">Select…</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Contact name"><input style={inputStyle} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
          <Field label="Contact email"><input style={inputStyle} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></Field>
          <Field label="Contact phone"><input style={inputStyle} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></Field>
          <PrimaryButton onClick={createRetailer} disabled={!form.name} style={{ width: "100%" }}>Create retailer</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminIntroductionsView() {
  const [intros, setIntros] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const load = useCallback(() => api.listIntroductionsAdmin(filter || undefined).then((r) => setIntros(r.introductions)).catch((e) => setError(e.message)), [filter]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id, status) {
    setError("");
    try { await api.updateIntroductionAdmin(id, { status }); load(); }
    catch (e) { setError(e.message); }
  }

  if (error) return <ErrorBanner text={error} />;
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select style={{ ...inputStyle, width: 240 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {!intros ? <Spinner /> : !intros.length ? (
        <EmptyState icon={Handshake} title="No introductions" text="Nothing matches this filter yet." />
      ) : intros.map((i) => (
        <Card key={i.id} style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{i.startup_name} → {i.retailer_name}</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>
                {i.partner_name ? `via ${i.partner_name}` : "RIV direct"} · Requested {dateStr(i.request_date)}{i.deal_value ? ` · Deal ${money(i.deal_value)} · Fee ${money(i.fee_amount_due)}` : ""}
              </div>
            </div>
            <StatusBadge status={i.status} />
          </div>
          <div style={{ marginTop: 10 }}>
            <select style={{ ...inputStyle, width: 260 }} value={i.status} onChange={(e) => setStatus(i.id, e.target.value)}>
              {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AdminInvoicesView() {
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.listInvoices().then((r) => setInvoices(r.invoices)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id, status) {
    setError("");
    try { await api.updateInvoice(id, { status }); load(); }
    catch (e) { setError(e.message); }
  }

  if (error) return <ErrorBanner text={error} />;
  if (!invoices) return <Spinner />;
  if (!invoices.length) return <EmptyState icon={FileText} title="No invoices yet" text="Raise an invoice from a Closed – Won introduction's admin view." />;
  return (
    <div>
      {invoices.map((inv) => (
        <Card key={inv.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>Invoice #{inv.id} — {inv.startup_name}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>{money(inv.amount)} · {inv.payment_terms} · Due {dateStr(inv.due_date)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusBadge status={inv.status} />
            <select style={{ ...inputStyle, width: 130 }} value={inv.status} onChange={(e) => setStatus(inv.id, e.target.value)}>
              <option>Draft</option><option>Sent</option><option>Paid</option><option>Overdue</option>
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AdminPayoutsView() {
  const [payouts, setPayouts] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.listPayouts().then((r) => setPayouts(r.payouts)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id, status) {
    setError("");
    try { await api.updatePayout(id, { status }); load(); }
    catch (e) { setError(e.message); }
  }

  if (error) return <ErrorBanner text={error} />;
  if (!payouts) return <Spinner />;
  if (!payouts.length) return <EmptyState icon={DollarSign} title="No payouts yet" text="Payouts to GTM partners will appear here once created." />;
  return (
    <div>
      {payouts.map((po) => (
        <Card key={po.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>Payout #{po.id} — {po.partner_name}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>{money(po.amount)} ({po.pct_applied}% applied)</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusBadge status={po.status} />
            <select style={{ ...inputStyle, width: 130 }} value={po.status} onChange={(e) => setStatus(po.id, e.target.value)}>
              <option>Pending</option><option>Paid</option>
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* =========================================================================
   ROOT
   ========================================================================= */
export default function RiseGtmApp() {
  const [user, setUser] = useState(() => getStoredUser());
  const [view, setView] = useState(null);
  const [openIntro, setOpenIntro] = useState(null);
  const [introduceStartup, setIntroduceStartup] = useState(null);
  const [requestRetailer, setRequestRetailer] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (user && !view) {
      setView(user.role === "admin" ? "overview" : user.role === "partner" ? "startups" : "retailers");
    }
  }, [user, view]);

  function logout() {
    clearSession();
    setUser(null);
    setView(null);
  }
  function refresh() { setRefreshKey((k) => k + 1); }

  if (!user) return (
    <>
      <GlobalStyle />
      <LoginView onAuthed={(u) => { setUser(u); }} />
    </>
  );

  return (
    <div style={{ minHeight: "100vh", background: BRAND.cream }}>
      <GlobalStyle />
      <NavBar view={view} setView={setView} user={user} onLogout={logout} />
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 24px 60px" }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink, marginBottom: 18, textTransform: "capitalize" }}>
          {view?.replace(/-/g, " ")}
        </div>

        {user.role === "partner" && view === "startups" && <PartnerStartupsView onIntroduce={setIntroduceStartup} />}
        {user.role === "partner" && view === "retailers" && <RetailerDirectoryView user={user} onRequest={() => {}} />}
        {(user.role === "partner" || user.role === "startup") && view === "introductions" && (
          <IntroductionsListView onOpen={setOpenIntro} refreshKey={refreshKey} />
        )}
        {user.role === "startup" && view === "retailers" && <RetailerDirectoryView user={user} onRequest={setRequestRetailer} />}

        {user.role === "admin" && view === "overview" && <AdminOverview />}
        {user.role === "admin" && view === "partners" && <AdminPartnersView />}
        {user.role === "admin" && view === "startups" && <AdminStartupsView />}
        {user.role === "admin" && view === "retailers" && <AdminRetailersView />}
        {user.role === "admin" && view === "introductions" && <AdminIntroductionsView />}
        {user.role === "admin" && view === "invoices" && <AdminInvoicesView />}
        {user.role === "admin" && view === "payouts" && <AdminPayoutsView />}
      </div>

      {openIntro && <IntroDetailModal intro={openIntro} user={user} onClose={() => setOpenIntro(null)} onRefresh={async () => refresh()} />}
      {introduceStartup && <NewIntroductionModal startup={introduceStartup} onClose={() => setIntroduceStartup(null)} onCreated={async () => refresh()} />}
      {requestRetailer && <RequestIntroductionModal retailer={requestRetailer} onClose={() => setRequestRetailer(null)} onCreated={async () => refresh()} />}
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      button:focus-visible { outline: 2px solid ${BRAND.coral}; outline-offset: 2px; }
      input:focus, select:focus, textarea:focus { outline: 2px solid ${BRAND.coral}; outline-offset: 0; }
      .gtm-portal-spin { animation: gtm-portal-spin 0.9s linear infinite; }
      @keyframes gtm-portal-spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}
