#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  deploy.sh — Pull/build and run on a Linux server or locally
#  Updated for safe local testing with random JWT secret
# ============================================================

MODE="${1:-docker}"
IMAGE_NAME="crypto-dashboard"
IMAGE_TAG="latest"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying crypto-dashboard ($MODE mode)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ────────────────────────────────────────────────
# Generate strong random JWT_SECRET if not set
# ────────────────────────────────────────────────
if [[ -z "${JWT_SECRET:-}" ]]; then
  JWT_SECRET=$(openssl rand -base64 48 2>/dev/null || echo "fallback-dev-secret-$(date +%s)-insecure")
  echo "⚠️  JWT_SECRET was not set → generated random value for this session:"
  echo "    JWT_SECRET=$JWT_SECRET"
  echo "   (this is only for local/testing — never use in production!)"
  echo ""
fi

# Use provided or fallback values for API_USER / API_PASS (demo only!)
API_USER="${API_USER:-testadmin}"
API_PASS="${API_PASS:-$(openssl rand -base64 24 2>/dev/null || echo "demo-$(date +%s)")}"
if [[ "$API_PASS" == demo-* ]]; then
  echo "⚠️  Using fallback API_PASS → $API_PASS"
fi

case "$MODE" in

docker)
  echo "→ Building Docker image..."
  docker build -t "$IMAGE_NAME:$IMAGE_TAG" .

  echo "→ Stopping & removing old container (if any)..."
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

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Container started"
  echo "   Access:       http://localhost:8080"
  echo "   Test login:   $API_USER / $API_PASS"
  echo "   JWT secret:   $JWT_SECRET  (copy for testing tokens)"
  echo ""
  echo "   Logs:         docker logs -f crypto-dashboard"
  echo "   Stop:         docker stop crypto-dashboard"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ;;

k8s)
  echo "→ Building Docker image (for local testing / minikube/load)..."
  docker build -t "$IMAGE_NAME:$IMAGE_TAG" .

  # Optional: load to local cluster if using minikube/kind
  if command -v minikube >/dev/null 2>&1; then
    echo "→ Detected minikube → loading image..."
    minikube image load "$IMAGE_NAME:$IMAGE_TAG" || true
  fi

  echo ""
  echo "⚠️  Kubernetes mode — secrets handling:"
  echo "   For real deployment, edit secret.yaml with strong values!"
  echo "   For quick testing, you can patch after apply:"
  echo "     kubectl create secret generic crypto-overview-secrets \\"
  echo "       --from-literal=JWT_SECRET=\"$JWT_SECRET\" \\"
  echo "       --from-literal=API_USER=\"$API_USER\" \\"
  echo "       --from-literal=API_PASS=\"$API_PASS\" \\"
  echo "       --dry-run=client -o yaml | kubectl apply -f -"
  echo ""

  echo "→ Applying manifests (assumes they exist in current dir)..."
  kubectl apply -f namespace.yaml     || echo "→ namespace.yaml skipped/missing"
  kubectl apply -f secret.yaml        || echo "→ Using placeholder secret — patch manually!"
  kubectl apply -f deployment.yaml
  kubectl apply -f service.yaml
  kubectl apply -f hpa.yaml           || echo "→ hpa.yaml optional/skipped"

  echo "→ Waiting for rollout (up to 2 min)..."
  kubectl rollout status deployment/crypto-dashboard --timeout=120s || true

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Kubernetes deployment attempted"
  echo "   Check pods:   kubectl get pods"
  echo "   Port-forward: kubectl port-forward svc/crypto-dashboard 8080:80"
  echo "   Logs:         kubectl logs -f deployment/crypto-dashboard"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ;;

bare)
  echo "→ Building Go binary..."
  go build -o aggregator ./main.go || { echo "Build failed"; exit 1; }

  echo "→ Starting server in foreground..."
  echo "   (Press Ctrl+C to stop)"
  echo ""
  JWT_SECRET="$JWT_SECRET" API_USER="$API_USER" API_PASS="$API_PASS" ./aggregator
  ;;

*)
  echo "Usage: $0 {docker|k8s|bare}"
  echo "  Examples:"
  echo "    ./deploy.sh docker"
  echo "    JWT_SECRET=supersecret ./deploy.sh docker"
  echo "    ./deploy.sh bare"
  exit 1
  ;;

esac