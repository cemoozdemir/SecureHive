import express from "express";
import { pool } from "../db";
import { generateToken, verifyToken } from "../utils/jwt";
import { User } from "../types";

const router = express.Router();

// [POST] /auth/request-link
router.post("/request-link", async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Valid email is required." });
  }

  try {
    // Kullanıcı yoksa oluştur
    const result = await pool.query(
      "INSERT INTO users (email) VALUES ($1) ON CONFLICT(email) DO UPDATE SET email = EXCLUDED.email RETURNING *",
      [email]
    );

    const user: User = result.rows[0];

    // Magic link token üret
    const token = generateToken({ userId: user.id });

    // Şimdilik linki response olarak dön
    const magicLink = `http://localhost:3000/magic-login?token=${token}`;
    res.json({ magicLink });
  } catch (err) {
    console.error("Error generating magic link", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// [GET] /auth/verify?token=...
router.get("/verify", async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required." });
    return;
  }

  try {
    const decoded = verifyToken(token) as { userId: string };

    const result = await pool.query("SELECT * FROM users WHERE id = $1", [
      decoded.userId,
    ]);
    const user: User = result.rows[0];

    if (!user) {
      res.status(404).json({ error: "User not found." });
    }

    // Yeni oturum token'ı döndür
    const sessionToken = generateToken({ userId: user.id }, "7d");

    res.json({ token: sessionToken, user });
  } catch (err) {
    console.error("Token verification failed", err);
    res.status(401).json({ error: "Invalid or expired token." });
  }
});
router.post("/update-public-key", async (req, res) => {
  const auth = req.headers.authorization;
  const token = auth?.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = verifyToken(token) as { userId: string };
    const { publicKey } = req.body;

    await pool.query("UPDATE users SET public_key = $1 WHERE id = $2", [
      publicKey,
      decoded.userId,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating public key:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
