import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);

// NIST 800-63B style: length over composition rules; reject trivially weak passwords.
const COMMON = new Set(['password', 'password1', '12345678', '123456789', 'qwertyui', 'dragonz123', 'iloveyou', '11111111']);
export const password = z.string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((p) => !COMMON.has(p.toLowerCase()), 'That password is too common')
  .refine((p) => new Set(p).size >= 5, 'Use a less repetitive password');

export const displayName = z.string().trim()
  .min(2, 'At least 2 characters').max(40, 'At most 40 characters')
  .regex(/^[\p{L}\p{N} _.\-]+$/u, 'Only letters, numbers, spaces, _ . -');

const token = z.string().min(20).max(100);

export const registerSchema = z.object({ email, password, displayName });
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const tokenSchema = z.object({ token });
export const emailOnlySchema = z.object({ email });
export const resetSchema = z.object({ token, password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
