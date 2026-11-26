#!/bin/bash
# PreToolUse hook: khi Claude chạy test bằng pnpm/vitest/playwright,
# chỉ trả về phần lỗi thay vì toàn bộ output (giảm mạnh token).
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command')

pattern='^(pnpm (test|vitest|playwright|e2e|turbo (run )?test)|pnpm --filter [^ ]+ (test|vitest|e2e)|npx (vitest|playwright))( [^;&|<>`$#\\[:cntrl:]]*)?$'
if [[ "$cmd" =~ $pattern ]]; then
  log="${TMPDIR:-/tmp}/kiemi-test.log"
  filtered_cmd="( $cmd ) > \"$log\" 2>&1; s=\$?; grep -E -A 8 '(FAIL|✗|×|Error|error TS|failed|AssertionError|Expected|Received)' \"$log\" | head -150; grep -E '(Test Files|Tests |passed|failed)' \"$log\" | tail -5; echo \"--- exit: \$s · log đầy đủ: $log ---\"; exit \$s"
  echo "$input" | jq --arg filtered "$filtered_cmd" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", updatedInput: (.tool_input + {command: $filtered})}}'
else
  echo "{}"
fi
