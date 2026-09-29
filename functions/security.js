'use strict';

const { randomBytes, timingSafeEqual } = require('node:crypto');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireValue(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}
function identifier(value) {
  requireValue(typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value), 400, 'Identificador inválido.');
  return value;
}
function text(value, max, required = false) {
  requireValue(typeof value === 'string' && value.trim().length <= max && (!required || value.trim().length > 0), 400, 'Revisá los datos ingresados.');
  return value.trim();
}
function secret() { return randomBytes(32).toString('base64url'); }
function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length < 32) return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function canManage(user, event) {
  return Boolean(user && user.suspended !== true && !event.assetsState && (user.admin === true || user.uid === event.ownerId));
}
function receptionOpen(event, now = Date.now()) {
  return !event.assetsState && event.status === 'active' && Boolean(event.activatedAt) && Date.parse(event.startsAt) <= now && Date.parse(event.receivesUntil) > now;
}
function eventStart(date, time = '00:00') {
  requireValue(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date && typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time), 400, 'Ingresá una fecha y hora válidas.');
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}
function canView(user, event, key) {
  if (event.downloadUntil && Date.parse(event.downloadUntil) <= Date.now()) return false;
  return canManage(user, event) || (receptionOpen(event) && sameSecret(key, event.projectionKey));
}
function canUpload(user, event, key) {
  return receptionOpen(event) && (canManage(user, event) || sameSecret(key, event.guestKey));
}
function decodeImage(data) {
  requireValue(typeof data === 'string' && data.length <= 7 * 1024 * 1024, 413, 'La foto es demasiado grande.');
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  requireValue(match && match[1].length % 4 === 0, 400, 'Usá una imagen JPEG, PNG o WebP.');
  const bytes = Buffer.from(match[1], 'base64');
  requireValue(bytes.length > 0 && bytes.length <= 5 * 1024 * 1024, 413, 'La foto supera los 5 MB.');
  return bytes;
}

module.exports = { HttpError, requireValue, identifier, text, secret, sameSecret, canManage, canView, canUpload, decodeImage, receptionOpen, eventStart };
