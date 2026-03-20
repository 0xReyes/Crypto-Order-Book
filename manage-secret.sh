#!/usr/bin/env bash
set -euo pipefail

# manage-secret.sh – Create/update Kubernetes secret for crypto-dashboard
# Usage:
#   ./manage-secret.sh [--namespace <ns>] [--generate] [--set key=value ...]
# Examples:
#   ./manage-secret.sh --generate                                 # auto-generate all secrets
#   ./manage-secret.sh --set JWT_SECRET=foo --set API_USER=admin  # set specific values
#   ./manage-secret.sh --namespace crypto-dashboard --generate

NAMESPACE="crypto-dashboard"
GENERATE=false
declare -A LITERALS

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --generate)
      GENERATE=true
      shift
      ;;
    --set)
      KEY="${2%%=*}"
      VALUE="${2#*=}"
      LITERALS["$KEY"]="$VALUE"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# If --generate is set, fill missing values with random ones
if [[ "$GENERATE" == true ]]; then
  [[ -z "${LITERALS[JWT_SECRET]:-}" ]] && LITERALS[JWT_SECRET]=$(openssl rand -base64 48 2>/dev/null || echo "dev-$(date +%s)")
  [[ -z "${LITERALS[API_USER]:-}" ]] && LITERALS[API_USER]="admin"
  [[ -z "${LITERALS[API_PASS]:-}" ]] && LITERALS[API_PASS]=$(openssl rand -base64 24 2>/dev/null || echo "pass-$(date +%s)")
fi

# Ensure we have at least JWT_SECRET, API_USER, API_PASS
for required in JWT_SECRET API_USER API_PASS; do
  if [[ -z "${LITERALS[$required]:-}" ]]; then
    echo "Error: $required not set. Use --set $required=value or --generate"
    exit 1
  fi
done

# Build kubectl command
CMD=(kubectl create secret generic crypto-dashboard-secrets --namespace "$NAMESPACE" --dry-run=client -o yaml)
for key in "${!LITERALS[@]}"; do
  CMD+=(--from-literal="$key=${LITERALS[$key]}")
done

# Apply
echo "→ Creating/updating secret in namespace '$NAMESPACE'"
"${CMD[@]}" | kubectl apply -f -

echo "✅ Secret 'crypto-dashboard-secrets' updated"