package main

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ============================================================
// JWT Auth Middleware
// ============================================================

// AuthMiddleware rejects requests without a valid Bearer token.
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"Authorization header required"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, `{"error":"Invalid Authorization format — use Bearer <token>"}`, http.StatusUnauthorized)
			return
		}

		_, err := ValidateToken(parts[1])
		if err != nil {
			msg := "Invalid token"
			if errors.Is(err, ErrExpiredToken) {
				msg = "Token expired"
			}
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, msg), http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	}
}

// ============================================================
// Token-Bucket Rate Limiter (per IP, in-memory, no deps)
// ============================================================

// bucket tracks tokens for a single IP.
type bucket struct {
	tokens    float64
	lastCheck time.Time
}

// RateLimiter is a thread-safe, per-IP token-bucket limiter.
type RateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rate     float64       // tokens added per second
	burst    float64       // max tokens (bucket capacity)
	cleanTTL time.Duration // evict idle buckets after this
}

// NewRateLimiter creates a limiter.
//   - rate:  requests per second each IP is allowed (sustained)
//   - burst: max burst size (bucket capacity)
func NewRateLimiter(rate float64, burst float64) *RateLimiter {
	rl := &RateLimiter{
		buckets:  make(map[string]*bucket),
		rate:     rate,
		burst:    burst,
		cleanTTL: 5 * time.Minute,
	}
	// Background janitor: sweep stale entries every minute
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()
	return rl
}

// Allow checks whether the given IP may proceed.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, exists := rl.buckets[ip]
	if !exists {
		rl.buckets[ip] = &bucket{tokens: rl.burst - 1, lastCheck: now}
		return true
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(b.lastCheck).Seconds()
	b.tokens += elapsed * rl.rate
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.lastCheck = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// cleanup removes entries that haven't been seen recently.
func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	cutoff := time.Now().Add(-rl.cleanTTL)
	for ip, b := range rl.buckets {
		if b.lastCheck.Before(cutoff) {
			delete(rl.buckets, ip)
		}
	}
}

// RateLimitMiddleware wraps a handler with per-IP rate limiting.
func RateLimitMiddleware(rl *RateLimiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !rl.Allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			http.Error(w, `{"error":"Rate limit exceeded — slow down"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	}
}

// extractIP pulls the client IP from X-Forwarded-For, X-Real-Ip, or RemoteAddr.
func extractIP(r *http.Request) string {
	// Respect proxy headers (Cloudflare, nginx, k8s ingress)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// First IP in the chain is the original client
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-Ip"); xri != "" {
		return strings.TrimSpace(xri)
	}
	// Fallback to RemoteAddr (host:port)
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// ============================================================
// Compose: rate limit + auth in one call
// ============================================================

// ProtectedRoute applies rate limiting first, then JWT auth.
func ProtectedRoute(rl *RateLimiter, handler http.HandlerFunc) http.HandlerFunc {
	return RateLimitMiddleware(rl, AuthMiddleware(handler))
}
