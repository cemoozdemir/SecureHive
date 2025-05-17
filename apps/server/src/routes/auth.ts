import express, { Request, Response, Router, RequestHandler } from "express";
import { pool } from "../db";
import { generateToken, verifyToken } from "../utils/jwt";
import { User } from "../types";

const router: Router = express.Router();

// [POST] /auth/request-link
router.post("/request-link", async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Valid email is required." });
    return;
  }

  try {
    const result = await pool.query(
      "INSERT INTO users (email) VALUES ($1) ON CONFLICT(email) DO UPDATE SET email = EXCLUDED.email RETURNING *",
      [email]
    );

    const user: User = result.rows[0];
    const token = generateToken({ userId: user.id });
    const magicLink = `http://localhost:3000/magic-login?token=${token}`;
    res.json({ magicLink });
  } catch (err) {
    console.error("Error generating magic link", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// [GET] /auth/verify?token=...
router.get("/verify", async (req: Request, res: Response): Promise<void> => {
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
      return;
    }

    const sessionToken = generateToken({ userId: user.id }, "7d");
    res.json({ token: sessionToken, user });
  } catch (err) {
    console.error("Token verification failed", err);
    res.status(401).json({ error: "Invalid or expired token." });
  }
});

// [POST] /auth/update-public-key
router.post(
  "/update-public-key",
  async (req: Request, res: Response): Promise<void> => {
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
  }
);

router.get("/me", async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" ? authHeader.split(" ")[1] : null;

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = verifyToken(token) as { userId: string };

    const result = await pool.query("SELECT email FROM users WHERE id = $1", [
      decoded.userId,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      userId: decoded.userId,
      email: result.rows[0].email,
    });
  } catch (err) {
    console.error("Error in /auth/me:", err);
    res.status(403).json({ error: "Invalid token" });
  }
});

export default router;
