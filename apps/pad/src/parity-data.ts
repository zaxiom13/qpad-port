export type SupportLevel = "reference" | "high" | "medium" | "low" | "none";

export interface SupportCell {
  label: string;
  level: SupportLevel;
}

export interface ParityRow {
  surface: string;
  category: "Primitive" | "Syntax" | "Function" | "Namespace";
  officialQ: SupportCell;
  ours: SupportCell;
  jq: SupportCell;
  parity: SupportCell;
  note: string;
}

export interface ParitySummary {
  referenceFixtures: number;
  upstreamFixtures: number;
  browserSafeFixtures: number;
}

export const paritySummary: ParitySummary = {
  referenceFixtures: 386,
  upstreamFixtures: 58,
  browserSafeFixtures: 410
};

export const parityRows: ParityRow[] = [
  {
    surface: "Integers and floats",
    category: "Primitive",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Working", level: "high" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Strong start", level: "high" },
    note: "Scalar numeric atoms round-trip in the pad and are covered by smoke tests."
  },
  {
    surface: "Booleans",
    category: "Primitive",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Basic", level: "medium" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Partial", level: "medium" },
    note: "Core `0b` and `1b` atoms exist, but full boolean vector semantics still need deeper coverage."
  },
  {
    surface: "Symbols",
    category: "Primitive",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Basic", level: "medium" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Partial", level: "medium" },
    note: "Backtick symbols parse and format; broader symbol-heavy functions remain to be filled in."
  },
  {
    surface: "General lists and vectors",
    category: "Primitive",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Working", level: "high" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Solid", level: "high" },
    note: "Adjacency forms like `1 2 3` and monad-over-vector calls are now supported in-browser."
  },
  {
    surface: "Dictionaries",
    category: "Primitive",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Parse only", level: "medium" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Partial", level: "medium" },
    note: "The `!` constructor parses, but dictionary indexing/default semantics are still behind official q."
  },
  {
    surface: "Tables",
    category: "Primitive",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Planned", level: "low" },
    jq: { label: "Partial", level: "medium" },
    parity: { label: "Early", level: "low" },
    note: "Official q table semantics are broad; upstream jq only partially implements queries and our browser engine has not caught up yet."
  },
  {
    surface: "Lambdas and projection",
    category: "Syntax",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Basic", level: "medium" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Partial", level: "medium" },
    note: "Curly-brace lambdas exist in the engine, but deeper projection and variadic edge cases still need parity work."
  },
  {
    surface: "Assignment inside expressions",
    category: "Syntax",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Working", level: "high" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Now aligned", level: "high" },
    note: "Forms like `show v:...` now parse in the browser engine instead of hard-failing."
  },
  {
    surface: "Line comments",
    category: "Syntax",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Working", level: "high" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Good", level: "high" },
    note: "Leading slash comments are skipped in the tokenizer and highlighted in the editor."
  },
  {
    surface: "Bracket-heavy reference forms",
    category: "Syntax",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "In progress", level: "low" },
    jq: { label: "Partial", level: "medium" },
    parity: { label: "Gap", level: "low" },
    note: "This is the current main parser frontier: nested apply/index/default dictionary forms still trip the differential suite."
  },
  {
    surface: "Arithmetic dyads",
    category: "Function",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Core set", level: "high" },
    jq: { label: "Core set", level: "high" },
    parity: { label: "Good base", level: "high" },
    note: "`+ - * % = < > <= >= , ! # _ ~` are wired in-browser and form the base of the current engine."
  },
  {
    surface: "til",
    category: "Function",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Working", level: "high" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Strong", level: "high" },
    note: "This is one of the fully working monads and is exercised directly in the app snippets and tests."
  },
  {
    surface: "sum / avg / count / distinct",
    category: "Function",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Working", level: "high" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Strong", level: "high" },
    note: "These were the first parity targets because they show vector semantics clearly and match live q output already."
  },
  {
    surface: "first / last / min / max",
    category: "Function",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Working", level: "medium" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Partial+", level: "medium" },
    note: "The browser engine has these monads now, but they still need much broader corpus coverage."
  },
  {
    surface: "type / string / where",
    category: "Function",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Basic", level: "medium" },
    jq: { label: "Working", level: "high" },
    parity: { label: "Partial", level: "medium" },
    note: "Implemented for browser ergonomics and current smoke tests, but still not full official-q semantics."
  },
  {
    surface: "Math library breadth",
    category: "Function",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Very early", level: "low" },
    jq: { label: "Broader", level: "medium" },
    parity: { label: "Gap", level: "low" },
    note: "Official q and jq cover far more numeric/statistical functions than the current in-browser engine."
  },
  {
    surface: ".Q namespace",
    category: "Namespace",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Seeded subset", level: "medium" },
    jq: { label: "Seeded subset", level: "medium" },
    parity: { label: "Partial", level: "medium" },
    note: "The pad currently exposes useful `.Q` staples like `.Q.n`, `.Q.A`, console rows, and columns."
  },
  {
    surface: ".z namespace",
    category: "Namespace",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Browser-safe subset", level: "medium" },
    jq: { label: "Partial", level: "low" },
    parity: { label: "Partial", level: "medium" },
    note: "The browser host models `.z.K`, `.z.D`, `.z.T`, `.z.P`, `.z.Z`, and a few environment-flavored values."
  },
  {
    surface: "Disk / IPC / socket host features",
    category: "Namespace",
    officialQ: { label: "Canonical", level: "reference" },
    ours: { label: "Intentionally absent", level: "none" },
    jq: { label: "More available", level: "medium" },
    parity: { label: "Out of scope", level: "none" },
    note: "This dashboard is browser-native by design, so disk, handles, IPC, and sockets are explicitly not parity targets here."
  }
];
