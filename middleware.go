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
			http.Error(w, `{"error":"Invalid Authorization format"}`, http.StatusUnauthorized)
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

type bucket struct {
	tokens    float64
	lastCheck time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rate     float64
	burst    float64
	cleanTTL time.Duration
}

func NewRateLimiter(rate float64, burst float64) *RateLimiter {
	rl := &RateLimiter{
		buckets:  make(map[string]*bucket),
		rate:     rate,
		burst:    burst,
		cleanTTL: 5 * time.Minute,
	}
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()
	return rl
}

func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	b, exists := rl.buckets[ip]
	if !exists {
		rl.buckets[ip] = &bucket{tokens: rl.burst - 1, lastCheck: now}
		return true
	}
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

func RateLimitMiddleware(rl *RateLimiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !rl.Allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			http.Error(w, `{"error":"Rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	}
}

func extractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-Ip"); xri != "" {
		return strings.TrimSpace(xri)
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func ProtectedRoute(rl *RateLimiter, handler http.HandlerFunc) http.HandlerFunc {
	return RateLimitMiddleware(rl, AuthMiddleware(handler))
}