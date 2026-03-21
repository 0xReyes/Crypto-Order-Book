#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  deploy.sh — Build, deploy, and run crypto-dashboard
#  Supports: docker | k8s | bare
#  Works the same in local dev and CI (when CI=true)
# ============================================================

MODE="${1:-docker}"
IMAGE_NAME="crypto-dashboard"
IMAGE_TAG="${TAG:-latest}"          # override with TAG=ci ./deploy.sh ...
NAMESPACE="crypto-dashboard"
CI="${CI:-false}"                    # set to "true" in GitHub Actions

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying crypto-dashboard ($MODE mode)"
echo "  Tag: $IMAGE_TAG | CI: $CI"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ----------------------------------------------------------------------
# Helper: load image into local cluster (kind / minikube) if present
# ----------------------------------------------------------------------
load_image_to_cluster() {
  if command -v kind &>/dev/null; then
    echo "→ Loading image into kind..."
    kind load docker-image "$IMAGE_NAME:$IMAGE_TAG" || true
  elif command -v minikube &>/dev/null; then
    echo "→ Loading image into minikube..."
    minikube image load "$IMAGE_NAME:$IMAGE_TAG" || true
  fi
}

# ----------------------------------------------------------------------
# Mode: docker
# ----------------------------------------------------------------------
if [ "$MODE" = "docker" ]; then
  echo "→ Building Docker image..."
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
    -e JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48)}" \
    -e API_USER="${API_USER:-demo}" \
    -e API_PASS="${API_PASS:-$(openssl rand -base64 24)}" \
    "$IMAGE_NAME:$IMAGE_TAG"

  echo "→ Waiting for health check (up to 30s)..."
  for i in {1..15}; do
    if curl -sf http://localhost:8080/api/v1/health >/dev/null 2>&1; then
      echo "   Health check passed ✓"
      break
    fi
    echo "   Waiting... ($i/15)"
    sleep 2
  done

  echo ""
  echo "✅ Container running"
  echo "   URL:    http://localhost:8080"
  echo "   Logs:   docker logs -f crypto-dashboard"
  exit 0
fi

# ----------------------------------------------------------------------
# Mode: bare (direct Go execution)
# ----------------------------------------------------------------------
if [ "$MODE" = "bare" ]; then
  echo "→ Building Go binary..."
  go build -o aggregator ./main.go

  echo "→ Starting server in foreground..."
  echo "   (Ctrl+C to stop)"
  echo ""
  JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48)}" \
    API_USER="${API_USER:-demo}" \
    API_PASS="${API_PASS:-$(openssl rand -base64 24)}" \
    ./aggregator
  exit 0
fi

# ----------------------------------------------------------------------
# Mode: k8s (default if not docker/bare)
# ----------------------------------------------------------------------
if [ "$MODE" != "k8s" ]; then
  echo "Unknown mode: $MODE. Use docker|k8s|bare"
  exit 1
fi

# ----------------------------------------------------------------------
# Kubernetes mode
# ----------------------------------------------------------------------
# 1. Build image only if not in CI (CI already built it)
if [ "$CI" != "true" ]; then
  echo "→ Building Docker image..."
  docker build -t "$IMAGE_NAME:$IMAGE_TAG" .
  load_image_to_cluster
else
  echo "→ CI mode: assuming image '$IMAGE_NAME:$IMAGE_TAG' is already present"
fi

# 2. Ensure namespace exists
echo "→ Creating namespace (if not exists)..."
kubectl apply -f namespace.yaml

# 3. Manage secrets using the dedicated script
echo "→ Managing secrets..."
if [ "$CI" = "true" ]; then
  # In CI, secrets must be passed via environment
  : "${JWT_SECRET:?JWT_SECRET not set}"
  : "${API_USER:?API_USER not set}"
  : "${API_PASS:?API_PASS not set}"
  ./manage-secret.sh --namespace "$NAMESPACE" \
    --set "JWT_SECRET=$JWT_SECRET" \
    --set "API_USER=$API_USER" \
    --set "API_PASS=$API_PASS"
else
  # Locally, auto-generate missing secrets
  ./manage-secret.sh --namespace "$NAMESPACE" --generate
fi

# 4. Apply remaining manifests
echo "→ Applying deployment, service, HPA, ingress..."
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml        # optional – will fail if file missing, so we check
kubectl apply -f ingress.yaml    # optional

# 5. Force image tag (in case deployment.yaml uses a different tag)
echo "→ Ensuring image tag is $IMAGE_TAG"
kubectl set image deployment/crypto-dashboard \
  "dashboard=$IMAGE_NAME:$IMAGE_TAG" \
  --namespace "$NAMESPACE"

# 6. Wait for rollout
echo "→ Waiting for rollout (up to 2 minutes)..."
kubectl rollout status deployment/crypto-dashboard \
  --namespace "$NAMESPACE" \
  --timeout=120s

# 7. Show status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Kubernetes deployment ready"
echo "   Pods:         kubectl get pods -n $NAMESPACE"
echo "   Service:      kubectl get svc -n $NAMESPACE"
echo "   Port-forward: kubectl port-forward svc/crypto-dashboard -n $NAMESPACE 8080:80"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"