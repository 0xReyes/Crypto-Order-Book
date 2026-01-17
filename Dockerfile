FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod ./
COPY main.go ./

RUN go build -o generator .

FROM alpine:3.19

WORKDIR /app
COPY --from=builder /app/generator /app/generator

ENTRYPOINT ["/app/generator"]
