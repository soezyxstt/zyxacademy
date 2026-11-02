import ts from "typescript";

export type SourceColumn = { storage: string; mode: string };
export type SourceSchema = Map<string, Map<string, SourceColumn>>;

export function parseSourceSchema(files: string[]): SourceSchema {
  const tables: SourceSchema = new Map();
  for (const source of files) {
    const file = ts.createSourceFile("schema.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "sqliteTable") {
        const [name, object] = node.arguments;
        if (!name || !ts.isStringLiteral(name) || !object || !ts.isObjectLiteralExpression(object) || tables.has(name.text)) throw new Error("UNSUPPORTED_SQLITE_TABLE_DECLARATION");
        const columns = new Map<string, SourceColumn>();
        for (const property of object.properties) {
          if (!ts.isPropertyAssignment(property)) throw new Error(`UNSUPPORTED_COLUMN_DECLARATION:${name.text}`);
          let root: ts.Expression = property.initializer;
          while (ts.isCallExpression(root) && ts.isPropertyAccessExpression(root.expression)) root = root.expression.expression;
          if (!ts.isCallExpression(root) || !ts.isIdentifier(root.expression) || !["text", "integer", "real", "blob"].includes(root.expression.text)) throw new Error(`UNSUPPORTED_COLUMN_BUILDER:${name.text}`);
          const columnName = root.arguments[0];
          if (!columnName || !ts.isStringLiteral(columnName) || columns.has(columnName.text)) throw new Error(`UNSUPPORTED_COLUMN_NAME:${name.text}`);
          let mode = "default";
          const options = root.arguments[1];
          if (options) {
            if (!ts.isObjectLiteralExpression(options)) throw new Error(`UNSUPPORTED_COLUMN_OPTIONS:${name.text}`);
            for (const option of options.properties) {
              if (ts.isPropertyAssignment(option) && ts.isIdentifier(option.name) && option.name.text === "enum" && root.expression.text === "text" && ts.isArrayLiteralExpression(option.initializer) && option.initializer.elements.every(ts.isStringLiteral)) continue;
              if (!ts.isPropertyAssignment(option) || !ts.isIdentifier(option.name) || option.name.text !== "mode" || !ts.isStringLiteral(option.initializer)) throw new Error(`UNSUPPORTED_COLUMN_OPTIONS:${name.text}`);
              mode = option.initializer.text;
            }
          }
          columns.set(columnName.text, { storage: root.expression.text, mode });
        }
        tables.set(name.text, columns);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return tables;
}
