#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  setup-metallb.sh — Install MetalLB in a Kind cluster
#  Gives LoadBalancer services a real external IP.
#
#  Required for Kind (bare-metal). On cloud providers (EKS/GKE/AKS),
#  skip this — the cloud LB controller handles it natively.
#
#  Usage:
#    ./setup-metallb.sh                    # Auto-detect Kind subnet
#    ./setup-metallb.sh 172.18.255.200     # Custom start IP
# ============================================================

METALLB_VERSION="v0.14.9"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Installing MetalLB $METALLB_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Install MetalLB
echo "→ Applying MetalLB manifests..."
kubectl apply -f "https://raw.githubusercontent.com/metallb/metallb/$METALLB_VERSION/config/manifests/metallb-native.yaml"

# 2. Wait for MetalLB pods to be ready
echo "→ Waiting for MetalLB controller..."
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app=metallb \
  --timeout=90s 2>/dev/null || \
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=component=controller \
  --timeout=90s 2>/dev/null || \
  echo "  (waiting for pods with alternate selector...)" && \
  sleep 10

# 3. Determine IP range from Kind's Docker network
if [[ -n "${1:-}" ]]; then
  # User provided a start IP
  START_IP="$1"
  # Derive end IP (same /24, last octet + 50)
  BASE=$(echo "$START_IP" | cut -d. -f1-3)
  LAST=$(echo "$START_IP" | cut -d. -f4)
  END_IP="${BASE}.$((LAST + 50))"
else
  # Auto-detect from Kind's Docker network
  echo "→ Detecting Kind network subnet..."
  KIND_SUBNET=$(docker network inspect kind -f '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || echo "172.18.0.0/16")
  BASE=$(echo "$KIND_SUBNET" | cut -d. -f1-2)
  START_IP="${BASE}.255.200"
  END_IP="${BASE}.255.250"
fi

echo "→ IP pool: $START_IP — $END_IP"

# 4. Apply the IP address pool and L2 advertisement
cat <<EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
    - ${START_IP}-${END_IP}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - default-pool
EOF

echo ""
echo "✅ MetalLB installed"
echo "   Pool: $START_IP — $END_IP"
echo "   LoadBalancer services will now get external IPs"