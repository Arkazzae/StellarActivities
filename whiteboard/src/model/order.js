/**
 * Fractional order keys (variable-length integer part + fraction, base 62).
 * Keys compare with plain string comparison, appending at either end grows the
 * key logarithmically, and two clients inserting concurrently at the same spot
 * produce equal keys that are broken by element id — so every replica sorts the
 * scene identically.
 */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0];
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;
const integerLength = (head) => {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - 97 + 2;
  if (head >= "A" && head <= "Z") return 90 - head.charCodeAt(0) + 2;
  throw new Error(`Invalid order key head: ${head}`);
};
const integerPart = (key) => {
  const length = integerLength(key[0] ?? "");
  if (length > key.length) throw new Error(`Invalid order key: ${key}`);
  return key.slice(0, length);
};
export const isValidOrderKey = (key) => {
  if (key.length === 0 || key === SMALLEST_INTEGER) return false;
  try {
    const head = integerPart(key);
    const fraction = key.slice(head.length);
    for (const char of key.slice(1)) if (!DIGITS.includes(char)) return false;
    return !fraction.endsWith(ZERO);
  } catch {
    return false;
  }
};
const midpoint = (a, b) => {
  if (b !== null) {
    let shared = 0;
    while ((a[shared] ?? ZERO) === b[shared]) shared += 1;
    if (shared > 0) return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
  }
  const digitA = a.length > 0 ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) {
    return DIGITS[Math.round((digitA + digitB) / 2)];
  }
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
};
const incrementInteger = (value) => {
  const head = value[0];
  const digits = value.slice(1).split("");
  let carry = true;
  for (let index = digits.length - 1; carry && index >= 0; index -= 1) {
    const next = DIGITS.indexOf(digits[index]) + 1;
    if (next === DIGITS.length) {
      digits[index] = ZERO;
    } else {
      digits[index] = DIGITS[next];
      carry = false;
    }
  }
  if (!carry) return head + digits.join("");
  if (head === "Z") return `a${ZERO}`;
  if (head === "z") return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
  if (nextHead > "a") digits.push(ZERO);
  else digits.pop();
  return nextHead + digits.join("");
};
const decrementInteger = (value) => {
  const head = value[0];
  const digits = value.slice(1).split("");
  let borrow = true;
  const last = DIGITS[DIGITS.length - 1];
  for (let index = digits.length - 1; borrow && index >= 0; index -= 1) {
    const next = DIGITS.indexOf(digits[index]) - 1;
    if (next === -1) {
      digits[index] = last;
    } else {
      digits[index] = DIGITS[next];
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join("");
  if (head === "a") return `Z${last}`;
  if (head === "A") return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) - 1);
  if (nextHead < "Z") digits.push(last);
  else digits.pop();
  return nextHead + digits.join("");
};
/** Returns a key strictly between `a` and `b` (null = open end). */
export const keyBetween = (a, b) => {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`Order keys out of order: ${a} >= ${b}`);
  }
  if (a === null) {
    if (b === null) return `a${ZERO}`;
    const head = integerPart(b);
    const fraction = b.slice(head.length);
    if (head === SMALLEST_INTEGER) return head + midpoint("", fraction);
    if (head < b) return head;
    const decremented = decrementInteger(head);
    if (decremented === null) throw new Error("Order key space exhausted");
    return decremented;
  }
  if (b === null) {
    const head = integerPart(a);
    const fraction = a.slice(head.length);
    const incremented = incrementInteger(head);
    return incremented === null ? head + midpoint(fraction, null) : incremented;
  }
  const headA = integerPart(a);
  const fractionA = a.slice(headA.length);
  const headB = integerPart(b);
  const fractionB = b.slice(headB.length);
  if (headA === headB) return headA + midpoint(fractionA, fractionB);
  const incremented = incrementInteger(headA);
  if (incremented === null) throw new Error("Order key space exhausted");
  if (incremented < b) return incremented;
  return headA + midpoint(fractionA, null);
};
/** Returns `count` ascending keys strictly between `a` and `b`. */
export const keysBetween = (a, b, count) => {
  if (count <= 0) return [];
  if (count === 1) return [keyBetween(a, b)];
  if (b === null) {
    const keys = [];
    let previous = a;
    for (let index = 0; index < count; index += 1) {
      previous = keyBetween(previous, null);
      keys.push(previous);
    }
    return keys;
  }
  if (a === null) {
    const keys = [];
    let next = b;
    for (let index = 0; index < count; index += 1) {
      next = keyBetween(null, next);
      keys.push(next);
    }
    return keys.reverse();
  }
  const middleIndex = Math.floor(count / 2);
  const middle = keyBetween(a, b);
  return [...keysBetween(a, middle, middleIndex), middle, ...keysBetween(middle, b, count - middleIndex - 1)];
};
export const compareOrder = (left, right) => {
  if (left.z < right.z) return -1;
  if (left.z > right.z) return 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};
