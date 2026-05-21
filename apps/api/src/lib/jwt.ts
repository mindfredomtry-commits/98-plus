import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface JwtPayload {
  userId: string;
  telegramId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret()) as JwtPayload;
  } catch {
    return null;
  }
}
