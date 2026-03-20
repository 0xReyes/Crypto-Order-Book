#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  deploy.sh — Build, deploy, and run crypto-dashboard
#  Supports: docker | k8s | bare
#  Safe for local testing with random secrets
# ============================================================

MODE="${1:-docker}"
IMAGE_NAME="crypto-dashboard"
IMAGE_TAG="${TAG:-latest}"  # override with --tag or env var TAG=ci ./deploy.sh

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying crypto-dashboard ($MODE mode) — tag: $IMAGE_TAG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ────────────────────────────────────────────────
# Generate random secrets if not provided
# ────────────────────────────────────────────────
if [[ -z "${JWT_SECRET:-}" ]]; then
  JWT_SECRET=$(openssl rand -base64 48 2>/dev/null || echo "fallback-dev-secret-$(date +%s)-insecure")
  echo "⚠️  JWT_SECRET auto-generated for this session:"
  echo "    $JWT_SECRET"
  echo "   (never use in production!)"
  echo ""
fi

API_USER="${API_USER:-testadmin}"
API_PASS="${API_PASS:-$(openssl rand -base64 24 2>/dev/null || echo "demo-$(date +%s)")}"
if [[ "$API_PASS" == demo-* ]]; then
  echo "⚠️  Using fallback API_PASS: $API_PASS"
fi

case "$MODE" in

docker)
  echo "→ Building Docker image ($IMAGE_NAME:$IMAGE_TAG)..."
  docker build -t "$IMAGE_NAME:$IMAGE_TAG" .

  echo "→ Stopping & removing old container..."
  docker rm -f crypto-dashboard 2>/dev/null || true

  echo "→ Starting container..."
  docker run -d \
    --name crypto-dashboard \
    --restart unless-stopped \
    -p 8080:8080 \
    --memory=256m \
    --cpus=0.5 \
    -e PORT=8080 \
    -e JWT_SECRET="$JWT_SECRET" \
    -e API_USER="$API_USER" \
    -e API_PASS="$API_PASS" \
    "$IMAGE_NAME:$IMAGE_TAG"

  echo "→ Waiting for health check (up to 30s)..."
  for i in {1..15}; do
    if curl -sf http://localhost:8080/api/v1/health >/dev/null 2>&1; then
      echo "   Health check passed ✓"
      break
    fi
    echo "   Waiting... ($i/15)"
    sleep 2
  done || echo "   Warning: health check timed out"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Container running"
  echo "   URL:          http://localhost:8080"
  echo "   Login:        $API_USER / $API_PASS"
  echo "   JWT_SECRET:   $JWT_SECRET (copy for tokens)"
  echo ""
  echo "   Logs:         docker logs -f crypto-dashboard"
  echo "   Stop:         docker stop crypto-dashboard"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ;;

k8s)
  echo "→ Building Docker image ($IMAGE_NAME:$IMAGE_TAG)..."
  docker build -t "$IMAGE_NAME:$IMAGE_TAG" .

  # Load to local cluster if detected
  if command -v minikube >/dev/null 2>&1; then
    echo "→ Detected minikube → loading image..."
    minikube image load "$IMAGE_NAME:$IMAGE_TAG" || true
  elif command -v kind >/dev/null 2>&1; then
    echo "→ Detected kind → loading image..."
    kind load docker-image "$IMAGE_NAME:$IMAGE_TAG" || true
  fi

  echo ""
  echo "⚠️ Kubernetes mode"
  echo "   Namespace: crypto-dashboard"
  echo "   Secrets:   crypto-dashboard-secrets"

  # Auto-patch secrets if --force-secrets flag is passed
  if [[ "${2:-}" == "--force-secrets" ]]; then
    echo "→ Auto-patching secrets with generated values..."
    kubectl create secret generic crypto-dashboard-secrets \
      --namespace crypto-dashboard \
      --from-literal=JWT_SECRET="$JWT_SECRET" \
      --from-literal=API_USER="$API_USER" \
      --from-literal=API_PASS="$API_PASS" \
      --dry-run=client -o yaml | kubectl apply -f -
  else
    echo "→ Using existing secret.yaml (edit manually if needed)"
    echo "   Quick patch command:"
    echo "     kubectl create secret generic crypto-dashboard-secrets \\"
    echo "       --namespace crypto-dashboard \\"
    echo "       --from-literal=JWT_SECRET=\"$JWT_SECRET\" \\"
    echo "       --from-literal=API_USER=\"$API_USER\" \\"
    echo "       --from-literal=API_PASS=\"$API_PASS\" \\"
    echo "       --dry-run=client -o yaml | kubectl apply -f -"
  fi

  echo "→ Applying manifests..."
  kubectl apply -f namespace.yaml     || echo "→ namespace skipped/missing"
  kubectl apply -f deployment.yaml    || echo "→ deployment failed"
  kubectl apply -f service.yaml       || echo "→ service failed"
  kubectl apply -f hpa.yaml           || echo "→ hpa skipped/optional"
  kubectl apply -f ingress.yaml       || echo "→ ingress skipped/optional"

  echo "→ Waiting for rollout (up to 2 min)..."
  kubectl rollout status deployment/crypto-dashboard \
    --namespace crypto-dashboard \
    --timeout=120s || true

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Kubernetes deployment attempted"
  echo "   Pods:         kubectl get pods -n crypto-dashboard"
  echo "   Service:      kubectl get svc -n crypto-dashboard"
  echo "   Logs:         kubectl logs -f deployment/crypto-dashboard -n crypto-dashboard"
  echo "   Port-forward: kubectl port-forward svc/crypto-dashboard -n crypto-dashboard 8080:80"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ;;

bare)
  echo "→ Building Go binary..."
  go build -o aggregator ./main.go || { echo "Build failed"; exit 1; }

  echo "→ Starting server in foreground..."
  echo "   (Ctrl+C to stop)"
  echo ""
  JWT_SECRET="$JWT_SECRET" API_USER="$API_USER" API_PASS="$API_PASS" ./aggregator
  ;;

*)
  echo "Usage: $0 {docker|k8s|bare} [--force-secrets]"
  echo "  Examples:"
  echo "    ./deploy.sh docker"
  echo "    ./deploy.sh k8s --force-secrets"
  echo "    JWT_SECRET=supersecret ./deploy.sh bare"
  exit 1
  ;;

esac