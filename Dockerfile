FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod ./
COPY main.go ./

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o aggregator main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/aggregator .
RUN mkdir docs

# Run and output to docs/data.json
ENTRYPOINT ["./aggregator"]
CMD ["--dir", "docs"]