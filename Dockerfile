FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY *.go ./
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o aggregator .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /app/aggregator .
COPY orderbook-ui/dist/ ./orderbook-ui/dist
EXPOSE 8080
ENV PORT=8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/v1/health || exit 1
ENTRYPOINT ["./aggregator"]