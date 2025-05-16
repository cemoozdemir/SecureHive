import { Server, Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";
import { pool } from "../db";
import { User } from "../types";

export function configureSocket(io: Server) {
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication token missing."));
    }

    try {
      const decoded = verifyToken(token) as { userId: string };
      const result = await pool.query("SELECT * FROM users WHERE id = $1", [
        decoded.userId,
      ]);
      const user: User | undefined = result.rows[0];

      if (!user) {
        return next(new Error("User not found."));
      }

      socket.data.user = user;
      next();
    } catch (err) {
      console.error("Socket auth failed:", err);
      next(new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as User;
    console.log(`✅ ${user.email} connected with socket ID: ${socket.id}`);

    // Mesaj al
    socket.on("message", (data: { text: string }) => {
      const message = {
        text: data.text,
        sender: user.email,
        timestamp: new Date().toISOString(),
      };

      // Yayınla (diğer kullanıcılara)
      socket.broadcast.emit("message", message);
    });

    socket.on("disconnect", () => {
      console.log(`❌ ${user.email} disconnected`);
    });
  });
}
