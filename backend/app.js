import express from "express";
import cors from "cors";

import { initSchema } from "./db.js";
import authRoutes from "./routes/auth.js";
import portalRoutes from "./routes/portal.js";
import adminRoutes from "./routes/admin.js";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", portalRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

let schemaReady;
export function ensureSchema() {
  if (!schemaReady) schemaReady = initSchema();
  return schemaReady;
}