import {
  canonicalize,
  isTruthy,
  qBool,
  qDate,
  qDictionary,
  qError,
  qFloat,
  qInt,
  qKeyedTable,
  qList,
  qNull,
  qProjection,
  qShort,
  qString,
  qSymbol,
  qTable,
  qTypeNumber,
  type CanonicalNode,
  type QBuiltin,
  type QDictionary,
  type QError,
  type QKeyedTable,
  type QList,
  type QLambda,
  type QNamespace,
  type QNumber,
  type QProjection,
  type QString,
  type QSymbol,
  type QTemporal,
  type QTable,
  type QValue
} from "@qpad/core";

export type AstNode =
  | { kind: "program"; statements: AstNode[]; source: string }
  | { kind: "return"; value: AstNode }
  | { kind: "assign"; name: string; value: AstNode }
  | { kind: "identifier"; name: string }
  | { kind: "number"; value: string }
  | { kind: "date"; value: string }
  | { kind: "string"; value: string }
  | { kind: "symbol"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "placeholder" }
  | { kind: "vector"; items: AstNode[] }
  | { kind: "list"; items: AstNode[] }
  | { kind: "table"; columns: { name: string; value: AstNode }[] }
  | {
      kind: "keyedTable";
      keys: { name: string; value: AstNode }[];
      values: { name: string; value: AstNode }[];
    }
  | {
      kind: "select";
      columns: { name: string | null; value: AstNode }[] | null;
      source: AstNode;
      where: AstNode | null;
    }
  | { kind: "exec"; value: AstNode; source: AstNode; where: AstNode | null }
  | {
      kind: "update";
      updates: { name: string; value: AstNode }[];
      source: AstNode;
      where: AstNode | null;
    }
  | { kind: "delete"; columns: string[] | null; source: AstNode; where: AstNode | null }
  | { kind: "each"; callee: AstNode; arg: AstNode }
  | { kind: "eachCall"; callee: AstNode; args: AstNode[] }
  | { kind: "binary"; op: string; left: AstNode; right: AstNode }
  | { kind: "call"; callee: AstNode; args: AstNode[] }
  | { kind: "lambda"; params: string[] | null; body: AstNode[]; source: string }
  | { kind: "group"; value: AstNode };

interface Token {
  kind: string;
  value: string;
}

const MONAD_KEYWORDS = new Set([
  "abs",
  "all",
  "any",
  "til",
  "ceiling",
  "cols",
  "count",
  "desc",
  "exp",
  "first",
  "last",
  "log",
  "min",
  "max",
  "asc",
  "asin",
  "atan",
  "sum",
  "avg",
  "asin",
  "acos",
  "atan",
  "sin",
  "cos",
  "tan",
  "floor",
  "null",
  "reciprocal",
  "reverse",
  "signum",
  "sqrt",
  "neg",
  "not",
  "enlist",
  "distinct",
  "attr",
  "flip",
  "key",
  "lower",
  "upper",
  "prd",
  "prev",
  "var",
  "svar",
  "dev",
  "sdev",
  "deltas",
  "sums",
  "string",
  "type",
  "where",
  "value",
  "show",
  "system",
  "hopen",
  "hclose",
  "hcount",
  "hdel",
  "read0",
  "read1"
]);

const WORD_DIAD_KEYWORDS = new Set([
  "cross",
  "xlog",
  "cut",
  "xcol",
  "in",
  "rotate",
  "sublist",
  "like",
  "within",
  "except",
  "inter",
  "union"
]);
const Q_X10_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const Q_X12_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CX_USAGE =
  "usage: complex must be a numeric scalar, numeric pair (re im), or `re`im dictionary";

const Q_RESERVED_WORDS = [
  "abs",
  "acos",
  "asin",
  "atan",
  "avg",
  "bin",
  "binr",
  "cor",
  "cos",
  "cov",
  "count",
  "delete",
  "dev",
  "div",
  "do",
  "enlist",
  "exec",
  "exit",
  "exp",
  "get",
  "if",
  "in",
  "like",
  "log",
  "max",
  "min",
  "prd",
  "select",
  "sum",
  "update",
  "var",
  "wavg",
  "while",
  "within",
  "xexp"
] as const;

const Q_RESERVED_SET = new Set<string>(Q_RESERVED_WORDS);

export interface FormatOptions {
  trailingNewline?: boolean;
}

export interface EvalResult {
  value: QValue;
  formatted: string;
  canonical: CanonicalNode;
}

export interface HostAdapter {
  now?: () => Date;
  timezone?: () => string;
  env?: () => Record<string, string>;
  consoleSize?: () => { rows: number; columns: number };
  unsupported?: (name: string) => never;
}

export class QRuntimeError extends Error {
  readonly qName: string;

  constructor(qName: string, message: string) {
    super(message);
    this.qName = qName;
  }
}

type BuiltinImpl = (session: Session, args: QValue[]) => QValue;

interface BuiltinEntry extends QBuiltin {
  impl: BuiltinImpl;
}

interface LambdaValue extends QLambda {
  body: AstNode[];
}

export class Session {
  private readonly env = new Map<string, QValue>();
  private readonly builtins = new Map<string, BuiltinEntry>();
  private readonly host: Required<HostAdapter>;
  private outputBuffer = "";

  constructor(host: HostAdapter = {}) {
    this.host = {
      now: host.now ?? (() => new Date()),
      timezone: host.timezone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      env: host.env ?? (() => ({})),
      consoleSize: host.consoleSize ?? (() => ({ rows: 40, columns: 120 })),
      unsupported:
        host.unsupported ??
        ((name: string) => {
          throw new QRuntimeError("nyi", `${name} is not available in the browser host`);
        })
    };

    this.installBuiltins();
    this.seedNamespaces();
  }

  evaluate(source: string): EvalResult {
    const ast = parse(source);
    this.outputBuffer = "";
    const value = this.eval(ast);
    const isEmptyProgram = ast.kind === "program" && ast.statements.length === 0;
    const finalStatement = ast.kind === "program" ? ast.statements.at(-1) ?? ast : ast;
    const shouldPrintFinal = !isSilentExpression(finalStatement);
    return {
      value,
      formatted: isEmptyProgram
        ? this.outputBuffer
        : `${this.outputBuffer}${shouldPrintFinal ? formatValue(value) : ""}`,
      canonical: canonicalize(value)
    };
  }

  get(name: string): QValue {
    this.refreshDynamicNamespaces();
    if (name.includes(".")) {
      return this.getDotted(name);
    }
    const value = this.env.get(name);
    if (value) {
      return value;
    }
    const builtin = this.builtins.get(name);
    if (!builtin) {
      throw new QRuntimeError("name", `Unknown identifier: ${name}`);
    }
    return {
      kind: "builtin",
      name: builtin.name,
      arity: builtin.arity
    };
  }

  assign(name: string, value: QValue): QValue {
    if (!name.includes(".")) {
      this.env.set(name, value);
      return value;
    }

    const parts = name.replace(/^\./, "").split(".");
    const last = parts.pop()!;
    let current =
      this.env.get(`.${parts[0]}`) ??
      this.env.get(parts[0]);

    if (!current) {
      current = {
        kind: "namespace",
        name: parts[0],
        entries: new Map()
      } satisfies QNamespace;
      this.env.set(name.startsWith(".") ? `.${parts[0]}` : parts[0], current);
    }

    for (const part of parts.slice(1)) {
      if (current.kind !== "namespace") {
        throw new QRuntimeError("type", `Cannot assign into non-namespace ${name}`);
      }
      let next = current.entries.get(part);
      if (!next) {
        next = {
          kind: "namespace",
          name: part,
          entries: new Map()
        } satisfies QNamespace;
        current.entries.set(part, next);
      }
      current = next;
    }

    if (current.kind !== "namespace") {
      throw new QRuntimeError("type", `Cannot assign into non-namespace ${name}`);
    }
    current.entries.set(last, value);
    return value;
  }

  emit(value: QValue) {
    this.outputBuffer += formatValue(value);
  }

  private eval(node: AstNode): QValue {
    switch (node.kind) {
      case "program": {
        let last: QValue = qNull();
        for (const statement of node.statements) {
          last = this.eval(statement);
        }
        return last;
      }
      case "assign":
        return this.assign(node.name, this.eval(node.value));
      case "return":
        return this.eval(node.value);
      case "identifier":
        return this.get(node.name);
      case "number":
        return parseNumericLiteral(node.value);
      case "date":
        return qDate(node.value);
      case "boolean":
        return qBool(node.value);
      case "string":
        return qString(node.value);
      case "symbol":
        return qSymbol(node.value);
      case "null":
        return qNull();
      case "placeholder":
        return qNull();
      case "vector":
        return qList(node.items.map((item) => this.eval(item)), true);
      case "list":
        return qList(
          node.items.reduceRight<QValue[]>((items, item) => {
            items.unshift(this.eval(item));
            return items;
          }, [])
        );
      case "table":
        return buildTable(node.columns.map((column) => ({
          name: column.name,
          value: this.eval(column.value)
        })));
      case "keyedTable":
        return qKeyedTable(
          buildTable(node.keys.map((column) => ({
            name: column.name,
            value: this.eval(column.value)
          }))),
          buildTable(node.values.map((column) => ({
            name: column.name,
            value: this.eval(column.value)
          })))
        );
      case "select":
        return this.evalSelect(node);
      case "exec":
        return this.evalExec(node);
      case "update":
        return this.evalUpdate(node);
      case "delete":
        return this.evalDelete(node);
      case "group":
        return this.eval(node.value);
      case "each": {
        const callee = this.eval(node.callee);
        const arg = this.eval(node.arg);
        const items =
          arg.kind === "list"
            ? arg.items
            : arg.kind === "string"
              ? [...arg.value].map((char) => qString(char))
              : [arg];
        return qList(items.map((item) => this.invoke(callee, [item])), false);
      }
      case "eachCall": {
        const callee = this.eval(node.callee);
        const args = node.args.map((arg) => this.eval(arg));
        const sizes = args
          .map((arg) => (arg.kind === "list" ? arg.items.length : arg.kind === "string" ? arg.value.length : null))
          .filter((size): size is number => size !== null);
        if (sizes.length === 0) {
          return this.invoke(callee, args);
        }
        if (!sizes.every((size) => size === sizes[0])) {
          throw new QRuntimeError("length", "Each arguments must have the same length");
        }
        return qList(
          Array.from({ length: sizes[0] }, (_, index) =>
            this.invoke(
              callee,
              args.map((arg) => {
                if (arg.kind === "list") {
                  return arg.items[index] ?? qNull();
                }
                if (arg.kind === "string") {
                  return qString(arg.value[index] ?? "");
                }
                return arg;
              })
            )
          ),
          false
        );
      }
      case "binary": {
        const right = this.eval(node.right);
        const left = this.eval(node.left);
        return this.evalBinary(node.op, left, right);
      }
      case "call": {
        const callee = this.eval(node.callee);
        const args = node.args.map((arg) => (arg.kind === "placeholder" ? null : this.eval(arg)));
        return this.invokeCall(callee, args);
      }
      case "lambda":
        return {
          kind: "lambda",
          params: node.params,
          source: node.source,
          body: node.body
        } satisfies LambdaValue;
    }
  }

  invoke(callee: QValue, args: QValue[]): QValue {
    if (callee.kind === "projection") {
      return this.invokeProjection(callee, args);
    }

    if (callee.kind === "builtin") {
      const builtin = this.builtins.get(callee.name);
      if (!builtin) {
        throw new QRuntimeError("nyi", `Builtin not found: ${callee.name}`);
      }
      if (args.length < builtin.arity) {
        return qProjection(callee, [...args], builtin.arity);
      }
      return builtin.impl(this, args);
    }

    if (callee.kind === "lambda") {
      return this.invokeLambda(callee as LambdaValue, args);
    }

    return applyValue(callee, args);
  }

  private invokeCall(callee: QValue, args: (QValue | null)[]): QValue {
    if (args.every((arg): arg is QValue => arg !== null)) {
      return this.invoke(callee, args);
    }

    if (callee.kind === "projection") {
      return qProjection(callee.target, this.mergeProjectionArgs(callee.args, args, callee.arity), callee.arity);
    }

    if (callee.kind === "builtin") {
      return qProjection(callee, [...args], callee.arity);
    }

    if (callee.kind === "lambda") {
      return qProjection(callee, [...args], lambdaArity(callee as LambdaValue));
    }

    return applyValue(
      callee,
      args.map((arg) => arg ?? qNull())
    );
  }

  private mergeProjectionArgs(
    baseArgs: (QValue | null)[],
    newArgs: (QValue | null)[],
    arity: number
  ) {
    const merged = [...baseArgs];
    let argIndex = 0;

    for (let index = 0; index < merged.length && argIndex < newArgs.length; index += 1) {
      if (merged[index] === null) {
        merged[index] = newArgs[argIndex] ?? null;
        argIndex += 1;
      }
    }

    while (argIndex < newArgs.length && merged.length < arity) {
      merged.push(newArgs[argIndex] ?? null);
      argIndex += 1;
    }

    return merged;
  }

  private invokeProjection(projection: QProjection, args: QValue[]): QValue {
    const boundCount = projection.args.filter((value) => value !== null).length;
    if (projection.arity - boundCount === 1 && args.length > 1) {
      args = [qList(args, args.every((arg) => arg.kind === args[0]?.kind))];
    }

    const merged = [...projection.args];
    let argIndex = 0;
    for (let index = 0; index < merged.length && argIndex < args.length; index += 1) {
      if (merged[index] === null) {
        merged[index] = args[argIndex] ?? null;
        argIndex += 1;
      }
    }
    while (argIndex < args.length && merged.length < projection.arity) {
      merged.push(args[argIndex]);
      argIndex += 1;
    }

    const completeArgs = merged.filter((value): value is QValue => value !== null);
    if (completeArgs.length < projection.arity) {
      return qProjection(projection.target, merged, projection.arity);
    }

    let result = this.invoke(projection.target, completeArgs);
    while (argIndex < args.length) {
      result = applyValue(result, [args[argIndex]]);
      argIndex += 1;
    }
    return result;
  }

  private invokeLambda(lambda: LambdaValue, args: QValue[]): QValue {
    const arity = lambdaArity(lambda);
    if (arity === 1 && args.length > 1) {
      args = [qList(args, args.every((arg) => arg.kind === args[0]?.kind))];
    }
    if (args.length < arity) {
      return qProjection(lambda, [...args], arity);
    }

    const child = new Session(this.host);
    for (const [key, value] of this.env.entries()) {
      child.assign(key, value);
    }

    const params = lambda.params ?? ["x", "y", "z"].slice(0, Math.max(arity, args.length));
    params.forEach((param, index) => {
      child.assign(param, args[index] ?? qNull());
    });

    let last: QValue = qNull();
    for (const statement of lambda.body) {
      if (statement.kind === "return") {
        const result = child.eval(statement.value);
        for (const [key, value] of child.env.entries()) {
          if (!key.startsWith(".Q") && !key.startsWith(".z")) {
            this.env.set(key, value);
          }
        }
        return result;
      }
      last = child.eval(statement);
    }

    return last;
  }

  private createTableContext(table: QTable, positions?: number[]) {
    const child = new Session(this.host);
    for (const [key, value] of this.env.entries()) {
      child.assign(key, value);
    }
    for (const [name, column] of Object.entries(table.columns)) {
      child.assign(name, column);
    }
    const rowPositions =
      positions ?? Array.from({ length: tableRowCount(table) }, (_, index) => index);
    child.assign("i", qList(rowPositions.map((index) => qInt(index)), true));
    return child;
  }

  private resolveTableRows(table: QTable, where: AstNode | null) {
    if (!where) {
      return Array.from({ length: tableRowCount(table) }, (_, index) => index);
    }

    const context = this.createTableContext(table);
    const result = context.eval(where);
    if (result.kind === "boolean") {
      return result.value ? Array.from({ length: tableRowCount(table) }, (_, index) => index) : [];
    }
    if (result.kind !== "list") {
      throw new QRuntimeError("type", "where expects a boolean vector");
    }

    return result.items.flatMap((item, index) =>
      item.kind === "boolean" && item.value ? [index] : []
    );
  }

  private evalSelect(node: Extract<AstNode, { kind: "select" }>): QValue {
    const source = this.eval(node.source);
    if (source.kind !== "table") {
      throw new QRuntimeError("type", "select expects a table source");
    }

    const positions = this.resolveTableRows(source, node.where);
    const filtered = selectTableRows(source, positions);
    if (!node.columns) {
      return filtered;
    }

    const context = this.createTableContext(filtered, positions);
    const columns = node.columns.map((column) => {
      const value = context.eval(column.value);
      return {
        name:
          column.name ??
          (column.value.kind === "identifier" ? column.value.name : renderAst(column.value)),
        value: materializeTableColumn(value, tableRowCount(filtered))
      };
    });
    return buildTable(columns);
  }

  private evalExec(node: Extract<AstNode, { kind: "exec" }>): QValue {
    const source = this.eval(node.source);
    if (source.kind !== "table") {
      throw new QRuntimeError("type", "exec expects a table source");
    }

    const positions = this.resolveTableRows(source, node.where);
    const filtered = selectTableRows(source, positions);
    const context = this.createTableContext(filtered, positions);
    return context.eval(node.value);
  }

  private evalUpdate(node: Extract<AstNode, { kind: "update" }>): QValue {
    const source = this.eval(node.source);
    if (source.kind !== "table") {
      throw new QRuntimeError("type", "update expects a table source");
    }

    const positions = this.resolveTableRows(source, node.where);
    const filtered = selectTableRows(source, positions);
    const context = this.createTableContext(filtered, positions);
    const updatedColumns = Object.fromEntries(
      Object.entries(source.columns).map(([name, column]) => [name, [...column.items]])
    ) as Record<string, QValue[]>;

    for (const update of node.updates) {
      const value = context.eval(update.value);
      const column = materializeTableColumn(value, positions.length);
      const sample = column.items[0] ?? source.columns[update.name]?.items[0];
      if (!updatedColumns[update.name]) {
        updatedColumns[update.name] = Array.from({ length: tableRowCount(source) }, () =>
          nullLike(sample)
        );
      }
      positions.forEach((position, index) => {
        updatedColumns[update.name]![position] = column.items[index] ?? nullLike(sample);
      });
      context.assign(update.name, column);
    }

    return qTable(
      Object.fromEntries(
        Object.entries(updatedColumns).map(([name, items]) => [
          name,
          qList(items, items.every((item) => item.kind === items[0]?.kind))
        ])
      )
    );
  }

  private evalDelete(node: Extract<AstNode, { kind: "delete" }>): QValue {
    const source = this.eval(node.source);
    if (source.kind !== "table") {
      throw new QRuntimeError("type", "delete expects a table source");
    }

    if (node.columns) {
      if (node.where) {
        throw new QRuntimeError("nyi", "delete column where is not implemented yet");
      }
      return qTable(
        Object.fromEntries(
          Object.entries(source.columns).filter(([name]) => !node.columns!.includes(name))
        )
      );
    }

    const positionsToDelete = new Set(this.resolveTableRows(source, node.where));
    const keep = Array.from({ length: tableRowCount(source) }, (_, index) => index).filter(
      (index) => !positionsToDelete.has(index)
    );
    return selectTableRows(source, keep);
  }

  private evalBinary(op: string, left: QValue, right: QValue): QValue {
    switch (op) {
      case "+":
        return mapBinary(left, right, (a, b) => add(a, b));
      case "-":
        return mapBinary(left, right, (a, b) => subtract(a, b));
      case "*":
        return mapBinary(left, right, (a, b) => multiply(a, b));
      case "%":
        return mapBinary(left, right, (a, b) => divide(a, b));
      case "=":
        return mapBinary(left, right, (a, b) => qBool(equals(a, b)));
      case "<":
        return mapBinary(left, right, (a, b) => qBool(compare(a, b) < 0));
      case ">":
        return mapBinary(left, right, (a, b) => qBool(compare(a, b) > 0));
      case "<=":
        return mapBinary(left, right, (a, b) => qBool(compare(a, b) <= 0));
      case ">=":
        return mapBinary(left, right, (a, b) => qBool(compare(a, b) >= 0));
      case ",":
        return concatValues(left, right);
      case "!":
        if (left.kind === "list" && right.kind === "list") {
          return qDictionary(left.items, right.items);
        }
        throw new QRuntimeError("type", "Expected two lists for dictionary creation");
      case "#":
        return takeValue(left, right);
      case "_":
        return dropValue(left, right);
      case "~":
        return qBool(equals(left, right));
      case "^":
        return fillValue(left, right);
      case "?":
        return findValue(left, right);
      case "$":
        return castValue(left, right);
      case "@": {
        const args = right.kind === "list" && !(right.homogeneous ?? false) ? right.items : [right];
        if (left.kind === "builtin" || left.kind === "lambda" || left.kind === "projection") {
          return this.invoke(left, args);
        }
        return applyValue(left, args);
      }
      case "in":
        return inValue(left, right);
      case "like":
        return likeValue(left, right);
      case "cross":
        return crossValue(left, right);
      case "within":
        return withinValue(left, right);
      case "except":
        return exceptValue(left, right);
      case "inter":
        return interValue(left, right);
      case "union":
        return unionValue(left, right);
      case "cut":
        return cutValue(left, right);
      case "rotate":
        return rotateValue(left, right);
      case "sublist":
        return sublistValue(left, right);
      case "xcol":
        return xcolValue(left, right);
      case "xlog":
        return mapBinary(left, right, (a, b) => qFloat(Math.log(toNumber(b)) / Math.log(toNumber(a))));
      case "|":
        return mapBinary(left, right, (a, b) => maxPair(a, b));
      case "&":
        return mapBinary(left, right, (a, b) => minPair(a, b));
      default:
        throw new QRuntimeError("nyi", `Operator ${op} is not implemented yet`);
    }
  }

  private keyValue(arg: QValue): QValue {
    if (arg.kind === "dictionary") {
      return qList(arg.keys, arg.keys.every((key) => key.kind === "symbol"));
    }
    if (arg.kind === "table") {
      return qList(Object.keys(arg.columns).map((name) => qSymbol(name)), true);
    }
    if (arg.kind === "keyedTable") {
      return arg.keys;
    }
    if (arg.kind === "namespace") {
      return qList(namespaceKeys(arg), true, "namespaceKeys");
    }
    if (arg.kind === "symbol") {
      if (arg.value === "") {
        const roots = [...this.env.keys()]
          .filter((name) => name.startsWith("."))
          .map((name) => qSymbol(name));
        return qList(roots, true, "namespaceKeys");
      }
      return qList(
        namespaceKeys(this.get(arg.value.startsWith(".") ? arg.value : `.${arg.value}`)),
        true,
        "namespaceKeys"
      );
    }
    throw new QRuntimeError("type", "key expects a dictionary, table, or namespace");
  }

  private installBuiltins() {
    const register = (name: string, arity: number, impl: BuiltinImpl) => {
      this.builtins.set(name, {
        kind: "builtin",
        name,
        arity,
        impl
      });
    };

    register("abs", 1, (_, [arg]) => absValue(arg));
    register("all", 1, (_, [arg]) => allValue(arg));
    register("any", 1, (_, [arg]) => anyValue(arg));
    register("til", 1, (_, [arg]) => {
      const count = toNumber(arg);
      return qList(Array.from({ length: count }, (_, i) => qInt(i)), true);
    });
    register("ceiling", 1, (_, [arg]) => ceilingValue(arg));
    register("cols", 1, (_, [arg]) => colsValue(arg));
    register("count", 1, (_, [arg]) => qInt(countValue(arg)));
    register("desc", 1, (_, [arg]) => descValue(arg));
    register("exp", 1, (_, [arg]) => numericUnary(arg, Math.exp));
    register("first", 1, (_, [arg]) => firstValue(arg));
    register("last", 1, (_, [arg]) => lastValue(arg));
    register("log", 1, (_, [arg]) => numericUnary(arg, Math.log));
    register("asc", 1, (_, [arg]) => ascValue(arg));
    register("asin", 1, (_, [arg]) => unaryNumeric(arg, Math.asin));
    register("atan", 1, (_, [arg]) => unaryNumeric(arg, Math.atan));
    register("min", 1, (_, [arg]) => minValue(arg));
    register("max", 1, (_, [arg]) => maxValue(arg));
    register("sum", 1, (_, [arg]) => sumValue(arg));
    register("avg", 1, (_, [arg]) => avgValue(arg));
    register("asin", 1, (_, [arg]) => numericUnary(arg, Math.asin));
    register("acos", 1, (_, [arg]) => numericUnary(arg, Math.acos));
    register("atan", 1, (_, [arg]) => numericUnary(arg, Math.atan));
    register("sin", 1, (_, [arg]) => numericUnary(arg, Math.sin));
    register("cos", 1, (_, [arg]) => numericUnary(arg, Math.cos));
    register("tan", 1, (_, [arg]) => numericUnary(arg, Math.tan));
    register("floor", 1, (_, [arg]) => floorValue(arg));
    register("null", 1, (_, [arg]) => nullValue(arg));
    register("reciprocal", 1, (_, [arg]) => reciprocalValue(arg));
    register("reverse", 1, (_, [arg]) => reverseValue(arg));
    register("signum", 1, (_, [arg]) => signumValue(arg));
    register("sqrt", 1, (_, [arg]) => numericUnary(arg, Math.sqrt));
    register("neg", 1, (_, [arg]) => negateValue(arg));
    register("not", 1, (_, [arg]) => notValue(arg));
    register("enlist", 1, (_, [arg]) => qList([arg]));
    register("distinct", 1, (_, [arg]) => distinctValue(arg));
    register("attr", 1, (_, [arg]) => attrValue(arg));
    register("flip", 1, (_, [arg]) => flipValue(arg));
    register("key", 1, (session, [arg]) => session.keyValue(arg));
    register("lower", 1, (_, [arg]) => lowerValue(arg));
    register("upper", 1, (_, [arg]) => upperValue(arg));
    register("prd", 1, (_, [arg]) => productValue(arg));
    register("prev", 1, (_, [arg]) => prevValue(arg));
    register("var", 1, (_, [arg]) => varianceValue(arg, false));
    register("svar", 1, (_, [arg]) => varianceValue(arg, true));
    register("dev", 1, (_, [arg]) => deviationValue(arg, false));
    register("sdev", 1, (_, [arg]) => deviationValue(arg, true));
    register("-':", 1, (_, [arg, maybeValues]) =>
      maybeValues === undefined ? deltasValue(arg) : deltasValue(maybeValues, arg)
    );
    this.builtins.set("deltas", this.builtins.get("-':")!);
    register("string", 1, (_, [arg]) => {
      if (arg.kind === "list") {
        return qList(
          arg.items.map((item) => qString(formatValue(item, { trailingNewline: false }))),
          false
        );
      }
      return qString(formatValue(arg, { trailingNewline: false }));
    });
    register("sums", 1, (_, [arg]) => sumsValue(arg));
    register("type", 1, (_, [arg]) => qShort(qTypeNumber(arg)));
    register("where", 1, (_, [arg]) => whereValue(arg));
    register("value", 1, (_, [arg]) => arg);
    register("show", 1, (session, [arg]) => {
      session.emit(arg);
      return arg;
    });
    register("system", 1, (session, [arg]) => {
      const text = arg.kind === "string" ? arg.value : formatValue(arg, { trailingNewline: false });
      if (text.startsWith("P ")) {
        return qNull();
      }
      return session.host.unsupported("system");
    });
    register("hopen", 1, (session) => session.host.unsupported("hopen"));
    register("hclose", 1, (session) => session.host.unsupported("hclose"));
    register("hcount", 1, (session) => session.host.unsupported("hcount"));
    register("hdel", 1, (session) => session.host.unsupported("hdel"));
    register("read0", 1, (session) => session.host.unsupported("read0"));
    register("read1", 1, (session) => session.host.unsupported("read1"));
    register("@", 2, (session, [target, arg, handler]) => {
      const args = arg.kind === "list" && !(arg.homogeneous ?? false) ? arg.items : [arg];
      try {
        if (target.kind === "builtin" || target.kind === "lambda" || target.kind === "projection") {
          return session.invoke(target, args);
        }
        return applyValue(target, args);
      } catch (error) {
        if (handler === undefined) {
          throw error;
        }
        if (!(error instanceof QRuntimeError)) {
          throw error;
        }
        if (handler.kind === "builtin" || handler.kind === "lambda" || handler.kind === "projection") {
          return session.invoke(handler, [qString(error.message)]);
        }
        return applyValue(handler, [qString(error.message)]);
      }
    });
    register("|:", 1, (_, [arg]) => reverseValue(arg));
    register("#:", 1, (_, [arg]) => qInt(countValue(arg)));
    register(".Q.opt", 1, (_, [arg]) => parseQOpt(arg));
    register(".Q.def", 3, (_, [defaults, parser, raw]) => defineDefaults(defaults, parser, raw));
    register(".Q.fmt", 3, (_, [width, decimals, value]) => formatQNumber(width, decimals, value));
    register(".Q.addmonths", 2, (_, [dateValue, monthsValue]) =>
      mapBinary(dateValue, monthsValue, (dateArg, monthArg) => addMonthsValue(dateArg, monthArg))
    );
    register(".Q.atob", 1, (_, [arg]) => atobValue(arg));
    register(".Q.btoa", 1, (_, [arg]) => btoaValue(arg));
    register(".Q.s", 1, (_, [arg]) => qString(formatValue(arg)));
    register(".Q.id", 1, (_, [arg]) => qIdValue(arg));
    register(".Q.x10", 1, (_, [arg]) => encodeFixedBase(arg, 10, Q_X10_ALPHABET));
    register(".Q.j10", 1, (_, [arg]) => decodeFixedBase(arg, Q_X10_ALPHABET));
    register(".Q.x12", 1, (_, [arg]) => encodeFixedBase(arg, 12, Q_X12_ALPHABET));
    register(".Q.j12", 1, (_, [arg]) => decodeFixedBase(arg, Q_X12_ALPHABET));
    register(".cx.from", 1, (_, [arg]) => qComplexFromValue(arg));
    register(".cx.new", 2, (_, [re, im]) => qComplex(toNumber(re), toNumber(im)));
    register(".cx.z", 2, (_, [re, im]) => qComplex(toNumber(re), toNumber(im)));
    register(".cx.re", 1, (_, [arg]) => qFloat(complexParts(arg).re));
    register(".cx.im", 1, (_, [arg]) => qFloat(complexParts(arg).im));
    register(".cx.conj", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(value.re, -value.im);
    });
    register(".cx.neg", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(-value.re, -value.im);
    });
    register(".cx.add", 2, (_, [left, right]) => {
      const a = complexParts(left);
      const b = complexParts(right);
      return qComplex(a.re + b.re, a.im + b.im);
    });
    register(".cx.sub", 2, (_, [left, right]) => {
      const a = complexParts(left);
      const b = complexParts(right);
      return qComplex(a.re - b.re, a.im - b.im);
    });
    register(".cx.mul", 2, (_, [left, right]) => {
      const a = complexParts(left);
      const b = complexParts(right);
      return qComplex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    });
    register(".cx.div", 2, (_, [left, right]) => {
      const a = complexParts(left);
      const b = complexParts(right);
      const denominator = b.re * b.re + b.im * b.im;
      if (denominator === 0) {
        throw new QRuntimeError("domain", "domain");
      }
      return qComplex(
        (a.re * b.re + a.im * b.im) / denominator,
        (a.im * b.re - a.re * b.im) / denominator
      );
    });
    register(".cx.abs", 1, (_, [arg]) => qFloat(Math.hypot(complexParts(arg).re, complexParts(arg).im)));
    register(".cx.modulus", 1, (_, [arg]) => qFloat(Math.hypot(complexParts(arg).re, complexParts(arg).im)));
    register(".cx.floor", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(Math.floor(value.re), Math.floor(value.im));
    });
    register(".cx.ceil", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(Math.ceil(value.re), Math.ceil(value.im));
    });
    register(".cx.round", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(roundHalfAwayFromZero(value.re), roundHalfAwayFromZero(value.im));
    });
    register(".cx.frac", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(value.re - Math.floor(value.re), value.im - Math.floor(value.im));
    });
    register(".cx.mod", 2, (_, [left, right]) => complexModulo(left, right));
    register(".cx.arg", 1, (_, [arg]) => qFloat(complexArg(complexParts(arg))));
    register(".cx.recip", 1, (_, [arg]) => {
      const value = complexParts(arg);
      const denominator = value.re * value.re + value.im * value.im;
      if (denominator === 0) {
        throw new QRuntimeError("domain", "domain");
      }
      return qComplex(value.re / denominator, -value.im / denominator);
    });
    register(".cx.normalize", 1, (_, [arg]) => {
      const value = complexParts(arg);
      const magnitude = Math.hypot(value.re, value.im);
      if (magnitude === 0) {
        throw new QRuntimeError("domain", "domain");
      }
      return qComplex(value.re / magnitude, value.im / magnitude);
    });
    register(".cx.fromPolar", 2, (_, [radius, theta]) => {
      const r = toNumber(radius);
      const angle = toNumber(theta);
      return qComplex(r * Math.cos(angle), r * Math.sin(angle));
    });
    register(".cx.polar", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qDictionary(
        [qSymbol("r"), qSymbol("theta")],
        [qFloat(Math.hypot(value.re, value.im)), qFloat(complexArg(value))]
      );
    });
    register(".cx.exp", 1, (_, [arg]) => {
      const value = complexParts(arg);
      const expRe = Math.exp(value.re);
      return qComplex(expRe * Math.cos(value.im), expRe * Math.sin(value.im));
    });
    register(".cx.log", 1, (_, [arg]) => {
      const value = complexParts(arg);
      const magnitude = Math.hypot(value.re, value.im);
      if (magnitude === 0) {
        throw new QRuntimeError("domain", "domain");
      }
      return qComplex(Math.log(magnitude), complexArg(value));
    });
    register(".cx.pow", 2, (_, [left, right]) => {
      const base = complexParts(left);
      const exponent = complexParts(right);
      const magnitude = Math.hypot(base.re, base.im);
      if (magnitude === 0) {
        throw new QRuntimeError("domain", "domain");
      }
      const logBase = { re: Math.log(magnitude), im: complexArg(base) };
      const product = {
        re: exponent.re * logBase.re - exponent.im * logBase.im,
        im: exponent.re * logBase.im + exponent.im * logBase.re
      };
      const expRe = Math.exp(product.re);
      return qComplex(expRe * Math.cos(product.im), expRe * Math.sin(product.im));
    });
    register(".cx.powEach", 2, (_, [left, right]) => {
      const base = complexParts(left);
      if (right.kind === "number") {
        return qComplex(Math.pow(base.re, right.value), Math.pow(base.im, right.value));
      }
      const exponent = complexParts(right);
      return qComplex(Math.pow(base.re, exponent.re), Math.pow(base.im, exponent.im));
    });
    register(".cx.sqrt", 1, (_, [arg]) => {
      const value = complexParts(arg);
      const angle = complexArg(value) / 2;
      return qComplex(Math.sqrt(Math.hypot(value.re, value.im)) * Math.cos(angle), Math.sqrt(Math.hypot(value.re, value.im)) * Math.sin(angle));
    });
    register(".cx.sin", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(
        Math.sin(value.re) * Math.cosh(value.im),
        Math.cos(value.re) * Math.sinh(value.im)
      );
    });
    register(".cx.cos", 1, (_, [arg]) => {
      const value = complexParts(arg);
      return qComplex(
        Math.cos(value.re) * Math.cosh(value.im),
        -Math.sin(value.re) * Math.sinh(value.im)
      );
    });
    register(".cx.tan", 1, (session, [arg]) => {
      const sine = session.invoke(session.get(".cx.sin"), [arg]);
      const cosine = session.invoke(session.get(".cx.cos"), [arg]);
      return session.invoke(session.get(".cx.div"), [sine, cosine]);
    });
    register(".cx.str", 1, (_, [arg]) => {
      const value = complexParts(arg);
      const sign = value.im < 0 ? "-" : "+";
      return qString(`${formatFloat(value.re)} ${sign} ${formatFloat(Math.abs(value.im))}i`);
    });
    register("cut", 2, (_, [left, right]) => cutValue(left, right));
    register("cross", 2, (_, [left, right]) => crossValue(left, right));
    register("rotate", 2, (_, [left, right]) => rotateValue(left, right));
    register("sublist", 2, (_, [left, right]) => sublistValue(left, right));
    register("xcol", 2, (_, [left, right]) => xcolValue(left, right));
    register("like", 2, (_, [left, right]) => likeValue(left, right));
    register("within", 2, (_, [left, right]) => withinValue(left, right));
    register("except", 2, (_, [left, right]) => exceptValue(left, right));
    register("inter", 2, (_, [left, right]) => interValue(left, right));
    register("union", 2, (_, [left, right]) => unionValue(left, right));
    register("xlog", 2, (_, [left, right]) =>
      mapBinary(left, right, (a, b) => qFloat(Math.log(toNumber(b)) / Math.log(toNumber(a))))
    );

    register("+", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => add(a, b)));
    register("-", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => subtract(a, b)));
    register("*", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => multiply(a, b)));
    register("%", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => divide(a, b)));
    register("div", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => divValue(a, b)));
    register("mod", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => modValue(a, b)));
    register("=", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => qBool(equals(a, b))));
    register("<", 2, (_, [left, right]) =>
      mapBinary(left, right, (a, b) => qBool(compare(a, b) < 0))
    );
    register(">", 2, (_, [left, right]) =>
      mapBinary(left, right, (a, b) => qBool(compare(a, b) > 0))
    );
    register("<=", 2, (_, [left, right]) =>
      mapBinary(left, right, (a, b) => qBool(compare(a, b) <= 0))
    );
    register(">=", 2, (_, [left, right]) =>
      mapBinary(left, right, (a, b) => qBool(compare(a, b) >= 0))
    );
    register(",", 2, (_, [left, right]) => concatValues(left, right));
    register("!", 2, (_, [left, right]) => {
      if (left.kind === "list" && right.kind === "list") {
        return qDictionary(left.items, right.items);
      }
      throw new QRuntimeError("type", "Expected two lists for dictionary creation");
    });
    register("#", 2, (_, [left, right]) => takeValue(left, right));
    register("_", 2, (_, [left, right]) => dropValue(left, right));
    register("~", 2, (_, [left, right]) => qBool(equals(left, right)));
    register("^", 2, (_, [left, right]) => fillValue(left, right));
    register("?", 2, (_, [left, right]) => findValue(left, right));
    register("$", 2, (_, [left, right]) => castValue(left, right));
    register("|", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => maxPair(a, b)));
    register("&", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => minPair(a, b)));
    register("/", 2, (session, [callable, arg]) => reduceValue(session, callable, arg));
  }

  private seedNamespaces() {
    const env = this.host.env();
    const now = this.host.now();
    const timezone = this.host.timezone();
    const size = this.host.consoleSize();

    this.env.set(".Q", {
      kind: "namespace",
      name: ".Q",
      entries: new Map<string, QValue>([
        ["n", qString("0123456789")],
        ["A", qString("ABCDEFGHIJKLMNOPQRSTUVWXYZ")],
        ["a", qString("abcdefghijklmnopqrstuvwxyz")],
        ["an", qString("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789")],
        ["opt", { kind: "builtin", name: ".Q.opt", arity: 1 }],
        ["def", { kind: "builtin", name: ".Q.def", arity: 3 }],
        ["fmt", { kind: "builtin", name: ".Q.fmt", arity: 3 }],
        ["addmonths", { kind: "builtin", name: ".Q.addmonths", arity: 2 }],
        ["atob", { kind: "builtin", name: ".Q.atob", arity: 1 }],
        ["btoa", { kind: "builtin", name: ".Q.btoa", arity: 1 }],
        ["s", { kind: "builtin", name: ".Q.s", arity: 1 }],
        ["id", { kind: "builtin", name: ".Q.id", arity: 1 }],
        ["x10", { kind: "builtin", name: ".Q.x10", arity: 1 }],
        ["j10", { kind: "builtin", name: ".Q.j10", arity: 1 }],
        ["x12", { kind: "builtin", name: ".Q.x12", arity: 1 }],
        ["j12", { kind: "builtin", name: ".Q.j12", arity: 1 }],
        ["res", qList(Q_RESERVED_WORDS.map((name) => qSymbol(name)), true)],
        ["b6", qString(Q_X10_ALPHABET)],
        ["nA", qString(Q_X12_ALPHABET)],
        ["K", qDate("0Nd")],
        ["M", qFloat(Number.POSITIVE_INFINITY, "posInf")],
        ["k", qFloat(5)],
        ["rows", qInt(size.rows)],
        ["cols", qInt(size.columns)]
      ])
    });

    this.env.set(".z", {
      kind: "namespace",
      name: ".z",
      entries: new Map<string, QValue>([
        ["K", qFloat(5)],
        ["D", qString(now.toISOString().slice(0, 10).replace(/-/g, "."))],
        ["T", qString(now.toTimeString().slice(0, 8))],
        ["P", qString(now.toISOString())],
        ["Z", qString(timezone)],
        ["o", qString(typeof navigator !== "undefined" ? navigator.userAgent : "node")],
        ["x", qList([])],
        ["e", qList(Object.entries(env).map(([k, v]) => qString(`${k}=${v}`)))]
      ])
    });

    this.env.set(".cx", {
      kind: "namespace",
      name: ".cx",
      entries: new Map<string, QValue>([
        ["_usage", qString(CX_USAGE)],
        ["from", { kind: "builtin", name: ".cx.from", arity: 1 }],
        ["new", { kind: "builtin", name: ".cx.new", arity: 2 }],
        ["z", { kind: "builtin", name: ".cx.z", arity: 2 }],
        ["zero", qComplex(0, 0)],
        ["one", qComplex(1, 0)],
        ["i", qComplex(0, 1)],
        ["re", { kind: "builtin", name: ".cx.re", arity: 1 }],
        ["im", { kind: "builtin", name: ".cx.im", arity: 1 }],
        ["conj", { kind: "builtin", name: ".cx.conj", arity: 1 }],
        ["neg", { kind: "builtin", name: ".cx.neg", arity: 1 }],
        ["add", { kind: "builtin", name: ".cx.add", arity: 2 }],
        ["sub", { kind: "builtin", name: ".cx.sub", arity: 2 }],
        ["mul", { kind: "builtin", name: ".cx.mul", arity: 2 }],
        ["div", { kind: "builtin", name: ".cx.div", arity: 2 }],
        ["abs", { kind: "builtin", name: ".cx.abs", arity: 1 }],
        ["modulus", { kind: "builtin", name: ".cx.modulus", arity: 1 }],
        ["floor", { kind: "builtin", name: ".cx.floor", arity: 1 }],
        ["ceil", { kind: "builtin", name: ".cx.ceil", arity: 1 }],
        ["round", { kind: "builtin", name: ".cx.round", arity: 1 }],
        ["frac", { kind: "builtin", name: ".cx.frac", arity: 1 }],
        ["mod", { kind: "builtin", name: ".cx.mod", arity: 2 }],
        ["arg", { kind: "builtin", name: ".cx.arg", arity: 1 }],
        ["recip", { kind: "builtin", name: ".cx.recip", arity: 1 }],
        ["normalize", { kind: "builtin", name: ".cx.normalize", arity: 1 }],
        ["fromPolar", { kind: "builtin", name: ".cx.fromPolar", arity: 2 }],
        ["polar", { kind: "builtin", name: ".cx.polar", arity: 1 }],
        ["exp", { kind: "builtin", name: ".cx.exp", arity: 1 }],
        ["log", { kind: "builtin", name: ".cx.log", arity: 1 }],
        ["pow", { kind: "builtin", name: ".cx.pow", arity: 2 }],
        ["powEach", { kind: "builtin", name: ".cx.powEach", arity: 2 }],
        ["sqrt", { kind: "builtin", name: ".cx.sqrt", arity: 1 }],
        ["sin", { kind: "builtin", name: ".cx.sin", arity: 1 }],
        ["cos", { kind: "builtin", name: ".cx.cos", arity: 1 }],
        ["tan", { kind: "builtin", name: ".cx.tan", arity: 1 }],
        ["str", { kind: "builtin", name: ".cx.str", arity: 1 }]
      ])
    });
  }

  private refreshDynamicNamespaces() {
    const now = this.host.now();
    const z = this.getDotted(".z");
    if (z.kind !== "namespace") {
      return;
    }
    z.entries.set("D", qString(now.toISOString().slice(0, 10).replace(/-/g, ".")));
    z.entries.set("T", qString(now.toTimeString().slice(0, 8)));
    z.entries.set("P", qString(now.toISOString()));
  }

  private getDotted(name: string): QValue {
    const parts = name.replace(/^\./, "").split(".");
    let current: QValue | undefined = this.env.get(`.${parts[0]}`) ?? this.env.get(parts[0]);
    if (!current) {
      current = this.env.get(parts[0]);
    }
    if (!current) {
      throw new QRuntimeError("name", `Unknown identifier: ${name}`);
    }
    for (const part of parts.slice(1)) {
      if (current.kind !== "namespace") {
        throw new QRuntimeError("type", `Cannot index into ${name}`);
      }
      const next = current.entries.get(part);
      if (!next) {
        throw new QRuntimeError("name", `Unknown identifier: ${name}`);
      }
      current = next;
    }
    return current;
  }
}

export const createSession = (host?: HostAdapter) => new Session(host);

export const evaluate = (source: string, session = createSession()): EvalResult =>
  session.evaluate(source);

export const formatValue = (
  value: QValue,
  options: FormatOptions = { trailingNewline: true }
): string => {
  const text = formatBare(value);
  return options.trailingNewline === false ? text : `${text}\n`;
};

export const listBuiltins = () => ({
  monads: [
    "abs",
    "all",
    "any",
    "til",
    "ceiling",
    "cols",
    "count",
    "desc",
    "exp",
    "first",
    "last",
    "log",
    "min",
    "max",
    "asc",
    "asin",
    "atan",
    "sum",
    "avg",
    "asin",
    "acos",
    "atan",
    "sin",
    "cos",
    "tan",
    "floor",
    "null",
    "reciprocal",
    "reverse",
    "signum",
    "sqrt",
    "neg",
    "not",
    "enlist",
    "distinct",
    "attr",
    "flip",
    "key",
    "lower",
    "upper",
    "cut",
    "prd",
    "prev",
    "var",
    "svar",
    "dev",
    "sdev",
    "deltas",
    "sums",
    "string",
    "type",
    "where",
    "value",
    "show",
    "system",
    "hopen",
    "hclose",
    "hcount",
    "hdel",
    "read0",
    "read1"
  ],
  diads: [
    "+",
    "-",
    "*",
    "%",
    "=",
    "<",
    ">",
    "<=",
    ">=",
    ",",
    "!",
    "#",
    "_",
    "~",
    "div",
    "mod",
    "^",
    "?",
    "$",
    "@",
    "in",
    "like",
    "|",
    "&",
    "cross",
    "within",
    "except",
    "inter",
    "union",
    "xlog",
    "cut",
    "xcol",
    "rotate",
    "sublist"
  ]
});

export const parse = (source: string): AstNode => {
  const parser = new Parser(tokenize(source));
  return parser.parseProgram(source);
};

export class Parser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly stopIdentifiers: Set<string>[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseProgram(source: string): AstNode {
    const statements: AstNode[] = [];
    while (!this.match("eof")) {
      this.skipSeparators();
      if (this.peek().kind === "eof") {
        break;
      }
      statements.push(this.parseStatement());
      this.skipSeparators();
    }
    return { kind: "program", statements, source };
  }

  private parseStatement(): AstNode {
    if (this.peek().kind === "operator" && this.peek().value === ":") {
      this.consume("operator", ":");
      return { kind: "return", value: this.parseExpression() };
    }
    return this.parseExpression();
  }

  private parseExpression(): AstNode {
    if (this.peek().kind === "identifier") {
      switch (this.peek().value) {
        case "select":
          return this.parseSelectExpression();
        case "exec":
          return this.parseExecExpression();
        case "update":
          return this.parseUpdateExpression();
        case "delete":
          return this.parseDeleteExpression();
      }
    }
    return this.parseAssignment();
  }

  private parseSelectExpression(): AstNode {
    this.consume("identifier", "select");
    const columns = this.peek().kind === "identifier" && this.peek().value === "from"
      ? null
      : this.parseSelectColumns();
    this.consume("identifier", "from");
    const source = this.withStopIdentifiers(["where"], () => this.parseAssignment());
    const where = this.parseOptionalWhereClause();
    return { kind: "select", columns, source, where };
  }

  private parseExecExpression(): AstNode {
    this.consume("identifier", "exec");
    const value = this.withStopIdentifiers(["from"], () => this.parseAssignment());
    this.consume("identifier", "from");
    const source = this.withStopIdentifiers(["where"], () => this.parseAssignment());
    const where = this.parseOptionalWhereClause();
    return { kind: "exec", value, source, where };
  }

  private parseUpdateExpression(): AstNode {
    this.consume("identifier", "update");
    const updates = this.parseUpdateClauses();
    this.consume("identifier", "from");
    const source = this.withStopIdentifiers(["where"], () => this.parseAssignment());
    const where = this.parseOptionalWhereClause();
    return { kind: "update", updates, source, where };
  }

  private parseDeleteExpression(): AstNode {
    this.consume("identifier", "delete");
    const columns =
      this.peek().kind === "identifier" && this.peek().value === "from"
        ? null
        : this.parseDeleteColumns();
    this.consume("identifier", "from");
    const source = this.withStopIdentifiers(["where"], () => this.parseAssignment());
    const where = this.parseOptionalWhereClause();
    return { kind: "delete", columns, source, where };
  }

  private parseSelectColumns() {
    const columns: { name: string | null; value: AstNode }[] = [];
    while (!this.match("eof")) {
      const value = this.withStopIdentifiers(["from"], () => this.parseAssignment());
      columns.push(value.kind === "assign" ? { name: value.name, value: value.value } : { name: null, value });
      if (this.peek().kind === "operator" && this.peek().value === ",") {
        this.consume("operator", ",");
        continue;
      }
      break;
    }
    return columns;
  }

  private parseUpdateClauses() {
    const updates: { name: string; value: AstNode }[] = [];
    while (!this.match("eof")) {
      const update = this.withStopIdentifiers(["from"], () => this.parseAssignment());
      if (update.kind !== "assign") {
        throw new QRuntimeError("parse", "update expects assignment clauses");
      }
      updates.push({ name: update.name, value: update.value });
      if (this.peek().kind === "operator" && this.peek().value === ",") {
        this.consume("operator", ",");
        continue;
      }
      break;
    }
    return updates;
  }

  private parseDeleteColumns() {
    const columns: string[] = [];
    while (!this.match("eof")) {
      if (this.peek().kind !== "identifier") {
        throw new QRuntimeError("parse", "delete expects column names");
      }
      columns.push(this.consume("identifier").value);
      if (this.peek().kind === "operator" && this.peek().value === ",") {
        this.consume("operator", ",");
        continue;
      }
      break;
    }
    return columns;
  }

  private parseOptionalWhereClause() {
    if (this.peek().kind === "identifier" && this.peek().value === "where") {
      this.consume("identifier", "where");
      return this.parseAssignment();
    }
    return null;
  }

  private withStopIdentifiers<T>(stops: string[], fn: () => T): T {
    this.stopIdentifiers.push(new Set(stops));
    try {
      return fn();
    } finally {
      this.stopIdentifiers.pop();
    }
  }

  private isStopIdentifier(token: Token) {
    return token.kind === "identifier" && this.stopIdentifiers.some((stops) => stops.has(token.value));
  }

  private parseAssignment(): AstNode {
    if (
      this.peek().kind === "identifier" &&
      this.peek(1).kind === "operator" &&
      this.peek(1).value === ":"
    ) {
      const name = this.consume("identifier").value;
      this.consume("operator", ":");
      return { kind: "assign", name, value: this.parseAssignment() };
    }
    return this.parseBinary();
  }

  private parseBinary(): AstNode {
    return this.parseBinaryTail(this.parseApplication());
  }

  private parseApplication(): AstNode {
    let callee = this.parsePrimary();

    while (true) {
      if (this.peek().kind === "lbracket") {
        const args = this.parseBracketArgs();
        callee = { kind: "call", callee, args };
        continue;
      }
      if (
        this.peek().kind === "operator" &&
        this.peek().value === "'" &&
        this.peek(1).kind === "lbracket"
      ) {
        this.consume("operator", "'");
        const args = this.parseBracketArgs();
        callee = { kind: "eachCall", callee, args };
        continue;
      }
      break;
    }

    if (this.peek().kind === "identifier" && this.peek().value === "each") {
      this.consume("identifier", "each");
      return { kind: "each", callee, arg: this.parseAssignment() };
    }

    if (
      callee.kind === "identifier" &&
      MONAD_KEYWORDS.has(callee.name) &&
      this.canStartPrimary(this.peek()) &&
      !this.isStopIdentifier(this.peek())
    ) {
      return {
        kind: "call",
        callee,
        args: [this.parseAssignment()]
      };
    }

    const adjacent: AstNode[] = [];
    while (this.canStartPrimary(this.peek()) && !this.isStopIdentifier(this.peek())) {
      if (this.peek().kind === "identifier" && WORD_DIAD_KEYWORDS.has(this.peek().value)) {
        break;
      }
      if (
        adjacent.length === 0 &&
        isCallableAst(callee) &&
        (this.peek().kind === "lparen" || this.peek().kind === "lbrace")
      ) {
        adjacent.push(this.parseBinary());
        continue;
      }
      adjacent.push(this.parseAdjacentArgument());
      if (this.peek().kind === "lbracket") {
        const nestedArgs = this.parseBracketArgs();
        const last = adjacent.pop()!;
        adjacent.push({ kind: "call", callee: last, args: nestedArgs });
      }
    }

    if (adjacent.length === 0) {
      return callee;
    }

    if (callee.kind === "string") {
      return {
        kind: "call",
        callee,
        args: [adjacent.length === 1 ? adjacent[0] : { kind: "vector", items: adjacent }]
      };
    }

    if (isCallableAst(callee)) {
      const chained =
        callee.kind === "identifier" || callee.kind === "lambda" || callee.kind === "group"
          ? this.collapseAdjacentCallChain(adjacent)
          : null;
      if (chained) {
        return { kind: "call", callee, args: [chained] };
      }
      return { kind: "call", callee, args: adjacent };
    }

    return { kind: "vector", items: [callee, ...adjacent] };
  }

  private parseAdjacentArgument(): AstNode {
    if (
      this.peek().kind === "identifier" &&
      this.peek(1).kind === "operator" &&
      this.peek(1).value === ":"
    ) {
      return this.parseAssignment();
    }
    const left = this.parsePrimary();
    if (left.kind === "identifier" && left.name === "flip" && this.canStartPrimary(this.peek())) {
      return {
        kind: "call",
        callee: left,
        args: [this.parseBinary()]
      };
    }
    if (this.peek().kind === "operator" && this.peek().value === "$") {
      const op = this.consume("operator").value;
      const right = this.parseBinary();
      return { kind: "binary", op, left, right };
    }
    return left;
  }

  private collapseAdjacentCallChain(items: AstNode[]): AstNode | null {
    if (items.length < 2 || !isCallableAst(items[0]!)) {
      return null;
    }

    const [head, ...rest] = items;
    const nested = this.collapseAdjacentCallChain(rest);
    const arg =
      nested ?? (rest.length === 1 ? rest[0]! : { kind: "vector", items: rest });

    return { kind: "call", callee: head, args: [arg] };
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (this.isStopIdentifier(token)) {
      throw new QRuntimeError("parse", `Unexpected identifier ${token.value}`);
    }
    switch (token.kind) {
      case "number":
        return { kind: "number", value: this.consume("number").value };
      case "date":
        return { kind: "date", value: this.consume("date").value };
      case "string":
        return { kind: "string", value: this.consume("string").value };
      case "symbol":
        return { kind: "symbol", value: this.consume("symbol").value };
      case "boolean":
        return { kind: "boolean", value: this.consume("boolean").value === "1b" };
      case "boolvector": {
        const value = this.consume("boolvector").value;
        return {
          kind: "vector",
          items: [...value.slice(0, -1)].map<AstNode>((digit) => ({
            kind: "boolean",
            value: digit === "1"
          }))
        };
      }
      case "null":
        this.consume("null");
        return { kind: "null" };
      case "identifier":
        return { kind: "identifier", name: this.consume("identifier").value };
      case "operator":
        return this.parseOperatorValue();
      case "lparen": {
        this.consume("lparen");
        if (this.peek().kind === "rparen") {
          this.consume("rparen");
          return { kind: "list", items: [] };
        }
        if (this.peek().kind === "lbracket") {
          return this.peek(1).kind === "rbracket"
            ? this.parseTableLiteral()
            : this.parseKeyedTableLiteral();
        }
        const first = this.parseExpression();
        if (this.peek().kind === "separator") {
          const items = [first];
          while (this.peek().kind === "separator") {
            this.consume("separator");
            if (this.peek().kind === "rparen") {
              break;
            }
            items.push(this.parseExpression());
          }
          this.consume("rparen");
          return { kind: "list", items };
        }
        this.consume("rparen");
        return { kind: "group", value: first };
      }
      case "lbrace":
        return this.parseLambda();
      default:
        throw new QRuntimeError("parse", `Unexpected token: ${token.kind} ${token.value}`);
    }
  }

  private parseOperatorValue(): AstNode {
    const base = this.consume("operator").value;
    if (base === ":" || base === ";") {
      throw new QRuntimeError("parse", `Unexpected token: operator ${base}`);
    }

    let name = base;
    while (this.peek().kind === "operator") {
      const suffix = this.peek().value;
      if (suffix === "'" && !name.endsWith("'") && !name.endsWith(":")) {
        name += this.consume("operator").value;
        continue;
      }
      if (suffix === ":" && !name.endsWith(":")) {
        name += this.consume("operator").value;
        continue;
      }
      break;
    }

    return { kind: "identifier", name };
  }

  private parseTableLiteral(): AstNode {
    this.consume("lbracket");
    this.consume("rbracket");
    const columns = this.parseColumnDefinitions("rparen");
    this.consume("rparen");
    return { kind: "table", columns };
  }

  private parseKeyedTableLiteral(): AstNode {
    this.consume("lbracket");
    const keys = this.parseColumnDefinitions("rbracket");
    this.consume("rbracket");
    if (this.peek().kind === "separator") {
      this.consume("separator");
    }
    const values = this.parseColumnDefinitions("rparen");
    this.consume("rparen");
    return { kind: "keyedTable", keys, values };
  }

  private parseColumnDefinitions(endToken: "rparen" | "rbracket") {
    const columns: { name: string; value: AstNode }[] = [];
    while (this.peek().kind !== endToken && this.peek().kind !== "eof") {
      this.skipSeparators();
      if (this.peek().kind === endToken) {
        break;
      }

      if (this.peek().kind === "identifier") {
        const name = this.consume("identifier").value;
        if (this.peek().kind === "operator" && this.peek().value === ":") {
          this.consume("operator", ":");
          columns.push({ name, value: this.parseExpression() });
        } else {
          columns.push({ name, value: { kind: "identifier", name } });
        }
      } else {
        const autoName = columns.length === 0 ? "x" : `x${columns.length}`;
        columns.push({ name: autoName, value: this.parseExpression() });
      }

      if (this.peek().kind === "separator") {
        this.consume("separator");
      }
    }
    return columns;
  }

  private parseLambda(): AstNode {
    const sourceTokens: string[] = [];
    this.consume("lbrace");
    sourceTokens.push("{");

    let params: string[] | null = null;
    if (this.peek().kind === "lbracket") {
      this.consume("lbracket");
      sourceTokens.push("[");
      params = [];
      while (this.peek().kind !== "rbracket") {
        if (this.peek().kind === "identifier") {
          params.push(this.consume("identifier").value);
          sourceTokens.push(params[params.length - 1]);
        } else if (this.peek().kind === "separator") {
          this.consume("separator");
          sourceTokens.push(";");
        } else {
          throw new QRuntimeError("parse", "Invalid lambda parameter list");
        }
      }
      this.consume("rbracket");
      sourceTokens.push("]");
    }

    const body: AstNode[] = [];
    while (this.peek().kind !== "rbrace" && this.peek().kind !== "eof") {
      this.skipSeparators();
      if (this.peek().kind === "rbrace") {
        break;
      }
      const statement = this.parseStatement();
      body.push(statement);
      sourceTokens.push(renderAst(statement));
      this.skipSeparators();
      if (this.peek().kind === "separator") {
        this.consume("separator");
        sourceTokens.push(";");
      }
    }
    this.consume("rbrace");
    sourceTokens.push("}");
    return {
      kind: "lambda",
      params,
      body,
      source: sourceTokens.join("")
    };
  }

  private parseBracketArgs(): AstNode[] {
    this.consume("lbracket");
    const args: AstNode[] = [];
    while (this.peek().kind !== "rbracket") {
      if (this.peek().kind === "separator") {
        args.push({ kind: "placeholder" });
        this.consume("separator");
        continue;
      }
      args.push(this.parseExpression());
      if (this.peek().kind === "separator") {
        this.consume("separator");
        if (this.peek().kind === "rbracket") {
          args.push({ kind: "placeholder" });
        }
      }
    }
    this.consume("rbracket");
    return args;
  }

  private skipSeparators() {
    while (this.peek().kind === "newline" || this.peek().kind === "separator") {
      this.index += 1;
    }
  }

  private canStartPrimary(token: Token): boolean {
    return [
      "number",
      "date",
      "string",
      "symbol",
      "boolean",
      "boolvector",
      "null",
      "identifier",
      "lparen",
      "lbrace"
    ].includes(token.kind);
  }

  private peek(offset = 0): Token {
    return this.tokens[this.index + offset] ?? { kind: "eof", value: "" };
  }

  private match(kind: string): boolean {
    return this.peek().kind === kind;
  }

  private consume(kind: string, value?: string): Token {
    const token = this.peek();
    if (token.kind !== kind || (value !== undefined && token.value !== value)) {
      throw new QRuntimeError(
        "parse",
        `Expected ${kind}${value ? ` ${value}` : ""} but found ${token.kind} ${token.value}`
      );
    }
    this.index += 1;
    return token;
  }

  private parseBinaryTail(left: AstNode): AstNode {
    if (this.isStopIdentifier(this.peek())) {
      return left;
    }
    if (this.peek().kind === "identifier" && WORD_DIAD_KEYWORDS.has(this.peek().value)) {
      const op = this.consume("identifier").value;
      const right = this.parseBinary();
      return { kind: "binary", op, left, right };
    }
    if (this.peek().kind === "operator" && this.peek().value !== ":" && this.peek().value !== ";") {
      const op = this.consume("operator").value;
      if (["separator", "rparen", "rbracket", "rbrace", "eof"].includes(this.peek().kind)) {
        return { kind: "call", callee: { kind: "identifier", name: op }, args: [left] };
      }
      const right = this.parseBinary();
      return { kind: "binary", op, left, right };
    }
    return left;
  }
}

export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === " " || char === "\t" || char === "\r") {
      i += 1;
      continue;
    }

    if (char === "/") {
      const previous = source[i - 1] ?? "\n";
      const next = source[i + 1] ?? "";
      const inCommentPosition =
        next !== ":" &&
        (i === 0 ||
          previous === "\n" ||
          previous === ";" ||
          previous === " " ||
          previous === "\t" ||
          previous === "\r");
      if (inCommentPosition) {
        while (i < source.length && source[i] !== "\n") {
          i += 1;
        }
        continue;
      }
    }

    if (char === "\n") {
      tokens.push({ kind: "newline", value: "\n" });
      i += 1;
      continue;
    }

    if (char === ";") {
      tokens.push({ kind: "separator", value: ";" });
      i += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ kind: "lparen", value: char });
      i += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: "rparen", value: char });
      i += 1;
      continue;
    }

    if (char === "[") {
      tokens.push({ kind: "lbracket", value: char });
      i += 1;
      continue;
    }

    if (char === "]") {
      tokens.push({ kind: "rbracket", value: char });
      i += 1;
      continue;
    }

    if (char === "{") {
      tokens.push({ kind: "lbrace", value: char });
      i += 1;
      continue;
    }

    if (char === "}") {
      tokens.push({ kind: "rbrace", value: char });
      i += 1;
      continue;
    }

    if (char === "_") {
      tokens.push({ kind: "operator", value: char });
      i += 1;
      continue;
    }

    if (char === "\"") {
      let value = "";
      i += 1;
      while (i < source.length && source[i] !== "\"") {
        if (source[i] === "\\" && i + 1 < source.length) {
          value += source[i + 1];
          i += 2;
        } else {
          value += source[i];
          i += 1;
        }
      }
      i += 1;
      tokens.push({ kind: "string", value });
      continue;
    }

    if (char === "`") {
      let value = "";
      i += 1;
      while (i < source.length && /[a-zA-Z0-9_./:]/.test(source[i])) {
        value += source[i];
        i += 1;
      }
      tokens.push({ kind: "symbol", value });
      continue;
    }

    const booleanMatch = source.slice(i).match(/^[01]+b/);
    if (booleanMatch) {
      tokens.push({
        kind: booleanMatch[0].length === 2 ? "boolean" : "boolvector",
        value: booleanMatch[0]
      });
      i += booleanMatch[0].length;
      continue;
    }

    const nullMatch = source.slice(i).match(/^(0Wj|-0Wj|0N|0n|-0W|0W|-0w|0w)/);
    if (nullMatch) {
      tokens.push({ kind: "number", value: nullMatch[1] });
      i += nullMatch[1].length;
      continue;
    }

    const dateMatch = source.slice(i).match(/^\d{4}\.\d{2}\.\d{2}/);
    if (dateMatch) {
      tokens.push({ kind: "date", value: dateMatch[0] });
      i += dateMatch[0].length;
      continue;
    }

    const canStartSignedNumber =
      i === 0 ||
      [" ", "\t", "\r", "\n", "(", "[", "{", ";", ":"].includes(source[i - 1] ?? "") ||
      "+-*%=<>,!#_~?/^&|\\'$".includes(source[i - 1] ?? "");
    const numberPattern = canStartSignedNumber
      ? /^-?(?:\d+\.\d+|\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fhij]?/
      : /^(?:\d+\.\d+|\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fhij]?/;
    const numberMatch = source.slice(i).match(numberPattern);
    if (numberMatch) {
      tokens.push({ kind: "number", value: numberMatch[0] });
      i += numberMatch[0].length;
      continue;
    }

    const identifierMatch = source.slice(i).match(/^[a-zA-Z_.][a-zA-Z0-9_.]*/);
    if (identifierMatch) {
      tokens.push({ kind: "identifier", value: identifierMatch[0] });
      i += identifierMatch[0].length;
      continue;
    }

    const opMatch = source.slice(i).match(/^(<=|>=|<>|\/:|\\:|[+\-*%=<>,!#_~:?/^&|@\\'$])/);
    if (opMatch) {
      tokens.push({ kind: "operator", value: opMatch[1] });
      i += opMatch[1].length;
      continue;
    }

    throw new QRuntimeError("parse", `Unexpected character: ${char}`);
  }

  tokens.push({ kind: "eof", value: "" });
  return tokens;
};

const isCallableAst = (node: AstNode) =>
  node.kind === "identifier" ||
  node.kind === "lambda" ||
  node.kind === "call" ||
  node.kind === "group" ||
  node.kind === "list" ||
  node.kind === "table" ||
  node.kind === "keyedTable";

const isShowExpression = (node: AstNode): boolean =>
  node.kind === "call" &&
  node.callee.kind === "identifier" &&
  node.callee.name === "show";

const isSilentExpression = (node: AstNode): boolean =>
  node.kind === "assign" || isShowExpression(node);

const renderAst = (node: AstNode): string => {
  switch (node.kind) {
    case "return":
      return `:${renderAst(node.value)}`;
    case "identifier":
      return node.name;
    case "number":
    case "date":
    case "string":
    case "symbol":
      return node.value;
    case "boolean":
      return node.value ? "1b" : "0b";
    case "null":
      return "0N";
    case "placeholder":
      return "";
    case "vector":
      return node.items.map(renderAst).join(" ");
    case "list":
      return `(${node.items.map(renderAst).join(";")})`;
    case "table":
      return `([] ${node.columns
        .map((column) => `${column.name}:${renderAst(column.value)}`)
        .join(";")})`;
    case "keyedTable":
      return `([${node.keys
        .map((column) => `${column.name}:${renderAst(column.value)}`)
        .join(";")}]; ${node.values
        .map((column) => `${column.name}:${renderAst(column.value)}`)
        .join(";")})`;
    case "select":
      return `select ${node.columns ? node.columns.map((column) => column.name ? `${column.name}:${renderAst(column.value)}` : renderAst(column.value)).join(",") : ""} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "exec":
      return `exec ${renderAst(node.value)} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "update":
      return `update ${node.updates.map((update) => `${update.name}:${renderAst(update.value)}`).join(",")} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "delete":
      return `delete ${node.columns ? node.columns.join(",") : ""} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "each":
      return `${renderAst(node.callee)}each ${renderAst(node.arg)}`;
    case "eachCall":
      return `${renderAst(node.callee)}'[${node.args.map(renderAst).join(";")}]`;
    case "group":
      return `(${renderAst(node.value)})`;
    case "binary":
      return `${renderAst(node.left)}${node.op}${renderAst(node.right)}`;
    case "assign":
      return `${node.name}:${renderAst(node.value)}`;
    case "call":
      return `${renderAst(node.callee)}[${node.args.map(renderAst).join(";")}]`;
    case "lambda":
      return node.source;
    case "program":
      return node.statements.map(renderAst).join(";");
  }
};

const parseNumericLiteral = (raw: string): QValue => {
  if (raw === "0N") {
    return qInt(0, "intNull");
  }
  if (raw === "0n") {
    return qFloat(Number.NaN, "null");
  }
  if (raw === "0W" || raw === "0w") {
    return qFloat(Number.POSITIVE_INFINITY, "posInf");
  }
  if (raw === "-0W" || raw === "-0w") {
    return qFloat(Number.NEGATIVE_INFINITY, "negInf");
  }
  if (raw === "0Wj") {
    return qFloat(9.223372036854776e18);
  }
  if (raw === "-0Wj") {
    return qFloat(-9.223372036854776e18);
  }
  if (raw.endsWith("h")) {
    return qShort(Number.parseInt(raw.slice(0, -1), 10));
  }
  if (/[.ef]/.test(raw)) {
    return qFloat(Number.parseFloat(raw));
  }
  return qInt(Number.parseInt(raw, 10));
};

const lambdaArity = (lambda: LambdaValue): number => {
  if (lambda.params) {
    return lambda.params.length;
  }

  const used = new Set<string>();
  for (const statement of lambda.body) {
    collectImplicitParams(statement, used);
  }

  if (used.has("z")) {
    return 3;
  }
  if (used.has("y")) {
    return 2;
  }
  if (used.has("x")) {
    return 1;
  }
  return 0;
};

const collectImplicitParams = (node: AstNode, used: Set<string>) => {
  switch (node.kind) {
    case "identifier":
      if (node.name === "x" || node.name === "y" || node.name === "z") {
        used.add(node.name);
      }
      return;
    case "assign":
      collectImplicitParams(node.value, used);
      return;
    case "vector":
    case "list":
      node.items.forEach((item) => collectImplicitParams(item, used));
      return;
    case "table":
      node.columns.forEach((column) => collectImplicitParams(column.value, used));
      return;
    case "keyedTable":
      node.keys.forEach((column) => collectImplicitParams(column.value, used));
      node.values.forEach((column) => collectImplicitParams(column.value, used));
      return;
    case "select":
      node.columns?.forEach((column) => collectImplicitParams(column.value, used));
      collectImplicitParams(node.source, used);
      if (node.where) {
        collectImplicitParams(node.where, used);
      }
      return;
    case "exec":
      collectImplicitParams(node.value, used);
      collectImplicitParams(node.source, used);
      if (node.where) {
        collectImplicitParams(node.where, used);
      }
      return;
    case "update":
      node.updates.forEach((update) => collectImplicitParams(update.value, used));
      collectImplicitParams(node.source, used);
      if (node.where) {
        collectImplicitParams(node.where, used);
      }
      return;
    case "delete":
      collectImplicitParams(node.source, used);
      if (node.where) {
        collectImplicitParams(node.where, used);
      }
      return;
    case "binary":
      collectImplicitParams(node.left, used);
      collectImplicitParams(node.right, used);
      return;
    case "call":
      collectImplicitParams(node.callee, used);
      node.args.forEach((arg) => collectImplicitParams(arg, used));
      return;
    case "each":
      collectImplicitParams(node.callee, used);
      collectImplicitParams(node.arg, used);
      return;
    case "eachCall":
      collectImplicitParams(node.callee, used);
      node.args.forEach((arg) => collectImplicitParams(arg, used));
      return;
    case "group":
      collectImplicitParams(node.value, used);
      return;
    case "lambda":
    case "program":
      return;
    default:
      return;
  }
};

const asList = (value: QValue): QList => {
  if (value.kind !== "list") {
    throw new QRuntimeError("type", "Expected list");
  }
  return value;
};

const toNumber = (value: QValue): number => {
  if (value.kind === "boolean") {
    return value.value ? 1 : 0;
  }
  if (value.kind !== "number") {
    throw new QRuntimeError("type", "Expected numeric value");
  }
  return value.value;
};

const numeric = (value: number, float = false): QNumber =>
  float || !Number.isInteger(value) ? qFloat(value) : qInt(value);

const unaryNumeric = (value: QValue, mapper: (input: number) => number): QValue =>
  value.kind === "list"
    ? qList(value.items.map((item) => unaryNumeric(item, mapper)), value.homogeneous ?? false)
    : qFloat(mapper(toNumber(value)));

const roundHalfAwayFromZero = (value: number) =>
  value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);

const qComplex = (re: number, im: number): QDictionary =>
  qDictionary([qSymbol("re"), qSymbol("im")], [qFloat(re), qFloat(im)]);

const complexDictionaryField = (value: QDictionary, field: "re" | "im") => {
  const index = value.keys.findIndex((key) => key.kind === "symbol" && key.value === field);
  return index >= 0 ? value.values[index] : undefined;
};

const complexParts = (value: QValue): { re: number; im: number } => {
  if (value.kind === "number") {
    return { re: value.value, im: 0 };
  }
  if (
    value.kind === "list" &&
    value.items.length === 2 &&
    value.items.every((item) => item.kind === "number")
  ) {
    return {
      re: value.items[0]!.value,
      im: value.items[1]!.value
    };
  }
  if (value.kind === "dictionary") {
    const re = complexDictionaryField(value, "re");
    const im = complexDictionaryField(value, "im");
    if (re?.kind === "number" && im?.kind === "number") {
      return { re: re.value, im: im.value };
    }
  }
  throw new QRuntimeError("type", CX_USAGE);
};

const qComplexFromValue = (value: QValue) => {
  const parts = complexParts(value);
  return qComplex(parts.re, parts.im);
};

const complexArg = (value: { re: number; im: number }) => {
  if (value.re === 0 && value.im === 0) {
    return 0;
  }
  return Math.atan2(value.im, value.re);
};

const positiveModulo = (left: number, right: number) =>
  left - right * Math.floor(left / right);

const complexModulo = (left: QValue, right: QValue) => {
  const value = complexParts(left);
  if (right.kind === "number") {
    if (right.value === 0) {
      throw new QRuntimeError("domain", "domain");
    }
    return qComplex(positiveModulo(value.re, right.value), positiveModulo(value.im, right.value));
  }
  const divisor = complexParts(right);
  if (divisor.re === 0 || divisor.im === 0) {
    throw new QRuntimeError("domain", "domain");
  }
  return qComplex(
    positiveModulo(value.re, divisor.re),
    positiveModulo(value.im, divisor.im)
  );
};

const dictionaryKeysMatch = (left: QDictionary, right: QDictionary) =>
  left.keys.length === right.keys.length &&
  left.keys.every((key, index) => equals(key, right.keys[index]!));

const applyDictionaryBinary = (
  left: QValue,
  right: QValue,
  mapper: (a: QValue, b: QValue) => QValue
): QValue | null => {
  if (left.kind === "dictionary" && right.kind === "dictionary") {
    if (!dictionaryKeysMatch(left, right)) {
      throw new QRuntimeError("length", "Dictionary keys differ");
    }
    return qDictionary(
      left.keys,
      left.values.map((value, index) => mapper(value, right.values[index]!))
    );
  }
  if (left.kind === "dictionary") {
    return qDictionary(left.keys, left.values.map((value) => mapper(value, right)));
  }
  if (right.kind === "dictionary") {
    return qDictionary(right.keys, right.values.map((value) => mapper(left, value)));
  }
  return null;
};

const add = (a: QValue, b: QValue): QValue =>
  applyDictionaryBinary(a, b, add) ?? numeric(toNumber(a) + toNumber(b));
const subtract = (a: QValue, b: QValue): QValue =>
  applyDictionaryBinary(a, b, subtract) ?? numeric(toNumber(a) - toNumber(b));
const multiply = (a: QValue, b: QValue): QValue =>
  applyDictionaryBinary(a, b, multiply) ?? numeric(toNumber(a) * toNumber(b));
const divide = (a: QValue, b: QValue): QValue =>
  applyDictionaryBinary(a, b, divide) ?? qFloat(toNumber(a) / toNumber(b));
const divValue = (a: QValue, b: QValue): QValue => qInt(Math.floor(toNumber(a) / toNumber(b)));
const modValue = (a: QValue, b: QValue): QValue => {
  const left = toNumber(a);
  const right = toNumber(b);
  return qInt(left - right * Math.floor(left / right));
};

const compare = (a: QValue, b: QValue): number => {
  if (a.kind === "number" && b.kind === "number") {
    return toNumber(a) - toNumber(b);
  }
  const left = formatBare(a);
  const right = formatBare(b);
  return left.localeCompare(right);
};

const compareValue = (a: QValue, b: QValue) => compare(a, b);

const equals = (a: QValue, b: QValue): boolean =>
  JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));

const numericUnary = (value: QValue, fn: (input: number) => number): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map((item) => numericUnary(item, fn)), value.homogeneous ?? false);
  }
  if (value.kind !== "number") {
    throw new QRuntimeError("type", "Expected numeric value");
  }
  if (value.special === "null" || value.special === "intNull") {
    return qFloat(Number.NaN, "null");
  }
  return qFloat(fn(value.value));
};

const mapBinary = (left: QValue, right: QValue, mapper: (a: QValue, b: QValue) => QValue): QValue => {
  if (left.kind === "list" && right.kind === "list") {
    if (left.items.length !== right.items.length) {
      throw new QRuntimeError("length", "Vector lengths differ");
    }
    return qList(
      left.items.map((item, index) => mapBinary(item, right.items[index]!, mapper)),
      left.homogeneous ?? right.homogeneous ?? false
    );
  }
  if (left.kind === "list") {
    return qList(left.items.map((item) => mapBinary(item, right, mapper)), left.homogeneous ?? false);
  }
  if (right.kind === "list") {
    return qList(right.items.map((item) => mapBinary(left, item, mapper)), right.homogeneous ?? false);
  }
  return mapper(left, right);
};

const countValue = (value: QValue) => {
  switch (value.kind) {
    case "list":
      return value.items.length;
    case "string":
      return value.value.length;
    case "dictionary":
      return value.keys.length;
    case "table":
      return Object.values(value.columns)[0]?.items.length ?? 0;
    case "keyedTable":
      return countValue(value.keys);
    default:
      return 1;
  }
};

const absValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(absValue), value.homogeneous ?? false);
  }
  return numeric(Math.abs(toNumber(value)));
};

const allValue = (value: QValue): QValue =>
  qBool(value.kind === "list" ? value.items.every(isTruthy) : isTruthy(value));

const anyValue = (value: QValue): QValue =>
  qBool(value.kind === "list" ? value.items.some(isTruthy) : isTruthy(value));

const ceilingValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(ceilingValue), value.homogeneous ?? false);
  }
  return qInt(Math.ceil(toNumber(value)));
};

const colsValue = (value: QValue): QValue => {
  if (value.kind === "table") {
    return qList(Object.keys(value.columns).map((name) => qSymbol(name)), true);
  }
  if (value.kind === "keyedTable") {
    return qList(
      [...Object.keys(value.keys.columns), ...Object.keys(value.values.columns)].map((name) => qSymbol(name)),
      true
    );
  }
  throw new QRuntimeError("type", "cols expects a table");
};

const firstValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return value.items[0] ?? qNull();
  }
  if (value.kind === "dictionary") {
    return value.values[0] ?? qNull();
  }
  if (value.kind === "string") {
    return qString(value.value[0] ?? "");
  }
  return value;
};

const lastValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return value.items.at(-1) ?? qNull();
  }
  if (value.kind === "dictionary") {
    return value.values.at(-1) ?? qNull();
  }
  if (value.kind === "string") {
    return qString(value.value.at(-1) ?? "");
  }
  return value;
};

const ascValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList([...value.items].sort(compareValue), value.homogeneous ?? false, "s");
  }
  if (value.kind === "string") {
    return qString([...value.value].sort((a, b) => a.localeCompare(b)).join(""));
  }
  return value;
};

const descValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList([...value.items].sort((a, b) => compareValue(b, a)), value.homogeneous ?? false, "s");
  }
  if (value.kind === "string") {
    return qString([...value.value].sort((a, b) => b.localeCompare(a)).join(""));
  }
  return value;
};

const attrValue = (value: QValue): QValue =>
  value.kind === "list" && value.attribute ? qSymbol(value.attribute) : qSymbol("");

const sumValue = (value: QValue): QValue => {
  if (value.kind !== "list") {
    return value;
  }
  const items = value.items.filter((item) => !isNullish(item));
  return items.reduce((acc, item) => add(acc, item), qInt(0));
};

const minValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qString([...value.value].sort((a, b) => a.localeCompare(b))[0] ?? "");
  }
  if (value.kind !== "list") {
    return value;
  }
  const list = asList(value);
  const items = list.items.filter((item) => !isNullish(item));
  if (items.length === 0) {
    if (list.attribute === "int") {
      return qInt(Number.POSITIVE_INFINITY, "intPosInf");
    }
    return qFloat(Number.POSITIVE_INFINITY, "posInf");
  }
  return items.reduce((acc, item) => (compare(item, acc) < 0 ? item : acc));
};

const maxValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qString([...value.value].sort((a, b) => a.localeCompare(b)).at(-1) ?? "");
  }
  if (value.kind !== "list") {
    return value;
  }
  const list = asList(value);
  const items = list.items.filter((item) => !isNullish(item));
  if (items.length === 0) {
    if (list.attribute === "int") {
      return qInt(Number.NEGATIVE_INFINITY, "intNegInf");
    }
    return qFloat(Number.NEGATIVE_INFINITY, "negInf");
  }
  return items.reduce((acc, item) => (compare(item, acc) > 0 ? item : acc));
};

const minPair = (left: QValue, right: QValue): QValue =>
  compare(left, right) <= 0 ? left : right;

const maxPair = (left: QValue, right: QValue): QValue =>
  compare(left, right) >= 0 ? left : right;

const avgValue = (value: QValue): QValue => {
  const list = asList(value);
  const items = list.items.filter((item) => !isNullish(item));
  if (items.length === 0) {
    return qFloat(Number.NaN, "null");
  }
  const total = sumValue(qList(items, list.homogeneous ?? false));
  return qFloat(toNumber(total) / items.length);
};

const productValue = (value: QValue): QValue => {
  if (value.kind !== "list") {
    return value;
  }
  return value.items.reduce((acc, item) => multiply(acc, item), qInt(1));
};

const prevValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qString(` ${value.value.slice(0, -1)}`);
  }
  const list = asList(value);
  if (list.items.length === 0) {
    return qList([], list.homogeneous ?? false);
  }
  return qList(
    [nullLike(list.items[0]), ...list.items.slice(0, -1)],
    list.homogeneous ?? false
  );
};

const sumsValue = (value: QValue): QValue => {
  const list = asList(value);
  let running: QValue = qInt(0);
  return qList(
    list.items.map((item) => {
      running = add(running, item);
      return running;
    }),
    list.homogeneous ?? false
  );
};

const varianceValue = (value: QValue, sample: boolean): QValue => {
  const list = asList(value);
  const items = list.items.filter((item) => !isNullish(item));
  if (items.length === 0 || (sample && items.length < 2)) {
    return qFloat(Number.NaN, "null");
  }

  const numbers = items.map(toNumber);
  const mean = numbers.reduce((sum, current) => sum + current, 0) / numbers.length;
  const divisor = sample ? numbers.length - 1 : numbers.length;
  const variance =
    numbers.reduce((sum, current) => sum + (current - mean) ** 2, 0) / divisor;
  return qFloat(variance);
};

const deviationValue = (value: QValue, sample: boolean): QValue => {
  const variance = varianceValue(value, sample);
  return variance.kind === "number" && variance.special === "null"
    ? variance
    : qFloat(Math.sqrt(toNumber(variance)));
};

const deltasValue = (value: QValue, seed?: QValue): QValue => {
  const list = asList(value);
  if (list.items.length === 0) {
    return qList([], list.homogeneous ?? false);
  }

  return qList(
    list.items.map((item, index) => {
      if (index === 0) {
        return seed === undefined ? item : subtract(item, seed);
      }
      return subtract(item, list.items[index - 1] ?? qNull());
    }),
    list.homogeneous ?? false
  );
};

const reverseValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qString([...value.value].reverse().join(""));
  }
  if (value.kind === "list") {
    return qList([...value.items].reverse(), value.homogeneous ?? false);
  }
  return value;
};

const reciprocalValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(reciprocalValue), value.homogeneous ?? false);
  }
  return qFloat(1 / toNumber(value));
};

const signumValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(signumValue), value.homogeneous ?? false, "explicitInt");
  }
  const number = toNumber(value);
  return {
    kind: "number",
    value: number < 0 ? -1 : number > 0 ? 1 : 0,
    numericType: "int",
    explicitInt: true
  } as QValue;
};

const floorValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map((item) => floorValue(item)), value.homogeneous ?? false);
  }
  return qInt(Math.floor(toNumber(value)));
};

const cutValue = (left: QValue, right: QValue): QValue => {
  if (left.kind === "number") {
    const size = toNumber(left);
    if (size <= 0) {
      throw new QRuntimeError("domain", "cut size must be positive");
    }
    return chunkValue(size, right);
  }

  if (left.kind === "list") {
    const starts = left.items.map((item) => {
      if (item.kind !== "number") {
        throw new QRuntimeError("type", "cut indices must be numeric");
      }
      return item.value;
    });
    return cutByIndices(starts, right);
  }

  throw new QRuntimeError("type", "cut expects a numeric left argument");
};

const rotateValue = (left: QValue, right: QValue): QValue => {
  const count = toNumber(left);
  if (right.kind === "string") {
    const chars = [...right.value];
    if (chars.length === 0) {
      return right;
    }
    const shift = ((count % chars.length) + chars.length) % chars.length;
    return qString([...chars.slice(shift), ...chars.slice(0, shift)].join(""));
  }
  const list = asList(right);
  if (list.items.length === 0) {
    return list;
  }
  const shift = ((count % list.items.length) + list.items.length) % list.items.length;
  return qList(
    [...list.items.slice(shift), ...list.items.slice(0, shift)],
    list.homogeneous ?? false
  );
};

const sublistValue = (left: QValue, right: QValue): QValue => {
  if (left.kind !== "list" || left.items.length < 2) {
    throw new QRuntimeError("type", "sublist expects a two-item left argument");
  }
  const start = toNumber(left.items[0] ?? qInt(0));
  const count = toNumber(left.items[1] ?? qInt(0));
  if (right.kind === "string") {
    return qString(right.value.slice(start, start + count));
  }
  const list = asList(right);
  return qList(list.items.slice(start, start + count), list.homogeneous ?? false);
};

const chunkValue = (size: number, right: QValue): QValue => {
  if (right.kind === "string") {
    const parts: QValue[] = [];
    for (let index = 0; index < right.value.length; index += size) {
      parts.push(qString(right.value.slice(index, index + size)));
    }
    return qList(parts, false);
  }

  const list = asList(right);
  const parts: QValue[] = [];
  for (let index = 0; index < list.items.length; index += size) {
    parts.push(qList(list.items.slice(index, index + size), list.homogeneous ?? false));
  }
  return qList(parts, false);
};

const cutByIndices = (starts: number[], right: QValue): QValue => {
  if (starts.some((start) => start < 0)) {
    throw new QRuntimeError("domain", "cut indices must be non-negative");
  }

  const ordered = [...starts].sort((a, b) => a - b);
  if (right.kind === "string") {
    const parts = ordered.map((start, index) =>
      qString(right.value.slice(start, ordered[index + 1] ?? right.value.length))
    );
    return qList(parts, false);
  }

  const list = asList(right);
  const parts = ordered.map((start, index) =>
    qList(list.items.slice(start, ordered[index + 1] ?? list.items.length), list.homogeneous ?? false)
  );
  return qList(parts, false);
};

const addMonthsValue = (dateValue: QValue, monthsValue: QValue): QValue => {
  if (dateValue.kind !== "temporal" || dateValue.temporalType !== "date") {
    throw new QRuntimeError("type", ".Q.addmonths expects date values");
  }

  const months = toNumber(monthsValue);
  const [yearText, monthText, dayText] = dateValue.value.split(".");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcDate = new Date(Date.UTC(year, month - 1 + months, day));
  const formatted = [
    utcDate.getUTCFullYear(),
    String(utcDate.getUTCMonth() + 1).padStart(2, "0"),
    String(utcDate.getUTCDate()).padStart(2, "0")
  ].join(".");
  return qDate(formatted);
};

const parseQOpt = (value: QValue): QValue => {
  if (value.kind === "list" && value.items.length === 0) {
    return qDictionary([], []);
  }
  if (value.kind === "dictionary") {
    return value;
  }
  throw new QRuntimeError("type", ".Q.opt expects argv-style input");
};

const defineDefaults = (defaults: QValue, parser: QValue, raw: QValue): QValue => {
  if (defaults.kind !== "dictionary") {
    throw new QRuntimeError("type", ".Q.def expects a default dictionary");
  }

  const parsed =
    parser.kind === "builtin" && parser.name === ".Q.opt"
      ? parseQOpt(raw)
      : raw.kind === "dictionary"
        ? raw
        : qDictionary([], []);

  if (parsed.kind !== "dictionary") {
    throw new QRuntimeError("type", ".Q.def expects a dictionary of parsed options");
  }

  return qDictionary(
    defaults.keys,
    defaults.keys.map((key, index) => {
      const parsedIndex = parsed.keys.findIndex((candidate) => equals(candidate, key));
      return parsedIndex >= 0 ? parsed.values[parsedIndex] ?? defaults.values[index]! : defaults.values[index]!;
    })
  );
};

const formatQNumber = (widthValue: QValue, decimalsValue: QValue, value: QValue): QValue => {
  const width = toNumber(widthValue);
  const decimals = toNumber(decimalsValue);
  const numericValue = toNumber(value);
  return qString(numericValue.toFixed(decimals).padStart(width, " "));
};

const atobValue = (value: QValue): QValue => {
  if (value.kind !== "string") {
    throw new QRuntimeError("type", ".Q.atob expects a string");
  }

  if (typeof atob === "function") {
    return qString(atob(value.value));
  }

  return qString(Buffer.from(value.value, "base64").toString("utf8"));
};

const btoaValue = (value: QValue): QValue => {
  const text = value.kind === "string" ? value.value : formatValue(value, { trailingNewline: false });

  if (typeof btoa === "function") {
    return qString(btoa(text));
  }

  return qString(Buffer.from(text, "utf8").toString("base64"));
};

const encodeFixedBase = (value: QValue, width: number, alphabet: string): QValue => {
  let remaining = BigInt(Math.max(0, Math.trunc(toNumber(value))));
  const base = BigInt(alphabet.length);
  const chars = Array.from({ length: width }, () => alphabet[0]!);

  for (let index = width - 1; index >= 0 && remaining > 0n; index -= 1) {
    chars[index] = alphabet[Number(remaining % base)]!;
    remaining /= base;
  }

  return qString(chars.join(""));
};

const decodeFixedBase = (value: QValue, alphabet: string): QValue => {
  if (value.kind !== "string") {
    throw new QRuntimeError("type", "decode expects a string");
  }

  const base = BigInt(alphabet.length);
  let decoded = 0n;
  for (const char of value.value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) {
      throw new QRuntimeError("domain", `Unsupported digit ${char}`);
    }
    decoded = decoded * base + BigInt(digit);
  }
  return qInt(Number(decoded));
};

const sanitizeQIdentifier = (name: string) => {
  const stripped = name.replace(/[^A-Za-z0-9_]/g, "");
  return stripped === "" || /^[0-9_]/.test(stripped) ? `a${stripped}` : stripped;
};

const uniquifyQIdentifiers = (names: string[]) => {
  const used = new Set<string>();
  return names.map((name) => {
    const base = sanitizeQIdentifier(name);
    let candidate = Q_RESERVED_SET.has(base) ? `${base}1` : base;
    if (!used.has(candidate) && !Q_RESERVED_SET.has(candidate)) {
      used.add(candidate);
      return candidate;
    }

    let suffix = 1;
    let unique = `${candidate}${suffix}`;
    while (used.has(unique) || Q_RESERVED_SET.has(unique)) {
      suffix += 1;
      unique = `${candidate}${suffix}`;
    }
    used.add(unique);
    return unique;
  });
};

const renameTableColumns = (table: QTable, names: string[]) => {
  const entries = Object.entries(table.columns);
  return qTable(
    Object.fromEntries(
      entries.map(([_, column], index) => [names[index]!, column])
    )
  );
};

const qIdValue = (value: QValue): QValue => {
  if (value.kind === "symbol") {
    return qSymbol(uniquifyQIdentifiers([value.value])[0]!);
  }
  if (value.kind === "list" && value.items.every((item) => item.kind === "symbol")) {
    return qList(
      uniquifyQIdentifiers(value.items.map((item) => (item as QSymbol).value)).map((name) =>
        qSymbol(name)
      ),
      true
    );
  }
  if (value.kind === "dictionary" && value.keys.every((key) => key.kind === "symbol")) {
    return qDictionary(
      uniquifyQIdentifiers(value.keys.map((key) => (key as QSymbol).value)).map((name) =>
        qSymbol(name)
      ),
      value.values
    );
  }
  if (value.kind === "table") {
    return renameTableColumns(value, uniquifyQIdentifiers(Object.keys(value.columns)));
  }
  if (value.kind === "keyedTable") {
    const allNames = [...Object.keys(value.keys.columns), ...Object.keys(value.values.columns)];
    const renamed = uniquifyQIdentifiers(allNames);
    return qKeyedTable(
      renameTableColumns(value.keys, renamed.slice(0, Object.keys(value.keys.columns).length)),
      renameTableColumns(value.values, renamed.slice(Object.keys(value.keys.columns).length))
    );
  }
  throw new QRuntimeError("type", ".Q.id expects symbols, dictionaries or tables");
};

const xcolValue = (namesValue: QValue, tableValue: QValue): QValue => {
  if (namesValue.kind !== "list" || !namesValue.items.every((item) => item.kind === "symbol")) {
    throw new QRuntimeError("type", "xcol expects a symbol list on the left");
  }

  const names = namesValue.items.map((item) => (item as QSymbol).value);

  if (tableValue.kind === "table") {
    if (names.length !== Object.keys(tableValue.columns).length) {
      throw new QRuntimeError("length", "xcol name count must match table columns");
    }
    return renameTableColumns(tableValue, names);
  }

  if (tableValue.kind === "keyedTable") {
    const keyNames = Object.keys(tableValue.keys.columns);
    const valueNames = Object.keys(tableValue.values.columns);
    if (names.length !== keyNames.length + valueNames.length) {
      throw new QRuntimeError("length", "xcol name count must match keyed table columns");
    }
    return qKeyedTable(
      renameTableColumns(tableValue.keys, names.slice(0, keyNames.length)),
      renameTableColumns(tableValue.values, names.slice(keyNames.length))
    );
  }

  throw new QRuntimeError("type", "xcol expects a table");
};

const inValue = (left: QValue, right: QValue): QValue => {
  const contains = (value: QValue) => {
    if (right.kind === "list") {
      return qBool(right.items.some((candidate) => equals(candidate, value)));
    }
    return qBool(equals(value, right));
  };

  if (left.kind === "list") {
    return qList(left.items.map(contains), true);
  }

  return contains(left);
};

const asSequenceItems = (value: QValue): QValue[] => {
  if (value.kind === "list") {
    return value.items;
  }
  if (value.kind === "string") {
    return [...value.value].map((char) => qString(char));
  }
  return [value];
};

const rebuildSequence = (prototype: QValue, items: QValue[]): QValue => {
  if (prototype.kind === "string") {
    return qString(
      items
        .map((item) => {
          if (item.kind !== "string" || item.value.length !== 1) {
            throw new QRuntimeError("type", "String set verbs expect character values");
          }
          return item.value;
        })
        .join("")
    );
  }
  if (prototype.kind === "list") {
    return qList(items, prototype.homogeneous ?? items.every((item) => item.kind === items[0]?.kind));
  }
  return items[0] ?? qNull();
};

const distinctItems = (items: QValue[]) =>
  items.filter((item, index) => items.findIndex((candidate) => equals(candidate, item)) === index);

const crossValue = (left: QValue, right: QValue): QValue =>
  qList(
    asSequenceItems(left).flatMap((leftItem) =>
      asSequenceItems(right).map((rightItem) => qList([leftItem, rightItem]))
    ),
    false
  );

const reduceValue = (session: Session, callable: QValue, value: QValue): QValue => {
  const items = asSequenceItems(value);
  if (items.length === 0) {
    return qNull();
  }
  let result = items[0]!;
  for (const item of items.slice(1)) {
    result = session.invoke(callable, [result, item]);
  }
  return result;
};

const patternToRegex = (pattern: string) =>
  new RegExp(
    `^${[...pattern]
      .map((char) => {
        if (char === "*") {
          return ".*";
        }
        if (char === "?") {
          return ".";
        }
        return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("")}$`
  );

const likeValue = (left: QValue, right: QValue): QValue =>
  mapBinary(left, right, (value, pattern) => {
    if (value.kind !== "string" || pattern.kind !== "string") {
      throw new QRuntimeError("type", "like expects string arguments");
    }
    return qBool(patternToRegex(pattern.value).test(value.value));
  });

const resolveWithinBound = (bound: QValue, index: number, length: number): QValue => {
  if (bound.kind !== "list") {
    return bound;
  }
  if (bound.items.length !== length) {
    throw new QRuntimeError("length", "within bounds must match the left argument");
  }
  return bound.items[index] ?? nullLike(bound.items[0]);
};

const withinValue = (left: QValue, right: QValue): QValue => {
  if (right.kind !== "list" || right.items.length !== 2) {
    throw new QRuntimeError("type", "within expects a two-item right argument");
  }

  const [lower, upper] = right.items;
  const withinScalar = (value: QValue, lowerBound: QValue, upperBound: QValue) =>
    qBool(compare(value, lowerBound) >= 0 && compare(value, upperBound) <= 0);

  if (left.kind === "list") {
    return qList(
      left.items.map((item, index) =>
        withinScalar(
          item,
          resolveWithinBound(lower, index, left.items.length),
          resolveWithinBound(upper, index, left.items.length)
        )
      ),
      true
    );
  }

  return withinScalar(left, resolveWithinBound(lower, 0, 1), resolveWithinBound(upper, 0, 1));
};

const exceptValue = (left: QValue, right: QValue): QValue => {
  const rightItems = asSequenceItems(right);
  return rebuildSequence(
    left,
    asSequenceItems(left).filter(
      (item) => !rightItems.some((candidate) => equals(candidate, item))
    )
  );
};

const interValue = (left: QValue, right: QValue): QValue => {
  const rightItems = asSequenceItems(right);
  return rebuildSequence(
    left,
    distinctItems(asSequenceItems(left)).filter((item) =>
      rightItems.some((candidate) => equals(candidate, item))
    )
  );
};

const unionValue = (left: QValue, right: QValue): QValue =>
  rebuildSequence(left, distinctItems([...asSequenceItems(left), ...asSequenceItems(right)]));

const lowerValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qString(value.value.toLowerCase());
  }
  if (value.kind === "symbol") {
    return qSymbol(value.value.toLowerCase());
  }
  if (value.kind === "list") {
    return qList(value.items.map(lowerValue), value.homogeneous ?? false);
  }
  return value;
};

const upperValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qString(value.value.toUpperCase());
  }
  if (value.kind === "symbol") {
    return qSymbol(value.value.toUpperCase());
  }
  if (value.kind === "list") {
    return qList(value.items.map(upperValue), value.homogeneous ?? false);
  }
  return value;
};

const nullValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map((item) => qBool(isNullish(item))), true);
  }
  return qBool(isNullish(value));
};

const flipListValue = (value: QList): QValue => {
  if (value.items.length === 0) {
    return value;
  }

  const rows = value.items.map((item) => {
    if (item.kind === "list") {
      return item.items;
    }
    if (item.kind === "string") {
      return [...item.value].map((char) => qString(char));
    }
    throw new QRuntimeError("type", "Flip expects a dictionary or rectangular list");
  });
  const width = rows[0]?.length ?? 0;
  if (!rows.every((row) => row.length === width)) {
    throw new QRuntimeError("length", "Flip expects a rectangular list");
  }

  return qList(
    Array.from({ length: width }, (_, columnIndex) =>
      qList(
        rows.map((row) => row[columnIndex]!),
        rows.every((row) => row[columnIndex]!.kind === rows[0]?.[columnIndex]?.kind)
      )
    ),
    false
  );
};

const flipValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return flipListValue(value);
  }
  if (value.kind !== "dictionary") {
    return value;
  }

  const columns = value.keys.map((key, index) => {
    if (key.kind !== "symbol") {
      throw new QRuntimeError("type", "Flip expects symbol keys");
    }

    const columnValue = value.values[index];
    if (!columnValue) {
      return { name: key.value, value: qList([]) };
    }
    if (columnValue.kind === "list") {
      return { name: key.value, value: columnValue };
    }
    if (columnValue.kind === "string") {
      return {
        name: key.value,
        value: qList([...columnValue.value].map((char) => qString(char)), true)
      };
    }
    throw new QRuntimeError("type", "Flip expects list-like dictionary values");
  });

  return buildTable(columns);
};

const negateValue = (value: QValue): QValue =>
  value.kind === "list"
    ? qList(value.items.map(negateValue), true)
    : value.kind === "number"
      ? numeric(-value.value, value.numericType === "float")
      : qInt(-toNumber(value));

const notValue = (value: QValue): QValue =>
  value.kind === "list"
    ? qList(value.items.map(notValue), true)
    : qBool(!isTruthy(value));

const distinctValue = (value: QValue): QValue => {
  if (value.kind === "table") {
    const seen = new Set<string>();
    const positions: number[] = [];
    const rowCount = countValue(value);
    for (let index = 0; index < rowCount; index += 1) {
      const rowKey = JSON.stringify(canonicalize(rowFromTable(value, index)));
      if (seen.has(rowKey)) {
        continue;
      }
      seen.add(rowKey);
      positions.push(index);
    }

    return qTable(
      Object.fromEntries(
        Object.entries(value.columns).map(([name, column]) => [
          name,
          qList(
            positions.map((position) => column.items[position] ?? nullLike(column.items[0])),
            column.homogeneous ?? false
          )
        ])
      )
    );
  }

  if (value.kind !== "list") {
    return value;
  }
  const seen = new Set<string>();
  const items = value.items.filter((item) => {
    const key = JSON.stringify(canonicalize(item));
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return qList(items, value.homogeneous ?? false);
};

const namespaceKeys = (value: QValue) => {
  if (value.kind !== "namespace") {
    throw new QRuntimeError("type", "Expected a namespace");
  }
  return [...value.entries.keys()].map((name) => qSymbol(name));
};

const whereValue = (value: QValue): QValue => {
  const list = asList(value);
  const items = list.items.flatMap((item, index) =>
    isTruthy(item) ? [qInt(index)] : []
  );
  return qList(items, true);
};

const concatValues = (left: QValue, right: QValue): QValue => {
  if (left.kind === "list" && right.kind === "list") {
    return qList([...left.items, ...right.items], left.homogeneous && right.homogeneous);
  }
  if (left.kind === "string" && right.kind === "string") {
    return qString(`${left.value}${right.value}`);
  }
  if (left.kind === "list") {
    return qList([...left.items, right], false);
  }
  if (right.kind === "list") {
    return qList([left, ...right.items], false);
  }
  return qList([left, right]);
};

const takeValue = (left: QValue, right: QValue): QValue => {
  if (left.kind === "list") {
    const shape = left.items.map((item) => {
      if (item.kind !== "number") {
        throw new QRuntimeError("type", "Take shape must be numeric");
      }
      return item.value;
    });
    if (shape.length === 0) {
      return qList([]);
    }
    return reshapeValue(shape, right);
  }

  const count = toNumber(left);
  if (right.kind === "list") {
    if (right.items.length === 0) {
      return qList([]);
    }
    const items = Array.from({ length: Math.abs(count) }, (_, index) => right.items[index % right.items.length]);
    return qList(count >= 0 ? items : items.reverse(), right.homogeneous ?? false);
  }
  if (right.kind === "string") {
    const text = Array.from({ length: Math.abs(count) }, (_, index) => right.value[index % right.value.length] ?? " ").join("");
    return qString(count >= 0 ? text : text.split("").reverse().join(""));
  }
  return qList(Array.from({ length: Math.abs(count) }, () => right));
};

const reshapeValue = (shape: number[], value: QValue): QValue => {
  const counts = shape.map((count) => Math.abs(count));
  const total = counts.reduce((product, count) => product * count, 1);

  if (value.kind === "string") {
    const flat = Array.from({ length: total }, (_, index) => value.value[index % value.value.length] ?? " ");
    return reshapeStrings(counts, flat);
  }

  const items =
    value.kind === "list"
      ? value.items
      : Array.from({ length: total }, () => value);

  if (items.length === 0) {
    return qList([]);
  }

  const flat = Array.from({ length: total }, (_, index) => items[index % items.length] ?? nullLike(items[0]));
  return reshapeItems(counts, flat, value.kind === "list" ? (value.homogeneous ?? false) : false);
};

const reshapeStrings = (shape: number[], flat: string[]): QValue => {
  if (shape.length === 1) {
    return qString(flat.slice(0, shape[0]).join(""));
  }

  const step = shape.slice(1).reduce((product, count) => product * count, 1);
  const rows: QValue[] = [];
  for (let index = 0; index < shape[0]; index += 1) {
    rows.push(reshapeStrings(shape.slice(1), flat.slice(index * step, (index + 1) * step)));
  }
  return qList(rows, false);
};

const reshapeItems = (shape: number[], flat: QValue[], homogeneous: boolean): QValue => {
  if (shape.length === 1) {
    return qList(flat.slice(0, shape[0]), homogeneous);
  }

  const step = shape.slice(1).reduce((product, count) => product * count, 1);
  const rows: QValue[] = [];
  for (let index = 0; index < shape[0]; index += 1) {
    rows.push(
      reshapeItems(shape.slice(1), flat.slice(index * step, (index + 1) * step), homogeneous)
    );
  }
  return qList(rows, false);
};

const dropValue = (left: QValue, right: QValue): QValue => {
  const count = toNumber(left);
  if (right.kind === "list") {
    return qList(right.items.slice(Math.max(0, count)), right.homogeneous ?? false);
  }
  if (right.kind === "string") {
    return qString(right.value.slice(Math.max(0, count)));
  }
  throw new QRuntimeError("type", "Drop expects a list or string on the right");
};

const fillValue = (left: QValue, right: QValue): QValue => {
  if (left.kind === "list" && right.kind === "list") {
    if (left.items.length !== right.items.length) {
      throw new QRuntimeError("length", "Fill arguments must have the same length");
    }
    return qList(
      right.items.map((item, index) => (isNullish(item) ? left.items[index] : item)),
      right.homogeneous ?? false
    );
  }

  if (right.kind === "list") {
    return qList(
      right.items.map((item) => (isNullish(item) ? left : item)),
      right.homogeneous ?? false
    );
  }

  if (left.kind === "list") {
    throw new QRuntimeError("nyi", "Vector-left fill is not implemented");
  }

  return isNullish(right) ? left : right;
};

const findValue = (left: QValue, right: QValue): QValue => {
  if (left.kind !== "list") {
    throw new QRuntimeError("type", "Find expects a list on the left");
  }

  const lookup = (item: QValue) => {
    const index = left.items.findIndex((candidate) => equals(candidate, item));
    return qInt(index >= 0 ? index : left.items.length);
  };

  if (right.kind === "list") {
    return qList(right.items.map(lookup), true);
  }

  return lookup(right);
};

const castValue = (left: QValue, right: QValue): QValue => {
  const castName =
    left.kind === "symbol"
      ? left.value
      : left.kind === "string"
        ? left.value
        : left.kind === "number" && left.numericType === "short"
          ? `${left.value}h`
          : null;
  if (castName === null) {
    throw new QRuntimeError("type", "Cast expects a symbol or string on the left");
  }

  switch (castName) {
    case "":
      return castSymbolValue(right);
    case "10h":
      return castCharValue(right);
    case "int":
    case "i":
      return castIntValue(right);
    default:
      throw new QRuntimeError("nyi", `Cast ${castName}$ is not implemented yet`);
  }
};

const castSymbolValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qSymbol(value.value);
  }
  if (value.kind === "symbol") {
    return value;
  }
  if (value.kind === "list") {
    return qList(value.items.map(castSymbolAtom), true);
  }
  throw new QRuntimeError("type", "symbol$ expects strings or symbols");
};

const castSymbolAtom = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qSymbol(value.value);
  }
  if (value.kind === "symbol") {
    return value;
  }
  throw new QRuntimeError("type", "symbol$ expects strings or symbols");
};

const castCharValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return value;
  }
  if (value.kind === "list" && value.items.every((item) => item.kind === "number")) {
    return qString(
      value.items
        .map((item) => String.fromCharCode(Math.max(0, Math.trunc(toNumber(item)))))
        .join("")
    );
  }
  throw new QRuntimeError("type", "10h$ expects a string or byte-like list");
};

const castIntValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(castIntAtom), true, "int");
  }
  return castIntAtom(value);
};

const castIntAtom = (value: QValue): QValue => {
  if (value.kind === "number") {
    if (value.special === "null" || value.special === "intNull") {
      return qInt(0, "intNull");
    }
    return qInt(Math.trunc(value.value));
  }
  if (value.kind === "null") {
    return qInt(0, "intNull");
  }
  throw new QRuntimeError("type", "int$ expects numeric values");
};

const buildTable = (columns: { name: string; value: QValue }[]): QTable => {
  const listCounts = columns.flatMap((column) =>
    column.value.kind === "list" ? [column.value.items.length] : []
  );
  const counts = [...new Set(listCounts)];
  if (counts.length > 1) {
    throw new QRuntimeError("length", "Table columns must have the same length");
  }

  const rowCount = counts[0] ?? 1;
  const entries = columns.map(({ name, value }) => {
    if (value.kind === "list") {
      return [name, value] as const;
    }

    return [
      name,
      qList(Array.from({ length: rowCount }, () => value), true)
    ] as const;
  });

  return qTable(Object.fromEntries(entries));
};

const tableRowCount = (table: QTable) => Object.values(table.columns)[0]?.items.length ?? 0;

const selectTableRows = (table: QTable, positions: number[]) =>
  qTable(
    Object.fromEntries(
      Object.entries(table.columns).map(([name, column]) => [
        name,
        qList(
          positions.map((position) => column.items[position] ?? nullLike(column.items[0])),
          column.homogeneous ?? false
        )
      ])
    )
  );

const materializeTableColumn = (value: QValue, rowCount: number): QList => {
  if (value.kind === "list") {
    if (value.items.length !== rowCount) {
      throw new QRuntimeError("length", "Column length must match table rows");
    }
    return value;
  }
  return qList(Array.from({ length: rowCount }, () => value), true);
};

const applyValue = (value: QValue, args: QValue[]): QValue => {
  switch (value.kind) {
    case "list":
      if (args.length === 1) {
        return indexList(value, args[0]);
      }
      if (args.length === 2) {
        return indexNestedRows(value, args);
      }
      throw new QRuntimeError("rank", "List indexing expects one or two arguments");
    case "string":
      if (args.length !== 1) {
        throw new QRuntimeError("rank", "String indexing expects one argument");
      }
      return indexString(value, args[0]);
    case "dictionary":
      if (args.length !== 1) {
        throw new QRuntimeError("rank", "Dictionary indexing expects one argument");
      }
      return indexDictionary(value, args[0]);
    case "table":
      return indexTable(value, args);
    case "keyedTable":
      return indexKeyedTable(value, args);
    default:
      throw new QRuntimeError("type", "Value is not callable");
  }
};

const indexList = (list: QList, index: QValue): QValue => {
  if (index.kind === "number") {
    return list.items[index.value] ?? nullLike(list.items[0]);
  }
  if (index.kind === "list") {
    return qList(index.items.map((item) => indexList(list, item)), list.homogeneous ?? false);
  }
  throw new QRuntimeError("type", "List index must be numeric");
};

const indexString = (text: QString, index: QValue): QValue => {
  if (index.kind === "number") {
    return qString(text.value[index.value] ?? "");
  }
  if (index.kind === "list") {
    return qString(
      index.items
        .map((item) => {
          const result = indexString(text, item);
          return result.kind === "string" ? result.value : "";
        })
        .join("")
    );
  }
  throw new QRuntimeError("type", "String index must be numeric");
};

const indexNestedRows = (list: QList, args: QValue[]): QValue => {
  const [rowSelector, columnSelector] = args;
  const rows = rowSelector.kind === "null" ? list : indexList(list, rowSelector);

  if (columnSelector.kind === "null") {
    return rows;
  }

  const project = (row: QValue) => {
    if (row.kind === "list") {
      return indexList(row, columnSelector);
    }
    if (row.kind === "string") {
      return indexString(row, columnSelector);
    }
    throw new QRuntimeError("type", "Nested index expects row vectors");
  };

  if (rows.kind === "list") {
    return qList(rows.items.map(project), false);
  }

  return project(rows);
};

const indexDictionary = (dictionary: QDictionary, index: QValue): QValue => {
  const lookup = (key: QValue) => {
    const position = dictionary.keys.findIndex((candidate) => equals(candidate, key));
    return position >= 0 ? dictionary.values[position] : nullLike(dictionary.values[0]);
  };

  if (index.kind === "list") {
    return qList(index.items.map(lookup), dictionary.values.every((value) => value.kind === dictionary.values[0]?.kind));
  }

  return lookup(index);
};

const indexTable = (table: QTable, args: QValue[]): QValue => {
  if (args.length === 2) {
    const rows = args[0].kind === "null" ? table : indexTable(table, [args[0]]);
    if (rows.kind !== "table" && rows.kind !== "dictionary") {
      throw new QRuntimeError("type", "Unexpected intermediate table selection result");
    }
    if (args[1].kind === "null") {
      return rows;
    }
    return rows.kind === "table"
      ? selectTableColumns(rows, args[1])
      : indexDictionary(rows, args[1]);
  }

  if (args.length !== 1) {
    throw new QRuntimeError("rank", "Table indexing expects one or two arguments");
  }

  const [index] = args;
  if (index.kind === "symbol") {
    const column = table.columns[index.value];
    if (!column) {
      throw new QRuntimeError("name", `Unknown column: ${index.value}`);
    }
    return column;
  }

  if (index.kind === "list" && index.items.every((item) => item.kind === "symbol")) {
    return selectTableColumns(table, index);
  }

  if (index.kind === "number") {
    return rowFromTable(table, index.value);
  }

  if (index.kind === "list") {
    const positions = index.items.map((item) => {
      if (item.kind !== "number") {
        throw new QRuntimeError("type", "Table row index must be numeric");
      }
      return item.value;
    });
    return qTable(
      Object.fromEntries(
        Object.entries(table.columns).map(([name, column]) => [
          name,
          qList(
            positions.map((position) => column.items[position] ?? nullLike(column.items[0])),
            column.homogeneous ?? false
          )
        ])
      )
    );
  }

  throw new QRuntimeError("type", "Unsupported table index");
};

const rowFromTable = (table: QTable, position: number): QDictionary =>
  qDictionary(
    Object.keys(table.columns).map((name) => qSymbol(name)),
    Object.values(table.columns).map((column) => column.items[position] ?? nullLike(column.items[0]))
  );

const indexKeyedTable = (table: QKeyedTable, args: QValue[]): QValue => {
  if (args.length !== 1) {
    throw new QRuntimeError("rank", "Keyed table indexing expects one argument");
  }

  const keyNames = Object.keys(table.keys.columns);
  if (keyNames.length !== 1) {
    throw new QRuntimeError("nyi", "Only single-key keyed table indexing is implemented");
  }

  const keyColumn = table.keys.columns[keyNames[0]]!;
  const lookup = (key: QValue) => {
    const position = keyColumn.items.findIndex((candidate) => equals(candidate, key));
    if (position < 0) {
      return rowFromTable(table.values, -1);
    }
    return rowFromTable(table.values, position);
  };

  const [index] = args;
  if (index.kind === "list") {
    return qList(index.items.map(lookup), false);
  }
  return lookup(index);
};

const nullLike = (sample?: QValue): QValue => {
  if (!sample) {
    return qNull();
  }

  switch (sample.kind) {
    case "number":
      return sample.numericType === "int" ? qInt(0, "intNull") : qFloat(Number.NaN, "null");
    case "string":
      return qString("");
    case "temporal":
      return qDate("0000.00.00");
    case "symbol":
      return qSymbol("");
    case "boolean":
      return qBool(false);
    case "list":
      return qList([]);
    default:
      return qNull();
  }
};

const isNullish = (value: QValue) =>
  value.kind === "null" ||
  (value.kind === "symbol" && value.value === "") ||
  (value.kind === "number" &&
    (value.special === "null" || value.special === "intNull"));

const selectTableColumns = (table: QTable, selector: QValue): QValue => {
  if (selector.kind === "symbol") {
    const column = table.columns[selector.value];
    if (!column) {
      throw new QRuntimeError("name", `Unknown column: ${selector.value}`);
    }
    return column;
  }

  if (selector.kind === "list" && selector.items.every((item) => item.kind === "symbol")) {
    const selected: Record<string, QList> = {};
    for (const item of selector.items) {
      const symbol = item as QSymbol;
      const column = table.columns[symbol.value];
      if (!column) {
        throw new QRuntimeError("name", `Unknown column: ${symbol.value}`);
      }
      selected[symbol.value] = column;
    }
    return qTable(selected);
  }

  throw new QRuntimeError("type", "Table column selector must be a symbol or symbol list");
};

const formatBare = (value: QValue): string => {
  switch (value.kind) {
    case "null":
      return "::";
    case "boolean":
      return value.value ? "1b" : "0b";
    case "number":
      if (value.special === "intNull") {
        return "0N";
      }
      if (value.special === "intPosInf") {
        return "0Wi";
      }
      if (value.special === "intNegInf") {
        return "-0Wi";
      }
      if (value.special === "null") {
        return "0n";
      }
      if (value.special === "posInf") {
        return "0W";
      }
      if (value.special === "negInf") {
        return "-0W";
      }
      if (value.numericType === "short") {
        return `${value.value}h`;
      }
      if ((value as { explicitInt?: boolean }).explicitInt) {
        return `${value.value}i`;
      }
      return value.numericType === "float" ? formatFloat(value.value) : `${value.value}`;
    case "string":
      return JSON.stringify(value.value);
    case "symbol":
      return `\`${value.value}`;
    case "temporal":
      return value.value;
    case "list":
      if (value.items.length === 0) {
        return "()";
      }
      if (value.items.length === 1 && value.attribute !== "namespaceKeys") {
        return `,${formatBare(value.items[0])}`;
      }
      if (value.items.every((item) => item.kind === "number")) {
        if (value.attribute === "explicitInt") {
          return `${value.items
            .map((item) => (item.kind === "number" ? `${item.value}` : formatBare(item)))
            .join(" ")}i`;
        }
        return value.items.map((item) => formatListNumber(item)).join(" ");
      }
      if (value.items.every((item) => item.kind === "boolean")) {
        return `${value.items.map((item) => (item.kind === "boolean" && item.value ? "1" : "0")).join("")}b`;
      }
      if (value.items.every((item) => item.kind === "symbol")) {
        if (value.attribute === "namespaceKeys") {
          return `\`\`${value.items
            .map((item) => (item.kind === "symbol" ? item.value : ""))
            .join("`")}`;
        }
        return value.items.map((item) => formatBare(item)).join("");
      }
      if (value.items.every((item) => item.kind === "string")) {
        return value.items
          .map((item) => (item.kind === "string" && item.value.length === 1 ? `,${formatBare(item)}` : formatBare(item)))
          .join("\n");
      }
      if (value.items.every((item) => item.kind === "list" || item.kind === "string")) {
        return value.items.map((item) => formatBare(item)).join("\n");
      }
      return value.items.map(formatBare).join(" ");
    case "dictionary":
      return formatDictionary(value);
    case "table":
      return formatTable(value);
    case "keyedTable":
      return formatKeyedTable(value);
    case "lambda":
      return value.source;
    case "projection":
      return `${formatBare(value.target)}[${value.args
        .map((arg) => (arg ? formatBare(arg) : ""))
        .join(";")}]`;
    case "builtin":
      return value.name;
    case "namespace":
      return value.name;
    case "error":
      return `'${value.name}: ${value.message}`;
  }
  throw new QRuntimeError("nyi", "Unhandled value kind during formatting");
};

const trimFloat = (value: number) => {
  const text = value.toString();
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
};

const formatFloat = (value: number) => {
  if (Number.isInteger(value)) {
    return `${value}f`;
  }

  const text = value.toPrecision(7);
  if (text.includes("e") || text.includes("E")) {
    return text
      .replace(/(\.\d*?[1-9])0+(e.*)$/i, "$1$2")
      .replace(/\.0+(e.*)$/i, "$1")
      .replace(/\.e/i, "e");
  }

  return text.replace(/0+$/, "").replace(/\.$/, "");
};

const formatListNumber = (value: QValue) => {
  if (value.kind !== "number") {
    return formatBare(value);
  }
  if (value.special === "intNull") {
    return "0N";
  }
  if (value.special === "intPosInf") {
    return "0Wi";
  }
  if (value.special === "intNegInf") {
    return "-0Wi";
  }
  if (value.special === "null") {
    return "0n";
  }
  if (value.special === "posInf") {
    return "0W";
  }
  if (value.special === "negInf") {
    return "-0W";
  }
  if (value.numericType === "short") {
    return `${value.value}h`;
  }
  if (value.numericType === "float") {
    return Number.isInteger(value.value) ? `${value.value}` : formatFloat(value.value);
  }
  return `${value.value}`;
};

const formatTable = (table: QTable) => {
  const layout = layoutTable(table);
  return [layout.header, layout.divider, ...layout.rows].join("\n");
};

const layoutTable = (table: QTable) => {
  const names = Object.keys(table.columns);
  if (names.length === 0) {
    return { header: "+", divider: "", rows: [] as string[] };
  }

  const rowCount = countValue(table);
  const cellsByColumn = names.map((name) =>
    Array.from({ length: rowCount }, (_, rowIndex) =>
      formatTableCell(table.columns[name].items[rowIndex] ?? nullLike(table.columns[name].items[0]))
    )
  );
  const widths = names.map((name, index) =>
    Math.max(name.length, ...cellsByColumn[index].map((cell) => cell.length))
  );
  const padRow = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join(" ").trimEnd();
  const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
    padRow(names.map((_, columnIndex) => cellsByColumn[columnIndex][rowIndex]))
  );
  const header = padRow(names);
  const divider = "-".repeat(header.length);
  return { header, divider, rows };
};

const formatKeyedTable = (table: QKeyedTable) => {
  const keys = layoutTable(table.keys);
  const values = layoutTable(table.values);
  const header = `${keys.header}| ${values.header}`;
  const divider = `${keys.divider}| ${values.divider}`;
  const rowCount = Math.max(keys.rows.length, values.rows.length);
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const left = keys.rows[index] ?? "";
    const right = values.rows[index] ?? "";
    return `${left.padEnd(keys.header.length)}| ${right}`.trimEnd();
  });
  return [header, divider, ...rows].join("\n");
};

const formatTableCell = (value: QValue) => {
  if (isNullish(value)) {
    return "";
  }
  if (value.kind === "symbol") {
    return value.value;
  }
  if (value.kind === "string" && value.value.length === 1) {
    return value.value;
  }
  return formatBare(value);
};

const formatDictionary = (dictionary: QDictionary) => {
  const keys = dictionary.keys.map((key) =>
    key.kind === "symbol" ? key.value : formatBare(key)
  );
  const width = Math.max(0, ...keys.map((key) => key.length));
  const typedSymbols = dictionary.values.every((value) => value.kind === "symbol");
  return keys
    .map(
      (key, index) => {
        const value = dictionary.values[index] ?? qNull();
        const rendered =
          value.kind === "null"
            ? ""
            : typedSymbols
              ? formatTableCell(value)
              : formatBare(value);
        return `${key.padEnd(width)}| ${rendered}`;
      }
    )
    .join("\n");
};
