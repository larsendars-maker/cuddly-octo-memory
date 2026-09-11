import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const secret = () => process.env.JWT_SECRET || 'dev-only-change-me';
export function signUser(user){
  return jwt.sign({sub:user.id, username:user.username}, secret(), {expiresIn:'30d'});
}
export function verifyToken(token){ return jwt.verify(token, secret()); }
export async function hashPassword(p){ return bcrypt.hash(p, 12); }
export async function verifyPassword(p, h){ return bcrypt.compare(p,h); }
export function requireAuth(req,res,next){
  try {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
    if(!token) return res.status(401).json({error:'AUTH_REQUIRED'});
    req.user = verifyToken(token);
    next();
  } catch { return res.status(401).json({error:'INVALID_TOKEN'}); }
}
