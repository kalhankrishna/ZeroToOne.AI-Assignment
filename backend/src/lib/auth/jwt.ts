import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import type { Role } from "../../generated/prisma/client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  userId: string;
  role: Role;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SECRET = process.env.JWT_SECRET!;
const EXPIRES_IN = "24h";

export const COOKIE_NAME = "token";

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 24 * 60 * 60 * 1000,
  path: "/",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, SECRET) as JWTPayload;
}