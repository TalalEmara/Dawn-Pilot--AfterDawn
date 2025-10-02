import express from "express";

const app = express();
const PORT = 5000;

// Middleware to parse JSON
app.use(express.json());

// Example route
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from Express API!" });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server runningss on http://localhost:${PORT}`);
  console.log(`✅ Server runningss on http://localhost:${PORT}`);
});
