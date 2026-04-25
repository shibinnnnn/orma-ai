import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { Resend } from "resend";
import cookieSession from "cookie-session";
import { OAuth2Client } from "google-auth-library";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (!resend) {
  console.warn("RESEND_API_KEY is not set. Email notifications will be disabled.");
}

const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const oauthClient = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;

// OTP Store (Memory-only for demo)
const otpStore = new Map<string, { otp: string, expires: number }>();

// Simple file-based DB
const DB_FILE = path.join(__dirname, "data-storage.json");

function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Error reading DB:", e);
  }
  return { users: {} };
}

function writeDb(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error writing DB:", e);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(
    cookieSession({
      name: "orma-session",
      keys: [process.env.SESSION_SECRET || "default-secret"],
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    })
  );

  // Auth Middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Auth Endpoints
  app.post("/api/auth/google", async (req: any, res) => {
    const { credential } = req.body;
    if (!oauthClient) return res.status(503).json({ error: "Google Auth not configured" });

    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: credential,
        audience: CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error("Invalid payload");

      const userId = payload.sub; // unique Google ID
      req.session!.userId = userId;
      req.session!.email = payload.email;
      req.session!.name = payload.name;
      req.session!.picture = payload.picture;

      res.json({ user: { id: userId, email: payload.email, name: payload.name, picture: payload.picture } });
    } catch (e) {
      console.error("Google Auth Error:", e);
      res.status(401).json({ error: "Invalid credential" });
    }
  });

  app.post("/api/auth/phone/send", (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(phone, { otp, expires: Date.now() + 5 * 60 * 1000 });
    
    console.log(`[SMS AUTH] Phone: ${phone}, OTP: ${otp}`);
    res.json({ success: true, message: "OTP sent (check server logs for demo)" });
  });

  app.post("/api/auth/phone/verify", (req: any, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });
    
    const stored = otpStore.get(phone);
    if (!stored || stored.otp !== otp || Date.now() > stored.expires) {
      return res.status(401).json({ error: "Invalid or expired OTP" });
    }
    
    otpStore.delete(phone);
    
    // Create session
    const userId = `phone_${phone}`;
    req.session!.userId = userId;
    req.session!.phone = phone;
    req.session!.name = `User ${phone.slice(-4)}`;
    
    res.json({ 
      user: { 
        id: userId, 
        phone: phone, 
        name: `User ${phone.slice(-4)}` 
      } 
    });
  });

  app.get("/api/auth/me", (req: any, res) => {
    if (!req.session?.userId) return res.json({ user: null });
    res.json({
      user: {
        id: req.session.userId,
        email: req.session.email,
        phone: req.session.phone,
        name: req.session.name,
        picture: req.session.picture,
      },
    });
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.session = null;
    res.json({ success: true });
  });

  // Data endpoints
  app.get("/api/data", requireAuth, (req: any, res) => {
    const db = readDb();
    const userData = db.users[req.session!.userId] || { customers: [], settings: {} };
    res.json(userData);
  });

  app.post("/api/data", requireAuth, (req: any, res) => {
    const { customers, settings } = req.body;
    const db = readDb();
    db.users[req.session!.userId] = { customers, settings };
    writeDb(db);
    res.status(200).json({ success: true });
  });

  // API: Test Email
  app.post("/api/test-email", requireAuth, async (req, res) => {
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
            <p style="font-size: 16px; line-height: 1.5; color: #374151;">Success! Your email service is connected.</p>
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
