import { Server, Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";
import { pool } from "../db";
import { User } from "../types";

const onlineUsers = new Map<string, Socket>();

export function configureSocket(io: Server) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication token missing."));

    try {
      const decoded = verifyToken(token) as { userId: string };
      const result = await pool.query("SELECT * FROM users WHERE id = $1", [
        decoded.userId,
      ]);
      const user: User = result.rows[0];
      if (!user) return next(new Error("User not found."));

      socket.data.user = user;
      next();
    } catch (err) {
      console.error("Socket auth failed:", err);
      next(new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;

    onlineUsers.set(user.email, socket);
    console.log("🧠 Online users:", Array.from(onlineUsers.keys()));

    socket.on("sendPrivateMessage", (data) => {
      const recipientSocket = onlineUsers.get(data.to); // email bazlı eşleştirme

      if (recipientSocket) {
        recipientSocket.emit("message", {
          ciphertext: data.ciphertext,
          iv: data.iv,
          sender: user.email,
          timestamp: new Date().toISOString(),
        });
        console.log(`✅ Message sent from ${user.email} to ${data.to}`);
      } else {
        console.warn(`❌ Recipient ${data.to} not online`);
      }
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(user.email); // ☠️ Kullanıcı çıkınca listeden sil
    });
  });
}
