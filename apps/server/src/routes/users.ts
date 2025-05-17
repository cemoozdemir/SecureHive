import express, { Request, Response } from "express";
import { pool } from "../db";

export const usersRouter = express.Router();

usersRouter.get("/:email/public-key", async (req: Request, res: Response) => {
  const { email } = req.params;

  if (typeof email !== "string") {
    res.status(400).json({ error: "Invalid email parameter" });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT public_key FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ publicKey: result.rows[0].public_key });
  } catch (err) {
    console.error("Error fetching public key:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
