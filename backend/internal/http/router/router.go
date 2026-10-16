package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/kilcdevs/janamen/internal/config"
	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/integrations/documentolog"
	"github.com/kilcdevs/janamen/internal/integrations/zup1c"
	"github.com/kilcdevs/janamen/internal/middleware"
	"github.com/kilcdevs/janamen/internal/modules/academy"
	"github.com/kilcdevs/janamen/internal/modules/ai"
	"github.com/kilcdevs/janamen/internal/modules/analytics"
	"github.com/kilcdevs/janamen/internal/modules/auth"
	"github.com/kilcdevs/janamen/internal/modules/notifications"
	"github.com/kilcdevs/janamen/internal/modules/profile"
	"github.com/kilcdevs/janamen/internal/modules/requests"
	"github.com/kilcdevs/janamen/internal/modules/team"
)

func NewRouter(cfg config.Config, q *db.Queries, zup zup1c.Client, doc documentolog.Client) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigin,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"janamen-backend"}`))
	})

	authH := auth.NewHandler(q, cfg)
	profH := profile.NewHandler(q, zup)
	reqH := requests.NewHandler(q, zup, doc)
	teamH := team.NewHandler(q)
	acadH := academy.NewHandler(q)
	notifH := notifications.NewHandler(q)
	aiH := ai.NewHandler(q)
	analyH := analytics.NewHandler(q)

	r.Route("/api", func(api chi.Router) {
		// Public auth endpoints
		api.Post("/auth/demo-login", authH.DemoLogin)
		api.Get("/auth/demo-users", authH.ListDemoUsers)

		// Protected endpoints
		api.Group(func(p chi.Router) {
			p.Use(middleware.AuthMiddleware(cfg.JWTSecret))

			// Profile
			p.Get("/me", profH.GetMe)
			p.Put("/me/locale", profH.UpdateLocale)

			// Requests
			p.Get("/requests", reqH.ListRequests)
			p.Post("/requests", reqH.CreateRequest)
			p.Get("/requests/{id}", reqH.GetRequest)
			p.Post("/requests/{id}/approve", reqH.ApproveRequest)
			p.Post("/requests/{id}/reject", reqH.RejectRequest)

			// Team & Tasks
			p.Get("/team", teamH.ListTeam)
			p.Get("/tasks", teamH.ListTasks)
			p.Post("/tasks", teamH.CreateTask)
			p.Put("/tasks/{id}/status", teamH.UpdateTaskStatus)

			// Academy
			p.Get("/courses", acadH.ListCourses)
			p.Get("/courses/{id}", acadH.GetCourse)
			p.Post("/courses/{id}/quiz", acadH.SubmitQuiz)
			p.Post("/courses/assign", acadH.AssignCourse)

			// Notifications
			p.Get("/notifications", notifH.ListNotifications)
			p.Put("/notifications/{id}/read", notifH.MarkRead)
			p.Put("/notifications/read-all", notifH.MarkAllRead)

			// AI Jana
			p.Post("/ai/chat", aiH.Chat)
			p.Post("/ai/escalate", aiH.Escalate)
			p.Get("/ai/kb", aiH.ListKB)
			p.Post("/ai/kb", aiH.CreateKB)
			p.Delete("/ai/kb/{id}", aiH.DeleteKB)
			p.Get("/ai/escalations", aiH.ListEscalations)

			// Analytics (HR Admin)
			p.Get("/analytics", analyH.GetAnalytics)
		})
	})

	return r
}
