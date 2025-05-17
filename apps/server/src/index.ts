// apps/server/src/index.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db";
import { configureSocket } from "./socket";
import authRoutes from "./routes/auth";
import { usersRouter } from "./routes/users";
import messageRoutes from "./routes/messages";

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

app.use("/auth", authRoutes);
app.use("/users", usersRouter);
app.use("/messages", messageRoutes);

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

configureSocket(io);

(async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Database connection successful");
  } catch (err) {
    console.error("Database connection failed", err);
  }
})();

const PORT = process.env.PORT || 3100;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
