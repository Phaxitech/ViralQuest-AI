import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Get Latest Compliance Rules
  app.get("/api/compliance", (req, res) => {
    // In a real app, this would fetch from a database or search tool
    // Here we provide the latest learned rules
    res.json({
      lastUpdated: new Date().toISOString(),
      platforms: {
        tiktok: {
          status: "updated",
          rules: ["No dangerous challenges", "Protect minors", "No sensitive content in first 3s", "Engage with trending sounds"]
        },
        facebook: {
          status: "updated",
          rules: ["No misinformation", "Respect intellectual property", "Avoid engagement bait", "Clear CTA"]
        },
        youtube: {
          status: "updated",
          rules: ["Ad-friendly content", "No harmful acts", "COPPA compliance", "High retention focus"]
        },
        google: {
          status: "updated",
          rules: ["E-E-A-T principles", "Mobile-first rendering", "Helpful content update focus"]
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
