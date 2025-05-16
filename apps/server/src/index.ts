import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // production'da değiştirilmeli
  },
});

app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

(async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Database connection successful");
  } catch (err) {
    console.error("Database connection failed", err);
  }
})();

import authRoutes from "./routes/auth";

app.use("/auth", authRoutes);

const PORT = process.env.PORT || 3100;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
