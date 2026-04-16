import cors from "cors";
import express from "express";

const app = express();
const PORT = Number(process.env.PORT) || 8787;

const frontendOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: frontendOrigins.length > 0 ? frontendOrigins : true,
  })
);
app.use(express.json({ limit: "48kb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "howethstudio.com-backend",
    uptimeSec: Math.round(process.uptime()),
  });
});

app.post("/api/contact", (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof subject !== "string" ||
    typeof message !== "string"
  ) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const trimmed = {
    name: name.trim(),
    email: email.trim(),
    subject: subject.trim(),
    message: message.trim(),
  };
  if (!trimmed.name || !trimmed.email || !trimmed.subject || !trimmed.message) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[contact]", trimmed.subject, "from", trimmed.email);
  }

  return res.status(202).json({ received: true });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.info(`howethstudio.com-backend listening on :${PORT}`);
});
