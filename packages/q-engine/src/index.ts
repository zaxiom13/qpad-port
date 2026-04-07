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
  | { kind: "assignGlobal"; name: string; value: AstNode }
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
      by: { name: string | null; value: AstNode }[] | null;
      source: AstNode;
      where: AstNode | null;
    }
  | {
      kind: "exec";
      value: AstNode;
      by: { name: string | null; value: AstNode }[] | null;
      source: AstNode;
      where: AstNode | null;
    }
  | {
      kind: "update";
      updates: { name: string; value: AstNode }[];
      source: AstNode;
      where: AstNode | null;
    }
  | { kind: "delete"; columns: string[] | null; source: AstNode; where: AstNode | null }
  | { kind: "if"; condition: AstNode; body: AstNode[] }
  | {
      kind: "cond";
      branches: { condition: AstNode; value: AstNode }[];
      elseValue: AstNode | null;
    }
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
  "avgs",
  "til",
  "ceiling",
  "cols",
  "count",
  "desc",
  "differ",
  "exp",
  "fills",
  "first",
  "last",
  "log",
  "min",
  "mins",
  "max",
  "maxs",
  "med",
  "asc",
  "iasc",
  "idesc",
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
  "group",
  "key",
  "keys",
  "lower",
  "ltrim",
  "next",
  "upper",
  "prd",
  "prds",
  "prev",
  "raze",
  "ratios",
  "rtrim",
  "var",
  "svar",
  "dev",
  "sdev",
  "deltas",
  "trim",
  "sums",
  "string",
  "type",
  "where",
  "value",
  "show",
  "+/",
  "+\\",
  "system",
  "hopen",
  "hclose",
  "hcount",
  "hdel",
  "read0",
  "read1"
]);

const WORD_DIAD_KEYWORDS = new Set([
  "and",
  "cross",
  "cut",
  "div",
  "mavg",
  "mcount",
  "mdev",
  "msum",
  "in",
  "except",
  "inter",
  "like",
  "mod",
  "or",
  "over",
  "prior",
  "rotate",
  "scan",
  "ss",
  "sublist",
  "sv",
  "union",
  "vs",
  "within",
  "xbar",
  "xcol",
  "xexp",
  "xlog"
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
type TemporalType = "date" | "month" | "minute" | "second" | "time" | "timespan";

interface BuiltinEntry extends QBuiltin {
  impl: BuiltinImpl;
}

interface LambdaValue extends QLambda {
  body: AstNode[];
}

interface TableQueryScope {
  source: QTable;
  positions: number[];
  filtered: QTable;
  context: Session;
}

const createHostAdapter = (host: HostAdapter): Required<HostAdapter> => ({
  now: host.now ?? (() => new Date()),
  timezone: host.timezone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  env: host.env ?? (() => ({})),
  consoleSize: host.consoleSize ?? (() => ({ rows: 40, columns: 120 })),
  unsupported:
    host.unsupported ??
    ((name: string) => {
      throw new QRuntimeError("nyi", `${name} is not available in the browser host`);
    })
});

const builtinRef = (name: string, arity: number): QBuiltin => ({
  kind: "builtin",
  name,
  arity
});

const namespaceValue = (name: string, entries: [string, QValue][]): QNamespace => ({
  kind: "namespace",
  name,
  entries: new Map<string, QValue>(entries)
});

export class Session {
  private readonly env = new Map<string, QValue>();
  private readonly builtins: ReadonlyMap<string, BuiltinEntry>;
  private readonly host: Required<HostAdapter>;
  private readonly root: Session;
  private readonly parent: Session | null;
  private outputBuffer = "";

  constructor(host: HostAdapter = {}, root?: Session, parent?: Session | null) {
    this.parent = parent ?? null;
    this.host = parent?.host ?? createHostAdapter(host);
    this.root = root ?? this;
    this.builtins = parent?.builtins ?? SHARED_BUILTINS;

    if (!parent) {
      this.seedNamespaces();
    }
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
    this.root.refreshDynamicNamespaces();
    if (name.includes(".")) {
      return this.getDotted(name);
    }
    const value = this.lookup(name);
    if (value !== undefined) {
      return value;
    }
    const builtin = this.builtins.get(name);
    if (builtin) {
      return {
        kind: "builtin",
        name: builtin.name,
        arity: builtin.arity
      };
    }

    const derived = name.match(/^(.*)([\/\\])$/);
    if (derived && derived[1]) {
      return qProjection(this.get(derived[2]!), [this.get(derived[1]!)], 2);
    }

    throw new QRuntimeError("name", `Unknown identifier: ${name}`);
  }

  assign(name: string, value: QValue): QValue {
    if (!name.includes(".")) {
      this.env.set(name, value);
      return value;
    }

    const parts = name.replace(/^\./, "").split(".");
    const last = parts.pop()!;
    if (parts.length === 0) {
      this.env.set(name.startsWith(".") ? `.${last}` : last, value);
      return value;
    }

    let current = this.getRootValue(parts[0]!);

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

  assignGlobal(name: string, value: QValue): QValue {
    this.root.assign(name, value);
    if (this !== this.root) {
      this.assign(name, value);
    }
    return value;
  }

  emit(value: QValue) {
    this.root.outputBuffer += formatValue(value);
  }

  unsupported(name: string): never {
    return this.host.unsupported(name);
  }

  private createChildScope() {
    return new Session({}, this.root, this);
  }

  private eval(node: AstNode): QValue {
    switch (node.kind) {
      case "program": {
        return this.evalStatements(node.statements);
      }
      case "assign":
        return this.assign(node.name, this.eval(node.value));
      case "assignGlobal":
        return this.assignGlobal(node.name, this.eval(node.value));
      case "return":
        return this.eval(node.value);
      case "identifier":
        return this.get(node.name);
      case "number":
        return parseNumericLiteral(node.value);
      case "date":
        return parseTemporalLiteral(node.value);
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
      case "vector": {
        const items = node.items.map((item) => this.eval(item));
        if (
          node.items.length > 0 &&
          node.items.every((item) => item.kind === "number") &&
          items.every((item) => item.kind === "number")
        ) {
          const lastRaw = node.items[node.items.length - 1]!.value;
          if (lastRaw.endsWith("i")) {
            return qList(items.map((item) => qInt(toNumber(item))), true, "explicitInt");
          }
          if (lastRaw.endsWith("f")) {
            return qList(items.map((item) => qFloat(toNumber(item))), true, "explicitFloat");
          }
        }
        return qList(items, true);
      }
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
      case "if":
        return isTruthy(this.eval(node.condition)) ? this.evalBranchBody(node.body) : qNull();
      case "cond":
        return this.evalConditional(node);
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
      const merged = this.mergeProjectionArgs(callee.args, args, callee.arity);
      return qProjection(callee.target, merged, Math.max(callee.arity, merged.length));
    }

    if (callee.kind === "builtin") {
      return qProjection(callee, [...args], Math.max(callee.arity, args.length));
    }

    if (callee.kind === "lambda") {
      return qProjection(callee, [...args], Math.max(lambdaArity(callee as LambdaValue), args.length));
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
    const isDerivedAdverbProjection =
      projection.target.kind === "builtin" &&
      (projection.target.name === "/" ||
        projection.target.name === "\\" ||
        projection.target.name === "over" ||
        projection.target.name === "scan") &&
      boundCount === 1;
    if (projection.arity - boundCount === 1 && args.length > 1 && !isDerivedAdverbProjection) {
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

    const child = this.createChildScope();

    const params = lambda.params ?? ["x", "y", "z"].slice(0, Math.max(arity, args.length));
    params.forEach((param, index) => {
      child.assign(param, args[index] ?? qNull());
    });

    return child.evalStatements(lambda.body);
  }

  private evalStatements(body: AstNode[]) {
    let last: QValue = qNull();
    for (const statement of body) {
      if (statement.kind === "return") {
        return this.eval(statement.value);
      }
      last = this.eval(statement);
    }
    return last;
  }

  private createTableContext(table: QTable, positions?: number[]) {
    const child = this.createChildScope();
    for (const [name, column] of Object.entries(table.columns)) {
      child.assign(name, column);
    }
    const rowPositions =
      positions ?? Array.from({ length: tableRowCount(table) }, (_, index) => index);
    child.assign("i", qList(rowPositions.map((index) => qInt(index)), true));
    return child;
  }

  private requireTableSource(source: AstNode, action: string): QTable {
    const value = this.eval(source);
    if (value.kind !== "table") {
      throw new QRuntimeError("type", `${action} expects a table source`);
    }
    return value;
  }

  private createTableQueryScope(source: AstNode, where: AstNode | null, action: string): TableQueryScope {
    const table = this.requireTableSource(source, action);
    const positions = this.resolveTableRows(table, where);
    const filtered = selectTableRows(table, positions);
    return {
      source: table,
      positions,
      filtered,
      context: this.createTableContext(filtered, positions)
    };
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
    if (!result.items.every((item) => item.kind === "boolean")) {
      throw new QRuntimeError("type", "where expects a boolean vector");
    }

    return result.items.flatMap((item, index) =>
      item.kind === "boolean" && item.value ? [index] : []
    );
  }

  private groupTableRows(
    table: QTable,
    positions: number[],
    by: { name: string | null; value: AstNode }[]
  ) {
    const rowCount = tableRowCount(table);
    const context = this.createTableContext(table, positions);
    const names = qsqlColumnNames(by);
    const keyColumns = by.map((column, index) => ({
      name: names[index]!,
      value: materializeTableColumn(context.eval(column.value), rowCount)
    }));

    const groups: { keyValues: QValue[]; positions: number[] }[] = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const keyValues = keyColumns.map(
        (column) => column.value.items[rowIndex] ?? nullLike(column.value.items[0])
      );
      const existing = groups.find((group) =>
        group.keyValues.every((candidate, index) => equals(candidate, keyValues[index]!))
      );
      if (existing) {
        existing.positions.push(rowIndex);
        continue;
      }
      groups.push({ keyValues, positions: [rowIndex] });
    }

    return { keyColumns, groups };
  }

  private buildGroupedKeyTable(
    columns: { name: string; value: QList }[],
    groups: { keyValues: QValue[] }[]
  ) {
    return buildTable(
      columns.map((column, index) => ({
        name: column.name,
        value: qList(
          groups.map((group) => group.keyValues[index]!),
          column.value.homogeneous ?? false,
          column.value.attribute
        )
      }))
    );
  }

  private buildSelectColumns(
    columns: { name: string | null; value: AstNode }[],
    context: Session,
    rowCount: number
  ) {
    const names = qsqlColumnNames(columns);
    const values = columns.map((column) => context.eval(column.value));
    const aggregateMode = isQsqlAggregateExpression(columns[0]?.value ?? null);

    if (!aggregateMode && !values.some((value) => value.kind === "list" && value.items.length === rowCount)) {
      throw new QRuntimeError("rank", "select result must be row-wise or aggregate");
    }

    return columns.map((_, index) => ({
      name: names[index]!,
      value: aggregateMode ? qList([values[index]!], false) : materializeTableColumn(values[index]!, rowCount)
    }));
  }

  private cloneTableColumns(table: QTable) {
    return Object.fromEntries(
      Object.entries(table.columns).map(([name, column]) => [name, [...column.items]])
    ) as Record<string, QValue[]>;
  }

  private applyUpdateColumn(
    updatedColumns: Record<string, QValue[]>,
    source: QTable,
    positions: number[],
    updateName: string,
    column: QList
  ) {
    const sample = column.items[0] ?? source.columns[updateName]?.items[0];
    const targetColumn =
      updatedColumns[updateName] ??
      (updatedColumns[updateName] = Array.from({ length: tableRowCount(source) }, () =>
        nullLike(sample)
      ));
    positions.forEach((position, index) => {
      targetColumn[position] = column.items[index] ?? nullLike(sample);
    });
  }

  private evalGroupedSelect(
    source: QTable,
    sourcePositions: number[],
    columns: { name: string | null; value: AstNode }[] | null,
    by: { name: string | null; value: AstNode }[]
  ): QValue {
    const grouping = this.groupTableRows(source, sourcePositions, by);
    const selectColumns =
      columns ??
      Object.keys(source.columns)
        .filter(
          (name) =>
            !by.some(
              (column) =>
                column.name === name ||
                (column.value.kind === "identifier" && column.value.name === name)
            )
        )
        .map((name) => ({ name: null, value: { kind: "identifier", name } as AstNode }));
    const valueNames = qsqlColumnNames(selectColumns);
    const resultCells = selectColumns.map(() => [] as QValue[]);

    for (const group of grouping.groups) {
      const subgroup = selectTableRows(source, group.positions);
      const subgroupPositions = group.positions.map((index) => sourcePositions[index]!);
      const context = this.createTableContext(subgroup, subgroupPositions);
      selectColumns.forEach((column, index) => {
        resultCells[index]!.push(context.eval(column.value));
      });
    }

    return qKeyedTable(
      this.buildGroupedKeyTable(grouping.keyColumns, grouping.groups),
      buildTable(
        selectColumns.map((_, index) => ({
          name: valueNames[index]!,
          value: qList(
            resultCells[index]!,
            resultCells[index]!.every((item) => item.kind === resultCells[index]?.[0]?.kind)
          )
        }))
      )
    );
  }

  private evalGroupedExec(
    source: QTable,
    sourcePositions: number[],
    valueNode: AstNode,
    by: { name: string | null; value: AstNode }[]
  ): QValue {
    const grouping = this.groupTableRows(source, sourcePositions, by);
    const valueExpression =
      valueNode.kind === "assign" || valueNode.kind === "assignGlobal" ? valueNode.value : valueNode;
    const valueName =
      valueNode.kind === "assign" || valueNode.kind === "assignGlobal" ? valueNode.name : "";
    const values: QValue[] = [];

    for (const group of grouping.groups) {
      const subgroup = selectTableRows(source, group.positions);
      const subgroupPositions = group.positions.map((index) => sourcePositions[index]!);
      const context = this.createTableContext(subgroup, subgroupPositions);
      values.push(context.eval(valueExpression));
    }

    if (grouping.keyColumns.length === 1) {
      return qDictionary(
        grouping.groups.map((group) => group.keyValues[0]!),
        values
      );
    }

    return qKeyedTable(
      this.buildGroupedKeyTable(grouping.keyColumns, grouping.groups),
      buildTable([
        {
          name: valueName,
          value: qList(values, values.every((item) => item.kind === values[0]?.kind))
        }
      ])
    );
  }

  private evalSelect(node: Extract<AstNode, { kind: "select" }>): QValue {
    const { filtered, positions, context } = this.createTableQueryScope(node.source, node.where, "select");
    if (node.by && node.by.length > 0) {
      return this.evalGroupedSelect(filtered, positions, node.columns, node.by);
    }
    if (!node.columns) {
      return filtered;
    }
    return buildTable(this.buildSelectColumns(node.columns, context, tableRowCount(filtered)));
  }

  private evalExec(node: Extract<AstNode, { kind: "exec" }>): QValue {
    const { filtered, positions, context } = this.createTableQueryScope(node.source, node.where, "exec");
    if (node.by && node.by.length > 0) {
      return this.evalGroupedExec(filtered, positions, node.value, node.by);
    }
    return context.eval(node.value);
  }

  private evalUpdate(node: Extract<AstNode, { kind: "update" }>): QValue {
    const { source, positions, context } = this.createTableQueryScope(node.source, node.where, "update");
    const updatedColumns = this.cloneTableColumns(source);

    for (const update of node.updates) {
      const value = context.eval(update.value);
      const column = materializeTableColumn(value, positions.length);
      this.applyUpdateColumn(updatedColumns, source, positions, update.name, column);
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
    const source = this.requireTableSource(node.source, "delete");

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

  private evalBranchBody(body: AstNode[]) {
    return this.evalStatements(body);
  }

  private evalConditional(node: Extract<AstNode, { kind: "cond" }>) {
    for (const branch of node.branches) {
      if (isTruthy(this.eval(branch.condition))) {
        return this.eval(branch.value);
      }
    }
    return node.elseValue ? this.eval(node.elseValue) : qNull();
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
      case "@'":
        return applyEachValue(this, left, right);
      case "\\":
        return scanValue(this, left, right);
      case "+/":
        return reduceValueWithSeed(this, this.get("+"), left, right);
      case "+\\":
        return scanValueWithSeed(this, this.get("+"), left, right);
      case ",/":
        return concatValues(left, right);
      case "in":
        return inValue(left, right);
      case "and":
        return mapBinary(left, right, (a, b) => minPair(a, b));
      case "like":
        return likeValue(left, right);
      case "or":
        return mapBinary(left, right, (a, b) => maxPair(a, b));
      case "over":
        return reduceValue(this, left, right);
      case "prior":
        return priorValue(this, left, right);
      case "scan":
        return scanValue(this, left, right);
      case "ss":
        return ssValue(left, right);
      case "sv":
        return svValue(left, right);
      case "vs":
        return vsValue(left, right);
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
      case "div":
        return mapBinary(left, right, (a, b) => divValue(a, b));
      case "mavg":
        return movingValue(left, right, avgValue, false);
      case "mcount":
        return movingValue(left, right, movingCountValue, true);
      case "mdev":
        return movingValue(left, right, (window) => deviationValue(window, false), false);
      case "msum":
        return movingValue(left, right, sumValue, false);
      case "mod":
        return mapBinary(left, right, (a, b) => modValue(a, b));
      case "rotate":
        return rotateValue(left, right);
      case "sublist":
        return sublistValue(left, right);
      case "xcol":
        return xcolValue(left, right);
      case "xbar":
        return xbarValue(left, right);
      case "xexp":
        return mapBinary(left, right, (a, b) => qFloat(Math.pow(toNumber(a), toNumber(b))));
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

  keyValue(arg: QValue): QValue {
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
        const roots = [...this.collectEnvKeys()]
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

  private seedNamespaces() {
    const env = this.host.env();
    const now = this.host.now();
    const timezone = this.host.timezone();
    const size = this.host.consoleSize();

    this.env.set(
      ".Q",
      namespaceValue(".Q", [
        ["n", qString("0123456789")],
        ["A", qString("ABCDEFGHIJKLMNOPQRSTUVWXYZ")],
        ["a", qString("abcdefghijklmnopqrstuvwxyz")],
        ["an", qString("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789")],
        ["opt", builtinRef(".Q.opt", 1)],
        ["def", builtinRef(".Q.def", 3)],
        ["f", builtinRef(".Q.f", 2)],
        ["fmt", builtinRef(".Q.fmt", 3)],
        ["addmonths", builtinRef(".Q.addmonths", 2)],
        ["atob", builtinRef(".Q.atob", 1)],
        ["btoa", builtinRef(".Q.btoa", 1)],
        ["s", builtinRef(".Q.s", 1)],
        ["id", builtinRef(".Q.id", 1)],
        ["x10", builtinRef(".Q.x10", 1)],
        ["j10", builtinRef(".Q.j10", 1)],
        ["x12", builtinRef(".Q.x12", 1)],
        ["j12", builtinRef(".Q.j12", 1)],
        ["res", qList(Q_RESERVED_WORDS.map((name) => qSymbol(name)), true)],
        ["b6", qString(Q_X10_ALPHABET)],
        ["nA", qString(Q_X12_ALPHABET)],
        ["K", qDate("0Nd")],
        ["M", qFloat(Number.POSITIVE_INFINITY, "posInf")],
        ["k", qFloat(5)],
        ["rows", qInt(size.rows)],
        ["cols", qInt(size.columns)]
      ])
    );

    this.env.set(
      ".z",
      namespaceValue(".z", [
        ["K", qFloat(5)],
        ["D", qString(now.toISOString().slice(0, 10).replace(/-/g, "."))],
        ["T", qString(now.toTimeString().slice(0, 8))],
        ["P", qString(now.toISOString())],
        ["Z", qString(timezone)],
        ["o", qString(typeof navigator !== "undefined" ? navigator.userAgent : "node")],
        ["x", qList([])],
        ["e", qList(Object.entries(env).map(([k, v]) => qString(`${k}=${v}`)))]
      ])
    );

    this.env.set(
      ".cx",
      namespaceValue(".cx", [
        ["_usage", qString(CX_USAGE)],
        ["from", builtinRef(".cx.from", 1)],
        ["new", builtinRef(".cx.new", 2)],
        ["z", builtinRef(".cx.z", 2)],
        ["zero", qComplex(0, 0)],
        ["one", qComplex(1, 0)],
        ["i", qComplex(0, 1)],
        ["re", builtinRef(".cx.re", 1)],
        ["im", builtinRef(".cx.im", 1)],
        ["conj", builtinRef(".cx.conj", 1)],
        ["neg", builtinRef(".cx.neg", 1)],
        ["add", builtinRef(".cx.add", 2)],
        ["sub", builtinRef(".cx.sub", 2)],
        ["mul", builtinRef(".cx.mul", 2)],
        ["div", builtinRef(".cx.div", 2)],
        ["abs", builtinRef(".cx.abs", 1)],
        ["modulus", builtinRef(".cx.modulus", 1)],
        ["floor", builtinRef(".cx.floor", 1)],
        ["ceil", builtinRef(".cx.ceil", 1)],
        ["round", builtinRef(".cx.round", 1)],
        ["frac", builtinRef(".cx.frac", 1)],
        ["mod", builtinRef(".cx.mod", 2)],
        ["arg", builtinRef(".cx.arg", 1)],
        ["recip", builtinRef(".cx.recip", 1)],
        ["normalize", builtinRef(".cx.normalize", 1)],
        ["fromPolar", builtinRef(".cx.fromPolar", 2)],
        ["polar", builtinRef(".cx.polar", 1)],
        ["exp", builtinRef(".cx.exp", 1)],
        ["log", builtinRef(".cx.log", 1)],
        ["pow", builtinRef(".cx.pow", 2)],
        ["powEach", builtinRef(".cx.powEach", 2)],
        ["sqrt", builtinRef(".cx.sqrt", 1)],
        ["sin", builtinRef(".cx.sin", 1)],
        ["cos", builtinRef(".cx.cos", 1)],
        ["tan", builtinRef(".cx.tan", 1)],
        ["str", builtinRef(".cx.str", 1)]
      ])
    );
  }

  private lookup(name: string): QValue | undefined {
    const local = this.env.get(name);
    if (local !== undefined) {
      return local;
    }
    return this.parent?.lookup(name);
  }

  private collectEnvKeys() {
    const names = new Set<string>();
    let current: Session | null = this;
    while (current) {
      for (const key of current.env.keys()) {
        names.add(key);
      }
      current = current.parent;
    }
    return names;
  }

  private getRootValue(name: string): QValue | undefined {
    return this.lookup(`.${name}`) ?? this.lookup(name);
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
    let current: QValue | undefined = this.getRootValue(parts[0]!);
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

const createBuiltins = (): ReadonlyMap<string, BuiltinEntry> => {
  const builtins = new Map<string, BuiltinEntry>();
  const register = (name: string, arity: number, impl: BuiltinImpl) => {
    builtins.set(name, {
      kind: "builtin",
      name,
      arity,
      impl
    });
  };
  const registerAlias = (alias: string, target: string) => {
    builtins.set(alias, builtins.get(target)!);
  };
  const registerUnsupported = (...names: string[]) => {
    for (const name of names) {
      register(name, 1, (session) => session.unsupported(name));
    }
  };

  register("abs", 1, (_, [arg]) => absValue(arg));
  register("all", 1, (_, [arg]) => allValue(arg));
  register("any", 1, (_, [arg]) => anyValue(arg));
  register("avgs", 1, (_, [arg]) => avgsValue(arg));
  register("til", 1, (_, [arg]) => qList(Array.from({ length: toNumber(arg) }, (_, i) => qInt(i)), true));
  register("ceiling", 1, (_, [arg]) => ceilingValue(arg));
  register("cols", 1, (_, [arg]) => colsValue(arg));
  register("count", 1, (_, [arg]) => qInt(countValue(arg)));
  register("desc", 1, (_, [arg]) => descValue(arg));
  register("differ", 1, (_, [arg]) => differValue(arg));
  register("exp", 1, (_, [arg]) => numericUnary(arg, Math.exp));
  register("fills", 1, (_, [arg]) => fillsValue(arg));
  register("first", 1, (_, [arg]) => firstValue(arg));
  register("last", 1, (_, [arg]) => lastValue(arg));
  register("log", 1, (_, [arg]) => numericUnary(arg, Math.log));
  register("iasc", 1, (_, [arg]) => gradeValue(arg, true));
  register("idesc", 1, (_, [arg]) => gradeValue(arg, false));
  register("asc", 1, (_, [arg]) => ascValue(arg));
  register("asin", 1, (_, [arg]) => numericUnary(arg, Math.asin));
  register("acos", 1, (_, [arg]) => numericUnary(arg, Math.acos));
  register("atan", 1, (_, [arg]) => numericUnary(arg, Math.atan));
  register("min", 1, (_, [arg]) => minValue(arg));
  register("mins", 1, (_, [arg]) => minsValue(arg));
  register("max", 1, (_, [arg]) => maxValue(arg));
  register("maxs", 1, (_, [arg]) => maxsValue(arg));
  register("med", 1, (_, [arg]) => medianValue(arg));
  register("sum", 1, (_, [arg]) => sumValue(arg));
  register("avg", 1, (_, [arg]) => avgValue(arg));
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
  register("group", 1, (_, [arg]) => groupValue(arg));
  register("key", 1, (session, [arg]) => session.keyValue(arg));
  registerAlias("keys", "key");
  register("lower", 1, (_, [arg]) => lowerValue(arg));
  register("ltrim", 1, (_, [arg]) => trimStringValue(arg, "left"));
  register("next", 1, (_, [arg]) => nextValue(arg));
  register("upper", 1, (_, [arg]) => upperValue(arg));
  register("prd", 1, (_, [arg]) => productValue(arg));
  register("prds", 1, (_, [arg]) => prdsValue(arg));
  register("prev", 1, (_, [arg]) => prevValue(arg));
  register("raze", 1, (_, args) =>
    args.length === 1 ? razeValue(args[0]!) : args.slice(1).reduce((acc, item) => razeValue(qList([acc, item])), args[0]!)
  );
  register("ratios", 1, (_, [arg]) => ratiosValue(arg));
  register("rtrim", 1, (_, [arg]) => trimStringValue(arg, "right"));
  register("var", 1, (_, [arg]) => varianceValue(arg, false));
  register("svar", 1, (_, [arg]) => varianceValue(arg, true));
  register("dev", 1, (_, [arg]) => deviationValue(arg, false));
  register("sdev", 1, (_, [arg]) => deviationValue(arg, true));
  register("-':", 1, (_, [arg, maybeValues]) =>
    maybeValues === undefined ? deltasValue(arg) : deltasValue(maybeValues, arg)
  );
  registerAlias("deltas", "-':");
  register("string", 1, (_, [arg]) => stringValue(arg));
  register("sums", 1, (_, [arg]) => sumsValue(arg));
  register("trim", 1, (_, [arg]) => trimStringValue(arg, "both"));
  register("type", 1, (_, [arg]) => qShort(qTypeNumber(arg)));
  register("where", 1, (_, [arg]) => whereValue(arg));
  register("value", 1, (_, [arg]) => arg);
  register("::", 1, (_, [arg]) => arg);
  register("show", 1, (session, [arg]) => {
    session.emit(arg);
    return arg;
  });
  register("system", 1, (session, [arg]) => {
    const text = arg.kind === "string" ? arg.value : formatValue(arg, { trailingNewline: false });
    if (text.startsWith("P ")) {
      return qNull();
    }
    return session.unsupported("system");
  });
  registerUnsupported("hopen", "hclose", "hcount", "hdel", "read0", "read1");
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
  register(".Q.f", 2, (_, [decimals, value]) => qString(toNumber(value).toFixed(toNumber(decimals))));
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
    return qComplex(
      Math.sqrt(Math.hypot(value.re, value.im)) * Math.cos(angle),
      Math.sqrt(Math.hypot(value.re, value.im)) * Math.sin(angle)
    );
  });
  register(".cx.sin", 1, (_, [arg]) => {
    const value = complexParts(arg);
    return qComplex(Math.sin(value.re) * Math.cosh(value.im), Math.cos(value.re) * Math.sinh(value.im));
  });
  register(".cx.cos", 1, (_, [arg]) => {
    const value = complexParts(arg);
    return qComplex(Math.cos(value.re) * Math.cosh(value.im), -Math.sin(value.re) * Math.sinh(value.im));
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
  register("and", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => minPair(a, b)));
  register("cross", 2, (_, [left, right]) => crossValue(left, right));
  register("over", 2, (session, [callable, arg, seed]) => reduceValue(session, callable, arg, seed));
  register("or", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => maxPair(a, b)));
  register("prior", 2, (session, [callable, arg]) => priorValue(session, callable, arg));
  register("rotate", 2, (_, [left, right]) => rotateValue(left, right));
  register("scan", 2, (session, [callable, arg, seed]) => scanValue(session, callable, arg, seed));
  register("ss", 2, (_, [left, right]) => ssValue(left, right));
  register("sublist", 2, (_, [left, right]) => sublistValue(left, right));
  register("sv", 2, (_, [left, right]) => svValue(left, right));
  register("vs", 2, (_, [left, right]) => vsValue(left, right));
  register("xbar", 2, (_, [left, right]) => xbarValue(left, right));
  register("xcol", 2, (_, [left, right]) => xcolValue(left, right));
  register("xexp", 2, (_, [left, right]) =>
    mapBinary(left, right, (a, b) => qFloat(Math.pow(toNumber(a), toNumber(b))))
  );
  register("like", 2, (_, [left, right]) => likeValue(left, right));
  register("within", 2, (_, [left, right]) => withinValue(left, right));
  register("except", 2, (_, [left, right]) => exceptValue(left, right));
  register("inter", 2, (_, [left, right]) => interValue(left, right));
  register("union", 2, (_, [left, right]) => unionValue(left, right));
  register("xlog", 2, (_, [left, right]) =>
    mapBinary(left, right, (a, b) => qFloat(Math.log(toNumber(b)) / Math.log(toNumber(a))))
  );
  register(",/", 1, (session, args) => {
    if (args.length === 1) {
      return razeValue(args[0]!);
    }
    const items = args.length === 2 && args[1]?.kind === "list" ? [args[0]!, ...args[1].items] : args;
    return items.slice(1).reduce((acc, item) => session.invoke(session.get(","), [acc, item]), items[0]!);
  });
  register("+/", 1, (session, args) => {
    const plus = session.get("+");
    if (args.length === 1) {
      return reduceValue(session, plus, args[0]!);
    }
    if (args.length === 2 && args[1]?.kind === "list") {
      return reduceValue(session, plus, args[1], args[0]!);
    }
    return reduceValue(session, plus, qList(args, args.every((arg) => arg.kind === args[0]?.kind)));
  });
  register("+\\", 1, (session, args) => {
    const plus = session.get("+");
    if (args.length === 1) {
      return scanValue(session, plus, args[0]!);
    }
    if (args.length === 2 && args[1]?.kind === "list") {
      return scanValue(session, plus, args[1], args[0]!);
    }
    return scanValue(session, plus, qList(args, args.every((arg) => arg.kind === args[0]?.kind)));
  });

  register("+", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => add(a, b)));
  register("-", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => subtract(a, b)));
  register("*", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => multiply(a, b)));
  register("%", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => divide(a, b)));
  register("div", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => divValue(a, b)));
  register("mavg", 2, (_, [left, right]) => movingValue(left, right, avgValue, false));
  register("mcount", 2, (_, [left, right]) => movingValue(left, right, movingCountValue, true));
  register("mdev", 2, (_, [left, right]) =>
    movingValue(left, right, (window) => deviationValue(window, false), false)
  );
  register("msum", 2, (_, [left, right]) => movingValue(left, right, sumValue, false));
  register("mod", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => modValue(a, b)));
  register("=", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => qBool(equals(a, b))));
  register("<", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => qBool(compare(a, b) < 0)));
  register(">", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => qBool(compare(a, b) > 0)));
  register("<=", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => qBool(compare(a, b) <= 0)));
  register(">=", 2, (_, [left, right]) => mapBinary(left, right, (a, b) => qBool(compare(a, b) >= 0)));
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
  register("/", 2, (session, [callable, arg, seed]) => reduceValue(session, callable, arg, seed));
  register("\\", 2, (session, [callable, arg, seed]) => scanValue(session, callable, arg, seed));
  return builtins;
};

const SHARED_BUILTINS = createBuiltins();

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
    "avgs",
    "til",
    "ceiling",
    "cols",
    "count",
    "desc",
    "differ",
    "exp",
    "fills",
    "first",
    "last",
    "log",
    "min",
    "mins",
    "max",
    "maxs",
    "med",
    "asc",
    "iasc",
    "idesc",
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
    "group",
    "key",
    "keys",
    "lower",
    "ltrim",
    "next",
    "upper",
    "cut",
    "prd",
    "prds",
    "prev",
    "raze",
    "ratios",
    "rtrim",
    "var",
    "svar",
    "dev",
    "sdev",
    "deltas",
    "trim",
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
    "mavg",
    "mcount",
    "mdev",
    "msum",
    "mod",
    "^",
    "?",
    "$",
    "@",
    "and",
    "in",
    "like",
    "|",
    "&",
    "cross",
    "or",
    "over",
    "prior",
    "scan",
    "ss",
    "sv",
    "vs",
    "within",
    "except",
    "inter",
    "union",
    "xbar",
    "xexp",
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
  private readonly stopOperators: Set<string>[] = [];

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
    if (
      this.peek().kind === "operator" &&
      this.peek().value === ":" &&
      this.peek(1).kind !== "lbracket" &&
      !(this.peek(1).kind === "operator" && this.peek(1).value === ":")
    ) {
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
    const columns =
      this.peek().kind === "identifier" &&
      (this.peek().value === "from" || this.peek().value === "by")
      ? null
      : this.parseSelectColumns(["by", "from"]);
    const by = this.parseOptionalByClause();
    this.consume("identifier", "from");
    const source = this.withStopIdentifiers(["where"], () => this.parseAssignment());
    const where = this.parseOptionalWhereClause();
    return { kind: "select", columns, by, source, where };
  }

  private parseExecExpression(): AstNode {
    this.consume("identifier", "exec");
    const value = this.withStopIdentifiers(["by", "from"], () => this.parseAssignment());
    const by = this.parseOptionalByClause();
    this.consume("identifier", "from");
    const source = this.withStopIdentifiers(["where"], () => this.parseAssignment());
    const where = this.parseOptionalWhereClause();
    return { kind: "exec", value, by, source, where };
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

  private parseSelectColumns(stopIdentifiers: string[] = ["from"]) {
    const columns: { name: string | null; value: AstNode }[] = [];
    while (!this.match("eof")) {
      const value = this.withStopOperators([","], () =>
        this.withStopIdentifiers(stopIdentifiers, () => this.parseAssignment())
      );
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
      const update = this.withStopOperators([","], () =>
        this.withStopIdentifiers(["from"], () => this.parseAssignment())
      );
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

  private parseOptionalByClause() {
    if (this.peek().kind === "identifier" && this.peek().value === "by") {
      this.consume("identifier", "by");
      return this.parseSelectColumns(["from"]);
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

  private withStopOperators<T>(stops: string[], fn: () => T): T {
    this.stopOperators.push(new Set(stops));
    try {
      return fn();
    } finally {
      this.stopOperators.pop();
    }
  }

  private isStopIdentifier(token: Token) {
    return token.kind === "identifier" && this.stopIdentifiers.some((stops) => stops.has(token.value));
  }

  private isStopOperator(token: Token) {
    return token.kind === "operator" && this.stopOperators.some((stops) => stops.has(token.value));
  }

  private parseAssignment(): AstNode {
    if (
      this.peek().kind === "identifier" &&
      this.peek(1).kind === "operator" &&
      this.peek(1).value === "::"
    ) {
      const name = this.consume("identifier").value;
      this.consume("operator", "::");
      return { kind: "assignGlobal", name, value: this.parseExpression() };
    }
    if (
      this.peek().kind === "identifier" &&
      this.peek(1).kind === "operator" &&
      this.peek(1).value === ":"
    ) {
      const name = this.consume("identifier").value;
      this.consume("operator", ":");
      return { kind: "assign", name, value: this.parseExpression() };
    }
    if (
      this.peek().kind === "identifier" &&
      this.peek(1).kind === "operator" &&
      isAssignmentOperator(this.peek(1).value)
    ) {
      const name = this.consume("identifier").value;
      const op = this.consume("operator").value;
      return {
        kind: "assign",
        name,
        value: {
          kind: "binary",
          op: op.slice(0, -1),
          left: { kind: "identifier", name },
          right: this.parseExpression()
        }
      };
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
        if (callee.kind === "identifier") {
          if (callee.name === "if") {
            return this.buildIfExpression(args);
          }
          if (callee.name === "$") {
            return this.buildCondExpression(args);
          }
        }
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

    const monadName =
      callee.kind === "identifier"
        ? callee.name
        : callee.kind === "group" &&
            callee.value.kind === "identifier" &&
            (callee.value.name === "+/" || callee.value.name === "+\\")
          ? callee.value.name
          : null;

    if (
      monadName !== null &&
      MONAD_KEYWORDS.has(monadName) &&
      this.canStartPrimary(this.peek()) &&
      !this.isStopIdentifier(this.peek()) &&
      !(this.peek().kind === "identifier" && WORD_DIAD_KEYWORDS.has(this.peek().value))
    ) {
      return {
        kind: "call",
        callee,
        args: [this.parseAssignment()]
      };
    }

    if (
      callee.kind === "identifier" &&
      WORD_DIAD_KEYWORDS.has(callee.name) &&
      this.canStartPrimary(this.peek()) &&
      !this.isStopIdentifier(this.peek())
    ) {
      return callee;
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
      while (this.peek().kind === "lbracket") {
        const nestedArgs = this.parseBracketArgs();
        const last = adjacent.pop()!;
        adjacent.push({ kind: "call", callee: last, args: nestedArgs });
      }
    }

    if (adjacent.length === 0) {
      return callee;
    }

    if (adjacent.length === 1 && (callee.kind === "string" || isCallableAst(callee))) {
      adjacent[0] = this.parseBinaryTail(adjacent[0]!);
    }

    if (callee.kind === "string") {
      return {
        kind: "call",
        callee,
        args: [adjacent.length === 1 ? adjacent[0] : { kind: "vector", items: adjacent }]
      };
    }

    if (isCallableAst(callee)) {
      if (
        adjacent.length > 1 &&
        !this.isStopIdentifier(this.peek()) &&
        !this.isStopOperator(this.peek()) &&
        ((this.peek().kind === "identifier" && WORD_DIAD_KEYWORDS.has(this.peek().value)) ||
          (this.peek().kind === "operator" &&
            this.peek().value !== ":" &&
            this.peek().value !== ";"))
      ) {
        const vectorArg: AstNode = { kind: "vector", items: adjacent };
        const binaryArg = this.parseBinaryTail(vectorArg);
        if (binaryArg !== vectorArg) {
          return { kind: "call", callee, args: [binaryArg] };
        }
      }
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

  private buildIfExpression(args: AstNode[]): AstNode {
    if (args.length < 2) {
      throw new QRuntimeError("parse", "if expects a condition and at least one body expression");
    }

    return {
      kind: "if",
      condition: args[0]!,
      body: args.slice(1)
    };
  }

  private buildCondExpression(args: AstNode[]): AstNode {
    if (args.length < 2) {
      throw new QRuntimeError("parse", "$ expects at least a condition and a result");
    }

    const elseValue = args.length % 2 === 1 ? args[args.length - 1]! : null;
    const branchArgs = elseValue ? args.slice(0, -1) : args;
    const branches: { condition: AstNode; value: AstNode }[] = [];

    for (let index = 0; index < branchArgs.length; index += 2) {
      const condition = branchArgs[index];
      const value = branchArgs[index + 1];
      if (!condition || !value) {
        throw new QRuntimeError("parse", "$ expects condition/result pairs");
      }
      branches.push({ condition, value });
    }

    return {
      kind: "cond",
      branches,
      elseValue
    };
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
    if (
      base === ";" ||
      (base === ":" &&
        this.peek().kind !== "lbracket" &&
        !(this.peek().kind === "operator" && this.peek().value === ":"))
    ) {
      throw new QRuntimeError("parse", `Unexpected token: operator ${base}`);
    }

    return { kind: "identifier", name: this.extendOperatorName(base) };
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
      this.skipNewlines();
      if (this.peek().kind === "rbracket") {
        break;
      }
      if (this.peek().kind === "separator") {
        args.push({ kind: "placeholder" });
        this.consume("separator");
        this.skipNewlines();
        continue;
      }
      args.push(this.parseExpression());
      this.skipNewlines();
      if (this.peek().kind === "separator") {
        this.consume("separator");
        this.skipNewlines();
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

  private skipNewlines() {
    while (this.peek().kind === "newline") {
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
    if (this.isStopOperator(this.peek())) {
      return left;
    }
    if (this.peek().kind === "identifier" && WORD_DIAD_KEYWORDS.has(this.peek().value)) {
      const op = this.consume("identifier").value;
      const right = this.parseAssignment();
      return { kind: "binary", op, left, right };
    }
    if (this.peek().kind === "operator" && this.peek().value !== ":" && this.peek().value !== ";") {
      const op = this.extendOperatorName(this.consume("operator").value);
      if (["separator", "rparen", "rbracket", "rbrace", "eof"].includes(this.peek().kind)) {
        return { kind: "call", callee: { kind: "identifier", name: op }, args: [left] };
      }
      const right = this.parseAssignment();
      return { kind: "binary", op, left, right };
    }
    return left;
  }

  private extendOperatorName(base: string) {
    let name = base;
    while (this.peek().kind === "operator") {
      const suffix = this.peek().value;
      if (suffix === "':" && !name.endsWith(":")) {
        name += this.consume("operator").value;
        continue;
      }
      if (suffix === "'" && !name.endsWith("'") && !name.endsWith(":")) {
        name += this.consume("operator").value;
        continue;
      }
      if (suffix === ":" && !name.endsWith(":")) {
        name += this.consume("operator").value;
        continue;
      }
      if ((suffix === "/" || suffix === "\\") && !name.endsWith("/") && !name.endsWith("\\")) {
        name += this.consume("operator").value;
        continue;
      }
      break;
    }
    return name;
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
      const next = source[i + 1] ?? "";
      let previousIndex = i - 1;
      while (
        previousIndex >= 0 &&
        (source[previousIndex] === " " ||
          source[previousIndex] === "\t" ||
          source[previousIndex] === "\r")
      ) {
        previousIndex -= 1;
      }
      const previousNonSpace = previousIndex >= 0 ? source[previousIndex] : "\n";
      const previousChar = source[i - 1] ?? "";
      const atStatementStart =
        previousIndex < 0 || previousNonSpace === "\n" || previousNonSpace === ";";
      const startsCommentText =
        next === " " ||
        next === "\t" ||
        /[A-Za-z0-9`"]/.test(next);
      const looksLikeTrailingComment =
        (previousChar === " " || previousChar === "\t" || previousChar === "\r") &&
        startsCommentText &&
        next !== ":" &&
        next !== "/" &&
        next !== "\\";
      const inCommentPosition =
        next !== ":" && (atStatementStart || looksLikeTrailingComment);
      if (inCommentPosition) {
        while (i < source.length && source[i] !== "\n") {
          i += 1;
        }
        continue;
      }
    }

    if (char === "\\") {
      const previous = source[i - 1] ?? "\n";
      const atDirectiveStart =
        i === 0 ||
        previous === "\n" ||
        previous === ";" ||
        previous === " " ||
        previous === "\t" ||
        previous === "\r";
      if (atDirectiveStart) {
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

    if (
      (char === "+" || char === ",") &&
      (source[i + 1] === "/" || source[i + 1] === "\\") &&
      source[i + 2] !== ":" &&
      source[i + 2] !== "'"
    ) {
      tokens.push({ kind: "operator", value: `${char}${source[i + 1]}` });
      i += 2;
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

    const temporalBoundary = "(?=$|[ \\t\\r\\n\\]\\)\\};,])";
    const monthMatch = source
      .slice(i)
      .match(new RegExp(`^\\d{4}\\.\\d{2}m?${temporalBoundary}`));
    if (monthMatch) {
      tokens.push({ kind: "date", value: monthMatch[0] });
      i += monthMatch[0].length;
      continue;
    }

    const timespanMatch = source
      .slice(i)
      .match(new RegExp(`^\\d{1,2}:\\d{2}:\\d{2}\\.\\d{9}${temporalBoundary}`));
    if (timespanMatch) {
      tokens.push({ kind: "date", value: timespanMatch[0] });
      i += timespanMatch[0].length;
      continue;
    }

    const timeMatch = source
      .slice(i)
      .match(new RegExp(`^\\d{1,2}:\\d{2}:\\d{2}\\.\\d{3}${temporalBoundary}`));
    if (timeMatch) {
      tokens.push({ kind: "date", value: timeMatch[0] });
      i += timeMatch[0].length;
      continue;
    }

    const secondMatch = source
      .slice(i)
      .match(new RegExp(`^\\d{1,2}:\\d{2}:\\d{2}${temporalBoundary}`));
    if (secondMatch) {
      tokens.push({ kind: "date", value: secondMatch[0] });
      i += secondMatch[0].length;
      continue;
    }

    const minuteMatch = source
      .slice(i)
      .match(new RegExp(`^\\d{1,2}:\\d{2}${temporalBoundary}`));
    if (minuteMatch) {
      tokens.push({ kind: "date", value: minuteMatch[0] });
      i += minuteMatch[0].length;
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

    const opMatch = source
      .slice(i)
      .match(/^(<=|>=|<>|::|\/:|\\:|[+\-*%=<>,!#_~?/^&|@\\$']\:|[+\-*%=<>,!#_~:?/^&|@\\'$])/);
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

const isAssignmentOperator = (value: string) =>
  value.length > 1 && value.endsWith(":") && value !== "::";

const isShowExpression = (node: AstNode): boolean =>
  node.kind === "call" &&
  node.callee.kind === "identifier" &&
  node.callee.name === "show";

const isSilentExpression = (node: AstNode): boolean =>
  node.kind === "assign" || node.kind === "assignGlobal" || isShowExpression(node);

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
      return `select ${node.columns ? node.columns.map((column) => column.name ? `${column.name}:${renderAst(column.value)}` : renderAst(column.value)).join(",") : ""}${node.by ? ` by ${node.by.map((column) => column.name ? `${column.name}:${renderAst(column.value)}` : renderAst(column.value)).join(",")}` : ""} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "exec":
      return `exec ${renderAst(node.value)}${node.by ? ` by ${node.by.map((column) => column.name ? `${column.name}:${renderAst(column.value)}` : renderAst(column.value)).join(",")}` : ""} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "update":
      return `update ${node.updates.map((update) => `${update.name}:${renderAst(update.value)}`).join(",")} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "delete":
      return `delete ${node.columns ? node.columns.join(",") : ""} from ${renderAst(node.source)}${node.where ? ` where ${renderAst(node.where)}` : ""}`;
    case "if":
      return `if[${[renderAst(node.condition), ...node.body.map(renderAst)].join(";")}]`;
    case "cond": {
      const items = node.branches.flatMap((branch) => [
        renderAst(branch.condition),
        renderAst(branch.value)
      ]);
      if (node.elseValue) {
        items.push(renderAst(node.elseValue));
      }
      return `$[${items.join(";")}]`;
    }
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
    case "assignGlobal":
      return `${node.name}::${renderAst(node.value)}`;
    case "call":
      return `${renderAst(node.callee)}[${node.args.map(renderAst).join(";")}]`;
    case "lambda":
      return node.source;
    case "program":
      return node.statements.map(renderAst).join(";");
  }
  throw new QRuntimeError("nyi", `Cannot render AST node ${(node as AstNode).kind}`);
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

const parseTemporalLiteral = (raw: string): QValue => {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(raw)) {
    return qDate(raw);
  }
  if (/^\d{4}\.\d{2}m?$/.test(raw)) {
    return qTemporal("month", raw);
  }
  if (/^\d{1,2}:\d{2}:\d{2}\.\d{9}$/.test(raw)) {
    return qTemporal("timespan", `0D${raw}`);
  }
  if (/^\d{1,2}:\d{2}:\d{2}\.\d{3}$/.test(raw)) {
    return qTemporal("time", raw);
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) {
    return qTemporal("second", raw);
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    return qTemporal("minute", raw);
  }
  return qDate(raw);
};

const qTemporal = (temporalType: TemporalType, value: string): QValue =>
  ({
    kind: "temporal",
    temporalType,
    value
  } as QValue);

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
    case "assignGlobal":
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
    case "if":
      collectImplicitParams(node.condition, used);
      node.body.forEach((statement) => collectImplicitParams(statement, used));
      return;
    case "cond":
      node.branches.forEach((branch) => {
        collectImplicitParams(branch.condition, used);
        collectImplicitParams(branch.value, used);
      });
      if (node.elseValue) {
        collectImplicitParams(node.elseValue, used);
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
  if (value.kind === "temporal" && value.temporalType === "date") {
    if (value.value === "0Nd") {
      return qDate("0Nd");
    }
    return qDate(formatQDateFromDays(Math.abs(parseQDateDays(value.value))));
  }
  if (value.kind === "number") {
    if (value.special === "intNull") {
      return qInt(0, "intNull");
    }
    if (value.special === "intPosInf") {
      return qInt(0, "intPosInf");
    }
    if (value.special === "intNegInf") {
      return qInt(0, "intPosInf");
    }
  }
  if (value.kind === "number" && value.numericType === "float") {
    if (value.special === "null") {
      return qFloat(Number.NaN, "null");
    }
    if (value.special === "posInf") {
      return qFloat(Number.POSITIVE_INFINITY, "posInf");
    }
    if (value.special === "negInf") {
      return qFloat(Number.POSITIVE_INFINITY, "posInf");
    }
    return qFloat(Math.abs(value.value));
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

const medianValue = (value: QValue): QValue => {
  const list = asList(value);
  const items = [...list.items];
  if (items.length === 0) {
    return qFloat(Number.NaN, "null");
  }

  const sorted = items.sort(compare);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    const item = sorted[middle]!;
    return item.kind === "number" ? qFloat(toNumber(item)) : item;
  }

  const left = sorted[middle - 1]!;
  const right = sorted[middle]!;
  if (left.kind === "number" && right.kind === "number") {
    return qFloat((toNumber(left) + toNumber(right)) / 2);
  }
  return left;
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

const avgsValue = (value: QValue): QValue => {
  const list = asList(value);
  let running: QValue = qInt(0);
  let count = 0;
  return qList(
    list.items.map((item) => {
      if (!isNullish(item)) {
        running = add(running, item);
        count += 1;
      }
      return count === 0 ? qFloat(Number.NaN, "null") : qFloat(toNumber(running) / count);
    }),
    false
  );
};

const productValue = (value: QValue): QValue => {
  if (value.kind !== "list") {
    return value;
  }
  return value.items.reduce((acc, item) => multiply(acc, item), qInt(1));
};

const prdsValue = (value: QValue): QValue => {
  const list = asList(value);
  let running: QValue = qInt(1);
  return qList(
    list.items.map((item) => {
      if (!isNullish(item)) {
        running = multiply(running, item);
      }
      return running;
    }),
    list.homogeneous ?? false
  );
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

const nextValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qString(`${value.value.slice(1)} `);
  }
  const list = asList(value);
  if (list.items.length === 0) {
    return qList([], list.homogeneous ?? false);
  }
  return qList(
    [...list.items.slice(1), nullLike(list.items.at(-1))],
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

const minsValue = (value: QValue): QValue => {
  const list = asList(value);
  let running: QValue | null = null;
  return qList(
    list.items.map((item) => {
      if (!isNullish(item)) {
        running = running === null ? item : minPair(running, item);
      }
      return running ?? nullLike(item);
    }),
    list.homogeneous ?? false
  );
};

const maxsValue = (value: QValue): QValue => {
  const list = asList(value);
  let running: QValue | null = null;
  return qList(
    list.items.map((item) => {
      if (!isNullish(item)) {
        running = running === null ? item : maxPair(running, item);
      }
      return running ?? nullLike(item);
    }),
    list.homogeneous ?? false
  );
};

const ratiosValue = (value: QValue): QValue => {
  const list = asList(value);
  return qList(
    list.items.map((item, index) => {
      if (isNullish(item)) {
        return qFloat(Number.NaN, "null");
      }
      if (index === 0) {
        return qFloat(toNumber(item));
      }
      const previous = list.items[index - 1] ?? qNull();
      return isNullish(previous) ? qFloat(Number.NaN, "null") : divide(item, previous);
    }),
    false
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

const movingCountValue = (value: QValue): QValue => {
  const list = asList(value);
  return qInt(list.items.filter((item) => !isNullish(item)).length);
};

const movingValue = (
  windowSize: QValue,
  value: QValue,
  reducer: (value: QValue) => QValue,
  homogeneous: boolean
): QValue => {
  const size = Math.max(1, Math.trunc(toNumber(windowSize)));
  const list = asList(value);
  const values = list.items.map((_, index) => {
    const start = Math.max(0, index - size + 1);
    const window = qList(list.items.slice(start, index + 1), list.homogeneous ?? false);
    return reducer(window);
  });
  const isHomogeneous = homogeneous && values.every((item) => item.kind === values[0]?.kind);
  const attribute =
    isHomogeneous &&
    values[0]?.kind === "number" &&
    values.every((item) => item.kind === "number" && item.numericType === "int")
      ? "explicitInt"
      : undefined;
  return qList(values, isHomogeneous, attribute);
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

const differValue = (value: QValue): QValue => {
  const list = asList(value);
  return qList(
    list.items.map((item, index) =>
      qBool(index === 0 ? true : !equals(item, list.items[index - 1] ?? qNull()))
    ),
    true
  );
};

const fillsValue = (value: QValue): QValue => {
  const list = asList(value);
  let previous: QValue | null = null;
  return qList(
    list.items.map((item) => {
      if (isNullish(item)) {
        return previous ?? item;
      }
      previous = item;
      return item;
    }),
    list.homogeneous ?? false
  );
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

const qsqlExpressionName = (node: AstNode | null): string | null => {
  if (!node) {
    return null;
  }
  switch (node.kind) {
    case "identifier":
      return node.name;
    case "group":
      return qsqlExpressionName(node.value);
    case "assign":
    case "assignGlobal":
      return node.name;
    case "call":
      return qsqlExpressionName(node.args[0] ?? null);
    case "binary":
      return qsqlExpressionName(node.left) ?? qsqlExpressionName(node.right);
    case "vector":
      return qsqlExpressionName(node.items[0] ?? null);
    default:
      return null;
  }
};

const QSQL_AGGREGATES = new Set([
  "sum",
  "avg",
  "min",
  "max",
  "count",
  "first",
  "last",
  "prd",
  "med",
  "dev",
  "sdev",
  "var",
  "svar"
]);

const isQsqlAggregateExpression = (node: AstNode | null): boolean => {
  if (!node) {
    return false;
  }
  if (node.kind === "group") {
    return isQsqlAggregateExpression(node.value);
  }
  if (node.kind === "assign" || node.kind === "assignGlobal") {
    return isQsqlAggregateExpression(node.value);
  }
  return (
    node.kind === "call" &&
    node.callee.kind === "identifier" &&
    node.args.length === 1 &&
    QSQL_AGGREGATES.has(node.callee.name)
  );
};

const qsqlColumnNames = (columns: { name: string | null; value: AstNode }[]) =>
  uniquifyQIdentifiers(
    columns.map((column, index) => column.name ?? qsqlExpressionName(column.value) ?? (index === 0 ? "x" : `x${index}`))
  );

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

const gradeValue = (value: QValue, ascending: boolean): QValue => {
  const items = asSequenceItems(value).map((item, index) => ({ item, index }));
  items.sort((left, right) => {
    const compared = compare(left.item, right.item);
    return compared === 0 ? left.index - right.index : ascending ? compared : -compared;
  });
  return qList(items.map(({ index }) => qInt(index)), true);
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

const shuffleItems = <T>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
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

const applyEachValue = (session: Session, left: QValue, right: QValue): QValue => {
  if (left.kind === "list" && right.kind === "list") {
    if (left.items.length !== right.items.length) {
      throw new QRuntimeError("length", "@' expects equal-length lists");
    }
    return qList(
      left.items.map((item, index) => session.invoke(item, [right.items[index]!])),
      false
    );
  }

  const items = asSequenceItems(right);
  return qList(items.map((item) => session.invoke(left, [item])), false);
};

const groupValue = (value: QValue): QValue => {
  const buckets: { key: QValue; positions: QValue[] }[] = [];
  asSequenceItems(value).forEach((item, index) => {
    const existing = buckets.find((candidate) => equals(candidate.key, item));
    if (existing) {
      existing.positions.push(qInt(index));
      return;
    }
    buckets.push({ key: item, positions: [qInt(index)] });
  });
  return qDictionary(
    buckets.map(({ key }) => key),
    buckets.map(({ positions }) => qList(positions, true))
  );
};

const callableArity = (value: QValue): number | null => {
  switch (value.kind) {
    case "builtin":
      return value.arity;
    case "lambda":
      return lambdaArity(value as LambdaValue);
    case "projection":
      return value.arity - value.args.filter((arg) => arg !== null).length;
    default:
      return null;
  }
};

const convergeValue = (session: Session, callable: QValue, value: QValue, scan: boolean): QValue => {
  const outputs = [value];
  let current = value;
  for (let index = 0; index < 1024; index += 1) {
    const next = session.invoke(callable, [current]);
    outputs.push(next);
    if (equals(next, current)) {
      return scan ? qList(outputs, false) : current;
    }
    current = next;
  }
  throw new QRuntimeError("limit", "converge exceeded iteration limit");
};

const reduceValueWithSeed = (session: Session, callable: QValue, seed: QValue, value: QValue): QValue => {
  let result = seed;
  for (const item of asSequenceItems(value)) {
    result = session.invoke(callable, [result, item]);
  }
  return result;
};

const scanValueWithSeed = (session: Session, callable: QValue, seed: QValue, value: QValue): QValue => {
  const outputs: QValue[] = [];
  let result = seed;
  for (const item of asSequenceItems(value)) {
    result = session.invoke(callable, [result, item]);
    outputs.push(result);
  }
  return qList(outputs, false);
};

const flattenRazeLeaves = (value: QValue): QValue[] => {
  if (value.kind !== "list") {
    return [value];
  }
  return value.items.flatMap((item) => flattenRazeLeaves(item));
};

const reduceValue = (session: Session, callable: QValue, value: QValue, seed?: QValue): QValue => {
  if (seed !== undefined) {
    return reduceValueWithSeed(session, callable, seed, value);
  }
  if (callableArity(callable) === 1) {
    return convergeValue(session, callable, value, false);
  }
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

const scanValue = (session: Session, callable: QValue, value: QValue, seed?: QValue): QValue => {
  if (seed !== undefined) {
    return scanValueWithSeed(session, callable, seed, value);
  }
  if (callableArity(callable) === 1) {
    return convergeValue(session, callable, value, true);
  }
  const items = asSequenceItems(value);
  if (items.length === 0) {
    return qList([], false);
  }
  let result = items[0]!;
  const outputs = [result];
  for (const item of items.slice(1)) {
    result = session.invoke(callable, [result, item]);
    outputs.push(result);
  }
  return qList(outputs, false);
};

const priorValue = (session: Session, callable: QValue, value: QValue): QValue => {
  if (value.kind === "string") {
    const chars = [...value.value].map((char) => qString(char));
    const result = priorValue(session, callable, qList(chars, true));
    return rebuildSequence(value, asSequenceItems(result));
  }
  const list = asList(value);
  if (list.items.length === 0) {
    return qList([], list.homogeneous ?? false);
  }
  return qList(
    list.items.map((item, index) =>
      index === 0 ? item : session.invoke(callable, [list.items[index - 1] ?? qNull(), item])
    ),
    false
  );
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

const ssValue = (left: QValue, right: QValue): QValue => {
  if (left.kind !== "string" || right.kind !== "string") {
    throw new QRuntimeError("type", "ss expects string arguments");
  }
  if (right.value.length === 0) {
    return qList([], true);
  }
  const positions: QValue[] = [];
  let index = 0;
  while (index <= left.value.length - right.value.length) {
    if (left.value.slice(index, index + right.value.length) === right.value) {
      positions.push(qInt(index));
      index += right.value.length;
      continue;
    }
    index += 1;
  }
  return qList(positions, true);
};

const stringLikeValue = (value: QValue): string | null => {
  if (value.kind === "string") {
    return value.value;
  }
  if (value.kind === "symbol") {
    return value.value;
  }
  if (value.kind === "list" && value.items.every((item) => item.kind === "string")) {
    return value.items.map((item) => (item as QString).value).join("");
  }
  return null;
};

const svValue = (left: QValue, right: QValue): QValue => {
  if (left.kind !== "string" || right.kind !== "list") {
    throw new QRuntimeError("type", "sv expects a string separator and a list of strings");
  }
  const parts = right.items.map(stringLikeValue);
  if (parts.some((part) => part === null)) {
    throw new QRuntimeError("type", "sv expects a list of strings");
  }
  return qString((parts as string[]).join(left.value));
};

const vsValue = (left: QValue, right: QValue): QValue => {
  if (left.kind !== "string" || right.kind !== "string") {
    throw new QRuntimeError("type", "vs expects string arguments");
  }
  if (left.value === "") {
    return qList([qString(right.value)], false);
  }
  return qList(right.value.split(left.value).map((part) => qString(part)), false);
};

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

const trimStringValue = (value: QValue, mode: "left" | "right" | "both"): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map((item) => trimStringValue(item, mode)), value.homogeneous ?? false);
  }
  if (value.kind === "symbol") {
    const trimmed = trimStringValue(qString(value.value), mode);
    if (trimmed.kind !== "string") {
      throw new QRuntimeError("type", "trim expects strings or symbols");
    }
    return qSymbol(trimmed.value);
  }
  if (value.kind !== "string") {
    throw new QRuntimeError("type", "trim expects strings or symbols");
  }
  switch (mode) {
    case "left":
      return qString(value.value.replace(/^\s+/, ""));
    case "right":
      return qString(value.value.replace(/\s+$/, ""));
    case "both":
      return qString(value.value.trim());
  }
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
  if (left.kind === "table" && right.kind === "table") {
    return concatTables(left, right);
  }
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

const concatTables = (left: QTable, right: QTable): QTable => {
  const leftNames = Object.keys(left.columns);
  const rightNames = Object.keys(right.columns);

  if (
    leftNames.length !== rightNames.length ||
    leftNames.some((name, index) => name !== rightNames[index])
  ) {
    throw new QRuntimeError("type", "Cannot append tables with different schemas");
  }

  return qTable(
    Object.fromEntries(
      leftNames.map((name) => {
        const leftColumn = left.columns[name]!;
        const rightColumn = right.columns[name]!;
        return [
          name,
          qList(
            [...leftColumn.items, ...rightColumn.items],
            (leftColumn.homogeneous ?? false) && (rightColumn.homogeneous ?? false)
          )
        ];
      })
    )
  );
};

const razeValue = (value: QValue): QValue => {
  if (value.kind !== "list") {
    return value;
  }
  const items = flattenRazeLeaves(value);
  if (items.length === 0) {
    return qList([]);
  }
  if (items.every((item) => item.kind === "string")) {
    return qString(items.map((item) => item.value).join(""));
  }
  return items.reduce((acc, item) => concatValues(acc, item));
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

const sampleSequence = (count: number, source: QValue): QValue => {
  const distinct = count < 0;
  const size = Math.abs(Math.trunc(count));

  if (source.kind === "number") {
    const limit = Math.max(0, Math.trunc(toNumber(source)));
    const pool = Array.from({ length: limit }, (_, index) => qInt(index));
    const picks = distinct
      ? shuffleItems(pool).slice(0, Math.min(size, pool.length))
      : Array.from({ length: size }, () => qInt(Math.floor(Math.random() * Math.max(limit, 1))));
    return qList(picks, true, "explicitInt");
  }

  const items = asSequenceItems(source);
  if (items.length === 0) {
    return rebuildSequence(source, []);
  }

  const picks = distinct
    ? shuffleItems(items).slice(0, Math.min(size, items.length))
    : Array.from({ length: size }, () => items[Math.floor(Math.random() * items.length)]!);
  return rebuildSequence(source, picks);
};

const findMappedValues = (left: QList, right: QValue): QValue | null => {
  if (!left.items.every((item) => item.kind === "symbol")) {
    return null;
  }

  const rightItems = right.kind === "list" ? right.items : [right];
  if (!rightItems.every((item) => item.kind === "symbol")) {
    return null;
  }

  const keyCount = Math.floor(left.items.length / 2);
  if (keyCount < 2) {
    return null;
  }

  const values = left.items.slice(0, left.items.length - keyCount);
  const keys = left.items.slice(left.items.length - keyCount);
  const hasDefault = values.length === keys.length + 1;
  if (!hasDefault) {
    return null;
  }

  const lookup = (item: QValue) => {
    const index = keys.findIndex((candidate) => equals(candidate, item));
    if (index >= 0) {
      return values[index]!;
    }
    return hasDefault ? values.at(-1)! : qInt(keys.length);
  };

  if (right.kind === "list") {
    return qList(right.items.map(lookup), values.every((item) => item.kind === values[0]?.kind));
  }

  return lookup(right);
};

const findValue = (left: QValue, right: QValue): QValue => {
  if (left.kind === "number") {
    return sampleSequence(left.value, right);
  }
  if (left.kind !== "list") {
    throw new QRuntimeError("type", "Find expects a list on the left");
  }

  const mapped = findMappedValues(left, right);
  if (mapped) {
    return mapped;
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

type CastHandler = (value: QValue) => QValue;

const castNameFromLeftOperand = (left: QValue) => {
  switch (left.kind) {
    case "symbol":
    case "string":
      return left.value;
    case "number":
      return left.numericType === "short" ? `${left.value}h` : null;
    default:
      return null;
  }
};

const CAST_ALIAS_GROUPS: ReadonlyArray<{ aliases: readonly string[]; cast: CastHandler }> = [
  { aliases: ["", "symbol", "11h"], cast: (value) => castSymbolValue(value) },
  { aliases: ["boolean", "bool", "1h"], cast: (value) => castBooleanValue(value) },
  { aliases: ["short", "h", "5h"], cast: (value) => castShortValue(value) },
  { aliases: ["int", "i", "long", "j", "6h", "7h"], cast: (value) => castIntValue(value) },
  { aliases: ["float", "real", "e", "f", "8h", "9h"], cast: (value) => castFloatValue(value) },
  { aliases: ["10h", "char", "string"], cast: (value) => castCharValue(value) },
  { aliases: ["date", "14h"], cast: (value) => castDateValue(value) }
];

const CAST_HANDLER_BY_NAME = new Map<string, CastHandler>(
  CAST_ALIAS_GROUPS.flatMap(({ aliases, cast }) => aliases.map((alias) => [alias, cast] as const))
);

const castValue = (left: QValue, right: QValue): QValue => {
  const castName = castNameFromLeftOperand(left);
  if (castName === null) {
    throw new QRuntimeError("type", "Cast expects a symbol or string on the left");
  }

  const cast = CAST_HANDLER_BY_NAME.get(castName);
  if (!cast) {
    throw new QRuntimeError("nyi", `Cast ${castName}$ is not implemented yet`);
  }

  return cast(right);
};

const xbarValue = (left: QValue, right: QValue): QValue =>
  mapBinary(left, right, (step, value) => {
    const interval = toNumber(step);
    if (interval === 0) {
      throw new QRuntimeError("domain", "xbar expects a non-zero interval");
    }
    return numeric(Math.floor(toNumber(value) / interval) * interval, !Number.isInteger(interval));
  });

const castSymbolValue = (value: QValue): QValue => {
  if (value.kind === "temporal") {
    return qSymbol(value.value);
  }
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
  if (value.kind === "temporal") {
    return qSymbol(value.value);
  }
  if (value.kind === "string") {
    return qSymbol(value.value);
  }
  if (value.kind === "symbol") {
    return value;
  }
  throw new QRuntimeError("type", "symbol$ expects strings or symbols");
};

const castBooleanValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(castBooleanAtom), true);
  }
  return castBooleanAtom(value);
};

const castBooleanAtom = (value: QValue): QValue => {
  if (value.kind === "null") {
    return qBool(false);
  }
  if (value.kind === "boolean") {
    return value;
  }
  if (value.kind === "number") {
    if (value.special === "null" || value.special === "intNull") {
      return qBool(false);
    }
    return qBool(value.value !== 0);
  }
  throw new QRuntimeError("type", "boolean$ expects boolean or numeric values");
};

const castShortValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(castShortAtom), true);
  }
  return castShortAtom(value);
};

const castShortAtom = (value: QValue): QValue => {
  if (value.kind === "null") {
    return qShort(0);
  }
  if (value.kind === "number") {
    if (value.special === "null" || value.special === "intNull") {
      return qShort(0);
    }
    return qShort(Math.trunc(value.value));
  }
  if (value.kind === "boolean") {
    return qShort(value.value ? 1 : 0);
  }
  throw new QRuntimeError("type", "short$ expects numeric values");
};

const castCharValue = (value: QValue): QValue => {
  if (value.kind === "null") {
    return qString("");
  }
  if (value.kind === "symbol" || value.kind === "temporal") {
    return qString(value.value);
  }
  if (value.kind === "number") {
    return qString(String.fromCharCode(Math.max(0, Math.trunc(toNumber(value)))));
  }
  if (value.kind === "boolean") {
    return qString(value.value ? "1" : "0");
  }
  if (value.kind === "string") {
    return value;
  }
  if (value.kind === "list" && value.items.every((item) => item.kind === "string")) {
    return qString(
      value.items
        .map((item) => (item.kind === "string" ? item.value : ""))
        .join("")
    );
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

const stringAtomValue = (value: QValue): QString => {
  if (value.kind === "symbol" || value.kind === "temporal") {
    return qString(value.value);
  }
  return qString(formatValue(value, { trailingNewline: false }));
};

const stringValue = (value: QValue): QValue => {
  if (value.kind === "string") {
    return qList([...value.value].map((char) => qString(char)), false);
  }
  if (value.kind === "list") {
    return qList(
      value.items.map((item) => (item.kind === "string" ? stringValue(item) : stringAtomValue(item))),
      false
    );
  }
  return stringAtomValue(value);
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
  if (value.kind === "temporal" && value.temporalType === "date") {
    if (value.value === "0Nd") {
      return qInt(0, "intNull");
    }
    return qInt(parseQDateDays(value.value));
  }
  if (value.kind === "boolean") {
    return qInt(value.value ? 1 : 0);
  }
  if (value.kind === "null") {
    return qInt(0, "intNull");
  }
  throw new QRuntimeError("type", "int$ expects numeric values");
};

const castFloatValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(castFloatAtom), true);
  }
  return castFloatAtom(value);
};

const castFloatAtom = (value: QValue): QValue => {
  if (value.kind === "null") {
    return qFloat(Number.NaN, "null");
  }
  if (value.kind === "number") {
    if (value.special === "null" || value.special === "intNull") {
      return qFloat(Number.NaN, "null");
    }
    if (value.special === "intPosInf" || value.special === "posInf") {
      return qFloat(Number.POSITIVE_INFINITY, "posInf");
    }
    if (value.special === "intNegInf" || value.special === "negInf") {
      return qFloat(Number.NEGATIVE_INFINITY, "negInf");
    }
    return qFloat(value.value);
  }
  if (value.kind === "boolean") {
    return qFloat(value.value ? 1 : 0);
  }
  throw new QRuntimeError("type", "float$ expects numeric values");
};

const castDateValue = (value: QValue): QValue => {
  if (value.kind === "list") {
    return qList(value.items.map(castDateAtom), true);
  }
  return castDateAtom(value);
};

const castDateAtom = (value: QValue): QValue => {
  if (value.kind === "null") {
    return qDate("0Nd");
  }
  if (value.kind === "temporal" && value.temporalType === "date") {
    return value;
  }
  if ((value.kind === "string" || value.kind === "symbol") && isDateLiteral(value.value)) {
    return qDate(value.value);
  }
  throw new QRuntimeError("type", "date$ expects date strings or dates");
};

const isDateLiteral = (value: string) => /^\d{4}\.\d{2}\.\d{2}$|^0Nd$/.test(value);

const Q_DATE_EPOCH_MS = Date.UTC(2000, 0, 1);

const parseQDateDays = (value: string) => {
  const [yearText, monthText, dayText] = value.split(".");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);
  const utcMs = Date.UTC(year, month - 1, day);
  return Math.round((utcMs - Q_DATE_EPOCH_MS) / 86400000);
};

const formatQDateFromDays = (days: number) => {
  const date = new Date(Q_DATE_EPOCH_MS + days * 86400000);
  return date.toISOString().slice(0, 10).replace(/-/g, ".");
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

const selectColumnRows = (column: QList, positions: number[]) =>
  qList(
    positions.map((position) => column.items[position] ?? nullLike(column.items[0])),
    column.homogeneous ?? false
  );

const selectTableRows = (table: QTable, positions: number[]) =>
  qTable(
    Object.fromEntries(
      Object.entries(table.columns).map(([name, column]) => [
        name,
        selectColumnRows(column, positions)
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

const requireUnaryIndex = (args: QValue[], message: string) => {
  if (args.length !== 1) {
    throw new QRuntimeError("rank", message);
  }
  return args[0]!;
};

const collectNumericPositions = (index: QValue, message: string) => {
  if (index.kind !== "list") {
    throw new QRuntimeError("type", message);
  }

  return index.items.map((item) => {
    if (item.kind !== "number") {
      throw new QRuntimeError("type", message);
    }
    return item.value;
  });
};

const tableColumnByName = (table: QTable, name: string) => {
  const column = table.columns[name];
  if (!column) {
    throw new QRuntimeError("name", `Unknown column: ${name}`);
  }
  return column;
};

const applyListIndex = (list: QList, args: QValue[]) => {
  if (args.length === 1) {
    return indexList(list, args[0]!);
  }
  if (args.length === 2) {
    return indexNestedRows(list, args);
  }
  throw new QRuntimeError("rank", "List indexing expects one or two arguments");
};

const applyStringIndex = (text: QString, args: QValue[]) =>
  indexString(text, requireUnaryIndex(args, "String indexing expects one argument"));

const applyDictionaryIndex = (dictionary: QDictionary, args: QValue[]) =>
  indexDictionary(dictionary, requireUnaryIndex(args, "Dictionary indexing expects one argument"));

const applyValue = (value: QValue, args: QValue[]): QValue => {
  switch (value.kind) {
    case "list":
      return applyListIndex(value, args);
    case "string":
      return applyStringIndex(value, args);
    case "dictionary":
      return applyDictionaryIndex(value, args);
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

const isSymbolList = (value: QValue) =>
  value.kind === "list" && value.items.every((item) => item.kind === "symbol");

const selectTableByUnaryIndex = (table: QTable, index: QValue): QValue => {
  if (index.kind === "symbol") {
    return tableColumnByName(table, index.value);
  }

  if (isSymbolList(index)) {
    return selectTableColumns(table, index);
  }

  if (index.kind === "number") {
    return rowFromTable(table, index.value);
  }

  if (index.kind === "list") {
    return selectTableRows(table, collectNumericPositions(index, "Table row index must be numeric"));
  }

  throw new QRuntimeError("type", "Unsupported table index");
};

const projectTableSelection = (selection: QValue, columnSelector: QValue) => {
  if (columnSelector.kind === "null") {
    return selection;
  }

  if (selection.kind === "table") {
    return selectTableColumns(selection, columnSelector);
  }

  if (selection.kind === "dictionary") {
    return indexDictionary(selection, columnSelector);
  }

  throw new QRuntimeError("type", "Unexpected intermediate table selection result");
};

const indexTable = (table: QTable, args: QValue[]): QValue => {
  if (args.length === 2) {
    const [rowSelector, columnSelector] = args;
    const rows = rowSelector.kind === "null" ? table : selectTableByUnaryIndex(table, rowSelector);
    return projectTableSelection(rows, columnSelector);
  }

  const index = requireUnaryIndex(args, "Table indexing expects one or two arguments");
  return selectTableByUnaryIndex(table, index);
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
  const keyColumns = keyNames.map((name) => table.keys.columns[name]!);
  const lookupTuple = (key: QValue) => {
    const values =
      keyColumns.length === 1
        ? [key]
        : key.kind === "list" && key.items.length === keyColumns.length && key.items.every((item) => item.kind !== "list")
          ? key.items
          : null;
    if (!values) {
      throw new QRuntimeError("type", "Keyed table lookup expects a key tuple");
    }

    const position = keyColumns[0]!.items.findIndex((_, rowIndex) =>
      values.every((value, index) => equals(keyColumns[index]!.items[rowIndex]!, value))
    );
    if (position < 0) {
      return rowFromTable(table.values, -1);
    }
    return rowFromTable(table.values, position);
  };

  const [index] = args;
  if (keyColumns.length === 1 && index.kind === "list") {
    return qList(index.items.map(lookupTuple), false);
  }
  if (keyColumns.length > 1 && index.kind === "list" && index.items.every((item) => item.kind === "list")) {
    return qList(index.items.map(lookupTuple), false);
  }
  return lookupTuple(index);
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
        if (value.attribute === "explicitFloat") {
          return `${value.items.map((item) => formatListNumber(item)).join(" ")}f`;
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
      if (
        value.items.some(
          (item) =>
            item.kind === "list" ||
            item.kind === "string" ||
            item.kind === "dictionary" ||
            item.kind === "table" ||
            item.kind === "keyedTable"
        )
      ) {
        return value.items.map(formatBare).join("\n");
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
  const useScientific = Number.isFinite(value) && value !== 0 && Math.abs(value) >= 1e12;
  const text = useScientific
    ? value.toExponential(6)
    : Number.isInteger(value)
      ? `${value}`
      : value.toPrecision(7);
  const normalized = text.includes("e") || text.includes("E")
    ? text
        .replace(/(\.\d*?[1-9])0+(e.*)$/i, "$1$2")
        .replace(/\.0+(e.*)$/i, "$1")
        .replace(/\.e/i, "e")
    : text.includes(".")
      ? text.replace(/0+$/, "").replace(/\.$/, "")
      : text;

  return Number.isInteger(value) && !useScientific ? `${normalized}f` : normalized;
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
    return formatFloat(value.value).replace(/f$/, "");
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
  const allNamesBlank = names.every((name) => name.length === 0);
  const header = allNamesBlank ? widths.map((width) => " ".repeat(width)).join(" ") : padRow(names);
  const divider = allNamesBlank ? widths.map((width) => "-".repeat(width)).join(" ") : "-".repeat(header.length);
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
