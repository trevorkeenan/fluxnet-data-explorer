#!/usr/bin/env bash

set -uo pipefail

gha_timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

gha_log() {
  printf '[%s] %s\n' "$(gha_timestamp)" "$*"
}

gha_run_timed() {
  local label="$1"
  shift
  local start_epoch end_epoch status errexit_was_set
  start_epoch="$(date +%s)"
  gha_log "START ${label}"
  errexit_was_set=0
  case "$-" in
    *e*)
      errexit_was_set=1
      set +e
      ;;
  esac
  "$@"
  status=$?
  if [ "${errexit_was_set}" -eq 1 ]; then
    set -e
  fi
  end_epoch="$(date +%s)"
  gha_log "END ${label} status=${status} elapsed=$((end_epoch - start_epoch))s"
  return "${status}"
}
