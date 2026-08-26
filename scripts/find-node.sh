# Locate node under launchd, which does NOT read your shell profile.
# nvm installs outside every default PATH entry, so `command -v node`
# alone silently finds nothing and the job dies with status 127.
find_node() {
  local n
  n="$(command -v node 2>/dev/null)" && [ -x "$n" ] && { echo "$n"; return; }
  for n in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    [ -x "$n" ] && { echo "$n"; return; }
  done
  # nvm: prefer the version the user marked default, else the newest
  if [ -s "$HOME/.nvm/alias/default" ]; then
    local v; v="$(cat "$HOME/.nvm/alias/default")"
    for n in "$HOME/.nvm/versions/node/v$v"*/bin/node "$HOME/.nvm/versions/node/$v"*/bin/node; do
      [ -x "$n" ] && { echo "$n"; return; }
    done
  fi
  n="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)"
  [ -x "$n" ] && { echo "$n"; return; }
  return 1
}
