export type BuiltinKind = "monad" | "diad";

export type OperatorInfo = {
  name: string;
  slug: string;
  kind: BuiltinKind;
  family: string;
  summary: string;
  example: string;
  notes: string[];
};

export const starter = `a:til 5
/ use Ctrl+Enter or the Run button
sum a
`;

export const quickExamples = [
  "1+2",
  "til 10",
  "avg 1 2 3",
  "distinct 2 3 7 3 5 3",
  ".Q.n",
  ".z.K"
];

export const quickCheckGroups = [
  {
    title: "Atoms and lists",
    items: [
      { label: "Distinct", program: "distinct 2 3 7 3 5 3" },
      { label: "Unique", program: "1 2 1 3 2 4" },
      { label: "Sums", program: "sums 3 1 4 1 5" },
      { label: "Prev", program: "prev 10 20 30 40" },
      { label: "Rotate", program: "2 rotate 10 20 30 40 50" },
      { label: "Cut", program: "2 cut til 10" }
    ]
  },
  {
    title: "Dictionaries and keyed tables",
    items: [
      { label: "Dict lookup", program: "(`a`b`c!10 20 30)`b" },
      { label: "Membership", program: "`b in `a`b`c" },
      { label: "Keyed row", program: "([k:`a`b] v:10 20)[`a]" },
      { label: "Table keys", program: "key ([k:`a`b] v:10 20)" },
      { label: "Flip dict", program: "flip `x`y!(til 4;10 20 30 40)" },
      { label: "Xcol rename", program: "`left`right xcol ([]x:til 3;y:10 20 30)" }
    ]
  },
  {
    title: "Tables and qsql",
    items: [
      { label: "Plain table", program: "([] x: til 5; y: 10 20 30 40 50)" },
      {
        label: "Select where",
        program: "select from ([] x: til 6; y: 10 20 30 40 50 60) where x>2"
      },
      {
        label: "Exec column",
        program: "exec y from ([] x: til 4; y: 10 20 30 40)"
      },
      {
        label: "Update column",
        program: "update z:x+y from ([] x: 1 2 3; y: 10 20 30)"
      },
      {
        label: "Delete column",
        program: "delete y from ([] x: til 3; y: 10 20 30; z: 100 200 300)"
      },
      {
        label: "Unnamed cols",
        program: "([] 1 2 3; 10 20 30; 100 200 300)"
      }
    ]
  },
  {
    title: "Apply and adverbs",
    items: [
      { label: "Apply operator", program: "|[2;til 5]" },
      { label: "Each", program: "string each (1 20 300)" },
      { label: "Projection", program: "(+[2]) 40" },
      { label: "Sublist", program: "sublist[1 3;10 20 30 40 50]" },
      { label: "Take shape", program: "2 3#til 6" },
      { label: "Map at", program: "@[|:;\"zero\"]" }
    ]
  },
  {
    title: "Dot namespaces",
    items: [
      { label: ".Q.n", program: ".Q.n" },
      { label: ".Q.id", program: ".Q.id each `$(\"ab\";\"a/b\";\"two words\")" },
      { label: ".Q.s", program: ".Q.s ([h:1 2 3] m:4 5 6)" },
      { label: ".Q.btoa", program: ".Q.btoa \"hello\"" },
      { label: ".z.K", program: ".z.K" },
      { label: ".z.T", program: ".z.T" }
    ]
  }
] as const;

export const namespaceHint = [
  { label: ".Q.n", value: "0123456789", note: "digit tape" },
  { label: ".Q.A", value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", note: "alphabet rail" },
  { label: ".z.K", value: "current date marker", note: "session clock" },
  { label: ".z.T", value: "current time marker", note: "time pulse" }
];

const builtinCatalogSource = {
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
    "acos",
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
    "system"
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
} as const;

const GLYPH_OPERATOR_PATTERN = /^[+\-*%=<>?,!#@_^~|&$]+$/;

const FAMILY_NAMES = {
  adverbs: "adverbs",
  aggregation: "aggregation",
  glyphs: "glyph operators",
  listTransforms: "list transforms",
  numeric: "numeric",
  tableData: "tables and dictionaries",
  text: "text"
} as const;

const FAMILY_MEMBERS = {
  [FAMILY_NAMES.adverbs]: new Set(["over", "scan", "prior"]),
  [FAMILY_NAMES.tableData]: new Set(["key", "keys", "group", "flip", "xcol"]),
  [FAMILY_NAMES.aggregation]: new Set(["sum", "avg", "min", "max", "count", "prd", "med", "dev", "var"]),
  [FAMILY_NAMES.text]: new Set(["string", "lower", "upper", "trim", "ltrim", "rtrim", "like", "ss", "sv", "vs"]),
  [FAMILY_NAMES.listTransforms]: new Set([
    "til",
    "rotate",
    "cut",
    "sublist",
    "raze",
    "distinct",
    "enlist",
    "reverse"
  ])
} as const;

const DEFAULT_OPERATOR_NOTES: Record<BuiltinKind, string> = {
  monad: "Takes one argument.",
  diad: "Takes two arguments."
};

const operatorOverrides: Record<
  string,
  Partial<Pick<OperatorInfo, "family" | "summary" | "example" | "notes">>
> = {
  abs: {
    family: FAMILY_NAMES.numeric,
    summary: "Absolute value for atoms and numeric vectors.",
    example: "abs -3 2 -9"
  },
  til: {
    family: "list building",
    summary: "Generate a zero-based range from a count.",
    example: "til 8"
  },
  count: {
    family: "inspection",
    summary: "Count items, rows, or characters depending on the input.",
    example: "count `a`b`c"
  },
  sum: {
    family: FAMILY_NAMES.aggregation,
    summary: "Reduce a numeric list by addition.",
    example: "sum 3 1 4 1 5"
  },
  avg: {
    family: FAMILY_NAMES.aggregation,
    summary: "Compute the arithmetic mean of a numeric list.",
    example: "avg 10 20 30"
  },
  distinct: {
    family: "set logic",
    summary: "Keep the first appearance of each unique item.",
    example: "distinct 2 3 7 3 5 3"
  },
  flip: {
    family: FAMILY_NAMES.tableData,
    summary: "Transpose nested data and dictionaries into tables.",
    example: "flip `x`y!(til 4;10 20 30 40)"
  },
  group: {
    family: FAMILY_NAMES.tableData,
    summary: "Bucket positions by equal values.",
    example: "group `a`b`a`c`b"
  },
  key: {
    family: FAMILY_NAMES.tableData,
    summary: "Extract keys from dictionaries, keyed tables, and namespaces.",
    example: "key `a`b!10 20"
  },
  string: {
    family: FAMILY_NAMES.text,
    summary: "Render values as q strings or lists of characters.",
    example: "string `qpad"
  },
  where: {
    family: "selection",
    summary: "Return positions selected by a boolean vector.",
    example: "where 1 0 1 1b"
  },
  value: {
    family: "inspection",
    summary: "Return the raw value unchanged.",
    example: "value 1 2 3"
  },
  prev: {
    family: "windowing",
    summary: "Shift a list right and fill the first slot with null.",
    example: "prev 10 20 30 40"
  },
  sums: {
    family: "windowing",
    summary: "Running cumulative sum.",
    example: "sums 3 1 4 1 5"
  },
  rotate: {
    family: FAMILY_NAMES.listTransforms,
    summary: "Rotate a sequence by a count on the left.",
    example: "2 rotate 10 20 30 40 50"
  },
  cut: {
    family: FAMILY_NAMES.listTransforms,
    summary: "Split a list or string into slices.",
    example: "2 cut til 10"
  },
  sublist: {
    family: FAMILY_NAMES.listTransforms,
    summary: "Extract a span from a list by start and length.",
    example: "sublist[1 3;10 20 30 40 50]"
  },
  in: {
    family: "set logic",
    summary: "Membership test over lists and symbol vectors.",
    example: "`b in `a`b`c"
  },
  over: {
    family: FAMILY_NAMES.adverbs,
    summary: "Fold a function across a list.",
    example: "+/ 1 2 3 4"
  },
  scan: {
    family: FAMILY_NAMES.adverbs,
    summary: "Running fold that returns every intermediate result.",
    example: "+\\ 1 2 3 4"
  },
  "@": {
    family: "apply",
    summary: "Apply a value, function, or handler with explicit arguments.",
    example: "@[|:;\"zero\"]"
  },
  "?": {
    family: "lookup and search",
    summary: "Search, sample, or perform default-mapping style lookup depending on the left value.",
    example: "10?`v1`v2`v3",
    notes: [
      "List-left returns positions.",
      "Number-left samples from the right argument.",
      "Default-mapping forms are also supported."
    ]
  },
  "!": {
    family: FAMILY_NAMES.tableData,
    summary: "Build dictionaries and keyed structures from keys and values.",
    example: "`a`b!10 20"
  },
  "#": {
    family: "reshape",
    summary: "Take, reshape, or count depending on placement.",
    example: "2 3#til 6"
  },
  ",": {
    family: FAMILY_NAMES.listTransforms,
    summary: "Join, append, or enlist depending on rank.",
    example: "1 2,3 4"
  },
  "+": {
    family: FAMILY_NAMES.numeric,
    summary: "Addition and a base for derived adverbs like over and scan.",
    example: "10 + 32"
  },
  "-": {
    family: FAMILY_NAMES.numeric,
    summary: "Subtraction and unary negation.",
    example: "10 - 3"
  },
  "*": {
    family: FAMILY_NAMES.numeric,
    summary: "Multiplication across atoms and vectors.",
    example: "6 * 7"
  },
  "%": {
    family: FAMILY_NAMES.numeric,
    summary: "Division across atoms and vectors.",
    example: "22 % 7"
  }
};

export const slugifyOperator = (name: string) =>
  encodeURIComponent(name)
    .replace(/%/g, "")
    .toLowerCase();

export const unslugifyOperator = (slug?: string) =>
  slug ? decodeURIComponent(slug.replace(/%(?![0-9A-Fa-f]{2})/g, "%25")) : undefined;

const detectFamily = (name: string, kind: BuiltinKind) => {
  const overrideFamily = operatorOverrides[name]?.family;
  if (overrideFamily) {
    return overrideFamily;
  }

  if (GLYPH_OPERATOR_PATTERN.test(name)) {
    return FAMILY_NAMES.glyphs;
  }

  for (const [family, members] of Object.entries(FAMILY_MEMBERS)) {
    if (members.has(name)) {
      return family;
    }
  }

  return kind === "monad" ? "monads" : "diads";
};

const defaultExample = (name: string, kind: BuiltinKind) => {
  const overrideExample = operatorOverrides[name]?.example;
  if (overrideExample) {
    return overrideExample;
  }

  return kind === "monad"
    ? `${name} 1 2 3`
    : /^[A-Za-z.]+$/.test(name)
      ? `2 ${name} 1 2 3 4`
      : `1 ${name} 2`;
};

const OPERATOR_GLOSSARY: Record<string, string> = {
  all: "Check whether every item is truthy.",
  any: "Check whether at least one item is truthy.",
  avgs: "Return running averages across a numeric list.",
  ceiling: "Round numbers upward.",
  cols: "Expose table column names.",
  desc: "Sort values descending.",
  differ: "Flag changes between adjacent items.",
  exp: "Apply exponential growth.",
  fills: "Fill null gaps using neighboring values.",
  first: "Take the first item or row.",
  last: "Take the last item or row.",
  log: "Apply the natural logarithm.",
  min: "Return the smallest value.",
  mins: "Return running minima.",
  max: "Return the largest value.",
  maxs: "Return running maxima.",
  med: "Return the median of a numeric list.",
  asc: "Sort values ascending.",
  iasc: "Return ascending grade indices.",
  idesc: "Return descending grade indices.",
  asin: "Apply inverse sine.",
  atan: "Apply inverse tangent.",
  acos: "Apply inverse cosine.",
  sin: "Apply sine.",
  cos: "Apply cosine.",
  tan: "Apply tangent.",
  floor: "Round numbers downward.",
  null: "Test whether values are null-like.",
  reciprocal: "Return multiplicative inverses.",
  reverse: "Reverse the order of items.",
  signum: "Return the sign of each numeric value.",
  sqrt: "Return square roots.",
  neg: "Negate numeric values.",
  not: "Invert booleans or truthy values.",
  enlist: "Wrap a value in a single-item list.",
  attr: "Inspect list attributes.",
  keys: "Expose key vectors from keyed structures.",
  lower: "Convert text to lowercase.",
  ltrim: "Trim leading whitespace.",
  next: "Shift a list left and fill the end with null.",
  upper: "Convert text to uppercase.",
  prd: "Multiply a numeric list down to one value.",
  prds: "Return running products.",
  raze: "Flatten one level of nested lists.",
  ratios: "Return stepwise ratios between adjacent values.",
  rtrim: "Trim trailing whitespace.",
  var: "Return population variance.",
  svar: "Return sample variance.",
  dev: "Return population standard deviation.",
  sdev: "Return sample standard deviation.",
  deltas: "Return differences between adjacent values.",
  trim: "Trim whitespace from both ends.",
  type: "Return q type codes.",
  show: "Emit a value while also returning it.",
  system: "Handle supported system-style commands.",
  div: "Perform integer division.",
  mavg: "Return moving averages over a fixed window.",
  mcount: "Return moving non-null counts over a fixed window.",
  mdev: "Return moving standard deviations over a fixed window.",
  msum: "Return moving sums over a fixed window.",
  mod: "Return remainders after division.",
  and: "Boolean conjunction or elementwise minimum-style logic.",
  like: "Match strings against simple patterns.",
  cross: "Build a Cartesian product.",
  or: "Boolean disjunction or elementwise maximum-style logic.",
  prior: "Apply a function against each item and its predecessor.",
  ss: "Search string positions.",
  sv: "Join values with a separator.",
  vs: "Split values by a separator.",
  within: "Check whether values fall inside bounds.",
  except: "Remove right-side members from the left.",
  inter: "Return the intersection of two collections.",
  union: "Return the union of two collections.",
  xbar: "Bucket numeric values by a step size.",
  xexp: "Raise the left value as a power base.",
  xlog: "Take logarithms with an explicit base.",
  xcol: "Rename or reorder columns.",
  "<": "Compare whether the left side is less than the right.",
  ">": "Compare whether the left side is greater than the right.",
  "<=": "Compare whether the left side is less than or equal to the right.",
  ">=": "Compare whether the left side is greater than or equal to the right.",
  "=": "Compare values for equality.",
  "~": "Compare values for q-style match.",
  "^": "Fill nulls or missing values from the left.",
  "_": "Drop items or perform related cut-style removal.",
  "|": "Take elementwise maxima.",
  "&": "Take elementwise minima.",
  "$": "Cast values to another representation.",
  "%": "Divide numeric values.",
  "*": "Multiply numeric values.",
  "-": "Subtract values or negate them.",
  "+": "Add numeric values.",
  ",": "Join, append, or enlist values.",
  "!": "Build dictionaries and keyed structures from keys and values.",
  "#": "Take, repeat, reshape, or count depending on placement.",
  "@": "Apply a value, function, or handler with explicit arguments.",
  "?": "Search, sample, or perform default-style lookup depending on the left side."
};

const defaultSummary = (name: string, kind: BuiltinKind) => {
  const overrideSummary = operatorOverrides[name]?.summary;
  if (overrideSummary) {
    return overrideSummary;
  }

  const glossarySummary = OPERATOR_GLOSSARY[name];
  if (glossarySummary) {
    return glossarySummary;
  }

  const family = detectFamily(name, kind);
  if (family === FAMILY_NAMES.aggregation) {
    return "Aggregate a list or table expression down to a summary result.";
  }
  if (family === FAMILY_NAMES.text) {
    return "Transform or inspect string data.";
  }
  if (family === FAMILY_NAMES.tableData) {
    return "Work with keyed data, dictionaries, or tabular structures.";
  }
  if (family === FAMILY_NAMES.listTransforms) {
    return "Reorder, slice, or reshape list data.";
  }
  if (family === FAMILY_NAMES.adverbs) {
    return "Modify how another function is applied across data.";
  }
  if (family === FAMILY_NAMES.numeric) {
    return "Apply a numeric transformation or arithmetic combination.";
  }

  return kind === "monad"
    ? "Apply a unary transformation to the given value."
    : "Combine a left and right value with q-style binary semantics.";
};

export const operatorCatalog: OperatorInfo[] = (() => {
  const seen = new Set<string>();
  const operatorEntries = [
    ...builtinCatalogSource.monads.map((name) => ({ name, kind: "monad" as const })),
    ...builtinCatalogSource.diads.map((name) => ({ name, kind: "diad" as const }))
  ];

  return operatorEntries
    .flatMap(({ name, kind }) => {
      const operatorKey = `${kind}:${name}`;
      if (seen.has(operatorKey)) {
        return [];
      }

      seen.add(operatorKey);
      return [
        {
          name,
          slug: slugifyOperator(name),
          kind,
          family: detectFamily(name, kind),
          summary: defaultSummary(name, kind),
          example: defaultExample(name, kind),
          notes: operatorOverrides[name]?.notes ?? [
            DEFAULT_OPERATOR_NOTES[kind],
            "Load the example into the pad to inspect the current browser implementation."
          ]
        }
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
})();
