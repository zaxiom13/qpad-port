export const qMonarchTheme = {
  base: "vs-dark",
  inherit: false,
  rules: [
    { token: "comment", foreground: "6F6A68" },
    { token: "keyword", foreground: "FFB100", fontStyle: "bold" },
    { token: "date", foreground: "F87171" },
    { token: "time", foreground: "F87171" },
    { token: "symbol", foreground: "7DD3FC" },
    { token: "operator", foreground: "E7E5E4" },
    { token: "variable", foreground: "FCE7B2" },
    { token: "string", foreground: "8CF29A" },
    { token: "number", foreground: "93C5FD" }
  ],
  colors: {
    "editor.background": "#130f0c",
    "editor.foreground": "#f6efe8",
    "editorLineNumber.foreground": "#75675f",
    "editorLineNumber.activeForeground": "#f6efe8",
    "editorCursor.foreground": "#ffd166",
    "editor.selectionBackground": "#523a1e"
  }
} as const;

