import { z } from "zod";

/**
 * Plan 014: Formula Registry
 * Stores canonical mathematical formulas with symbol definitions, units, assumptions,
 * and source span IDs for diktats and exam intelligence.
 */

export const SymbolDefinitionSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().optional(),
  description: z.string().optional(),
});
export type SymbolDefinition = z.infer<typeof SymbolDefinitionSchema>;

export const RegisteredFormulaSchema = z.object({
  id: z.string().min(1),
  latexExpression: z.string().min(1),
  name: z.string().min(1),
  symbols: z.array(SymbolDefinitionSchema),
  assumptions: z.array(z.string()).default([]),
  domain: z.string().optional(),
  sourceKoIds: z.array(z.string()).default([]),
  sourceSpanIds: z.array(z.string()).default([]),
});
export type RegisteredFormula = z.infer<typeof RegisteredFormulaSchema>;

export class FormulaRegistry {
  private formulas = new Map<string, RegisteredFormula>();

  public registerFormula(formula: RegisteredFormula): void {
    const parsed = RegisteredFormulaSchema.parse(formula);
    this.formulas.set(parsed.id, parsed);
  }

  public getFormula(id: string): RegisteredFormula | undefined {
    return this.formulas.get(id);
  }

  public listFormulas(): RegisteredFormula[] {
    return Array.from(this.formulas.values());
  }
}
