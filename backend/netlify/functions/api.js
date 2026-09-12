import "dotenv/config";
import serverless from "serverless-http";
import { app, ensureSchema } from "../../app.js";

const wrapped = serverless(app, { basePath: "/.netlify/functions/api" });

export const handler = async (event, context) => {
  await ensureSchema();
  return wrapped(event, context);
};