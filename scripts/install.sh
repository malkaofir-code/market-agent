#!/bin/bash
# Installs both launchd jobs, generating the plists from wherever this
# project actually lives.
#
# IMPORTANT: this must NOT be inside ~/Desktop, ~/Documents or
# ~/Downloads. macOS TCC blocks launchd agents from those folders and
# every tick dies with "Operation not permitted" before running a
# single line - silently, with an empty log.
set -e
cd "$(dirname "$0")/.."
PROJ="$(pwd -P)"
LA="$HOME/Library/LaunchAgents"

case "$PROJ" in
  "$HOME"/Desktop/*|"$HOME"/Documents/*|"$HOME"/Downloads/*)
    echo "REFUSING TO INSTALL"
    echo
    echo "  $PROJ"
    echo
    echo "is inside a macOS privacy-protected folder. launchd cannot execute"
    echo "anything there - the job will fail with 'Operation not permitted'"
    echo "and log nothing at all."
    echo
    echo "Move it first, then install:"
    echo "  mv \"$PROJ\" \"$HOME/market-agent\""
    echo "  cd \"$HOME/market-agent\" && ./scripts/install.sh"
    exit 1;;
esac

chmod +x "$PROJ"/scripts/*.sh
mkdir -p "$LA" "$PROJ/logs"

emit() { # label, program, schedule-xml
cat > "$LA/$1.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$PROJ/scripts/$2</string></array>
$3
  <key>WorkingDirectory</key><string>$PROJ</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key><string>$PROJ/logs/launchd.out</string>
  <key>StandardErrorPath</key><string>$PROJ/logs/launchd.err</string>
</dict></plist>
PLIST
launchctl bootout "gui/$UID/$1" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$LA/$1.plist"
echo "installed $1"
}

emit il.marketalert.tick tick.sh \
  '  <key>StartInterval</key><integer>900</integer>'
emit il.marketalert.refresh refresh.sh \
  '  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>'

echo
echo "project : $PROJ"
echo "verify  : launchctl list | grep marketalert"
echo "logs    : tail -f $PROJ/logs/tick.log"
echo "pause   : touch $PROJ/PAUSED     resume: rm $PROJ/PAUSED"
echo
echo "First tick fires within 15 minutes. If logs/tick.log is still empty"
echo "after that, check logs/launchd.err - that is where permission and"
echo "path failures land."
