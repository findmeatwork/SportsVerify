import { AbiCoder, hexlify, keccak256, randomBytes } from "ethers";

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const abiCoder = AbiCoder.defaultAbiCoder();

/** Generate a random 32‑byte hex string (bytes32) */
export function generateSalt() {
  return hexlify(randomBytes(32));
}

/**
 * Validates and normalizes a date string in YYYY‑MM‑DD format.
 * Throws an Error if the format is invalid or the date is in the future.
 */
export function normalizeDob(dateString) {
  if (!dateString) throw new Error('Date of birth is required.');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) throw new Error('Enter a valid date of birth.');
  const [_, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new Error('Enter a valid date of birth.');
  }
  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(p => String(p).padStart(2, '0'))
    .join('-');
  if (dateString > today) throw new Error('Date of birth cannot be in the future.');
  return dateString; // already normalized
}

/** Compute the DOB hash using ABI encoding and keccak256. */
export function computeDobHash(eventId, participantId, dob, salt2) {
  if (!isValidBytes32(participantId)) throw new TypeError('Participant ID must be 32‑byte hex.');
  if (!isValidBytes32(salt2)) throw new TypeError('Salt2 must be 32‑byte hex.');
  return keccak256(abiCoder.encode(['uint256', 'bytes32', 'string', 'bytes32'], [eventId, participantId, dob, salt2]));
}

/** Compute keccak256 of a Uint8Array. */
export function hashBytes(uint8array) {
  if (!(uint8array instanceof Uint8Array)) throw new TypeError('Expected Uint8Array');
  const hex = '0x' + Buffer.from(uint8array).toString('hex');
  return keccak256(hex);
}

/** Compute participant commitment hash. */
export function computeCommitment(eventId, participantId, salt) {
  if (!isValidBytes32(participantId) || !isValidBytes32(salt)) {
    throw new TypeError('Participant ID and salt must be 32‑byte hexadecimal values.');
  }
  return keccak256(abiCoder.encode(['uint256', 'bytes32', 'bytes32'], [eventId, participantId, salt]));
}

/** Validate that a value is a 0x‑prefixed 64‑hex‑character string. */
export function isValidBytes32(value) {
  return typeof value === 'string' && bytes32Pattern.test(value);
}
