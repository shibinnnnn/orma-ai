import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import cron from "node-cron";
import fs from "fs";

import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const configPath = path.join(__dirname, "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);
const messaging = admin.messaging();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Save FCM Token
  app.post("/api/save-token", async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) return res.status(400).json({ error: "Missing data" });

    try {
      await db.collection("fcm_tokens").doc(userId).set({
        token,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // API: Test Notification
  app.post("/api/test-notification", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    try {
      const userTokenDoc = await db.collection("fcm_tokens").doc(userId).get();
      if (!userTokenDoc.exists) {
        return res.status(404).json({ error: "No token found for this user" });
      }

      const { token } = userTokenDoc.data()!;
      const message = {
        notification: {
          title: "Test Notification",
          body: "This is a test notification from Orma AI."
        },
        token: token
      };

      await messaging.send(message);
      res.json({ success: true, message: "Test notification sent" });
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
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
      
      for (const customerDoc of customersSnapshot.docs) {
        const customer = customerDoc.data();
        if (!customer.portingDate || !customer.userId) continue;

        const portingDate = new Date(customer.portingDate);
        portingDate.setHours(0, 0, 0, 0);

        const diffTime = portingDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let title = "";
        let body = "";

        if (diffDays === 0) {
          title = "Porting Eligible Now!";
          body = `${customer.name} (${customer.number}) is ready to port today.`;
        } else if (diffDays === 3) {
          title = "Urgent: Porting in 3 Days";
          body = `${customer.name} (${customer.number}) will be eligible in 3 days.`;
        } else if (diffDays === 7) {
          title = "Reminder: Porting in 7 Days";
          body = `${customer.name} (${customer.number}) will be eligible in 1 week.`;
        }

        if (title && body) {
          console.log(`Sending notification for ${customer.name}: ${title}`);
          const userTokenDoc = await db.collection("fcm_tokens").doc(customer.userId).get();
          
          if (userTokenDoc.exists) {
            const { token } = userTokenDoc.data()!;
            const message = {
              notification: { title, body },
              token: token
            };

            try {
              await messaging.send(message);
              console.log(`Notification sent to user ${customer.userId}`);
            } catch (err) {
              console.error(`Error sending notification to user ${customer.userId}:`, err);
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
