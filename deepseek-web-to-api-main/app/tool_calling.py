"""Tool calling emulation for DeepSeek Web-to-API."""

import json
import re
import uuid


# ---------------------------------------------------------------------------
# Tools that carry large string arguments — SQL, edge function code, etc.
# DeepSeek must NOT inline large content; it should write to disk first.
# ---------------------------------------------------------------------------
LARGE_PAYLOAD_TOOLS = {
    "apply_migration",
    "execute_sql",
    "deploy_edge_function",
    "create_branch",
    "reset_branch",
}

# Supabase MCP tool names — used to inject specific guidance
SUPABASE_TOOLS = {
    "list_projects", "list_organizations", "get_project", "get_organization",
    "get_project_url", "get_anon_key", "get_publishable_keys",
    "list_tables", "list_extensions", "list_migrations",
    "apply_migration", "execute_sql",
    "get_logs", "get_advisors",
    "generate_typescript_types",
    "list_edge_functions", "get_edge_function", "deploy_edge_function",
    "create_branch", "list_branches", "delete_branch",
    "merge_branch", "reset_branch", "rebase_branch",
    "get_cost", "confirm_cost",
    "pause_project", "restore_project",
    "search_docs",
}


TOOL_INSTRUCTION = """You are an AI coding agent running inside a terminal-based development environment.

You have tools that operate on the user's actual filesystem, shell, and Supabase project.

Available tools:
{tool_descriptions}

### How to call tools

Output EXACTLY this XML format and NOTHING ELSE when calling a tool:

<tool_call>
{{"name": "tool_name", "arguments": {{"arg1": "value1"}}}}
</tool_call>

Rules:
1. When the user asks about their code, files, database, or project, call a tool FIRST.
2. Do NOT answer from general knowledge when a tool would give the actual answer.
3. Do NOT emit DSML, XML function tags, markdown fences, or any other format.
4. Do NOT add text before or after a tool_call block when calling a tool.
5. Multiple tools: emit multiple <tool_call>...</tool_call> blocks in sequence.
6. Only answer with plain text when no tool is needed.

### Critical: Large SQL and edge function content

For apply_migration and execute_sql:
- The "query" argument must be a valid JSON string — escape all newlines as \\n, all quotes as \\".
- Keep SQL statements focused. For large migrations, split into multiple apply_migration calls.
- Never truncate SQL mid-statement.

For deploy_edge_function:
- The "files" argument contains the full TypeScript source. Escape all newlines as \\n.
- If the function is long, write it as one complete unit — never truncate.

### Critical: JSON argument format

All arguments must be valid JSON. String values containing SQL, code, or multiline text:
- Escape newlines: actual newline → \\n
- Escape quotes: " → \\"
- Escape backslashes: \\ → \\\\
- Never use real newlines inside a JSON string value

### confirm_cost tool

When creating a new project or branch, you MUST call confirm_cost first and wait for the result before proceeding. Do not skip this step.
{supabase_guidance}"""

SUPABASE_GUIDANCE = """
### Supabase workflow guidance

- Always call list_tables before writing migrations so you know the current schema.
- Use apply_migration for DDL (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.).
- Use execute_sql for DML (SELECT, INSERT, UPDATE, DELETE) and read-only queries.
- For edge functions: list_edge_functions first, then deploy_edge_function.
- For branching: always list_branches before create_branch to avoid duplicates.
- get_logs accepts service values: api, postgres, edge-function, auth, storage, realtime.
- get_advisors accepts type values: security, performance."""


def _has_supabase_tools(tools) -> bool:
    for t in tools:
        fn = t.get("function", {})
        if fn.get("name", "") in SUPABASE_TOOLS:
            return True
    return False


def build_tool_instruction(tools) -> str:
    lines = []
    for t in tools:
        fn = t.get("function", {})
        name = fn.get("name", "unknown")
        desc = fn.get("description", "")
        params = fn.get("parameters", {})
        props = params.get("properties", {})
        required = params.get("required", [])
        param_parts = []
        for k, v in props.items():
            typ = v.get("type", "any")
            opt = "" if k in required else "?"
            param_parts.append(f"{k}: {typ}{opt}")
        param_str = ", ".join(param_parts)
        lines.append(f"- {name}({param_str}) - {desc}")

    supabase_guidance = SUPABASE_GUIDANCE if _has_supabase_tools(tools) else ""
    return TOOL_INSTRUCTION.format(
        tool_descriptions="\n".join(lines),
        supabase_guidance=supabase_guidance,
    )


# ---------------------------------------------------------------------------
# Argument repair — fix common DeepSeek JSON escaping issues
# ---------------------------------------------------------------------------

_MULTILINE_ARGS = {
    "query", "sql", "content", "newString", "oldString",
    "command", "entrypoint_path",
}


def _repair_arguments(raw_args, tool_name: str):
    """
    Attempt to repair argument dicts that DeepSeek may have mangled.
    Returns a dict (or the original if unrecoverable).
    """
    if isinstance(raw_args, dict):
        repaired = {}
        for k, v in raw_args.items():
            if isinstance(v, str):
                v = v.replace("\r\n", "\n")
                # DeepSeek sometimes emits literal backslash-n instead of a
                # real newline in SQL/code args.  Convert them back so Postgres
                # and the shell receive valid multi-line text.
                if k in _MULTILINE_ARGS and "\\n" in v:
                    v = v.replace("\\n", "\n")
                repaired[k] = v
            else:
                repaired[k] = v
        return repaired
    return raw_args


def _is_truncated_json(s: str) -> bool:
    """Detect if a JSON string appears to be truncated mid-generation."""
    if not isinstance(s, str):
        return False
    s = s.strip()
    try:
        json.loads(s)
        return False
    except json.JSONDecodeError:
        pass
    # Heuristics: ends mid-string, missing closing braces/brackets
    open_braces = s.count("{") - s.count("}")
    open_brackets = s.count("[") - s.count("]")
    open_quotes = s.count('"') % 2
    return open_braces > 0 or open_brackets > 0 or open_quotes != 0


# ---------------------------------------------------------------------------
# DSML normalization
# ---------------------------------------------------------------------------
# DeepSeek's web UI emits DSML tags in several broken variants:
#
#   Canonical (expected):   <|DSML|invoke name="bash">
#   Doubled fullwidth pipe: <｜｜DSML｜｜ invoke name="bash">
#   Space after delimiter:  <|DSML| invoke ...>
#   Closing tag mismatch:   </｜｜DSML｜｜ calls>   ← closes an invoke block!
#
# _normalize() collapses all of these to the canonical <|DSML|tagname ...>
# form via three simple string operations.
#
# IMPORTANT: We deliberately do NOT rewrite `</|DSML|calls>` into
# `</|DSML|invoke>` here — the individual regexes accept `calls` as an
# alternative closer, which is safer than a greedy cross-invoke rewrite.
# ---------------------------------------------------------------------------

_FULLWIDTH_PIPE = "\uff5c"  # ｜


def _normalize(text: str) -> str:
    """
    Collapse all DSML tag variants to the canonical <|DSML|tagname ...> form.

    Handles:
      - Fullwidth pipes (｜) -> ASCII (|)
      - Doubled pipes (||DSML||) -> single (|DSML|)
      - Whitespace between < / </ and |DSML|, and after |DSML|

    Example:
      <｜｜DSML｜｜ invoke name="bash">   ->  <|DSML|invoke name="bash">
      </｜｜DSML｜｜ calls>               ->  </|DSML|calls>

    This is safe because |DSML| only appears as a tag delimiter, never in
    user content.
    """
    if not text:
        return text
    # Step 1: fullwidth -> ASCII
    text = text.replace(_FULLWIDTH_PIPE, "|")
    # Step 2: collapse runs of 2+ pipes to a single pipe
    text = re.sub(r"\|{2,}", "|", text)
    # Step 3: strip whitespace between < / </ and |DSML|, and after |DSML|
    # Pattern: opening/closing < + optional / + optional spaces + |DSML| + optional spaces
    text = re.sub(r"(</?)\s*\|DSML\|\s*", lambda m: m.group(1) + "|DSML|", text)
    return text


# ---------------------------------------------------------------------------
# Regex patterns  (all written against the *normalised* form)
# ---------------------------------------------------------------------------

# ---- <tool_call> JSON blocks -----------------------------------------------
_TOOL_TAG_RE = re.compile(
    r"<\s*(?:_?tool[_-]?call|_?call|toolcall)\s*>\s*(\{.*?\})\s*<\s*/\s*(?:_?tool[_-]?call|_?call|toolcall)\s*>",
    re.DOTALL | re.IGNORECASE,
)
_LOOSE_TAG_RE = re.compile(
    r"<\s*[^>]*call\s*>\s*(\{.*?\})\s*<\s*/\s*[^>]*call\s*>",
    re.DOTALL | re.IGNORECASE,
)
_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)

# ---- DSML invoke blocks ----------------------------------------------------
# Primary: fully closed invoke.  Accept `calls` as a closer because DeepSeek
# frequently emits </|DSML|calls> instead of </|DSML|invoke>.
_DSML_INVOKE_RE = re.compile(
    r'<\|DSML\|\s*invoke\s+name\s*=\s*"([^"]+)"\s*>(.*?)</\|DSML\|\s*(?:invoke|calls)\s*>',
    re.DOTALL | re.IGNORECASE,
)
# Fallback: invoke opener with no closing tag (truncated stream).
# Stops at the next DSML opening OR closing tag, or end-of-string.
_DSML_INVOKE_OPEN_RE = re.compile(
    r'<\|DSML\|\s*invoke\s+name\s*=\s*"([^"]+)"\s*>(.*?)(?=</?\|DSML\||$)',
    re.DOTALL | re.IGNORECASE,
)
# Fallback: mangled invoke format  <|DSML|invoke name="foo"({...})
_DSML_INVOKE_MANGLED_RE = re.compile(
    r'<\|DSML\|\s*invoke\s+name\s*=\s*"([A-Za-z_][A-Za-z0-9_]*)\(\s*(\{.*?\})\s*\)',
    re.DOTALL | re.IGNORECASE,
)

# ---- DSML parameter blocks -------------------------------------------------
# Accept both `parameter name="x"` and `parameter="x"` forms.
# Accept `parameter` OR `calls` as a closer (defensive — some streams drop
# the inner closer and rely on the outer `calls` tag).
_DSML_PARAM_RE = re.compile(
    r'<\|DSML\|\s*parameter(?:\s+name\s*=\s*|\s*=\s*)"([^"]+)"\s*(?:string\s*=\s*"([^"]*)"\s*)?>(.*?)</\|DSML\|\s*(?:parameter|calls)\s*>',
    re.DOTALL | re.IGNORECASE,
)
# Fallback: parameter with no closing tag (truncated mid-param).
# Stops at the next DSML opening OR closing tag, or end-of-string.
_DSML_PARAM_OPEN_RE = re.compile(
    r'<\|DSML\|\s*parameter(?:\s+name\s*=\s*|\s*=\s*)"([^"]+)"\s*(?:string\s*=\s*"([^"]*)"\s*)?>(.*?)(?=</?\|DSML\||$)',
    re.DOTALL | re.IGNORECASE,
)

# ---- Strip patterns (for cleaning text output) -----------------------------
_STRIP_TAG_RE = re.compile(
    r"<\s*(?:_?tool[_-]?call|_?call|toolcall)\s*>.*?<\s*/\s*(?:_?tool[_-]?call|_?call|toolcall)\s*>",
    re.DOTALL | re.IGNORECASE,
)
_UNCLOSED_TAG_RE = re.compile(
    r"<\s*_?(?:tool[_-]?call|call)\s*>\s*(\{.*?\})\s*(?:<\s*/\s*_?(?:tool[_-]?call|call)\s*>|$)",
    re.DOTALL | re.IGNORECASE,
)
_BARE_OPENER_RE = re.compile(
    r"<\s*_?(?:tool[_-]?call|call)\s*>\s*(\{[^<]+)",
    re.DOTALL | re.IGNORECASE,
)
_EMPTY_TAG_RE = re.compile(r"<>\s*(\{.*?\})\s*(?:</>|$)", re.DOTALL)
_BARE_EMPTY_TAG_RE = re.compile(r"<>\s*(\{[^<]+)", re.DOTALL)
# Strip entire <|DSML|calls>...</|DSML|calls> wrapper (including contents)
_STRIP_DSML_CALLS_RE = re.compile(
    r"<\|DSML\|\s*calls\s*>.*?</\|DSML\|\s*(?:calls|invoke)\s*>",
    re.DOTALL | re.IGNORECASE,
)
# Strip any orphaned <|DSML|invoke>...</|DSML|invoke OR calls> blocks
_STRIP_DSML_INVOKE_RE = re.compile(
    r"<\|DSML\|\s*invoke\b.*?(?:</\|DSML\|\s*(?:invoke|calls)\s*>|$)",
    re.DOTALL | re.IGNORECASE,
)
# Strip any remaining stray DSML open/close tags
_STRIP_DSML_TAG_RE = re.compile(
    r"</?\|DSML\|[^>]*>",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

_STRING_PARAMS = {
    "content", "newString", "oldString", "command", "query",
    "pattern", "filePath", "path", "sql", "name", "slug",
    "function_slug", "entrypoint_path", "import_map_path",
}


def _coerce_value(raw: str, is_string: bool):
    raw = raw.strip()
    if is_string:
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return raw


def _parse_dsml_body(body: str, name: str, param_re) -> dict:
    args = {}
    for param in param_re.finditer(body):
        pname = param.group(1)
        attr = param.group(2)   # value of string= attribute, or None if absent
        if attr is not None:
            is_string = (attr.lower() == "true")
        else:
            is_string = pname in _STRING_PARAMS
        pvalue = param.group(3)
        args[pname] = _coerce_value(pvalue, is_string)
    return args


def _parse_dsml(text: str) -> list[dict]:
    """
    Parse all DSML tool calls out of *text* (which is normalised internally).

    Strategy (each level is only tried if the previous found nothing):
      1. Closed invoke + closed param tags  — ideal case
      2. Closed invoke + open (truncated) param tags
      3. Open (truncated) invoke + closed param tags
      4. Open invoke + open param tags         — stream cut very early
      5. Mangled invoke format
    """
    normalized = _normalize(text)
    results = []

    def _collect_invoke(name: str, body: str):
        if not name or name.startswith("_"):
            return
        # Try closed params first, fall back to open (truncated) params
        args = _parse_dsml_body(body, name, _DSML_PARAM_RE)
        if not args:
            args = _parse_dsml_body(body, name, _DSML_PARAM_OPEN_RE)
        results.append({"name": name, "arguments": args})

    # Level 1 & 2: closed invoke tag (body may have open or closed params)
    for invoke in _DSML_INVOKE_RE.finditer(normalized):
        _collect_invoke(invoke.group(1), invoke.group(2))

    if results:
        return results

    # Level 3 & 4: open (unclosed) invoke tag
    for invoke in _DSML_INVOKE_OPEN_RE.finditer(normalized):
        name = invoke.group(1)
        body = invoke.group(2)
        args = _parse_dsml_body(body, name, _DSML_PARAM_RE)
        if not args:
            args = _parse_dsml_body(body, name, _DSML_PARAM_OPEN_RE)
        # Only keep if we got at least one argument (avoids empty ghost calls)
        if name and not name.startswith("_") and args:
            results.append({"name": name, "arguments": args})

    if results:
        return results

    # Level 5: mangled invoke format
    for m in _DSML_INVOKE_MANGLED_RE.finditer(normalized):
        tool_name = m.group(1)
        raw_json = m.group(2)
        try:
            obj = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        args = obj.get("arguments", obj)
        if tool_name and isinstance(args, dict):
            results.append({"name": tool_name, "arguments": args})

    return results


def _extract_obj(raw: str) -> dict | None:
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        # Try to recover truncated JSON by closing open structures
        try:
            fixed = _attempt_json_repair(raw)
            obj = json.loads(fixed)
        except Exception:
            return None
    if not isinstance(obj, dict):
        return None
    if "tool_call" in obj:
        obj = obj["tool_call"]
    if "name" not in obj and "function" in obj:
        obj = obj["function"]
    if "name" not in obj:
        return None
    return {
        "name": obj["name"],
        "arguments": obj.get("arguments", obj.get("parameters", {})),
    }


def _attempt_json_repair(s: str) -> str:
    """
    Best-effort repair of truncated JSON from DeepSeek.
    Closes unclosed strings, arrays, and objects.
    """
    s = s.strip()
    # Close unclosed string (odd number of unescaped quotes)
    in_string = False
    escaped = False
    for ch in s:
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
    if in_string:
        s += '"'

    # Close unclosed braces/brackets
    stack = []
    in_string = False
    escaped = False
    for ch in s:
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if not in_string:
            if ch in "{[":
                stack.append("}" if ch == "{" else "]")
            elif ch in "}]" and stack:
                stack.pop()

    s += "".join(reversed(stack))
    return s


# Required arguments for tools that frequently get truncated.
# If any required arg is missing or empty, the tool call is dropped.
_REQUIRED_ARGS: dict[str, list[str]] = {
    "edit":  ["filePath", "oldString", "newString"],
    "write": ["filePath", "content"],
    "bash":  ["command"],
    "read":  ["filePath"],
    "glob":  ["pattern"],
    "grep":  ["pattern"],
}


def _validate_tool_call(tc: dict) -> bool:
    """Return False if any required argument is missing or empty string."""
    name = tc.get("name", "")
    required = _REQUIRED_ARGS.get(name)
    if not required:
        return True
    args = tc.get("arguments") or {}
    for key in required:
        val = args.get(key)
        if val is None or val == "":
            return False

    # For bash: detect heredoc/stdin commands truncated before their content.
    # e.g. "python3 -" or "cat > file <<'EOF'" with no actual content following.
    if name == "bash":
        cmd = args.get("command", "")
        # Heredoc opener present but closing delimiter missing -> truncated
        heredoc_open = re.search(r"<<\s*['\"]?(\w+)['\"]?", cmd)
        if heredoc_open:
            delimiter = heredoc_open.group(1)
            opener_pos = heredoc_open.end()
            if delimiter not in cmd[opener_pos:]:
                return False
        # "cat > file" with no content (heredoc was stripped by JSON truncation)
        if re.search(r"\bcat\s*>\s*\S+\s*$", cmd.strip()):
            return False
        # "python3 -" or "bash -s" — stdin mode with nothing on stdin
        if re.search(r"\bpython3?\s+-\s*$", cmd.strip()):
            return False
        if re.search(r"\bbash\s+-s\s*$", cmd.strip()):
            return False

    return True


def parse_tool_calls(text: str) -> list[dict]:
    """
    Extract all tool calls from *text*, trying every known format in order of
    reliability.  Returns a list of {"name": str, "arguments": dict} dicts,
    deduplicated by (name, first-arg-prefix).
    """
    if not text:
        return []

    seen_sigs: set[tuple] = set()

    def _collect(obj, results):
        if not obj:
            return
        obj["arguments"] = _repair_arguments(obj["arguments"], obj.get("name", ""))
        if not _validate_tool_call(obj):
            return
        name = obj.get("name", "")
        args = obj.get("arguments") or {}
        key_val = next((v for v in args.values() if isinstance(v, str)), "")
        sig = (name, key_val[:120])
        if sig not in seen_sigs:
            seen_sigs.add(sig)
            results.append(obj)

    results: list[dict] = []

    # 1. Explicit <tool_call> JSON blocks (highest confidence)
    for m in _TOOL_TAG_RE.finditer(text):
        _collect(_extract_obj(m.group(1)), results)

    # 2. DSML blocks — may appear alongside <tool_call> blocks
    for r in _parse_dsml(text):
        r["arguments"] = _repair_arguments(r["arguments"], r.get("name", ""))
        if _validate_tool_call(r):
            name = r.get("name", "")
            args = r.get("arguments") or {}
            key_val = next((v for v in args.values() if isinstance(v, str)), "")
            sig = (name, key_val[:120])
            if sig not in seen_sigs:
                seen_sigs.add(sig)
                results.append(r)

    if results:
        return results

    # 3. Loose tag variants  (<_tool_call>, <call>, etc.)
    for m in _LOOSE_TAG_RE.finditer(text):
        _collect(_extract_obj(m.group(1)), results)
    if results:
        return results

    # 4. Unclosed / bare opener variants
    for m in _UNCLOSED_TAG_RE.finditer(text):
        _collect(_extract_obj(m.group(1).strip()), results)
    if not results:
        for m in _BARE_OPENER_RE.finditer(text):
            try:
                _collect(_extract_obj(m.group(1).strip()), results)
            except Exception:
                pass
    if results:
        return results

    # 5. Empty-tag variants  (<>{...}</>)
    for m in _EMPTY_TAG_RE.finditer(text):
        _collect(_extract_obj(m.group(1).strip()), results)
    if not results:
        for m in _BARE_EMPTY_TAG_RE.finditer(text):
            _collect(_extract_obj(m.group(1).strip()), results)
    if results:
        return results

    # 6. Markdown JSON fences
    for m in _FENCE_RE.finditer(text):
        _collect(_extract_obj(m.group(1)), results)
    if results:
        return results

    # 7. Last resort: bare JSON objects that contain a "name" key
    for m in re.finditer(r'(\{[^{}]*"name"\s*:\s*"[^"]+"[^{}]*\})', text, re.DOTALL):
        _collect(_extract_obj(m.group(1)), results)
    return results


def strip_tool_calls_from_text(text: str) -> str:
    """
    Remove all tool-call markup from *text*, leaving only the prose portions.
    Works on both raw and normalised text.
    """
    if not text:
        return ""

    # Normalise DSML tags first so strip patterns have a consistent target
    cleaned = _normalize(text)

    # Remove <tool_call>...</tool_call> blocks (all variants)
    cleaned = _STRIP_TAG_RE.sub("", cleaned)
    cleaned = _UNCLOSED_TAG_RE.sub("", cleaned)
    cleaned = _BARE_OPENER_RE.sub("", cleaned)
    cleaned = _EMPTY_TAG_RE.sub("", cleaned)
    cleaned = _BARE_EMPTY_TAG_RE.sub("", cleaned)

    # Remove DSML blocks — try the wrapped form first, then orphaned invokes
    cleaned = _STRIP_DSML_CALLS_RE.sub("", cleaned)
    cleaned = _STRIP_DSML_INVOKE_RE.sub("", cleaned)

    # Mop up any remaining stray DSML open/close tags
    cleaned = _STRIP_DSML_TAG_RE.sub("", cleaned)

    return cleaned.strip()


def to_openai_tool_calls(parsed: list[dict]) -> list[dict]:
    """
    Convert parsed tool calls to the OpenAI wire format.
    All fields (id, type, function.name, function.arguments) present in every
    entry — OpenCode requires function.name in the first chunk.
    arguments is always a JSON string, never a dict.
    """
    result = []
    for i, tc in enumerate(parsed):
        args = tc["arguments"]
        if isinstance(args, dict):
            args_str = json.dumps(args, ensure_ascii=False)
        elif isinstance(args, str):
            # Validate it's parseable; if not, wrap it
            try:
                json.loads(args)
                args_str = args
            except json.JSONDecodeError:
                args_str = json.dumps({"raw": args}, ensure_ascii=False)
        else:
            args_str = json.dumps(args, ensure_ascii=False)

        result.append({
            "id": f"call_{uuid.uuid4().hex[:24]}",
            "type": "function",
            "function": {
                "name": tc["name"],
                "arguments": args_str,
            },
            "index": i,
        })
    return result
