package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/kilcdevs/janamen/internal/config"
	"github.com/kilcdevs/janamen/internal/database"
	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/router"
	"github.com/kilcdevs/janamen/internal/integrations/documentolog"
	"github.com/kilcdevs/janamen/internal/integrations/zup1c"
)

func main() {
	log.Println("==================================================")
	log.Println("  JanaMen — Digital HR Platform for JanaPost     ")
	log.Println("  Go Backend + sqlc + PostgreSQL (Supabase)       ")
	log.Println("==================================================")

	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if cfg.DatabaseURL == "" {
		log.Println("WARNING: DATABASE_URL is not set in .env! Backend requires PostgreSQL (Supabase).")
		log.Println("Example: DATABASE_URL=\"postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres\"")
	}

	var queries *db.Queries
	pool, err := database.ConnectAndBootstrap(ctx, cfg.DatabaseURL, cfg.AutoSeed, cfg.PasswordHR)
	if err != nil {
		log.Printf("ERROR: Database connection failed: %v", err)
		log.Println("Please verify your DATABASE_URL in .env.")
	} else {
		defer pool.Close()
		queries = db.New(pool)
	}

	zupMock := zup1c.NewMock()
	docMock := documentolog.NewMock()

	r := router.NewRouter(cfg, queries, zupMock, docMock)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	log.Printf("Server listening on http://localhost:%s\n", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server stopped with error: %v", err)
	}
}
