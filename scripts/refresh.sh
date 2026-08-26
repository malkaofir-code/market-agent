#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
. scripts/find-node.sh
NODE="$(find_node)" || { echo "$(date '+%F %T') FATAL: node not found" >> logs/refresh.log; exit 1; }
"$NODE" src/refresh-token.js >> logs/refresh.log 2>&1
