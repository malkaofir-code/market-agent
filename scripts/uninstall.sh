#!/bin/bash
for j in il.marketalert.tick il.marketalert.refresh; do
  launchctl bootout "gui/$UID/$j" 2>/dev/null && echo "stopped $j"
  rm -f "$HOME/Library/LaunchAgents/$j.plist"
done
echo "removed. state.db and logs are untouched."
