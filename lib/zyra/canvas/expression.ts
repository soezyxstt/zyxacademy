import { scientificLiteralToLatex } from "@/lib/math/scientific-format";

export type SafeExpressionNode =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: string }
  | { kind: "unary"; operator: "+" | "-"; argument: SafeExpressionNode }
  | { kind: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: SafeExpressionNode; right: SafeExpressionNode }
  | { kind: "call"; name: SafeFunctionName; args: SafeExpressionNode[] };

export type SafeFunctionName = "abs" | "cos" | "exp" | "log" | "max" | "min" | "sin" | "sqrt" | "tan";

type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "^" }
  | { kind: "leftParen" }
  | { kind: "rightParen" }
  | { kind: "comma" }
  | { kind: "eof" };

const FUNCTION_ARITY: Record<SafeFunctionName, { min: number; max: number }> = {
  abs: { min: 1, max: 1 },
  cos: { min: 1, max: 1 },
  exp: { min: 1, max: 1 },
  log: { min: 1, max: 1 },
  max: { min: 2, max: 4 },
  min: { min: 2, max: 4 },
  sin: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  tan: { min: 1, max: 1 },
};

export interface SafeExpressionOptions {
  variables: readonly string[];
  maxNodes?: number;
  maxDepth?: number;
}

export interface CompiledSafeExpression {
  expression: string;
  ast: SafeExpressionNode;
  evaluate(values: Record<string, number>): number;
}

function fail(message: string): never {
  throw new Error(`SAFE_EXPRESSION_${message}`);
}

function tokenize(expression: string): Token[] {
  if (expression.length === 0 || expression.length > 180) fail("LENGTH");
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const rest = expression.slice(index);
    const numberMatch = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) fail("NUMBER");
      tokens.push({ kind: "number", value });
      index += numberMatch[0].length;
      continue;
    }
    const identifierMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifierMatch) {
      tokens.push({ kind: "identifier", value: identifierMatch[0] });
      index += identifierMatch[0].length;
      continue;
    }
    if ("+-*/^".includes(char)) {
      tokens.push({ kind: "operator", value: char as "+" | "-" | "*" | "/" | "^" });
      index += 1;
      continue;
    }
    if (char === "(") tokens.push({ kind: "leftParen" });
    else if (char === ")") tokens.push({ kind: "rightParen" });
    else if (char === ",") tokens.push({ kind: "comma" });
    else fail("TOKEN");
    index += 1;
  }
  tokens.push({ kind: "eof" });
  return tokens;
}

class ExpressionParser {
  private index = 0;
  private nodeCount = 0;
  private readonly declaredVariables: ReadonlySet<string>;
  private readonly maxNodes: number;
  private readonly maxDepth: number;

  constructor(private readonly tokens: readonly Token[], options: SafeExpressionOptions) {
    this.declaredVariables = new Set(options.variables);
    this.maxNodes = options.maxNodes ?? 64;
    this.maxDepth = options.maxDepth ?? 20;
  }

  parse(): SafeExpressionNode {
    const node = this.parseAdditive(0);
    if (this.peek().kind !== "eof") fail("TRAILING_INPUT");
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private consume(): Token {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private match(kind: Token["kind"], value?: string): boolean {
    const token = this.peek();
    if (token.kind !== kind) return false;
    if (value !== undefined && ("value" in token ? token.value !== value : true)) return false;
    this.index += 1;
    return true;
  }

  private addNode<T extends SafeExpressionNode>(node: T, depth: number): T {
    this.nodeCount += 1;
    if (this.nodeCount > this.maxNodes) fail("TOO_COMPLEX");
    if (depth > this.maxDepth) fail("TOO_DEEP");
    return node;
  }

  private parseAdditive(depth: number): SafeExpressionNode {
    let left = this.parseMultiplicative(depth + 1);
    while (true) {
      const next = this.peek();
      if (next.kind !== "operator" || (next.value !== "+" && next.value !== "-")) break;
      const operator = this.consume();
      if (operator.kind !== "operator") fail("PARSER");
      left = this.addNode({
        kind: "binary",
        operator: operator.value as "+" | "-",
        left,
        right: this.parseMultiplicative(depth + 1),
      }, depth);
    }
    return left;
  }

  private parseMultiplicative(depth: number): SafeExpressionNode {
    let left = this.parseUnary(depth + 1);
    while (true) {
      const next = this.peek();
      if (next.kind !== "operator" || (next.value !== "*" && next.value !== "/")) break;
      const operator = this.consume();
      if (operator.kind !== "operator") fail("PARSER");
      left = this.addNode({
        kind: "binary",
        operator: operator.value as "*" | "/",
        left,
        right: this.parseUnary(depth + 1),
      }, depth);
    }
    return left;
  }

  private parseUnary(depth: number): SafeExpressionNode {
    const next = this.peek();
    if (next.kind === "operator" && (next.value === "+" || next.value === "-")) {
      const operator = this.consume();
      if (operator.kind !== "operator") fail("PARSER");
      return this.addNode({
        kind: "unary",
        operator: operator.value as "+" | "-",
        argument: this.parseUnary(depth + 1),
      }, depth);
    }
    return this.parsePower(depth + 1);
  }

  private parsePower(depth: number): SafeExpressionNode {
    const left = this.parsePrimary(depth + 1);
    if (this.match("operator", "^")) {
      return this.addNode({
        kind: "binary",
        operator: "^",
        left,
        right: this.parseUnary(depth + 1),
      }, depth);
    }
    return left;
  }

  private parsePrimary(depth: number): SafeExpressionNode {
    const token = this.consume();
    if (token.kind === "number") return this.addNode({ kind: "number", value: token.value }, depth);
    if (token.kind === "identifier") {
      if (this.match("leftParen")) {
        if (!(token.value in FUNCTION_ARITY)) fail("FUNCTION");
        const name = token.value as SafeFunctionName;
        const args: SafeExpressionNode[] = [];
        if (!this.match("rightParen")) {
          do {
            args.push(this.parseAdditive(depth + 1));
          } while (this.match("comma"));
          if (!this.match("rightParen")) fail("PAREN");
        }
        const arity = FUNCTION_ARITY[name];
        if (args.length < arity.min || args.length > arity.max) fail("ARITY");
        return this.addNode({ kind: "call", name, args }, depth);
      }
      if (token.value === "pi" || token.value === "e") {
        return this.addNode({ kind: "number", value: token.value === "pi" ? Math.PI : Math.E }, depth);
      }
      if (!this.declaredVariables.has(token.value)) fail("IDENTIFIER");
      return this.addNode({ kind: "variable", name: token.value }, depth);
    }
    if (token.kind === "leftParen") {
      const node = this.parseAdditive(depth + 1);
      if (!this.match("rightParen")) fail("PAREN");
      return node;
    }
    fail("PRIMARY");
  }
}

function evaluateNode(node: SafeExpressionNode, values: Record<string, number>): number {
  if (node.kind === "number") return node.value;
  if (node.kind === "variable") {
    const value = values[node.name];
    if (typeof value !== "number" || !Number.isFinite(value)) fail("VALUE");
    return value;
  }
  if (node.kind === "unary") {
    const value = evaluateNode(node.argument, values);
    return node.operator === "-" ? -value : value;
  }
  if (node.kind === "binary") {
    const left = evaluateNode(node.left, values);
    const right = evaluateNode(node.right, values);
    if (node.operator === "+") return left + right;
    if (node.operator === "-") return left - right;
    if (node.operator === "*") return left * right;
    if (node.operator === "/") {
      if (right === 0) fail("DIVISION_BY_ZERO");
      return left / right;
    }
    return left ** right;
  }
  const args = node.args.map((arg) => evaluateNode(arg, values));
  let result: number;
  if (node.name === "abs") result = Math.abs(args[0]);
  else if (node.name === "cos") result = Math.cos(args[0]);
  else if (node.name === "exp") result = Math.exp(args[0]);
  else if (node.name === "log") result = Math.log(args[0]);
  else if (node.name === "max") result = Math.max(...args);
  else if (node.name === "min") result = Math.min(...args);
  else if (node.name === "sin") result = Math.sin(args[0]);
  else if (node.name === "sqrt") result = Math.sqrt(args[0]);
  else result = Math.tan(args[0]);
  if (!Number.isFinite(result)) fail("NON_FINITE");
  return result;
}

export function parseSafeExpression(
  expression: string,
  options: SafeExpressionOptions,
): SafeExpressionNode {
  return new ExpressionParser(tokenize(expression.trim()), options).parse();
}

export function compileSafeExpression(
  expression: string,
  options: SafeExpressionOptions,
): CompiledSafeExpression {
  const ast = parseSafeExpression(expression, options);
  return {
    expression: expression.trim(),
    ast,
    evaluate: (values) => {
      const result = evaluateNode(ast, values);
      if (!Number.isFinite(result)) fail("NON_FINITE");
      return result;
    },
  };
}

function expressionNodeToLatex(node: SafeExpressionNode, parentPrecedence = 0): string {
  if (node.kind === "number") {
    const literal = scientificLiteralToLatex(String(node.value));
    return literal && parentPrecedence > 2 ? `\\left(${literal}\\right)` : literal ?? String(node.value);
  }
  if (node.kind === "variable") return node.name;
  if (node.kind === "call") {
    const name = node.name === "log" ? "ln" : node.name;
    if (name === "sqrt") return `\\sqrt{${expressionNodeToLatex(node.args[0])}}`;
    return `\\${name}\\left(${node.args.map((arg) => expressionNodeToLatex(arg)).join(", ")}\\right)`;
  }
  if (node.kind === "unary") {
    const value = `${node.operator}${expressionNodeToLatex(node.argument, 4)}`;
    return parentPrecedence > 4 ? `\\left(${value}\\right)` : value;
  }
  if (node.operator === "/") {
    return `\\frac{${expressionNodeToLatex(node.left)}}{${expressionNodeToLatex(node.right)}}`;
  }
  if (node.operator === "^") {
    const value = `${expressionNodeToLatex(node.left, 4)}^{${expressionNodeToLatex(node.right)}}`;
    return parentPrecedence > 3 ? `\\left(${value}\\right)` : value;
  }
  const precedence = node.operator === "*" ? 2 : 1;
  const separator = node.operator === "*" ? "" : ` ${node.operator} `;
  const value = `${expressionNodeToLatex(node.left, precedence)}${separator}${expressionNodeToLatex(node.right, precedence + (node.operator === "-" ? 1 : 0))}`;
  return parentPrecedence > precedence ? `\\left(${value}\\right)` : value;
}

/** Formats a validated evaluator expression as readable math notation. */
export function safeExpressionToLatex(
  expression: string,
  variables: readonly string[],
): string {
  const normalized = normalizeLegacyGraphExpression(expression);
  try {
    return expressionNodeToLatex(parseSafeExpression(normalized, { variables }));
  } catch {
    return expression;
  }
}

export function normalizeLegacyGraphExpression(value: string): string {
  let expr = value
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/^\$+|\$+$/g, "")
    .replace(/^(?:\\\(|\\\[)|(?:\\\)|\\\])$/g, "")
    .replace(/^\s*(?:persamaan|fungsi|kurva|grafik|rumus)(?:\s+(?:kuadrat|linier|linear|polinomial))?\s*[:=]\s*/i, "")
    .replace(/^\s*(?:y\s*(?:\([a-zA-Z]\))?|[a-zA-Z](?:_\d+)?\s*\(\s*[a-zA-Z]\s*\))\s*[:=]\s*/i, "")
    .replace(/\s*(?:,|;)\s*x\s*(?:\\(?:ne|neq)|!=|≠|<|>|≤|≥).*$/i, "")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/⁴/g, "^4");

  while (/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/.test(expr)) {
    expr = expr.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "(($1)/($2))");
  }

  return expr
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\operatorname\s*\{(sin|cos|tan|log|ln|exp|min|max|abs)\}/gi, "$1")
    .replace(/\\(sin|cos|tan|log|ln|exp|min|max|abs)\b/gi, "$1")
    .replace(/\bln\b/gi, "log")
    .replace(/\\pi\b/gi, "pi")
    .replace(/\\mathrm\s*\{e\}/gi, "e")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\(?:,|;|!|quad|qquad)\s*/g, "")
    .replace(/[{}]/g, (character) => character === "{" ? "(" : ")")
    .replace(/\b(sin|cos|tan|log)\s*\^\s*(?:\((\d+)\)|(\d+))\s*\(([^()]+)\)/gi, (_match, name, groupedPower, power, argument) => `(${name}(${argument}))^${groupedPower ?? power}`)
    .replace(/\|([^|]+)\|/g, "abs($1)")
    .replace(/\b(sin|cos|tan|log|exp|sqrt|abs)\s+((?:pi|e|x)|(?:\d+(?:\.\d+)?))/gi, "$1($2)")
    .replace(/(\d|\))(?=[A-Za-z_(])/g, "$1*")
    .replace(/([A-Za-z_)])(?=\d)/g, "$1*")
    .replace(/\b([A-Za-z])\s*(?=\()/g, "$1*")
    .replace(/\b(pi|e|x)\s+(?=(?:pi|e|x)\b|\()/gi, "$1*")
    .replace(/[.,:]+$/g, "")
    .trim();
}
