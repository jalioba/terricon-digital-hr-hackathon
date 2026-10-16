// Package sqlfiles embeds SQL migrations and seed data so the API can bootstrap the DB on startup.
package sqlfiles

import "embed"

//go:embed migrations/*.sql seed/*.sql
var FS embed.FS
