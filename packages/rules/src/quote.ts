export interface QuoteLineInput {
  key: string;
  quantity: number;
  unitAmount: number;
}

export interface QuoteCalculationInput {
  lines: QuoteLineInput[];
  coordinationFee?: number;
  platformFee?: number;
  discount?: number;
  taxes?: number;
}

export interface CalculatedQuoteLine extends QuoteLineInput {
  totalAmount: number;
}

export interface QuoteCalculation {
  lines: CalculatedQuoteLine[];
  lineSubtotal: number;
  coordinationFee: number;
  platformFee: number;
  discount: number;
  taxes: number;
  total: number;
}

const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

function minorAmount(value: number | undefined, field: string): bigint {
  const amount = value ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer in minor units`);
  }
  return BigInt(amount);
}

function safeNumber(amount: bigint, field: string): number {
  if (amount > MAX_SAFE_AMOUNT) {
    throw new RangeError(`${field} exceeds the maximum safe integer`);
  }
  return Number(amount);
}

/** Computes a quote from already evaluated prices; all amounts are minor currency units. */
export function calculateQuote(input: QuoteCalculationInput): QuoteCalculation {
  if (input.lines.length === 0) {
    throw new RangeError('A quote must contain at least one line');
  }

  let lineSubtotal = 0n;
  const lines = input.lines.map((line, index): CalculatedQuoteLine => {
    if (!line.key.trim()) {
      throw new RangeError(`lines[${index}].key must not be empty`);
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError(`lines[${index}].quantity must be a positive safe integer`);
    }

    const unitAmount = minorAmount(line.unitAmount, `lines[${index}].unitAmount`);
    const totalAmount = unitAmount * BigInt(line.quantity);
    lineSubtotal += totalAmount;

    return {
      key: line.key,
      quantity: line.quantity,
      unitAmount: safeNumber(unitAmount, `lines[${index}].unitAmount`),
      totalAmount: safeNumber(totalAmount, `lines[${index}].totalAmount`),
    };
  });

  const coordinationFee = minorAmount(input.coordinationFee, 'coordinationFee');
  const platformFee = minorAmount(input.platformFee, 'platformFee');
  const discount = minorAmount(input.discount, 'discount');
  const taxes = minorAmount(input.taxes, 'taxes');
  const beforeDiscount = lineSubtotal + coordinationFee + platformFee;

  if (discount > beforeDiscount) {
    throw new RangeError('discount cannot exceed the line subtotal and fees');
  }

  return {
    lines,
    lineSubtotal: safeNumber(lineSubtotal, 'lineSubtotal'),
    coordinationFee: safeNumber(coordinationFee, 'coordinationFee'),
    platformFee: safeNumber(platformFee, 'platformFee'),
    discount: safeNumber(discount, 'discount'),
    taxes: safeNumber(taxes, 'taxes'),
    total: safeNumber(beforeDiscount - discount + taxes, 'total'),
  };
}
