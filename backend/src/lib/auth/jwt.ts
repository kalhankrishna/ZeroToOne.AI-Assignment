import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { JWTPayload } from '../types/types.js';

const SECRET = process.env.JWT_SECRET!;
const EXPIRES_IN = '24h';

export const COOKIE_NAME = 'token';

export const COOKIE_OPTIONS: CookieOptions = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
	maxAge: 24 * 60 * 60 * 1000,
	path: '/',
};

export function signToken(payload: JWTPayload): string {
	return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
	return jwt.verify(token, SECRET) as JWTPayload;
}
