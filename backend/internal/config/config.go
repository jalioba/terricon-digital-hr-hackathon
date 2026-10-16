package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	AllowedOrigin []string
	AutoSeed      bool
}

func Load() Config {
	// Load .env from backend/ or repo root (ignored if missing).
	_ = godotenv.Load(".env", "../.env")
	origins := strings.Split(get("CORS_ORIGINS", "http://localhost:4200,https://kilcdevs.net"), ",")
	return Config{
		Port:          get("PORT", "8080"),
		DatabaseURL:   get("DATABASE_URL", ""),
		JWTSecret:     get("JWT_SECRET", "dev-only-secret-change-me"),
		AllowedOrigin: origins,
		AutoSeed:      get("AUTO_SEED", "true") == "true",
	}
}

func get(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
