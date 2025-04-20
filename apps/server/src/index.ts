import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

app.get("/api", (_, res) => {
  res.send({ message: "SecureHive backend is running 🔐" });
});

io.on("connection", (socket) => {
  console.log("🟢 User connected", socket.id);
});

const PORT = process.env.PORT || 3100;
server.listen(PORT, () => {
  console.log(`🔐 SecureHive server listening on port ${PORT}`);
});
