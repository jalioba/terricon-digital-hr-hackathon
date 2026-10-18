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
	SupabaseURL   string
	SupabaseKey   string
	PasswordHR    string
}

func Load() Config {
	// Load .env candidate paths
	for _, p := range []string{".env", "../.env", "../../.env"} {
		_ = godotenv.Load(p)
	}
	origins := strings.Split(get("CORS_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200,https://kilcdevs.net"), ",")
	return Config{
		Port:          get("PORT", "8080"),
		DatabaseURL:   get("DATABASE_URL", ""),
		JWTSecret:     get("JWT_SECRET", "dev-only-secret-change-me"),
		AllowedOrigin: origins,
		AutoSeed:      get("AUTO_SEED", "true") == "true",
		SupabaseURL:   get("SUPABASE_URL", "https://pxirgvbyqqlkfdieozdx.supabase.co"),
		SupabaseKey:   get("SUPABASE_SECRET_KEY", ""),
		PasswordHR:    get("PASSWORD_HR", ""),
	}
}

func get(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
