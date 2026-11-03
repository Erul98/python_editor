/**
 * Web Worker for isolated Python code execution using Pyodide (WebAssembly)
 * Supports:
 *   1. Throttled real-time streaming stdout/stderr + Output Limit Exceeded (OLE) protection
 *   2. Multi-file workspace mounting (cross-file imports)
 *   3. Per-test-case progress & watchdog timer reset (fast TLE per test case)
 *   4. Dual Test Case Engine:
 *      - 'stdio'    : HackerRank / Codeforces stdin -> stdout comparison
 *      - 'function' : LeetCode `class Solution` or top-level function invocation
 */

/* eslint-disable no-restricted-globals */
const PYODIDE_VERSION = 'v0.26.4';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const WORKSPACE_DIR = '/home/pyodide/workspace';

let pyodideInstance = null;
let pyodideLoadingPromise = null;
let activeMessageId = null;

// Callback được gọi từ Python khi bộ đệm stream flush sang JS
self.__emitStream = (stream, text) => {
  if (!text) return;
  self.postMessage({
    action: 'STREAM',
    messageId: activeMessageId,
    stream,
    text: String(text),
  });
};

// Báo cho Main Thread biết đang bắt đầu và hoàn tất từng test case để reset bộ đếm TLE
self.__emitTestStart = (caseId, index) => {
  self.postMessage({
    action: 'TEST_CASE_START',
    messageId: activeMessageId,
    caseId: String(caseId),
    index: Number(index),
  });
};

self.__emitTestDone = (resultJson) => {
  try {
    self.postMessage({
      action: 'TEST_CASE_DONE',
      messageId: activeMessageId,
      result: JSON.parse(String(resultJson)),
    });
  } catch (_) {
    // ignore malformed progress payload
  }
};

const HARNESS = `
import sys, io, time, json, ast, math, inspect, traceback, importlib

WORKSPACE_DIR = ${JSON.stringify(WORKSPACE_DIR)}
MAX_OUTPUT_CHARS = 100_000
STREAM_FLUSH_INTERVAL_SEC = 0.020
STREAM_BATCH_CHARS = 1024

if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

class OutputLimitExceeded(RuntimeError):
    pass

class _StreamingIO(io.StringIO):
    """
    Vừa lưu vào bộ đệm vừa đẩy chunk sang JS theo lô (throttled batching):
    - Flush ngay ở dòng đầu tiên (để giữ được log nếu ngay sau đó rơi vào vòng lặp vô hạn).
    - Các lần ghi tiếp theo gom theo chu kỳ 20ms hoặc đủ 1KB để không làm nghẽn Main Thread.
    """
    def __init__(self, stream_name, emit_live=True, max_chars=MAX_OUTPUT_CHARS):
        super().__init__()
        self._stream_name = stream_name
        self._emit_live = emit_live
        self._max_chars = max_chars
        self._written = 0
        self._pending = []
        self._pending_len = 0
        self._last_emit = 0.0

    def write(self, s):
        if not s:
            return 0
        self._written += len(s)
        if self._written > self._max_chars:
            self.flush_live()
            raise OutputLimitExceeded(
                f"Output Limit Exceeded (> {self._max_chars // 1000}KB). Kiểm tra vòng lặp in vô hạn."
            )
        if self._emit_live:
            self._pending.append(s)
            self._pending_len += len(s)
            now = time.perf_counter()
            if (
                self._pending_len >= STREAM_BATCH_CHARS
                or ('\\n' in s and (now - self._last_emit) >= STREAM_FLUSH_INTERVAL_SEC)
            ):
                self.flush_live(now)
        return super().write(s)

    def flush_live(self, now=None):
        if not self._emit_live or not self._pending:
            return
        chunk = ''.join(self._pending)
        self._pending.clear()
        self._pending_len = 0
        self._last_emit = now if now is not None else time.perf_counter()
        try:
            _js_emit_stream(self._stream_name, chunk)
        except Exception:
            pass

def _purge_workspace_modules():
    """Xóa cache các module người dùng để lần chạy sau import bản mới nhất."""
    for name in list(sys.modules):
        mod = sys.modules.get(name)
        f = getattr(mod, '__file__', None) or ''
        if f.startswith(WORKSPACE_DIR):
            del sys.modules[name]
    importlib.invalidate_caches()

def _clean_tb(exc):
    """Giữ nguyên số dòng và dấu ^ cho SyntaxError mà không lộ frame của harness."""
    if exc.__traceback__ and exc.__traceback__.tb_next:
        tb = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__.tb_next))
    else:
        tb = ''.join(traceback.format_exception_only(type(exc), exc))
    return tb.replace(WORKSPACE_DIR + '/', '')

def __run_user_code(code, stdin_data, filename, emit_live=True):
    _purge_workspace_modules()
    out = _StreamingIO('stdout', emit_live)
    err = _StreamingIO('stderr', emit_live)
    old_streams = (sys.stdout, sys.stderr, sys.stdin)
    old_rec_limit = sys.getrecursionlimit()
    sys.stdout, sys.stderr, sys.stdin = out, err, io.StringIO(stdin_data or '')

    error, tb = None, ''
    start = time.perf_counter()
    try:
        user_globals = {
            '__name__': '__main__',
            '__file__': filename,
            '__builtins__': __builtins__,
        }
        exec(compile(code, filename, 'exec'), user_globals)
    except SystemExit as e:
        if e.code not in (None, 0):
            error = f'SystemExit: {e.code}'
            tb = f'SystemExit: {e.code}\\n'
    except BaseException as e:
        error = f'{type(e).__name__}: {e}'
        tb = _clean_tb(e)
    finally:
        elapsed = (time.perf_counter() - start) * 1000
        out.flush_live()
        err.flush_live()
        sys.stdout, sys.stderr, sys.stdin = old_streams
        try:
            sys.setrecursionlimit(old_rec_limit)
        except Exception:
            pass

    return json.dumps({
        'stdout': out.getvalue(),
        'stderr': err.getvalue(),
        'error': error,
        'traceback': tb,
        'executionTime': elapsed,
    })

def _parse_value(raw):
    s = raw.strip()
    if not s:
        return ''
    if '=' in s:
        lhs, rhs = s.split('=', 1)
        if lhs.strip().isidentifier():
            s = rhs.strip()
    try:
        return json.loads(s)
    except Exception:
        pass
    try:
        return ast.literal_eval(s)
    except Exception:
        return s

def _parse_args(input_str):
    """Hỗ trợ cả tham số 1 dòng và biểu thức nhiều dòng (vd: ma trận 2D)."""
    text = (input_str or '').strip()
    if not text:
        return []
    try:
        tree = ast.parse(text)
        if tree.body:
            args = []
            for stmt in tree.body:
                node = stmt.value if isinstance(stmt, (ast.Assign, ast.Expr)) else stmt
                segment = ast.get_source_segment(text, node)
                args.append(_parse_value(segment if segment is not None else ast.unparse(node)))
            return args
    except Exception:
        pass
    lines = [ln for ln in text.splitlines() if ln.strip() != '']
    return [_parse_value(ln) for ln in lines]

def _deep_equal(a, b):
    """So sánh chặt kiểu bool vs int (True != 1) và dung sai số thực float."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if isinstance(a, float) or isinstance(b, float):
            return math.isclose(float(a), float(b), rel_tol=1e-5, abs_tol=1e-5)
        return a == b
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(_deep_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a.keys()) == set(b.keys()) and all(_deep_equal(a[k], b[k]) for k in a)
    return a == b

def _format_value(val):
    if val is None:
        return 'null'
    if isinstance(val, bool):
        return 'true' if val else 'false'
    try:
        return json.dumps(val, ensure_ascii=False)
    except Exception:
        return repr(val)

def _resolve_callable(user_globals, entry_name):
    """Tìm method trong class Solution (theo đúng thứ tự khai báo) hoặc hàm top-level."""
    entry_name = (entry_name or '').strip()

    if entry_name:
        if '.' in entry_name:
            cls_name, meth_name = entry_name.split('.', 1)
            cls = user_globals.get(cls_name)
            if inspect.isclass(cls):
                return getattr(cls(), meth_name), f'{cls_name}.{meth_name}'
        if 'Solution' in user_globals and inspect.isclass(user_globals['Solution']):
            sol = user_globals['Solution']()
            if hasattr(sol, entry_name):
                return getattr(sol, entry_name), f'Solution.{entry_name}'
        if entry_name in user_globals and callable(user_globals[entry_name]):
            return user_globals[entry_name], entry_name
        raise AttributeError(f"Không tìm thấy hàm/method '{entry_name}'")

    # 1. Ưu tiên class Solution — duyệt __dict__ để giữ đúng thứ tự định nghĩa hàm trong source
    if 'Solution' in user_globals and inspect.isclass(user_globals['Solution']):
        sol_cls = user_globals['Solution']
        sol = sol_cls()
        methods = [
            name
            for name, obj in sol_cls.__dict__.items()
            if inspect.isfunction(obj) and not name.startswith('_')
        ]
        if methods:
            target = methods[0]
            return getattr(sol, target), f'Solution.{target}'

    # 2. Fallback: hàm cuối cùng do người dùng định nghĩa trong file
    candidates = [
        (name, obj)
        for name, obj in user_globals.items()
        if inspect.isfunction(obj) and not name.startswith('_') and obj.__module__ in (None, '__solution__')
    ]
    if candidates:
        name, fn = candidates[-1]
        return fn, name

    raise RuntimeError(
        "Không tìm thấy class Solution hoặc hàm nào để gọi. Hãy định nghĩa 'class Solution:' hoặc một hàm def."
    )

def __run_function_tests(code, test_cases_json, filename, entry_name=''):
    test_cases = json.loads(test_cases_json)
    results = []
    detected_name = None

    try:
        code_obj = compile(code, filename, 'exec')
    except BaseException as compile_exc:
        tb_str = _clean_tb(compile_exc) or f'{type(compile_exc).__name__}: {compile_exc}'
        for idx, tc in enumerate(test_cases):
            res_item = {
                'id': str(tc.get('id', idx + 1)),
                'status': 'ERROR',
                'input': tc.get('input', ''),
                'expectedOutput': tc.get('expectedOutput', '').strip(),
                'actualOutput': '',
                'stdout': '',
                'error': tb_str,
                'executionTime': 0.0,
            }
            results.append(res_item)
        return json.dumps({'detectedEntry': None, 'results': results})

    for idx, tc in enumerate(test_cases):
        case_id = str(tc.get('id', idx + 1))
        raw_in = tc.get('input', '')
        raw_exp = tc.get('expectedOutput', '')

        try:
            _js_emit_test_start(case_id, idx)
        except Exception:
            pass

        _purge_workspace_modules()
        out = _StreamingIO('stdout', emit_live=False)
        err = _StreamingIO('stderr', emit_live=False)
        old_streams = (sys.stdout, sys.stderr, sys.stdin)
        old_rec_limit = sys.getrecursionlimit()
        sys.stdout, sys.stderr, sys.stdin = out, err, io.StringIO(raw_in)

        start = time.perf_counter()
        try:
            user_globals = {
                '__name__': '__solution__',
                '__file__': filename,
                '__builtins__': __builtins__,
            }
            exec(code_obj, user_globals)
            fn, detected_name = _resolve_callable(user_globals, entry_name)
            args = _parse_args(raw_in)

            call_start = time.perf_counter()
            actual_val = fn(*args)
            elapsed = (time.perf_counter() - call_start) * 1000

            exp_val = _parse_value(raw_exp)
            actual_str = _format_value(actual_val)
            exp_str = _format_value(exp_val) if raw_exp.strip() != '' else ''

            passed = _deep_equal(actual_val, exp_val) or (
                not isinstance(actual_val, bool)
                and not isinstance(exp_val, bool)
                and actual_str.strip() == raw_exp.strip()
            )
            res_item = {
                'id': case_id,
                'status': 'PASSED' if passed else 'FAILED',
                'input': raw_in,
                'expectedOutput': exp_str if passed else raw_exp.strip(),
                'actualOutput': actual_str,
                'stdout': out.getvalue(),
                'error': err.getvalue() or None,
                'executionTime': elapsed,
            }
        except BaseException as e:
            elapsed = (time.perf_counter() - start) * 1000
            res_item = {
                'id': case_id,
                'status': 'ERROR',
                'input': raw_in,
                'expectedOutput': raw_exp.strip(),
                'actualOutput': '',
                'stdout': out.getvalue(),
                'error': _clean_tb(e) or f'{type(e).__name__}: {e}',
                'executionTime': elapsed,
            }
        finally:
            sys.stdout, sys.stderr, sys.stdin = old_streams
            try:
                sys.setrecursionlimit(old_rec_limit)
            except Exception:
                pass

        results.append(res_item)
        try:
            _js_emit_test_done(json.dumps(res_item))
        except Exception:
            pass

    return json.dumps({'detectedEntry': detected_name, 'results': results})
`;

function postStatus(message) {
  self.postMessage({ action: 'STATUS', message });
}

async function loadPyodideRuntime() {
  if (pyodideInstance) return pyodideInstance;

  if (!pyodideLoadingPromise) {
    pyodideLoadingPromise = (async () => {
      postStatus('Downloading Python runtime (WebAssembly)...');
      importScripts(`${PYODIDE_BASE}pyodide.js`);

      const pyodide = await self.loadPyodide({ indexURL: PYODIDE_BASE });

      postStatus('Warming up Python modules...');
      pyodide.FS.mkdirTree(WORKSPACE_DIR);
      pyodide.globals.set('_js_emit_stream', self.__emitStream);
      pyodide.globals.set('_js_emit_test_start', self.__emitTestStart);
      pyodide.globals.set('_js_emit_test_done', self.__emitTestDone);
      await pyodide.runPythonAsync(
        'import math, collections, heapq, bisect, itertools, functools, string, re, random, typing'
      );
      await pyodide.runPythonAsync(HARNESS);

      pyodideInstance = pyodide;
      return pyodide;
    })().catch((err) => {
      pyodideLoadingPromise = null;
      throw err;
    });
  }

  return pyodideLoadingPromise;
}

function syncWorkspace(pyodide, files = []) {
  const FS = pyodide.FS;

  const removeDir = (dir) => {
    for (const entry of FS.readdir(dir)) {
      if (entry === '.' || entry === '..') continue;
      const p = `${dir}/${entry}`;
      if (FS.isDir(FS.stat(p).mode)) {
        removeDir(p);
        FS.rmdir(p);
      } else {
        FS.unlink(p);
      }
    }
  };
  removeDir(WORKSPACE_DIR);

  for (const { path, content } of files) {
    const full = `${WORKSPACE_DIR}/${path}`;
    const dir = full.substring(0, full.lastIndexOf('/'));
    FS.mkdirTree(dir);
    FS.writeFile(full, content ?? '');
  }
}

async function executePythonCode(code, stdinData = '', entryPath = 'solution.py', emitLive = true) {
  const pyodide = await loadPyodideRuntime();
  const runner = pyodide.globals.get('__run_user_code');
  try {
    const raw = runner(code, stdinData || '', `${WORKSPACE_DIR}/${entryPath}`, emitLive);
    return JSON.parse(raw);
  } finally {
    runner.destroy();
  }
}

function normalizeOutput(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .replace(/^\n+/, '');
}

async function runStdioTestCases(code, testCases = [], entryPath = 'solution.py') {
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const { id, input, expectedOutput } = testCases[i];
    const caseId = id ?? String(i + 1);
    self.__emitTestStart(caseId, i);

    let resItem;
    try {
      const exec = await executePythonCode(code, input, entryPath, false);
      const actual = normalizeOutput(exec.stdout);
      const expected = normalizeOutput(expectedOutput);

      if (exec.error) {
        resItem = {
          id: caseId,
          status: 'ERROR',
          input,
          expectedOutput: expected,
          actualOutput: actual,
          error: exec.traceback || exec.error,
          executionTime: exec.executionTime,
        };
      } else {
        resItem = {
          id: caseId,
          status: actual === expected ? 'PASSED' : 'FAILED',
          input,
          expectedOutput: expected,
          actualOutput: actual,
          error: exec.stderr || null,
          executionTime: exec.executionTime,
        };
      }
    } catch (err) {
      resItem = {
        id: caseId,
        status: 'CRASH',
        input,
        expectedOutput,
        actualOutput: '',
        error: err?.message || String(err),
        executionTime: 0,
      };
    }

    results.push(resItem);
    self.__emitTestDone(JSON.stringify(resItem));
  }

  return { detectedEntry: null, results };
}

async function runFunctionTestCases(code, testCases = [], entryPath = 'solution.py', entryFunction = '') {
  const pyodide = await loadPyodideRuntime();
  const fnRunner = pyodide.globals.get('__run_function_tests');
  try {
    const raw = fnRunner(
      code,
      JSON.stringify(testCases),
      `${WORKSPACE_DIR}/${entryPath}`,
      entryFunction || ''
    );
    return JSON.parse(raw);
  } finally {
    fnRunner.destroy();
  }
}

self.onmessage = async (event) => {
  const { action, payload = {}, messageId } = event.data;
  activeMessageId = messageId;

  try {
    switch (action) {
      case 'INIT': {
        await loadPyodideRuntime();
        self.postMessage({ action: 'INIT_COMPLETE', messageId, success: true });
        break;
      }

      case 'RUN_CODE': {
        const { code, input, files, entryPath } = payload;
        const pyodide = await loadPyodideRuntime();
        syncWorkspace(pyodide, files);
        const result = await executePythonCode(code, input, entryPath, true);
        self.postMessage({
          action: 'RUN_CODE_COMPLETE',
          messageId,
          success: !result.error,
          data: result,
        });
        break;
      }

      case 'RUN_TEST_CASES': {
        const { code, testCases, files, entryPath, mode = 'stdio', entryFunction = '' } = payload;
        const pyodide = await loadPyodideRuntime();
        syncWorkspace(pyodide, files);

        const { detectedEntry, results } =
          mode === 'function'
            ? await runFunctionTestCases(code, testCases, entryPath, entryFunction)
            : await runStdioTestCases(code, testCases, entryPath);

        const passed = results.filter((r) => r.status === 'PASSED').length;
        self.postMessage({
          action: 'RUN_TEST_CASES_COMPLETE',
          messageId,
          success: passed === results.length,
          data: {
            mode,
            detectedEntry,
            summary: { total: results.length, passed, failed: results.length - passed },
            results,
          },
        });
        break;
      }

      default:
        self.postMessage({ action: 'ERROR', messageId, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    self.postMessage({
      action: 'GLOBAL_ERROR',
      messageId,
      error: err?.message || String(err),
    });
  } finally {
    activeMessageId = null;
  }
};
