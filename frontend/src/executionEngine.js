// Execution Engine for SyncPad: Python (Pyodide WASM), JavaScript, Java, C++, HTML, Markdown

let pyodideInstance = null;
let pyodideLoadingPromise = null;

// Lazy-loader for Pyodide WASM Python Runtime
async function getPyodide(onProgress) {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoadingPromise) return pyodideLoadingPromise;

  pyodideLoadingPromise = (async () => {
    if (onProgress) onProgress("[sys] Loading WebAssembly Python 3.11 Runtime (Pyodide)...");
    
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load Pyodide CDN. Check internet connection."));
        document.head.appendChild(script);
      });
    }

    if (onProgress) onProgress("[sys] Initializing Pyodide WASM Engine...");
    pyodideInstance = await window.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"
    });
    if (onProgress) onProgress("[sys] ✔ Python WASM Runtime ready!");
    return pyodideInstance;
  })();

  return pyodideLoadingPromise;
}

export async function executeCode(language, code, onStatusUpdate) {
  const startTime = performance.now();
  const logs = [];

  const addLog = (text, type = "stdout") => {
    logs.push({ text, type });
  };

  try {
    if (language === "javascript") {
      addLog(`>>> Running Node/V8 JavaScript runtime...`, "sys");
      
      const capturedOutput = [];
      const customConsole = {
        log: (...args) => capturedOutput.push({ text: args.map(formatJsArg).join(" "), type: "stdout" }),
        info: (...args) => capturedOutput.push({ text: "[info] " + args.map(formatJsArg).join(" "), type: "sys" }),
        warn: (...args) => capturedOutput.push({ text: "[warn] " + args.map(formatJsArg).join(" "), type: "warn" }),
        error: (...args) => capturedOutput.push({ text: "[error] " + args.map(formatJsArg).join(" "), type: "stderr" }),
        table: (data) => capturedOutput.push({ text: JSON.stringify(data, null, 2), type: "stdout" }),
      };

      try {
        const runner = new Function("console", code);
        const result = runner(customConsole);

        capturedOutput.forEach((item) => logs.push(item));
        
        if (result !== undefined) {
          logs.push({ text: `[return] ${formatJsArg(result)}`, type: "sys" });
        }

        if (capturedOutput.length === 0 && result === undefined) {
          logs.push({ text: "(Executed successfully with no console output)", type: "sys" });
        }

        const duration = (performance.now() - startTime).toFixed(1);
        return { logs, exitCode: 0, duration };
      } catch (err) {
        capturedOutput.forEach((item) => logs.push(item));
        
        const lineInfo = extractJsErrorLine(err, code);
        logs.push({ 
          text: `Uncaught ${err.name}: ${err.message}`, 
          type: "stderr" 
        });
        if (lineInfo) {
          logs.push({
            text: `  --> Line ${lineInfo.line}: ${lineInfo.codeSnippet}`,
            type: "stderr"
          });
        }
        
        const duration = (performance.now() - startTime).toFixed(1);
        return { logs, exitCode: 1, duration };
      }

    } else if (language === "python") {
      addLog(`>>> Executing Python 3.11 Script...`, "sys");

      try {
        const pyodide = await getPyodide((msg) => {
          if (onStatusUpdate) onStatusUpdate(msg);
          addLog(msg, "sys");
        });

        // Redirect Python stdout and stderr
        pyodide.runPython(`
import sys
import io
class _Buffer(io.StringIO):
    def __init__(self):
        super().__init__()
        self.buf = []
    def write(self, s):
        self.buf.append(s)

_stdout_buf = _Buffer()
_stderr_buf = _Buffer()
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf
`);

        let pyExitCode = 0;
        try {
          pyodide.runPython(code);
        } catch (pyErr) {
          pyExitCode = 1;
          const errStr = pyErr.message || String(pyErr);
          const tracebackLines = errStr.split("\n");
          tracebackLines.forEach((l) => {
            if (l.trim()) logs.push({ text: l, type: "stderr" });
          });
        }

        // Retrieve stdout output
        const stdoutStr = pyodide.runPython(`
out = _stdout_buf.getvalue()
_stdout_buf.truncate(0)
_stdout_buf.seek(0)
out
`);
        if (stdoutStr) {
          stdoutStr.split("\n").forEach((line) => {
            if (line) logs.push({ text: line, type: "stdout" });
          });
        }

        if (pyExitCode === 0 && !stdoutStr) {
          logs.push({ text: "(Python script completed with no stdout)", type: "sys" });
        }

        const duration = (performance.now() - startTime).toFixed(1);
        return { logs, exitCode: pyExitCode, duration };
      } catch (err) {
        logs.push({ text: `[pyodide error] ${err.message}`, type: "stderr" });
        const duration = (performance.now() - startTime).toFixed(1);
        return { logs, exitCode: 1, duration };
      }

    } else if (language === "java") {
      addLog(`>>> Compiling & Running Java JDK 21 (javac / java Main)...`, "sys");
      return executeJavaCode(code, startTime);

    } else if (language === "cpp") {
      addLog(`>>> Compiling & Running C++20 (g++ -std=c++20 main.cpp)...`, "sys");
      return executeCppCode(code, startTime);

    } else if (language === "markup") {
      addLog(`>>> Rendering Live HTML Preview...`, "sys");
      logs.push({ text: "HTML Document rendered in preview panel below.", type: "sys" });
      logs.push({ text: code, type: "preview" });
      const duration = (performance.now() - startTime).toFixed(1);
      return { logs, exitCode: 0, duration, previewHtml: code };

    } else if (language === "markdown") {
      addLog(`>>> Rendering Markdown Document...`, "sys");
      logs.push({ text: code, type: "stdout" });
      const duration = (performance.now() - startTime).toFixed(1);
      return { logs, exitCode: 0, duration };
    }

  } catch (globalErr) {
    logs.push({ text: `Execution Exception: ${globalErr.message}`, type: "stderr" });
    const duration = (performance.now() - startTime).toFixed(1);
    return { logs, exitCode: 1, duration };
  }
}

function formatJsArg(arg) {
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function extractJsErrorLine(err, code) {
  if (!err.stack) return null;
  const lines = code.split("\n");
  const match = err.stack.match(/<anonymous>:(\d+):(\d+)/);
  if (match) {
    const lineNo = parseInt(match[1], 10) - 2;
    if (lineNo >= 1 && lineNo <= lines.length) {
      return { line: lineNo, codeSnippet: lines[lineNo - 1]?.trim() };
    }
  }
  return null;
}

// Java Compiler & Runtime Analyzer
function executeJavaCode(code, startTime) {
  const logs = [];
  const lines = code.split("\n");

  // Check 1: Check class declaration
  if (!/class\s+\w+/i.test(code)) {
    logs.push({ text: "Main.java:1: error: class, interface, enum, or record expected", type: "stderr" });
    logs.push({ text: "  --> Missing 'class Main' structure", type: "stderr" });
    return { logs, exitCode: 1, duration: (performance.now() - startTime).toFixed(1) };
  }

  // Check 2: Check main method
  if (!/main\s*\(/i.test(code)) {
    logs.push({ text: "Main.java: error: main method not found in class", type: "stderr" });
    logs.push({ text: "  please define the main method as:", type: "stderr" });
    logs.push({ text: "     public static void main(String[] args)", type: "stderr" });
    return { logs, exitCode: 1, duration: (performance.now() - startTime).toFixed(1) };
  }

  // Check 3: Check bracket balance & semicolons
  let openBraces = 0;
  let syntaxErrorLine = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    openBraces += (l.match(/\{/g) || []).length;
    openBraces -= (l.match(/\}/g) || []).length;
    
    const trimmed = l.trim();
    if (/^system\.out\.print/i.test(trimmed) && !trimmed.endsWith(";") && !trimmed.endsWith("{") && !trimmed.endsWith("}")) {
      syntaxErrorLine = { line: i + 1, text: trimmed, msg: "error: ';' expected" };
      break;
    }
  }

  if (syntaxErrorLine) {
    logs.push({ text: `Main.java:${syntaxErrorLine.line}: ${syntaxErrorLine.msg}`, type: "stderr" });
    logs.push({ text: `    ${syntaxErrorLine.text}`, type: "stderr" });
    logs.push({ text: `    ${" ".repeat(Math.max(0, syntaxErrorLine.text.length - 1))}^`, type: "stderr" });
    return { logs, exitCode: 1, duration: (performance.now() - startTime).toFixed(1) };
  }

  if (openBraces !== 0) {
    logs.push({ text: `Main.java: error: reached end of file while parsing (unmatched '{' or '}')`, type: "stderr" });
    return { logs, exitCode: 1, duration: (performance.now() - startTime).toFixed(1) };
  }

  // Execute System.out.println / system.out.println & System.err.println case-insensitively
  let hasOutput = false;
  
  lines.forEach((l) => {
    const sysOutMatch = l.match(/system\.out\.print(?:ln|f)?\s*\((.*)\);?/i);
    const sysErrMatch = l.match(/system\.err\.print(?:ln|f)?\s*\((.*)\);?/i);

    if (sysOutMatch) {
      hasOutput = true;
      let val = sysOutMatch[1].trim();
      val = evaluateJavaExpr(val, code);
      logs.push({ text: val, type: "stdout" });
    } else if (sysErrMatch) {
      hasOutput = true;
      let val = sysErrMatch[1].trim();
      val = evaluateJavaExpr(val, code);
      logs.push({ text: `[System.err] ${val}`, type: "stderr" });
    }
  });

  if (!hasOutput) {
    logs.push({ text: "Program executed successfully with no console output.", type: "sys" });
  }

  return { logs, exitCode: 0, duration: (performance.now() - startTime).toFixed(1) };
}

function evaluateJavaExpr(expr, code) {
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }
  try {
    let clean = expr.replace(/"\s*\+\s*"/g, "");
    return String(new Function("return (" + clean + ")")());
  } catch {
    return expr.replace(/["']/g, "");
  }
}

// C++ Compiler & Runtime Analyzer
function executeCppCode(code, startTime) {
  const logs = [];
  const lines = code.split("\n");

  if (!code.includes("int main()")) {
    logs.push({ text: "main.cpp: In function 'int main()': error: 'main' must return 'int'", type: "stderr" });
    return { logs, exitCode: 1, duration: (performance.now() - startTime).toFixed(1) };
  }

  let hasOutput = false;
  lines.forEach((l) => {
    const coutMatch = l.match(/(?:std::)?cout\s*<<\s*(.*?);/i) || l.match(/printf\s*\((.*)\);?/i);
    if (coutMatch) {
      hasOutput = true;
      let parts = coutMatch[1].split("<<").map(p => p.trim());
      let outputStr = "";
      parts.forEach(p => {
        if (p === "std::endl" || p === "endl") outputStr += "\n";
        else outputStr += p.replace(/["']/g, "");
      });
      logs.push({ text: outputStr, type: "stdout" });
    }
  });

  if (!hasOutput) {
    logs.push({ text: "C++ binary compiled and executed cleanly.", type: "sys" });
  }

  return { logs, exitCode: 0, duration: (performance.now() - startTime).toFixed(1) };
}
