import { describe, expect, it } from 'vitest';
import { evaluate } from '../../packages/rules/src/evaluate';

describe('unit/rules', () => {
  const context = {
    answers: { guests: 90, venue: 'garden' },
    settings: { minimumGuests: 50 },
    tables: { capacity: { garden: 100, hall: 250 } },
  };

  it('evaluates supported functions, operators and scoped variables', () => {
    expect(evaluate('{"ceil":[{"/":[{"var":"answers.guests"},8]}]}', context)).toBe(12);
    expect(evaluate('{"floor":[3.9]}', context)).toBe(3);
    expect(evaluate('{"round":[3.5]}', context)).toBe(4);
    expect(evaluate('{"mod":[10,3]}', context)).toBe(1);
    expect(evaluate('{"min":[4,2,7]}', context)).toBe(2);
    expect(evaluate('{"max":[4,2,7]}', context)).toBe(7);
    expect(
      evaluate(
        '{"if":[{">":[{"var":"answers.guests"},{"var":"settings.minimumGuests"}]},"large","small"]}',
        context,
      ),
    ).toBe('large');
    expect(evaluate('{"lookup":["capacity",{"var":"answers.venue"}]}', context)).toBe(100);
    expect(evaluate('{"+":[{"var":"answers.guests"},10]}', context)).toBe(100);
  });

  it('short-circuits conditional and boolean branches', () => {
    expect(evaluate('{"if":[true,"selected",{"unknown":[]}]}', context)).toBe('selected');
    expect(evaluate('{"and":[false,{"unknown":[]}]}', context)).toBe(false);
    expect(evaluate('{"or":["ready",{"unknown":[]}]}', context)).toBe('ready');
    expect(evaluate('{"!!":[{}]}', context)).toBe(true);
    expect(evaluate('{"!!":[[]]}', context)).toBe(false);
    expect(evaluate('{"lookup":["__proto__","constructor"]}', context)).toBe(null);
  });

  it('rejects source code, unsupported operators and unsafe variable paths', () => {
    expect(() => evaluate('process.exit()', context)).toThrow(SyntaxError);
    expect(() => evaluate('{"exec":["alert(1)"]}', context)).toThrow(TypeError);
    expect(() => evaluate('{"var":"constructor.prototype"}', context)).toThrow(TypeError);
    expect(() => evaluate('{"var":"users.0.password"}', context)).toThrow(TypeError);

    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        throw new Error('Accessor must not run');
      },
    });
    expect(() => evaluate('{"var":"answers.value"}', { ...context, answers: accessor })).toThrow(
      TypeError,
    );

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => evaluate('{"var":"answers"}', { ...context, answers: cyclic })).toThrow(TypeError);
  });

  it('rejects invalid arithmetic and division by zero', () => {
    expect(() => evaluate('{"+":[1,"2"]}', context)).toThrow(TypeError);
    expect(() => evaluate('{"/":[1,0]}', context)).toThrow(RangeError);
    expect(() => evaluate('{"min":[]}', context)).toThrow(TypeError);
  });

  it('enforces expression size, evaluation depth and output size limits', () => {
    expect(() => evaluate(`"${'x'.repeat(32_768)}"`, context)).toThrow(RangeError);

    let deeplyNested: unknown = 1;
    for (let index = 0; index < 70; index += 1) deeplyNested = [deeplyNested];
    expect(() => evaluate(JSON.stringify(deeplyNested), context)).toThrow(RangeError);

    const manyNodes = JSON.stringify(new Array(5_001).fill(0));
    expect(() => evaluate(manyNodes, context)).toThrow(RangeError);

    const largeContext = { ...context, answers: { ...context.answers, large: 'x'.repeat(65_537) } };
    expect(() => evaluate('{"var":"answers.large"}', largeContext)).toThrow(RangeError);
  });
});
