import type { RuleContext } from './types';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const MAX_EXPRESSION_LENGTH = 32_768;
const MAX_OUTPUT_LENGTH = 65_536;
const MAX_DEPTH = 64;
const MAX_NODES = 5_000;
const FORBIDDEN_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === '') {
    return false;
  }
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function finiteNumber(value: unknown, operator: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${operator} expects finite numbers`);
  }
  return value;
}

function ownPath(root: unknown, parts: string[]): unknown {
  let value = root;
  for (const part of parts) {
    if (FORBIDDEN_PATH_PARTS.has(part)) {
      throw new TypeError('Unsafe variable path');
    }
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, part);
    if (!descriptor) {
      return null;
    }
    if (!('value' in descriptor)) {
      throw new TypeError('Variable paths cannot access accessor properties');
    }
    value = descriptor.value;
  }
  return value ?? null;
}

function addOutputSize(size: number, budget: { size: number }): void {
  budget.size += size;
  if (budget.size > MAX_OUTPUT_LENGTH) {
    throw new RangeError('Expression result exceeds the maximum size');
  }
}

function measureOutput(
  value: unknown,
  budget: { size: number },
  ancestors: Set<object>,
  depth: number,
): void {
  if (depth > MAX_DEPTH) {
    throw new RangeError('Expression result exceeds the maximum depth');
  }
  if (value === null) {
    addOutputSize(4, budget);
  } else if (typeof value === 'boolean') {
    addOutputSize(value ? 4 : 5, budget);
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Expression result must be JSON serializable');
    addOutputSize(String(value).length, budget);
  } else if (typeof value === 'string') {
    addOutputSize(JSON.stringify(value).length, budget);
  } else if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('Expression result must not contain cycles');
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError('Expression result must contain plain JSON values');
    }
    if (value.length > MAX_OUTPUT_LENGTH) {
      throw new RangeError('Expression result exceeds the maximum size');
    }
    ancestors.add(value);
    addOutputSize(2 + Math.max(0, value.length - 1), budget);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) {
        addOutputSize(4, budget);
      } else {
        if (!('value' in descriptor)) {
          throw new TypeError('Expression result must not contain accessor properties');
        }
        measureOutput(descriptor.value, budget, ancestors, depth + 1);
      }
    }
    ancestors.delete(value);
  } else if (isObject(value)) {
    if (ancestors.has(value)) throw new TypeError('Expression result must not contain cycles');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Expression result must contain plain JSON values');
    }
    ancestors.add(value);
    const keys = Object.keys(value);
    addOutputSize(2 + Math.max(0, keys.length - 1), budget);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        throw new TypeError('Expression result must not contain accessor properties');
      }
      addOutputSize(JSON.stringify(key).length + 1, budget);
      measureOutput(descriptor.value, budget, ancestors, depth + 1);
    }
    ancestors.delete(value);
  } else {
    throw new TypeError('Expression result must be JSON serializable');
  }
}

function evaluateNode(
  node: unknown,
  context: RuleContext,
  depth: number,
  budget: { nodes: number },
): unknown {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) {
    throw new RangeError('Expression exceeds the evaluation node limit');
  }
  if (depth > MAX_DEPTH) {
    throw new RangeError('Expression exceeds the maximum depth');
  }

  if (Array.isArray(node)) {
    return node.map((item) => evaluateNode(item, context, depth + 1, budget));
  }
  if (!isObject(node)) return node;

  const keys = Object.keys(node);
  if (keys.length === 0) return node;
  if (keys.length !== 1) {
    throw new TypeError('JSONLogic expressions must contain exactly one operator per object');
  }

  const [operator] = keys;
  const rawArgs = node[operator];
  const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs];
  const evaluateArg = (index: number) => evaluateNode(args[index], context, depth + 1, budget);
  const evaluateAll = () => args.map((_, index) => evaluateArg(index));

  switch (operator) {
    case 'var': {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string') {
        throw new TypeError('var expects a path and an optional default value');
      }
      const path = args[0];
      const parts = path.split('.');
      if (
        (parts[0] !== 'answers' && parts[0] !== 'settings') ||
        parts.some((part) => part.length === 0 || FORBIDDEN_PATH_PARTS.has(part))
      ) {
        throw new TypeError('var paths must start with answers or settings');
      }
      const root = parts[0] === 'answers' ? context.answers : context.settings;
      const value = ownPath(root, parts.slice(1));
      return value === null && args.length === 2 ? evaluateArg(1) : value;
    }
    case 'if': {
      if (args.length < 2) throw new TypeError('if expects condition/result pairs');
      let index = 0;
      while (index + 1 < args.length) {
        if (isTruthy(evaluateArg(index))) return evaluateArg(index + 1);
        index += 2;
      }
      return args.length % 2 === 1 ? evaluateArg(args.length - 1) : null;
    }
    case 'and': {
      if (args.length === 0) throw new TypeError('and expects at least one argument');
      let result: unknown = null;
      for (let index = 0; index < args.length; index += 1) {
        result = evaluateArg(index);
        if (!isTruthy(result)) return result;
      }
      return result;
    }
    case 'or': {
      if (args.length === 0) throw new TypeError('or expects at least one argument');
      for (let index = 0; index < args.length; index += 1) {
        const result = evaluateArg(index);
        if (isTruthy(result)) return result;
      }
      return evaluateArg(args.length - 1);
    }
    case '!':
      if (args.length !== 1) throw new TypeError('! expects one argument');
      return !isTruthy(evaluateArg(0));
    case '!!':
      if (args.length !== 1) throw new TypeError('!! expects one argument');
      return isTruthy(evaluateArg(0));
    case '===':
    case '!==': {
      if (args.length !== 2) throw new TypeError(`${operator} expects two arguments`);
      const equal = evaluateArg(0) === evaluateArg(1);
      return operator === '===' ? equal : !equal;
    }
    case '>':
    case '>=':
    case '<':
    case '<=': {
      if (args.length !== 2) throw new TypeError(`${operator} expects two arguments`);
      const left = evaluateArg(0);
      const right = evaluateArg(1);
      if (typeof left === 'number' && typeof right === 'number') {
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
          throw new TypeError(`${operator} expects finite numbers`);
        }
      } else if (typeof left !== 'string' || typeof right !== 'string') {
        throw new TypeError(`${operator} expects two numbers or two strings`);
      }
      if (operator === '>') return left > right;
      if (operator === '>=') return left >= right;
      if (operator === '<') return left < right;
      return left <= right;
    }
    case '+':
    case '*': {
      if (args.length === 0) throw new TypeError(`${operator} expects at least one argument`);
      const values = evaluateAll().map((value) => finiteNumber(value, operator));
      const result =
        operator === '+'
          ? values.reduce((total, value) => total + value, 0)
          : values.reduce((total, value) => total * value, 1);
      return finiteNumber(result, operator);
    }
    case '-': {
      if (args.length < 1 || args.length > 2) throw new TypeError('- expects one or two arguments');
      const values = evaluateAll().map((value) => finiteNumber(value, operator));
      return finiteNumber(values.length === 1 ? -values[0] : values[0] - values[1], operator);
    }
    case '/':
    case '%':
    case 'mod': {
      if (args.length !== 2) throw new TypeError(`${operator} expects two arguments`);
      const [leftValue, rightValue] = evaluateAll();
      const left = finiteNumber(leftValue, operator);
      const right = finiteNumber(rightValue, operator);
      if (right === 0) throw new RangeError(`${operator} cannot divide by zero`);
      return finiteNumber(operator === '/' ? left / right : left % right, operator);
    }
    case 'min':
    case 'max': {
      if (args.length === 0) throw new TypeError(`${operator} expects at least one argument`);
      const values = evaluateAll().map((value) => finiteNumber(value, operator));
      return operator === 'min' ? Math.min(...values) : Math.max(...values);
    }
    case 'ceil':
    case 'floor':
    case 'round': {
      if (args.length !== 1) throw new TypeError(`${operator} expects one argument`);
      const value = finiteNumber(evaluateArg(0), operator);
      if (operator === 'ceil') return Math.ceil(value);
      if (operator === 'floor') return Math.floor(value);
      return Math.round(value);
    }
    case 'lookup': {
      if (args.length !== 2) throw new TypeError('lookup expects a table name and a key');
      const [tableValue, keyValue] = evaluateAll();
      if (
        (typeof tableValue !== 'string' && typeof tableValue !== 'number') ||
        (typeof keyValue !== 'string' && typeof keyValue !== 'number')
      ) {
        throw new TypeError('lookup expects string or number table names and keys');
      }
      const key = String(keyValue);
      const tableName = String(tableValue);
      const tables = context.tables;
      if (!tables || !Object.prototype.hasOwnProperty.call(tables, tableName)) return null;
      const tableDescriptor = Object.getOwnPropertyDescriptor(tables, tableName);
      if (!tableDescriptor || !('value' in tableDescriptor)) {
        throw new TypeError('lookup tables cannot use accessor properties');
      }
      const table = tableDescriptor.value;
      if (!Object.prototype.hasOwnProperty.call(table, key)) return null;
      const entry = Object.getOwnPropertyDescriptor(table, key);
      if (!entry || !('value' in entry)) {
        throw new TypeError('lookup entries cannot use accessor properties');
      }
      return entry.value;
    }
    default:
      throw new TypeError(`Unsupported JSONLogic operator: ${operator}`);
  }
}

/**
 * Evaluates a bounded JSONLogic expression without executing source code.
 * Variable access is restricted to answers.* and settings.*.
 */
export function evaluate(expression: string, context: RuleContext): unknown {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new RangeError('Expression exceeds the maximum size');
  }

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(expression) as JsonValue;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SyntaxError('Expression must be valid JSON');
    }
    throw error;
  }

  const result = evaluateNode(parsed, context, 0, { nodes: 0 });
  measureOutput(result, { size: 0 }, new Set(), 0);
  return result;
}
