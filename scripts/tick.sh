#!/bin/bash
# One tick: pull new messages, then post the last closed window if it
# has anything worth posting.
cd "$(dirname "$0")/.." || exit 1
mkdir -p logs
. scripts/find-node.sh
NODE="$(find_node)" || { echo "$(date '+%F %T') FATAL: node not found" >> logs/tick.log; exit 1; }
"$NODE" src/run.js --ingest >> logs/tick.log 2>&1
