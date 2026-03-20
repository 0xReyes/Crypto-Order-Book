package main

import (
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
)

// Claims holds JWT payload data.
type Claims struct {
	UserID string `json:"user_id,omitempty"`
	jwt.RegisteredClaims
}

// getSecret reads JWT_SECRET from env; falls back to a dev-only default.
// NEVER use the fallback in production — set the env var.
func getSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "super-secret-change-me-very-very-long-random-string-2026"
	}
	return []byte(secret)
}

// GenerateToken creates a signed JWT valid for the given duration.
func GenerateToken(userID string, duration time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(duration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "crypto-order-book",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(getSecret())
}

// ValidateToken parses the raw JWT string and returns the claims if valid.
func ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return getSecret(), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, ErrInvalidToken
}
