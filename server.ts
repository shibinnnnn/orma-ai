import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { Resend } from "resend";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (!resend) {
  console.warn("RESEND_API_KEY is not set. Email notifications will be disabled.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API placeholders after Firebase removal
  app.post("/api/save-token", (req, res) => {
    res.status(501).json({ error: "Cloud features disabled. Firebase removed." });
  });

  app.post("/api/test-notification", (req, res) => {
    res.status(501).json({ error: "Push notifications disabled. Firebase removed." });
  });

  // API: Test Email
  app.post("/api/test-email", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });

    if (!resend) {
      return res.status(503).json({ error: "Email service not configured. Please set RESEND_API_KEY." });
    }

    console.log(`Sending test email to ${email}`);
    try {
      await resend.emails.send({
        from: "Orm.AI <notifications@ais.studio>",
        to: email,
        subject: "Test Email from Orm.AI",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
            <h2 style="color: #3b82f6; margin-top: 0;">Email Alerts Alert</h2>
            <p style="font-size: 16px; line-height: 1.5; color: #374151;">Success! Your email service is connected. Note: Automatic daily checks currently require Firebase/Cloud storage which has been removed.</p>
          </div>
        `
      });
      res.json({ success: true, message: "Test email sent" });
    } catch (error: any) {
      console.error("Resend Error:", error);
      res.status(500).json({ error: "Failed to send email", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
