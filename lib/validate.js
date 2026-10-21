// Input validation for the public quote form. Option lists mirror the form.
import { randomBytes } from 'node:crypto';
import { HttpError } from './http.js';

export const ORIGINS = ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Other'];
export const DESTINATIONS = ['Lagos', 'Abuja', 'Port Harcourt', 'Onitsha', 'Other'];
export const METHODS = ['Air freight', 'Sea freight LCL', 'Sea freight FCL', 'Not sure'];
export const GOODS = ['Personal effects', 'Commercial goods', 'Vehicle/machinery', 'Food items', 'Other'];
export const QUOTE_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PHONE = /^[+()\d\s.-]{6,24}$/;

function text(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function num(v, { min = 0, max, int = false } = {}) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) return NaN;
  return n;
}

// Codes avoid look-alike characters (0/O, 1/I) so they read well over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function code(len) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function parseQuote(input) {
  const errors = {};
  const pick = (field, list, label) => {
    const v = text(input[field], 40);
    if (!list.includes(v)) errors[field] = `Please choose ${label}.`;
    return v;
  };

  const q = {
    origin: pick('origin', ORIGINS, 'an origin city'),
    destination: pick('destination', DESTINATIONS, 'a destination'),
    method: pick('method', METHODS, 'a shipping method'),
    goods: pick('goods', GOODS, 'a goods type'),
    door: pick('door', ['Yes', 'No'], 'Yes or No'),
    customs: pick('customs', ['Yes', 'No'], 'Yes or No'),
    weight: num(input.weight, { max: 100000 }),
    packages: num(input.packages, { min: 1, max: 10000, int: true }),
    sizeMode: input.sizeMode === 'cbm' ? 'cbm' : 'dims',
    length: num(input.length, { max: 5000 }),
    width: num(input.width, { max: 5000 }),
    height: num(input.height, { max: 5000 }),
    cbm: num(input.cbm, { max: 500 }),
    name: text(input.name, 120),
    email: text(input.email, 200).toLowerCase(),
    phone: text(input.phone, 30),
    message: text(input.message, 2000),
    sailing: text(input.sailing, 80)
  };

  for (const f of ['weight', 'packages', 'length', 'width', 'height', 'cbm']) {
    if (Number.isNaN(q[f])) errors[f] = 'Please enter a valid number.';
  }
  if (q.name.length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL.test(q.email)) errors.email = 'Please enter a valid email address.';
  if (!PHONE.test(q.phone)) errors.phone = 'Please enter a valid phone or WhatsApp number.';

  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields.', errors);

  if (q.sizeMode === 'cbm') q.length = q.width = q.height = null;
  else q.cbm = null;
  return q;
}
