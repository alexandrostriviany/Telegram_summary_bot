/**
 * Property-Based Tests for Summary Handler - Time Parameter Parsing
 * 
 * These tests use fast-check to verify properties hold across many randomly generated inputs.
 * 
 * @module commands/summary-handler.property.test
 */

import * as fc from 'fast-check';
import { parseTimeParameter } from './summary-handler';

/**
 * **Validates: Requirements 3.2**
 * 
 * Property 4: Time Parameter Parsing
 * 
 * For any /summary command with a valid time parameter (e.g., "1h", "2h", "30m"),
 * the Summary_Engine SHALL calculate the correct start timestamp as
 * (current_time - specified_duration).
 * 
 * This test verifies that parseTimeParameter correctly converts time strings to hours:
 * - For hours (Nh format): value should equal the input number
 * - For minutes (Nm format): value should equal input / 60
 */
describe('Property Tests: Summary Handler - Time Parameter Parsing', () => {
  /**
   * Arbitrary generator for valid hour values (positive integers)
   * Generates values from 1 to 168 (1 week in hours) to cover realistic use cases
   */
  const validHourValueArbitrary: fc.Arbitrary<number> = fc.integer({ min: 1, max: 168 });

  /**
   * Arbitrary generator for valid minute values (positive integers)
   * Generates values from 1 to 10080 (1 week in minutes) to cover realistic use cases
   */
  const validMinuteValueArbitrary: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10080 });

  /**
   * Arbitrary generator for valid hour time parameters (Nh format)
   * Generates strings like "1h", "2h", "24h", "168h"
   */
  const validHourParameterArbitrary: fc.Arbitrary<{ input: string; expectedHours: number }> = 
    validHourValueArbitrary.map(value => ({
      input: `${value}h`,
      expectedHours: value,
    }));

  /**
   * Arbitrary generator for valid minute time parameters (Nm format)
   * Generates strings like "30m", "60m", "90m"
   */
  const validMinuteParameterArbitrary: fc.Arbitrary<{ input: string; expectedHours: number }> = 
    validMinuteValueArbitrary.map(value => ({
      input: `${value}m`,
      expectedHours: value / 60,
    }));

  /**
   * Arbitrary generator for valid hour parameters with uppercase H
   * Tests case-insensitivity
   */
  const validUppercaseHourParameterArbitrary: fc.Arbitrary<{ input: string; expectedHours: number }> = 
    validHourValueArbitrary.map(value => ({
      input: `${value}H`,
      expectedHours: value,
    }));

  /**
   * Arbitrary generator for valid minute parameters with uppercase M
   * Tests case-insensitivity
   */
  const validUppercaseMinuteParameterArbitrary: fc.Arbitrary<{ input: string; expectedHours: number }> = 
    validMinuteValueArbitrary.map(value => ({
      input: `${value}M`,
      expectedHours: value / 60,
    }));

  /**
   * Arbitrary generator for valid time parameters with leading/trailing whitespace
   * Tests that whitespace is properly trimmed
   */
  const validParameterWithWhitespaceArbitrary: fc.Arbitrary<{ input: string; expectedHours: number }> = 
    fc.oneof(
      validHourValueArbitrary.map(value => ({
        input: `  ${value}h  `,
        expectedHours: value,
      })),
      validMinuteValueArbitrary.map(value => ({
        input: `  ${value}m  `,
        expectedHours: value / 60,
      }))
    );

  describe('Property 4: Time Parameter Parsing', () => {
    /**
     * **Validates: Requirements 3.2**
     * 
     * For any valid hour parameter (Nh format), parseTimeParameter should return
     * the exact hour value as a number.
     * 
     * Property: parseTimeParameter("Nh") === N for all positive integers N
     */
    it('should correctly parse hour parameters (Nh format) to hour values', () => {
      fc.assert(
        fc.property(validHourParameterArbitrary, ({ input, expectedHours }) => {
          const result = parseTimeParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected hour value
          expect(result).toBe(expectedHours);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     * 
     * For any valid minute parameter (Nm format), parseTimeParameter should return
     * the value converted to hours (N / 60).
     * 
     * Property: parseTimeParameter("Nm") === N / 60 for all positive integers N
     */
    it('should correctly parse minute parameters (Nm format) to fractional hour values', () => {
      fc.assert(
        fc.property(validMinuteParameterArbitrary, ({ input, expectedHours }) => {
          const result = parseTimeParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected hour value (minutes / 60)
          expect(result).toBeCloseTo(expectedHours, 10);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     * 
     * Time parameter parsing should be case-insensitive.
     * Both "1h" and "1H" should produce the same result.
     * 
     * Property: parseTimeParameter("NH") === parseTimeParameter("Nh") for all N
     */
    it('should parse hour parameters case-insensitively (H and h)', () => {
      fc.assert(
        fc.property(validUppercaseHourParameterArbitrary, ({ input, expectedHours }) => {
          const result = parseTimeParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected hour value
          expect(result).toBe(expectedHours);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     * 
     * Time parameter parsing should be case-insensitive for minutes.
     * Both "30m" and "30M" should produce the same result.
     * 
     * Property: parseTimeParameter("NM") === parseTimeParameter("Nm") for all N
     */
    it('should parse minute parameters case-insensitively (M and m)', () => {
      fc.assert(
        fc.property(validUppercaseMinuteParameterArbitrary, ({ input, expectedHours }) => {
          const result = parseTimeParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected hour value
          expect(result).toBeCloseTo(expectedHours, 10);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     * 
     * Time parameter parsing should handle leading/trailing whitespace.
     * "  1h  " should be parsed the same as "1h".
     * 
     * Property: parseTimeParameter("  Nh  ") === parseTimeParameter("Nh") for all N
     */
    it('should correctly parse time parameters with leading/trailing whitespace', () => {
      fc.assert(
        fc.property(validParameterWithWhitespaceArbitrary, ({ input, expectedHours }) => {
          const result = parseTimeParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected hour value
          expect(result).toBeCloseTo(expectedHours, 10);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     * 
     * Combined test: For any valid time parameter (hours or minutes),
     * the parsed result should correctly represent the duration in hours.
     * 
     * This is the core property that validates the time parameter parsing
     * for the /summary command.
     */
    it('should correctly convert all valid time parameters to hours', () => {
      const allValidTimeParametersArbitrary = fc.oneof(
        validHourParameterArbitrary,
        validMinuteParameterArbitrary,
        validUppercaseHourParameterArbitrary,
        validUppercaseMinuteParameterArbitrary
      );

      fc.assert(
        fc.property(allValidTimeParametersArbitrary, ({ input, expectedHours }) => {
          const result = parseTimeParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected hour value
          expect(result).toBeCloseTo(expectedHours, 10);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     * 
     * Verify that the mathematical relationship holds:
     * For minutes, the result should be exactly input_value / 60
     * 
     * Property: parseTimeParameter("Nm") * 60 === N for all positive integers N
     */
    it('should maintain the mathematical relationship: minutes / 60 = hours', () => {
      fc.assert(
        fc.property(validMinuteValueArbitrary, (minutes) => {
          const input = `${minutes}m`;
          const result = parseTimeParameter(input);
          
          // Result should not be null
          expect(result).not.toBeNull();
          
          // Converting back to minutes should give the original value
          expect(result! * 60).toBeCloseTo(minutes, 10);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.2**
     * 
     * Verify that hour values are returned unchanged (identity property).
     * 
     * Property: parseTimeParameter("Nh") === N for all positive integers N
     */
    it('should return hour values unchanged (identity property)', () => {
      fc.assert(
        fc.property(validHourValueArbitrary, (hours) => {
          const input = `${hours}h`;
          const result = parseTimeParameter(input);
          
          // Result should not be null
          expect(result).not.toBeNull();
          
          // Result should be exactly the input hour value
          expect(result).toBe(hours);
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });
});


/**
 * Property-Based Tests for Summary Handler - Count Parameter Parsing
 * 
 * **Validates: Requirements 3.3**
 * 
 * Property 5: Count Parameter Parsing
 * 
 * For any /summary command with a valid count parameter (e.g., "50", "100"),
 * the message query SHALL limit results to exactly that number of most recent messages.
 */

import { parseCountParameter, parseSummaryParameter } from './summary-handler';

describe('Property Tests: Summary Handler - Count Parameter Parsing', () => {
  /**
   * Arbitrary generator for valid count values (positive integers)
   * Generates values from 1 to 10000 to cover realistic use cases
   */
  const validCountValueArbitrary: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10000 });

  /**
   * Arbitrary generator for valid count parameters (positive integer strings)
   * Generates strings like "1", "50", "100", "1000"
   */
  const validCountParameterArbitrary: fc.Arbitrary<{ input: string; expectedCount: number }> = 
    validCountValueArbitrary.map(value => ({
      input: `${value}`,
      expectedCount: value,
    }));

  /**
   * Arbitrary generator for valid count parameters with leading/trailing whitespace
   * Tests that whitespace is properly trimmed
   */
  const validCountWithWhitespaceArbitrary: fc.Arbitrary<{ input: string; expectedCount: number }> = 
    validCountValueArbitrary.map(value => ({
      input: `  ${value}  `,
      expectedCount: value,
    }));

  describe('Property 5: Count Parameter Parsing', () => {
    /**
     * **Validates: Requirements 3.3**
     * 
     * For any valid count parameter (positive integer string), parseCountParameter
     * should return the exact numeric value.
     * 
     * Property: parseCountParameter("N") === N for all positive integers N
     */
    it('should correctly parse count parameters to exact numeric values', () => {
      fc.assert(
        fc.property(validCountParameterArbitrary, ({ input, expectedCount }) => {
          const result = parseCountParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected count value
          expect(result).toBe(expectedCount);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.3**
     * 
     * For any valid count parameter, parseSummaryParameter should return
     * a MessageRange with type 'count' and the exact numeric value.
     * 
     * Property: parseSummaryParameter("N") === { type: 'count', value: N } for all positive integers N
     */
    it('should return MessageRange with type count and exact value via parseSummaryParameter', () => {
      fc.assert(
        fc.property(validCountParameterArbitrary, ({ input, expectedCount }) => {
          const result = parseSummaryParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should have type 'count'
          expect(result!.type).toBe('count');
          
          // Result value should equal the expected count
          expect(result!.value).toBe(expectedCount);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.3**
     * 
     * Count parameter parsing should handle leading/trailing whitespace.
     * "  50  " should be parsed the same as "50".
     * 
     * Property: parseCountParameter("  N  ") === parseCountParameter("N") for all N
     */
    it('should correctly parse count parameters with leading/trailing whitespace', () => {
      fc.assert(
        fc.property(validCountWithWhitespaceArbitrary, ({ input, expectedCount }) => {
          const result = parseCountParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should equal the expected count value
          expect(result).toBe(expectedCount);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.3**
     * 
     * Verify that the parsed count value is exactly the input value (identity property).
     * This ensures no transformation or rounding occurs.
     * 
     * Property: parseCountParameter(String(N)) === N for all positive integers N
     */
    it('should return count values unchanged (identity property)', () => {
      fc.assert(
        fc.property(validCountValueArbitrary, (count) => {
          const input = `${count}`;
          const result = parseCountParameter(input);
          
          // Result should not be null
          expect(result).not.toBeNull();
          
          // Result should be exactly the input count value
          expect(result).toBe(count);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.3**
     * 
     * Verify that parseSummaryParameter correctly distinguishes count parameters
     * from time parameters. Count parameters are pure numeric strings without
     * any unit suffix.
     * 
     * Property: For any positive integer N, parseSummaryParameter("N").type === 'count'
     */
    it('should correctly identify count parameters as type count in parseSummaryParameter', () => {
      fc.assert(
        fc.property(validCountValueArbitrary, (count) => {
          const input = `${count}`;
          const result = parseSummaryParameter(input);
          
          // Result should not be null
          expect(result).not.toBeNull();
          
          // Type should be 'count' (not 'time')
          expect(result!.type).toBe('count');
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.3**
     * 
     * Verify that the message query limit matches the input count exactly.
     * This is the core property that validates count parameter parsing
     * for the /summary command.
     * 
     * Property: The value returned by parseSummaryParameter for count inputs
     * should be usable directly as a query limit.
     */
    it('should provide exact count value for message query limit', () => {
      fc.assert(
        fc.property(validCountParameterArbitrary, ({ input, expectedCount }) => {
          const result = parseSummaryParameter(input);
          
          // Result should not be null
          expect(result).not.toBeNull();
          
          // The value should be exactly what we need for the query limit
          expect(result!.value).toBe(expectedCount);
          
          // Verify it's a positive integer suitable for a limit
          expect(Number.isInteger(result!.value)).toBe(true);
          expect(result!.value).toBeGreaterThan(0);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 3.3**
     * 
     * Combined test with whitespace: parseSummaryParameter should correctly
     * handle count parameters with whitespace and return the correct MessageRange.
     */
    it('should handle count parameters with whitespace via parseSummaryParameter', () => {
      fc.assert(
        fc.property(validCountWithWhitespaceArbitrary, ({ input, expectedCount }) => {
          const result = parseSummaryParameter(input);
          
          // Result should not be null for valid inputs
          expect(result).not.toBeNull();
          
          // Result should have type 'count'
          expect(result!.type).toBe('count');
          
          // Result value should equal the expected count
          expect(result!.value).toBe(expectedCount);
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });
});
