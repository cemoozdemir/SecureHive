import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "unbreachable_secret_key_which_is_impossible_to_guess";

export function generateToken(
  payload: string | object | Buffer,
  expiresIn?: string | number
): string {
  const options: jwt.SignOptions = {};
  if (expiresIn !== undefined) {
    options.expiresIn = expiresIn as jwt.SignOptions["expiresIn"];
  }
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}
