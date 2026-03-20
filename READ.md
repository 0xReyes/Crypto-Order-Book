
# Crypto-Order-Book

Lightweight crypto dashboard  

• Aggregates order books from 25+ exchanges  

• JWT login + per-IP rate limiting

### What you see

- Price chart (CoinGecko history)  

- Order book depth (aggregated bids/asks)  

- Market dominance chart

## Quick Start

**Local (Go)**  

```bash

go build -o agg .

./agg

```

→ http://localhost:8080  

Login: demo / demo

**Docker**  

```bash

docker build -t crypto .

docker run -d -p 8080:8080 \

  -e JWT_SECRET=$(openssl rand -base64 48) \

  -e API_USER=admin \

  -e API_PASS=secret123 \

  crypto

```

**Kubernetes**  

```bash

./deploy.sh k8s

kubectl port-forward svc/crypto-dashboard 8080:80

```

## Login & API

1. Get token  

```bash

curl -X POST http://localhost:8080/api/v1/login \

  -d '{"user":"demo","pass":"demo"}'

```

2. Use token  

```bash

curl -H "Authorization: Bearer <token>" \

  http://localhost:8080/api/v1/book?symbol=BTC

```

(The web UI logs in automatically.)

## Key env vars

- `JWT_SECRET`   — **must be strong in production**  

- `API_USER`     — default: demo  

- `API_PASS`     — default: demo  

- `PORT`         — default: 8080

## Rate limiting

10 req/s sustained per IP  

30 req burst  

Returns 429 when exceeded

## Main endpoints

- `/`                  → dashboard (no auth)  

- `/api/v1/login`      → get JWT (POST)  

- `/api/v1/health`     → status (no auth)  

- `/api/v1/book`       → order book (GET + Bearer)  

- `/api/v1/price`      → price history (GET + Bearer)  

- `/api/v1/dominance`  → dominance (GET + Bearer)

## Deploy on server

```bash

git clone https://github.com/0xReyes/Crypto-Order-Book.git

cd Crypto-Order-Book

chmod +x deploy.sh

export JWT_SECRET=$(openssl rand -base64 48)

export API_USER=admin

export API_PASS=your-strong-password

./deploy.sh docker     # easiest

# ./deploy.sh k8s      # Kubernetes

# ./deploy.sh bare     # plain binary

```

## Usage notes

~10–20 MB RAM idle  

Docker limited to ~256 MB  

Kubernetes auto-scales 2–10 pods

Enjoy!
