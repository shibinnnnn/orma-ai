import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import cron from "node-cron";
import fs from "fs";
import { Resend } from "resend";

import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (!resend) {
  console.warn("RESEND_API_KEY is not set. Email notifications will be disabled.");
}

// Load Firebase Config
const configPath = path.join(__dirname, "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firebase Admin
if (!admin.apps.length) {
  console.log("Initializing Firebase Admin...");
  try {
    // Attempt initialization with config from file
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: firebaseConfig.projectId,
    });
    console.log("Firebase Admin initialized with project:", firebaseConfig.projectId);
  } catch (err) {
    console.error("Firebase Admin initialization failed:", err);
    // Fallback to default initialization
    admin.initializeApp();
    console.log("Firebase Admin initialized with default settings");
  }
}

// In firebase-admin@11+, getFirestore can take an App and a databaseId
const db = getFirestore(admin.apps[0], firebaseConfig.firestoreDatabaseId);
const messaging = admin.messaging(admin.apps[0]);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Save FCM Token
  app.post("/api/save-token", async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) return res.status(400).json({ error: "Missing data" });

    console.log(`Attempting to save token for user: ${userId}`);
    try {
      await db.collection("fcm_tokens").doc(userId).set({
        token,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Token saved successfully for user: ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving token:", error);
      res.status(500).json({ error: "Internal server error", message: error.message });
    }
  });

  // API: Test Notification
  app.post("/api/test-notification", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    console.log(`Attempting to send test notification for user: ${userId}`);
    try {
      console.log("Fetching token from Firestore...");
      const userTokenDoc = await db.collection("fcm_tokens").doc(userId).get()
        .catch(err => {
          console.error("Firestore Get Error:", err);
          throw new Error(`Firestore Error: ${err.message}`);
        });

      if (!userTokenDoc.exists) {
        console.log(`No token found for user: ${userId}`);
        return res.status(404).json({ error: "No token found for this user" });
      }

      const { token } = userTokenDoc.data()!;
      console.log("Token found, preparing message...");
      const message = {
        notification: {
          title: "Test Notification",
          body: "This is a test notification from Orma AI."
        },
        token: token
      };

      console.log("Sending messaging via FCM...");
      await messaging.send(message)
        .catch(err => {
          console.error("FCM Send Error:", err);
          throw new Error(`FCM Error: ${err.message}`);
        });

      console.log("Notification sent successfully");
      res.json({ success: true, message: "Test notification sent" });
    } catch (error: any) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ error: "Failed to send notification", details: error.message });
    }
  });

  // API: Test Email
  app.post("/api/test-email", async (req, res) => {
    const { userId, email } = req.body;
    if (!userId || !email) return res.status(400).json({ error: "Missing data" });

    if (!resend) {
      return res.status(503).json({ error: "Email service not configured. Please set RESEND_API_KEY." });
    }

    console.log(`Sending test email to ${email} for user: ${userId}`);
    try {
      await resend.emails.send({
        from: "Orma AI <notifications@ais.studio>",
        to: email,
        subject: "Test Email from Orma AI",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
            <h2 style="color: #3b82f6; margin-top: 0;">Email Alerts Enabled</h2>
            <p style="font-size: 16px; line-height: 1.5; color: #374151;">Success! You have enabled email notifications for Orma AI. You will now receive daily reports on your customers' porting eligibility status.</p>
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #6b7280;">
              <p>This is a test message. You can manage your preferences in the app.</p>
            </div>
          </div>
        `
      });
      res.json({ success: true, message: "Test email sent" });
    } catch (error: any) {
      console.error("Resend Error:", error);
      res.status(500).json({ error: "Failed to send email", details: error.message });
    }
  });

  // Cron Job: Check for eligible customers every day at 9 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("Running daily porting eligibility check...");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const customersSnapshot = await db.collection("customers").get();
      console.log(`Checking ${customersSnapshot.size} customers...`);
      
      // Cache user settings to avoid redundant lookups
      const userSettingsMap = new Map();

      for (const customerDoc of customersSnapshot.docs) {
        const customer = customerDoc.data();
        if (!customer.portingDate || !customer.userId) continue;

        // Fetch user settings if not cached
        if (!userSettingsMap.has(customer.userId)) {
          console.log(`Fetching settings for user: ${customer.userId}`);
          const settingsDoc = await db.collection("settings").doc(customer.userId).get();
          userSettingsMap.set(customer.userId, settingsDoc.exists ? settingsDoc.data() : null);
        }

        const userSettings = userSettingsMap.get(customer.userId);
        const nearDays = userSettings?.nearDays ?? 7;
        const veryNearDays = userSettings?.veryNearDays ?? 3;
        const enableEmail = userSettings?.enableEmailNotifications ?? false;
        const userEmail = userSettings?.userEmail;

        const portingDate = new Date(customer.portingDate);
        portingDate.setHours(0, 0, 0, 0);

        const diffTime = portingDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let title = "";
        let body = "";
        let isUrgent = false;

        if (diffDays === 0) {
          title = "Porting Eligible Now!";
          body = `${customer.name} (${customer.number}) is ready to port today.`;
          isUrgent = true;
        } else if (diffDays <= veryNearDays && diffDays > 0) {
          title = "Urgent: Porting Approaching";
          body = `${customer.name} (${customer.number}) will be eligible in ${diffDays} days.`;
          isUrgent = true;
        } else if (diffDays <= nearDays && diffDays > 0) {
          title = "Reminder: Porting Eligible Soon";
          body = `${customer.name} (${customer.number}) will be eligible in ${diffDays} days.`;
        }

        if (title && body) {
          // 1. Send Push Notification
          console.log(`Processing notification for ${customer.name}: ${title}`);
          const userTokenDoc = await db.collection("fcm_tokens").doc(customer.userId).get();
          
          if (userTokenDoc.exists) {
            const { token } = userTokenDoc.data()!;
            const message = {
              notification: { title, body },
              token: token
            };

            try {
              await messaging.send(message);
              console.log(`Push notification sent to user ${customer.userId}`);
            } catch (err) {
              console.error(`Error sending push notification to user ${customer.userId}:`, err);
            }
          }

          // 2. Send Email Notification if enabled
          if (enableEmail && userEmail && resend) {
            console.log(`Sending email alert to ${userEmail} for ${customer.name}`);
            try {
              await resend.emails.send({
                from: "Orma AI <notifications@ais.studio>",
                to: userEmail,
                subject: title,
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
                    <h2 style="color: ${isUrgent ? '#ef4444' : '#f59e0b'}; margin-top: 0;">${title}</h2>
                    <p style="font-size: 16px; line-height: 1.5; color: #374151;">${body}</p>
                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #6b7280;">
                      <p>This is an automated alert from Orma AI. You can manage your notification preferences in the app settings.</p>
                    </div>
                  </div>
                `
              });
              console.log(`Email sent successfully to ${userEmail}`);
            } catch (err) {
              console.error(`Error sending email to ${userEmail}:`, err);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in cron job:", error);
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
