package database

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlfiles "github.com/kilcdevs/janamen/sql"
	"golang.org/x/crypto/bcrypt"
)

func ConnectAndBootstrap(ctx context.Context, dbURL string, autoSeed bool, passwordHR string) (*pgxpool.Pool, error) {
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is empty")
	}

	cfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, fmt.Errorf("invalid DATABASE_URL: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping to database failed: %w", err)
	}

	log.Println("Connected to PostgreSQL successfully")

	// Apply migration 001_init.sql
	migrationSQL, err := sqlfiles.FS.ReadFile("migrations/001_init.sql")
	if err != nil {
		return nil, fmt.Errorf("reading migration: %w", err)
	}
	if _, err := pool.Exec(ctx, string(migrationSQL)); err != nil {
		return nil, fmt.Errorf("executing migration: %w", err)
	}
	log.Println("Database schema migrated")

	// Check if seeding is needed
	if autoSeed {
		var count int
		_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM departments;").Scan(&count)
		if count == 0 {
			log.Println("Seeding database with demo data...")
			seedSQL, err := sqlfiles.FS.ReadFile("seed/seed.sql")
			if err == nil {
				if _, err := pool.Exec(ctx, string(seedSQL)); err != nil {
					log.Printf("Warning: seed execution had errors: %v", err)
				} else {
					log.Println("Database seeded successfully!")
				}
			}
		}
	}

	// Synchronize HR Director password from PASSWORD_HR env var
	if passwordHR != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(passwordHR), bcrypt.DefaultCost)
		if err == nil {
			_, err = pool.Exec(ctx, `
				INSERT INTO users (iin, password_hash, full_name, role, company, position, vacation_days_left)
				VALUES ('880101300555', $1, 'Сатпаева Айгерим Сериковна', 'hr', 'JanaPost', 'HR-директор', 24)
				ON CONFLICT (iin) DO UPDATE SET password_hash = EXCLUDED.password_hash;
			`, string(hash))
			if err != nil {
				log.Printf("Warning: failed to synchronize HR password from env: %v", err)
			} else {
				log.Println("HR administrator password synchronized with PASSWORD_HR from environment")
			}
		}
	}

	return pool, nil
}
