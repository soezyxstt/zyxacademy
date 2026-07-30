/**
 * Semantic validation interfaces and execution engine for typed AI outputs.
 */

export type ViolationSeverity = 'error' | 'warning';

export interface SemanticViolation {
  code: string;
  path: string;
  message: string;
  severity: ViolationSeverity;
}

export interface SemanticValidatorContext<TInput = any> {
  input: TInput;
  trustedContext?: Record<string, any>;
}

export interface SemanticValidator<TInput = any, TOutput = any> {
  id: string;
  version: string;
  validate: (
    output: TOutput,
    context: SemanticValidatorContext<TInput>
  ) => SemanticViolation[] | Promise<SemanticViolation[]>;
}

export interface SemanticValidationResult {
  valid: boolean;
  violations: SemanticViolation[];
  combinedVersion: string;
}

/**
 * Runs a set of semantic validators against typed AI output and input context.
 */
export async function runSemanticValidators<TInput, TOutput>(
  validators: SemanticValidator<TInput, TOutput>[] | undefined,
  output: TOutput,
  context: SemanticValidatorContext<TInput>
): Promise<SemanticValidationResult> {
  if (!validators || validators.length === 0) {
    return {
      valid: true,
      violations: [],
      combinedVersion: 'none',
    };
  }

  const combinedVersion = validators.map((v) => `${v.id}@${v.version}`).join('+');
  const allViolations: SemanticViolation[] = [];

  for (const validator of validators) {
    try {
      const res = await validator.validate(output, context);
      if (Array.isArray(res)) {
        allViolations.push(...res);
      }
    } catch (err: any) {
      allViolations.push({
        code: 'VALIDATOR_RUNTIME_ERROR',
        path: '$',
        message: `Validator ${validator.id} threw an error: ${err?.message || err}`,
        severity: 'error',
      });
    }
  }

  const hasError = allViolations.some((v) => v.severity === 'error');

  return {
    valid: !hasError,
    violations: allViolations,
    combinedVersion,
  };
}
