import express, { Request, Response, Router } from "express";
import { pool } from "../db";
import { verifyToken } from "../utils/jwt";

const router: Router = express.Router();

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const auth = req.headers.authorization;
  const token = auth?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = verifyToken(token) as { userId: string };
    const { to, ciphertext, iv } = req.body;

    if (!to || !ciphertext || !iv) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }
    const userResult = await pool.query(
      "SELECT email FROM users WHERE id = $1",
      [decoded.userId]
    );
    const senderEmail = userResult.rows[0]?.email;

    await pool.query(
      "INSERT INTO messages (sender, recipient, ciphertext, iv) VALUES ($1, $2, $3, $4)",
      [
        senderEmail, // email olarak kaydet
        to,
        Buffer.from(new Uint8Array(ciphertext)),
        Buffer.from(new Uint8Array(iv)),
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving message:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:email", async (req: Request, res: Response): Promise<void> => {
  const auth = req.headers.authorization;
  const token = auth?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = verifyToken(token) as { userId: string };
    const recipient = req.params.email;

    const result = await pool.query(
      "SELECT * FROM messages WHERE recipient = $1 ORDER BY timestamp ASC",
      [recipient]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
