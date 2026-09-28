# AGENTS.md

Agent-behavior guide. This file describes how the AI agent must operate across ANY project. It is not project documentation. Read it in full at the start of every session and follow it literally.

## Rules for the agent

1. Never stop on your own. Once a task is accepted, keep going until it is fully done, verified, and reported.
2. Never wait for the user to type "continue". Assume the mandate is to finish the whole task in one turn.
3. Keep an explicit todo list. Never end a turn while any item is `in_progress` or `pending`.
4. After each tool result, immediately decide the next action and issue the next tool call in the same turn.
5. Run the project's verification command (lint/typecheck/tests) after edits and before declaring anything complete.
6. The only source of truth is tool output. Never claim success from intent, memory, or expectation.

## Turn discipline

- A successful tool call is NOT a stopping point. It is a checkpoint; continue to the next step.
- A finished plan step is NOT a stopping point. Execute the next step.
- End a turn only when all todos are `completed` or `cancelled` and verification has passed.
- If the environment forces an end-of-turn, make it happen only after all work is done.

## Todo rules

- Every todo item MUST have all three keys: `content`, `status`, `priority`.
- Valid `status`: `pending`, `in_progress`, `completed`, `cancelled`.
- Valid `priority`: `high`, `medium`, `low` (default `medium`).
- Keep exactly ONE item `in_progress` at a time.
- Update status in real time; do not batch completions.
- Mark `completed` only after the work is actually done and verified, never based on intent.

## Tool-call format rules

- Emit tool calls using only the single valid format: a `tool_call` block containing a JSON object with a `name` key and an `arguments` object.
- NEVER use DSML, `function_calls`, or `invoke`/`parameter` tags. They are ignored by the system.
- NEVER leak a closing tag into an argument. A leaked tag appended to `filePath` produces `File ... not found`.
- Argument keys must be direct children of `arguments`. Do not nest an extra `arguments`/`parameters` wrapper.
- NEVER emit literal newlines inside a JSON string; use the escape sequence for a newline. Escape quotes and backslashes.
- Keep each tool call's JSON small enough to emit completely. If a call would be truncated, split it into smaller calls.

## Edit rules

- Read a file with a large limit (e.g. 500 lines) BEFORE editing it. Never edit content you have not seen.
- `oldString` must be an EXACT match of existing content, including every character and newline.
- If an edit fails with "oldString not found", re-read the file and retry with corrected text. Never retry the same failing string blindly.
- NEVER issue a no-op edit where `oldString === newString`. It wastes a turn and applies nothing.
- For large changes, split into multiple small edits rather than one giant block.
- After a structurally risky edit (braces, JSX, closing tags), re-read the changed region and run the typecheck before continuing.
- If the edit tool refuses repeatedly and the file genuinely contains the wrong characters, do not thrash with sed/perl/echo/heredoc. Switch to a deterministic method and verify by re-reading.

## Shell rules

- Avoid heredocs and inline `python3 -c "..."` containing quotes or newlines; they fail with `SyntaxError: unterminated string literal`.
- For scripted changes, write a script file under `/tmp/opencode/` and execute it.
- Never write temporary markers or probes into project files. Temporary work goes in `/tmp/opencode/`.
- Prefer the dedicated file tools (read/edit/write/grep/glob) over `sed`, `awk`, or `echo >`.

## Language pitfalls

- Use `||` for boolean OR. A single `|` is bitwise and triggers `TS2447: The '|' operator is not allowed for boolean types`.
- After any syntax error, re-read the EXACT line, fix the precise character(s), then re-run the typecheck. Do not guess.
- Missing or duplicated closing braces cause `TS1005: '}' expected` or `TS1128: Declaration or statement expected`; re-read the tail of the file to locate them.

## Verification rules

- Run the project's lint/typecheck/tests after edits and before completion, not sporadically.
- Fix every error the verification reports; do not declare done with errors outstanding.
- Only state a task is complete when tool output proves it.

## Failure log and how to handle each

### 1. Stopping mid-task (most common failure)

The agent ended turns after a partial step while real work remained; the user had to say "continue" three times.

How to handle it:
- Keep the todo list current and never end a turn while any item is `in_progress` or `pending`.
- After each tool result, immediately issue the next tool call.
- Treat a successful tool call or a plan step as a checkpoint, not a stopping point.
- Never wait for "continue".

### 2. Todo list schema error

`todowrite` failed with `Missing key at ["todos"][0]["priority"]` because items lacked `priority`.

How to handle it:
- Always include `content`, `status`, and `priority` on every item.
- Use valid values only: `status` in `pending|in_progress|completed|cancelled`, `priority` in `high|medium|low`.
- Keep exactly one `in_progress` at a time.

### 3. Malformed edit call (leaked parameter tag in filePath)

A leaked closing tag was appended to `filePath`, producing `File ... not found`. Caused by mixing tool-call formats and leaking a closing tag into an argument.

How to handle it:
- Emit the one valid tool-call format only.
- Never leak a closing tag or any tag into an argument value.
- Never nest arguments.

### 4. No-op edits (oldString equals newString)

The agent issued edits whose `oldString` equaled `newString`; the tool reported `No changes to apply`, wasting turns.

How to handle it:
- Before editing, confirm the replacement actually differs.
- If the edit reports identical strings, re-read the file and target the real difference.

### 5. Edit failed with "oldString not found"

A stale or incorrect exact-match string was used, and the agent retried without re-reading.

How to handle it:
- Re-read the file, copy the exact current text, and retry once with the corrected string.
- If it still fails, change approach instead of repeating.

### 6. Stray or duplicate closing brace

An edit produced an extra closing brace at end of file, causing `TS1128: Declaration or statement expected`.

How to handle it:
- Re-read the end of the file after any brace-level edit.
- Remove the duplicate precisely; do not add more braces to compensate.

### 7. Syntax error in a freshly written file

A `write` produced a missing closing brace (`TS1005: '}' expected`) so the file did not compile.

How to handle it:
- After writing a file, run the typecheck immediately.
- Re-read the file and append the missing brace exactly where required.

### 8. Bitwise vs logical operator

The agent repeatedly wrote `|` where `||` was required, causing `TS2447`.

How to handle it:
- Use `||` for boolean conditions.
- After the error, fix the exact line; avoid shell layers that mangle the `|` character.

### 9. Edits not applying; repeated "No changes to apply"

The file literally contained the wrong character, and the agent's edit reported identical strings repeatedly. It then tried sed, perl, append, and heredoc python3, several of which failed (e.g. `SyntaxError: unterminated string literal`), before succeeding with a written script file.

How to handle it:
- Stop retrying the same edit. Re-read to see the actual bytes.
- Write a script file under `/tmp/opencode/` and execute it, or use the file tools with an exact corrected string.
- Verify by re-reading the changed region.

### 10. Shell/heredoc syntax errors

Inline `python3 -c "..."` with embedded quotes/newlines failed with `SyntaxError: unterminated string literal`; heredocs failed too.

How to handle it:
- Write a script file to `/tmp/opencode/` and run it.
- Avoid heredocs and complex inline quoting.

### 11. Marker-test pollution

The agent appended a temporary marker line to a real source file to test writability, then had to remove it.

How to handle it:
- Never write probes into project files. Use `/tmp/opencode/` for any writability or scratch test.

### 12. Verification ignored until late

The agent ran the lint/typecheck only sporadically; errors accumulated.

How to handle it:
- Run verification after edits and before declaring completion.
- Fix all reported errors before stopping.

### 13. Partial progress declared as a stopping point

The agent ended a turn with pending work and treated partial progress as completion.

How to handle it:
- Completion means all todos done AND verification passed. Anything less means continue.

### 14. Wrong operator in a string replacement / escaping pain

The agent used the wrong operator in a comparison replacement and struggled to escape the `|` character through multiple shell layers.

How to handle it:
- Fix operators via the edit tool with an exact string, not through shell escaping.
- Keep the correct operator (`||`) in the final code and verify with the typecheck.

### 15. Todo list not used consistently

The agent did not use `todowrite` consistently and let it drift out of sync with actual work.

How to handle it:
- Create the todo list up front for multi-step work and update it in real time.
- Never let it disagree with what has actually been done.
