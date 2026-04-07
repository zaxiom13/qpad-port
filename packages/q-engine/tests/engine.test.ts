import { describe, expect, it } from "vitest";
import { createSession, formatValue, parse } from "../src/index";

describe("q engine smoke tests", () => {
  it("evaluates scalar arithmetic", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("1+2").value)).toBe("3\n");
  });

  it("evaluates vector monads", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("til 5").value)).toBe("0 1 2 3 4\n");
    expect(formatValue(session.evaluate("sum 1 2 3").value)).toBe("6\n");
    expect(formatValue(session.evaluate("avg 1 2 3").value)).toBe("2f\n");
    expect(formatValue(session.evaluate("last `a`b`c!1 2 3").value)).toBe("3\n");
  });

  it("supports simple assignment and namespace reads", () => {
    const session = createSession({
      now: () => new Date("2026-03-19T17:00:00.000Z"),
      timezone: () => "Europe/London"
    });
    expect(formatValue(session.evaluate("a:42;a+8").value)).toBe("50\n");
    expect(formatValue(session.evaluate(".z.K").value)).toBe("5f\n");
    expect(formatValue(session.evaluate(".Q.n").value)).toBe("\"0123456789\"\n");
    expect(formatValue(session.evaluate(".Q.an").value)).toBe(
      "\"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789\"\n"
    );
    expect(formatValue(session.evaluate(".Q.addmonths[2007.10.16;6 7]").value)).toBe(
      "2008.04.16 2008.05.16\n"
    );
    expect(
      formatValue(session.evaluate(".Q.def[`abc`xyz`efg!(1;2.;`a)].Q.opt .z.x").value)
    ).toBe("abc| 1\nxyz| 2f\nefg| `a\n");
    expect(
      formatValue(
        session.evaluate(".Q.def[`param1`param2`param3!(1;1999.01.01;23.1)].Q.opt .z.x").value
      )
    ).toBe("param1| 1\nparam2| 1999.01.01\nparam3| 23.1\n");
    expect(formatValue(session.evaluate(".Q.fmt[6;2]each 1 234").value)).toBe(
      "\"  1.00\"\n\"234.00\"\n"
    );
    expect(formatValue(session.evaluate("10h$.Q.atob \"aGVsbG8=\"").value)).toBe("\"hello\"\n");
    expect(formatValue(session.evaluate(".Q.btoa \"hello\"").value)).toBe("\"aGVsbG8=\"\n");
    expect(formatValue(session.evaluate(".Q.x10 12345").value)).toBe("\"AAAAAAADA5\"\n");
    expect(formatValue(session.evaluate(".Q.j10 .Q.x10 12345").value)).toBe("12345\n");
    expect(formatValue(session.evaluate(".Q.x12 12345").value)).toBe("\"0000000009IX\"\n");
    expect(formatValue(session.evaluate(".Q.j12 .Q.x12 12345").value)).toBe("12345\n");
    expect(formatValue(session.evaluate(".Q.b6").value)).toBe("\"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/\"\n");
    expect(formatValue(session.evaluate(".Q.nA").value)).toBe("\"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\"\n");
    expect(formatValue(session.evaluate(".Q.K").value)).toBe("0Nd\n");
    expect(formatValue(session.evaluate(".Q.M").value)).toBe("0W\n");
    expect(formatValue(session.evaluate(".Q.k").value)).toBe("5f\n");
    expect(formatValue(session.evaluate(".cx.from 5").value)).toBe("re| 5f\nim| 0f\n");
    expect(formatValue(session.evaluate(".cx.mul[.cx.new[1;2];.cx.new[3;4]]").value)).toBe(
      "re| -5f\nim| 10f\n"
    );
    expect(formatValue(session.evaluate(".cx.abs .cx.new[3;4]").value)).toBe("5f\n");
    expect(formatValue(session.evaluate(".Q.s ([h:1 2 3] m:4 5 6)").value)).toBe(
      "\"h| m\\n-| -\\n1| 4\\n2| 5\\n3| 6\\n\"\n"
    );
    expect(formatValue(session.evaluate(".Q.id each `$(\"ab\";\"a/b\";\"two words\";\"2drifters\";\"2+2\")").value)).toBe(
      "`ab`ab`twowords`a2drifters`a22\n"
    );
    expect(formatValue(session.evaluate(".Q.id (5#.Q.res)!(5#())").value)).toBe(
      "abs1 | \nacos1| \nasin1| \natan1| \navg1 | \n"
    );
    expect(formatValue(session.evaluate(".Q.id flip(`$(\"a\";\"a/b\"))!2#()").value)).toBe(
      "a ab\n----\n"
    );
    expect(
      formatValue(
        session.evaluate("cols .Q.id(`$(\"count+\";\"count*\";\"count1\"))xcol([]1 2;3 4;5 6)").value
      )
    ).toBe("`count1`count11`count12\n");
  });

  it("parses and formats the temporal literals used by the reference-card syntax page", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("2017.01").value)).toBe("2017.01\n");
    expect(formatValue(session.evaluate("2018.05 2018.07 2019.01m").value)).toBe(
      "2018.05 2018.07 2019.01m\n"
    );
    expect(formatValue(session.evaluate("00:00:00.000000000").value)).toBe(
      "0D00:00:00.000000000\n"
    );
    expect(formatValue(session.evaluate("00:00").value)).toBe("00:00\n");
    expect(formatValue(session.evaluate("00:00:00").value)).toBe("00:00:00\n");
    expect(formatValue(session.evaluate("00:00:00.000").value)).toBe("00:00:00.000\n");
  });

  it("supports q assignment operators that end with colon", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("a:1;a+:2;a").value)).toBe("3\n");
    expect(formatValue(session.evaluate("a:10;a-:3;a").value)).toBe("7\n");
    expect(formatValue(session.evaluate("a:4;a*:5;a").value)).toBe("20\n");
    expect(formatValue(session.evaluate("a:9;a%:2;a").value)).toBe("4.5\n");
    expect(formatValue(session.evaluate("a:1 2;a,:3 4;a").value)).toBe("1 2 3 4\n");
    expect(formatValue(session.evaluate(".qv.v:41;.qv.v+:1;.qv.v").value)).toBe("42\n");
  });

  it("preserves dotted namespace members across lambda execution", () => {
    const session = createSession();
    const program = [
      ".qv.cmds:()",
      ".qv.state:()",
      ".qv.config:()",
      ".qv.append:{[cmd].qv.cmds,:enlist cmd;:cmd}",
      ".qv.init:{.qv.cmds:();result:1;.qv.state:result;.qv.config:result;:result}",
      ".qv.frame:{[a;b;c].qv.cmds:();state1:draw[.qv.state;a;b;c];.qv.state:state1;:1_.qv.cmds}",
      "setup:{1}",
      "draw:{[state;frameInfo;input;canvas] state}",
      ".qv.init[]",
      ".qv.frame[1;2;3]"
    ].join(";");

    expect(formatValue(session.evaluate(program).value)).toBe("()\n");
    expect(formatValue(session.evaluate("key `.qv").value)).toBe("``cmds`state`config`append`init`frame\n");
    expect(formatValue(session.evaluate(".qv.frame").value)).toBe(
      "{[a;b;c].qv.cmds:()state1:draw[.qv.state;a;b;c].qv.state:state1:1_.qv.cmds}\n"
    );
  });

  it("deduplicates vectors", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("distinct 2 3 7 3 5 3").value)).toBe("2 3 7 5\n");
  });

  it("builds and formats simple tables", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("([] x: til 3; y: til 3)").value)).toBe(
      "x y\n---\n0 0\n1 1\n2 2\n"
    );
    expect(formatValue(session.evaluate("([]1 2;3 4;5 6)").value)).toBe(
      "x x1 x2\n-------\n1 3  5\n2 4  6\n"
    );
    expect(formatValue(session.evaluate("([] sym:`aapl`msft`goog; price:300)").value)).toBe(
      "sym  price\n----------\naapl 300\nmsft 300\ngoog 300\n"
    );
    expect(
      formatValue(
        session.evaluate("([names:`bob`carol;city:`NYC`CHI]; ages:42 39)").value
      )
    ).toBe("names city| ages\n----------| ----\nbob   NYC | 42\ncarol CHI | 39\n");
    expect(formatValue(session.evaluate("s:([k:`a`b] v:10 20); s[`a]").value)).toBe("v| 10\n");
    expect(formatValue(session.evaluate("key ([k:`a`b] v:10 20)").value)).toBe("k\n-\na\nb\n");
  });

  it("supports q reshape with variadic take and matrix indexing", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("4 5#\"abcdefghijklmnopqrst\"").value)).toBe(
      "\"abcde\"\n\"fghij\"\n\"klmno\"\n\"pqrst\"\n"
    );
    expect(
      formatValue(session.evaluate("m:4 5#\"abcdefghijklmnopqrst\"; m[1 3]").value)
    ).toBe("\"fghij\"\n\"pqrst\"\n");
    expect(
      formatValue(session.evaluate("m:4 5#\"abcdefghijklmnopqrst\"; m[1 3;2 4]").value)
    ).toBe("\"hj\"\n\"rt\"\n");
  });

  it("indexes dictionaries and tables like q", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("(`a`b!10 20) `a").value)).toBe("10\n");
    expect(formatValue(session.evaluate("(`a`b!10 20) `c").value)).toBe("0N\n");
    expect(formatValue(session.evaluate("(1 2 3) 10").value)).toBe("0N\n");
    expect(formatValue(session.evaluate("([] x: til 3; y: til 3)[`x]").value)).toBe(
      "0 1 2\n"
    );
    expect(formatValue(session.evaluate("([] x: til 3; y: til 3) 1").value)).toBe(
      "x| 1\ny| 1\n"
    );
    expect(formatValue(session.evaluate("([] x: til 3; y: til 3)[0 2]").value)).toBe(
      "x y\n---\n0 0\n2 2\n"
    );
    expect(formatValue(session.evaluate("([] x: til 3; y: til 3)[0 2; `y]").value)).toBe(
      "0 2\n"
    );
    expect(
      formatValue(session.evaluate("t:([]name:`Tom`Dick`Harry;age:34 42 17); t[;`age]").value)
    ).toBe("34 42 17\n");
    expect(
      formatValue(session.evaluate("t:([]name:`Tom`Dick`Harry;age:34 42 17); t[1;]").value)
    ).toBe("name| `Dick\nage | 42\n");
    expect(formatValue(session.evaluate("2 cut 1 2 3 4 5").value)).toBe("1 2\n3 4\n,5\n");
    expect(formatValue(session.evaluate("0 2 3 cut 1 2 3 4 5").value)).toBe("1 2\n,3\n4 5\n");
    expect(formatValue(session.evaluate("2 cut \"abcde\"").value)).toBe("\"ab\"\n\"cd\"\n,\"e\"\n");
  });

  it("returns projections for partial lambda application and keeps locals scoped", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("{x+y}[2]").value)).toBe("{x+y}[2]\n");
    expect(formatValue(session.evaluate("{x+y}[2][3]").value)).toBe("5\n");
    expect(formatValue(session.evaluate("{x+y}[;2]").value)).toBe("{x+y}[;2]\n");
    expect(formatValue(session.evaluate("{x+y}[;2][3]").value)).toBe("5\n");
    expect(formatValue(session.evaluate("+[;1] 2 3").value)).toBe("3 4\n");
    expect(formatValue(session.evaluate("f:{x+y}; f[2]3 4").value)).toBe("5 6\n");
    expect(formatValue(session.evaluate("a:1;{a:99; a+x}[2];a").value)).toBe("1\n");
    expect(formatValue(session.evaluate("{x - 2} 5 3").value)).toBe("3 1\n");
    expect(formatValue(session.evaluate("x:10;(x + 5; x: 20; x - 5)").value)).toBe("25 20 5\n");
    expect(formatValue(session.evaluate("f:{a : 10; : x + a; a : 20}; f[5]").value)).toBe("15\n");
  });

  it("supports key and fill on browser-safe reference-card cases", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("key `a`b!1 2").value)).toBe("`a`b\n");
    expect(formatValue(session.evaluate("1 ^ 0N 2 0N").value)).toBe("1 2 1\n");
    expect(formatValue(session.evaluate("a:11.0 2.1 3.1 0n 4.5 0n; type a").value)).toBe("9h\n");
    expect(formatValue(session.evaluate("`r1`r2`r3`v1`v2`v3?`v1`v3").value)).toBe("3 5\n");
    expect(formatValue(session.evaluate(".fee.fi.fo:42; key `.fee").value)).toBe("``fi\n");
    expect(
      formatValue(session.evaluate("distinct flip `a`b`c!(1 2 1;2 3 2;\"aba\")").value)
    ).toBe("a b c\n-----\n1 2 a\n2 3 b\n");
    expect(formatValue(session.evaluate("1 2 3 in 2 3").value)).toBe("011b\n");
    expect(formatValue(session.evaluate("`a`b in `b`c").value)).toBe("01b\n");
    expect(formatValue(session.evaluate("prev 1 2 3").value)).toBe("0N 1 2\n");
    expect(formatValue(session.evaluate("sums 1 2 3").value)).toBe("1 3 6\n");
    expect(formatValue(session.evaluate("2 rotate 1 2 3 4").value)).toBe("3 4 1 2\n");
    expect(formatValue(session.evaluate("sublist[1 2;10 20 30 40]").value)).toBe("20 30\n");
    expect(formatValue(session.evaluate("@[|:;\"zero\"]").value)).toBe("\"orez\"\n");
    expect(formatValue(session.evaluate("@[2+;3;4]").value)).toBe("5\n");
  });

  it("supports the common q casts used by practice starters", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("`symbol$()").value)).toBe("()\n");
    expect(formatValue(session.evaluate("`long$()").value)).toBe("()\n");
    expect(formatValue(session.evaluate("11h$(\"ab\";\"cd\")").value)).toBe("`ab`cd\n");
    expect(formatValue(session.evaluate("`boolean$1 0 2").value)).toBe("101b\n");
    expect(formatValue(session.evaluate("5h$1.9 2.1").value)).toBe("1h 2h\n");
    expect(formatValue(session.evaluate("`short$1.9 2.1").value)).toBe("1h 2h\n");
    expect(formatValue(session.evaluate("`int$1.9 2.1").value)).toBe("1 2\n");
    expect(formatValue(session.evaluate("`float$1 2 3").value)).toBe("1 2 3\n");
    expect(formatValue(session.evaluate("`string$97 98 99").value)).toBe("\"abc\"\n");
    expect(formatValue(session.evaluate("`symbol$(\"ab\";\"cd\")").value)).toBe("`ab`cd\n");
    expect(formatValue(session.evaluate("`date$(\"2026.03.22\";\"2026.03.23\")").value)).toBe("2026.03.22 2026.03.23\n");
  });

  it("preserves typed vector suffixes and scientific float formatting", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("2 3 4 5 6i").value)).toBe("2 3 4 5 6i\n");
    expect(formatValue(session.evaluate("2 3 4 5 6f").value)).toBe("2 3 4 5 6f\n");
    expect(formatValue(session.evaluate("3.4 57 1.2e20").value)).toBe("3.4 57 1.2e+20\n");
  });

  it("supports browser-native pattern and set verbs", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("\"abc\" like \"a*\"").value)).toBe("1b\n");
    expect(formatValue(session.evaluate("1 2 3 within 0 2").value)).toBe("110b\n");
    expect(formatValue(session.evaluate("1 2 cross 3 4").value)).toBe("1 3\n1 4\n2 3\n2 4\n");
    expect(formatValue(session.evaluate("1 2 3 except 2").value)).toBe("1 3\n");
    expect(formatValue(session.evaluate("1 2 3 inter 2 3 4").value)).toBe("2 3\n");
    expect(formatValue(session.evaluate("1 2 2 3 union 2 3 4").value)).toBe("1 2 3 4\n");
  });

  it("covers additional reference-card list verbs and iterators", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("avgs 1 2 3 4").value)).toBe("1 1.5 2 2.5\n");
    expect(formatValue(session.evaluate("fills 1 0N 2 0N 0N 3").value)).toBe("1 1 2 2 2 3\n");
    expect(formatValue(session.evaluate("next 1 2 3").value)).toBe("2 3 0N\n");
    expect(formatValue(session.evaluate("prds 1 2 3 4").value)).toBe("1 2 6 24\n");
    expect(formatValue(session.evaluate("mins 3 1 4 2").value)).toBe("3 1 1 1\n");
    expect(formatValue(session.evaluate("maxs 3 1 4 2").value)).toBe("3 3 4 4\n");
    expect(formatValue(session.evaluate("ratios 2 4 8").value)).toBe("2 2 2\n");
    expect(formatValue(session.evaluate("differ 1 1 2 2 3").value)).toBe("10101b\n");
    expect(formatValue(session.evaluate("raze (1 2;3 4)").value)).toBe("1 2 3 4\n");
    expect(formatValue(session.evaluate("group `a`b`a`c").value)).toBe("a| 0 2\nb| ,1\nc| ,3\n");
    expect(formatValue(session.evaluate("iasc 30 10 20").value)).toBe("1 2 0\n");
    expect(formatValue(session.evaluate("idesc 30 10 20").value)).toBe("0 2 1\n");
    expect(formatValue(session.evaluate("\"banana\" ss \"an\"").value)).toBe("1 3\n");
    expect(
      formatValue(session.evaluate("\",\" sv (enlist \"a\";enlist \"b\";enlist \"c\")").value)
    ).toBe("\"a,b,c\"\n");
    expect(formatValue(session.evaluate("\",\" vs \"a,b,c\"").value)).toBe(",\"a\"\n,\"b\"\n,\"c\"\n");
    expect(formatValue(session.evaluate("trim \"  hi  \"").value)).toBe("\"hi\"\n");
    expect(formatValue(session.evaluate("ltrim \"  hi  \"").value)).toBe("\"hi  \"\n");
    expect(formatValue(session.evaluate("rtrim \"  hi  \"").value)).toBe("\"  hi\"\n");
    expect(formatValue(session.evaluate("1 0 1 and 1 1 0").value)).toBe("1 0 0\n");
    expect(formatValue(session.evaluate("1 0 1 or 1 1 0").value)).toBe("1 1 1\n");
    expect(formatValue(session.evaluate("(+) over 1 2 3 4").value)).toBe("10\n");
    expect(formatValue(session.evaluate("(+) scan 1 2 3 4").value)).toBe("1 3 6 10\n");
    expect(formatValue(session.evaluate("(+) prior 1 2 3 4").value)).toBe("1 3 5 7\n");
    expect(formatValue(session.evaluate("(+\\) 1 2 3 4").value)).toBe("1 3 6 10\n");
    expect(formatValue(session.evaluate("xexp[2;3]").value)).toBe("8f\n");
    expect(formatValue(session.evaluate("xbar[5;17]").value)).toBe("15\n");
    expect(formatValue(session.evaluate("keys `a`b!1 2").value)).toBe("`a`b\n");
  });

  it("matches the remaining reference-card adverb and derived-function forms", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("+\\[1 2 3 4 5]").value)).toBe("1 3 6 10 15\n");
    expect(formatValue(session.evaluate("+\\[1000;1 2 3 4 5]").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("1000+\\1 2 3 4 5").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("(+\\)[1000;1 2 3 4 5]").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("(+\\)1 2 3 4 5").value)).toBe("1 3 6 10 15\n");
    expect(formatValue(session.evaluate("n:(1 2 3 4;5 6 7 8);(,/) over n").value)).toBe(
      "1 2 3 4 5 6 7 8\n"
    );
    expect(formatValue(session.evaluate("n:(1 2 3 4;5 6 7 8);raze over n").value)).toBe(
      "1 2 3 4 5 6 7 8\n"
    );
    expect(formatValue(session.evaluate("n:(1 2 3 4;5 6 7 8);{,/[x]}over n").value)).toBe(
      "1 2 3 4 5 6 7 8\n"
    );
    expect(formatValue(session.evaluate("(+/)1 2 3 4").value)).toBe("10\n");
    expect(formatValue(session.evaluate("16 +/ 1 2 3 4").value)).toBe("26\n");
  });

  it("supports baked-in complex reductions used by the mandelbrot snippet", () => {
    const session = createSession();
    const program = [
      "n: 4",
      "mandelbrot:255*flip {x<2}(n,n)#.cx.abs each ({y+.cx.mul[x;x]}/)each flip (10,n*n)#(.cx.new/)each {x cross x}{x*4}{x-0.5}{x%count x}til n;",
      "mandelbrot"
    ].join(";");
    expect(formatValue(session.evaluate(program).value)).toBe(
      "0 0 0 0\n0 0 255 0\n0 255 255 0\n0 0 255 0\n"
    );
  });

  it("supports basic qsql table workflows", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("select from ([]c:1 2 3)").value)).toBe(
      "c\n-\n1\n2\n3\n"
    );
    expect(formatValue(session.evaluate("exec c from ([]c:1 2 3)").value)).toBe("1 2 3\n");
    expect(formatValue(session.evaluate("exec first c from ([]c:1 2 3)").value)).toBe("1\n");
    expect(formatValue(session.evaluate("select from ([]c:1 2 3) where c in 2 3").value)).toBe(
      "c\n-\n2\n3\n"
    );
    expect(
      formatValue(session.evaluate("update d:c+1 from ([]c:1 2) where c=2").value)
    ).toBe("c d\n---\n1\n2 3\n");
    expect(
      formatValue(session.evaluate("delete c from ([]c:1 2;d:3 4)").value)
    ).toBe("d\n-\n3\n4\n");
    expect(
      formatValue(session.evaluate("delete from ([]c:1 2;d:3 4) where c=2").value)
    ).toBe("c d\n---\n1 3\n");
    expect(formatValue(session.evaluate(".Q.s ([h:1 2 3] m:4 5 6)").value)).toBe(
      "\"h| m\\n-| -\\n1| 4\\n2| 5\\n3| 6\\n\"\n"
    );
  });

  it("supports lazy q control forms and qsql on assignment rhs", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("a:0;if[0b;a:1];a").value)).toBe("0\n");
    expect(formatValue(session.evaluate("a:0;if[1b;a:1];a").value)).toBe("1\n");
    expect(formatValue(session.evaluate("$[1b;42;99]").value)).toBe("42\n");
    expect(formatValue(session.evaluate("$[0b;42;99]").value)).toBe("99\n");
    expect(formatValue(session.evaluate("t:([]x:1 2); t:update y:x+1 from t; t").value)).toBe(
      "x y\n---\n1 2\n2 3\n"
    );
  });

  it("parses right-to-left application used by shipped sketches", () => {
    const session = createSession();
    expect(
      formatValue(
        session.evaluate("palette:10 20 30 40 50 60; idx:til 8; t:1; palette (idx+t) mod count palette").value
      )
    ).toBe("20 30 40 50 60 10 20 30\n");
    expect(formatValue(session.evaluate("cw:10; idx:til 6; nc:3; cw*idx mod nc").value)).toBe(
      "0 10 20 0 10 20\n"
    );
    expect(formatValue(session.evaluate("ch:5; idx:til 6; nc:3; ch*idx div nc").value)).toBe(
      "0 0 0 5 5 5\n"
    );
  });

  it("supports derived reduce and scan forms from the syntax reference card", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("+\\[1 2 3 4 5]").value)).toBe("1 3 6 10 15\n");
    expect(formatValue(session.evaluate("+\\[1000;1 2 3 4 5]").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("1000+\\1 2 3 4 5").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("(+\\)[1000;1 2 3 4 5]").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("(+\\)1 2 3 4 5").value)).toBe("1 3 6 10 15\n");
    expect(formatValue(session.evaluate("(+/)1 2 3 4").value)).toBe("10\n");
    expect(formatValue(session.evaluate("16 +/ 1 2 3 4").value)).toBe("26\n");
    expect(formatValue(session.evaluate("n:(1 2;3 4 5;6 7 8 9);(,/) over n").value)).toBe(
      "1 2 3 4 5 6 7 8 9\n"
    );
    expect(formatValue(session.evaluate("n:(1 2;3 4 5;6 7 8 9);{,/[x]}over n").value)).toBe(
      "1 2 3 4 5 6 7 8 9\n"
    );
    expect(
      formatValue(
        session.evaluate(
          'n:("the ";("quick ";"brown ";("fox ";"jumps ";"over ");"the ");("lazy ";"dog."));raze over n'
        ).value
      )
    ).toBe('"the quick brown fox jumps over the lazy dog."\n');
  });

  it("keeps lambda locals scoped unless q global assignment is used", () => {
    const session = createSession();
    expect(
      formatValue(session.evaluate("x:10;f:{a : 10; : x + a; a : 20};f[5];x").value)
    ).toBe("10\n");
    expect(
      formatValue(session.evaluate("x:10;f:{x::x+1;:x};f[5];x").value)
    ).toBe("6\n");
    expect(session.evaluate("a::10").formatted).toBe("");
    expect(formatValue(session.evaluate("a").value)).toBe("10\n");
  });

  it("matches reference-card abs behavior for null ints and dates", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("abs 10 -43 0N").value)).toBe("10 43 0N\n");
    expect(formatValue(session.evaluate("abs 1999.01.01").value)).toBe("2000.12.31\n");
    expect(formatValue(session.evaluate("\"j\"$1999.01.01 2000.12.31").value)).toBe("-365 365\n");
    expect(formatValue(session.evaluate("abs(10;20 -30)").value)).toBe("10\n20 30\n");
  });

  it("appends tables row-wise with comma like q", () => {
    const session = createSession();
    expect(
      formatValue(
        session.evaluate("a:([] x:1 2; y:10 20); b:([] x:3 4; y:30 40); a,b").value
      )
    ).toBe("x y\n---\n1 10\n2 20\n3 30\n4 40\n");
  });

  it("emits show output and ignores trailing q comments", () => {
    const session = createSession();
    expect(session.evaluate("show 1 2 3").formatted).toBe("1 2 3\n");
    expect(session.evaluate("v:10 20 30; show v; v[1]").formatted).toBe("10 20 30\n20\n");
    expect(session.evaluate("f:{show x; x+1}; f 42").formatted).toBe("42\n43\n");
    expect(session.evaluate("f:{show abs(120; -20 30); x}; f 99").formatted).toBe("120\n20 30\n99\n");
    expect(session.evaluate("show 1 2 3               / values").formatted).toBe("1 2 3\n");
    expect(session.evaluate("r:({x+y}/) each (1 2 3;4 5 6); r").formatted).toBe("6 15\n");
    expect(session.evaluate("r:({x+y} /) each (1 2 3;4 5 6); r").formatted).toBe("6 15\n");
    expect(session.evaluate("\"abcdef\" 1 0 3").formatted).toBe("\"bad\"\n");
    expect(session.evaluate("enlist 3").formatted).toBe(",3\n");
    expect(session.evaluate("/Oh what a lovely day").formatted).toBe("");
  });

  it("supports derived over and scan forms from the reference-card syntax page", () => {
    const session = createSession();
    const nested =
      'n:("the ";("quick ";"brown ";("fox ";"jumps ";"over ");"the ");("lazy ";"dog."))';

    expect(formatValue(session.evaluate("+\\[1 2 3 4 5]").value)).toBe("1 3 6 10 15\n");
    expect(formatValue(session.evaluate("+\\[1000;1 2 3 4 5]").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("1000+\\1 2 3 4 5").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("(+\\)[1000;1 2 3 4 5]").value)).toBe(
      "1001 1003 1006 1010 1015\n"
    );
    expect(formatValue(session.evaluate("(+\\)1 2 3 4 5").value)).toBe("1 3 6 10 15\n");
    expect(formatValue(session.evaluate("(+/)1 2 3 4").value)).toBe("10\n");
    expect(formatValue(session.evaluate("16 +/ 1 2 3 4").value)).toBe("26\n");
    expect(formatValue(session.evaluate(`${nested};(,/) over n`).value)).toBe(
      '"the quick brown fox jumps over the lazy dog."\n'
    );
    expect(formatValue(session.evaluate(`${nested};raze over n`).value)).toBe(
      '"the quick brown fox jumps over the lazy dog."\n'
    );
    expect(formatValue(session.evaluate(`${nested};{,/[x]}over n`).value)).toBe(
      '"the quick brown fox jumps over the lazy dog."\n'
    );
  });

  it("parses adverb forms that combine scan tokens with colon suffixes", () => {
    expect(() => parse("percent:1.2; i:0 1+\\:floor percent; i")).not.toThrow();
  });

  it("supports basic trig monads needed by upstream jq", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("abs -2 3 -4").value)).toBe("2 3 4\n");
    expect(formatValue(session.evaluate("ceiling 1.2 3.0 -1.2").value)).toBe("2 3 -1\n");
    expect(formatValue(session.evaluate("desc 3 1 2").value)).toBe("3 2 1\n");
    expect(formatValue(session.evaluate("div[7;2]").value)).toBe("3\n");
    expect(formatValue(session.evaluate("mod[7;2]").value)).toBe("1\n");
    expect(formatValue(session.evaluate("reverse 1 2 3").value)).toBe("3 2 1\n");
    expect(formatValue(session.evaluate("reverse \"abc\"").value)).toBe("\"cba\"\n");
    expect(formatValue(session.evaluate("sqrt 9 2").value)).toBe("3 1.414214\n");
    expect(formatValue(session.evaluate("exp 0 1").value)).toBe("1 2.718282\n");
    expect(formatValue(session.evaluate("log 1 10").value)).toBe("0 2.302585\n");
    expect(formatValue(session.evaluate("upper \"abC\"").value)).toBe("\"ABC\"\n");
    expect(formatValue(session.evaluate("null 0N 2 0N").value)).toBe("101b\n");
    expect(formatValue(session.evaluate("all 110b").value)).toBe("0b\n");
    expect(formatValue(session.evaluate("any 001b").value)).toBe("1b\n");
    expect(formatValue(session.evaluate("001b").value)).toBe("001b\n");
    expect(formatValue(session.evaluate("010b,1b").value)).toBe("0101b\n");
    expect(formatValue(session.evaluate("signum -3 0 5").value)).toBe("-1 0 1i\n");
    expect(formatValue(session.evaluate("reciprocal 2 4").value)).toBe("0.5 0.25\n");
    expect(formatValue(session.evaluate("cols ([]a:1 2;b:3 4)").value)).toBe("`a`b\n");
    expect(formatValue(session.evaluate("asc 3 1 2").value)).toBe("1 2 3\n");
    expect(formatValue(session.evaluate("avg 1 0n 2 3").value)).toBe("2f\n");
    expect(formatValue(session.evaluate("asin 0").value)).toBe("0f\n");
    expect(formatValue(session.evaluate("atan 1").value)).toBe("0.7853982\n");
    expect(formatValue(session.evaluate("min 0N 0N").value)).toBe("0W\n");
    expect(formatValue(session.evaluate("max \"genie\"").value)).toBe("\"n\"\n");
    expect(formatValue(session.evaluate("dev 10 343 232 55").value)).toBe("134.3484\n");
    expect(formatValue(session.evaluate("var 2 3 5 7").value)).toBe("3.6875\n");
    expect(formatValue(session.evaluate("max `int$()").value)).toBe("-0Wi\n");
    expect(formatValue(session.evaluate("deltas").value)).toBe("-':\n");
    expect(formatValue(session.evaluate("deltas[15 27 93]").value)).toBe("15 12 66\n");
    expect(formatValue(session.evaluate("deltas[10;15 27 93]").value)).toBe("5 12 66\n");
    expect(formatValue(session.evaluate("-':[10;15 27 93]").value)).toBe("5 12 66\n");
    expect(formatValue(session.evaluate("|[2;til 5]").value)).toBe("2 2 2 3 4\n");
    expect(formatValue(session.evaluate("&[2;til 5]").value)).toBe("0 1 2 2 2\n");
    expect(formatValue(session.evaluate("|:[til 5]").value)).toBe("4 3 2 1 0\n");
    expect(formatValue(session.evaluate("(#:)\"zero\"").value)).toBe("4\n");
    expect(formatValue(session.evaluate("10 xlog 0Wj-1").value)).toBe("18.96489\n");
    expect(
      formatValue(session.evaluate("count each string floor 1.2 123 1.23445 -1234578.5522").value)
    ).toBe("1 3 1 8\n");
  });

  it("preserves float results for abs on float inputs", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("abs -1.0").value)).toBe("1f\n");
    expect(formatValue(session.evaluate("abs -1.0 2.5").value)).toBe("1 2.5\n");
    expect(formatValue(session.evaluate("(10;20 -30)").value)).toBe("10\n20 -30\n");
    expect(formatValue(session.evaluate("abs(10;20 -30)").value)).toBe("10\n20 30\n");
  });
});
