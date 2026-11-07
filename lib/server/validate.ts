// Small input checks for request bodies. Each returns the clean value or throws a 400.
import { badRequest } from './errors';

export function object(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw badRequest('Expected a JSON object.');
  return v as Record<string, unknown>;
}

export function text(label: string, v: unknown, { max = 100 } = {}): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw badRequest(`${label} is required.`);
  if (s.length > max) throw badRequest(`${label} must be ${max} characters or fewer.`);
  return s;
}

export function number(label: string, v: unknown, { min, max }: { min: number; max: number }): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw badRequest(`${label} must be a number.`);
  if (n < min || n > max) throw badRequest(`${label} must be between ${min} and ${max}.`);
  return n;
}

export function email(v: unknown): string {
  const s = text('Email', v, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw badRequest('Enter a valid email address.');
  return s;
}

export function password(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8) throw badRequest('Password must be at least 8 characters.');
  if (v.length > 200) throw badRequest('Password is too long.');
  return v;
}
