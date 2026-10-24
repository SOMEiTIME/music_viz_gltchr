//
// Operation and settings checks, ported from Media-Glitcher's presets.check_operation
// and validate(). glitch() runs them first, so a bad operation fails before any work
// (a zero `every` or `size` would otherwise loop forever).
//

// Operation type → its parameters as [name, kind, minimum], from engine.OPERATIONS.
// Only the types ported so far (PLAN.md §5); a null minimum means any value
export const OPERATIONS = {
  swap: [['interval', 'int', 0], ['flavour', 'int', null]],
  corrupt: [['interval', 'int', 0], ['flavour', 'int', null]],
  'byte-swap': [['size', 'int', 1], ['every', 'int', 1]],
  'byte-corrupt': [['every', 'int', 1]],
  bitflip: [['rate', 'float', 0]],
  repeat: [['size', 'int', 1], ['every', 'int', 1]],
};

// how each parameter kind is checked, and its name in errors.
// Infinity and NaN are rejected (JSON presets can't hold them anyway)
const KIND_CHECKS = {
  int: [Number.isInteger, 'an integer'],
  float: [Number.isFinite, 'a number'],
};

//
// Checks one operation dict and returns a copy with its keys in the standard
// order. Throws if the type is unknown or a parameter is wrong
//
export function checkOperation(op) {
  // own properties only, so names like 'constructor' aren't mistaken for operations
  if (typeof op !== 'object' || op === null || !Object.hasOwn(OPERATIONS, op.type)) {
    throw new Error(`type must be one of ${Object.keys(OPERATIONS).join(', ')}`);
  }
  const params = OPERATIONS[op.type];
  const names = params.map(([name]) => name);
  const keys = Object.keys(op);
  if (keys.length !== names.length + 1 || !names.every((name) => keys.includes(name))) {
    throw new Error(`needs exactly ${names.join(', ')}`);
  }
  for (const [name, kind, minimum] of params) {
    const [check, kindName] = KIND_CHECKS[kind];
    if (!check(op[name])) {
      throw new Error(`${name} must be ${kindName}`);
    }
    if (minimum !== null && op[name] < minimum) {
      throw new Error(`${name} must be at least ${minimum}`);
    }
  }
  return Object.fromEntries([['type', op.type], ...names.map((name) => [name, op[name]])]);
}

//
// Checks a whole operation list, naming the failing operation in the error like
// presets.validate(), and returns the checked copies
//
export function checkOperations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('operations must be a non-empty list');
  }
  return operations.map((op, index) => {
    try {
      return checkOperation(op);
    } catch (error) {
      throw new Error(`operation ${index + 1} (${op?.type ?? '?'}): ${error.message}`);
    }
  });
}

//
// Checks glitch()'s settings: headers are non-negative integers, the seed an
// integer or left out (null or undefined) for a random one
//
export function checkSettings({ headerLength, headerBytes, seed }) {
  for (const [name, value] of [['headerLength', headerLength], ['headerBytes', headerBytes]]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`);
    }
  }
  if (seed != null && !Number.isInteger(seed)) {
    throw new Error('seed must be an integer');
  }
}
