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
	"github.com/kilcdevs/janamen/internal/modules/hr"
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
	hrH := hr.NewHandler(q, cfg)
	profH := profile.NewHandler(q, zup)
	reqH := requests.NewHandler(q, cfg, zup, doc)
	teamH := team.NewHandler(q)
	acadH := academy.NewHandler(q)
	notifH := notifications.NewHandler(q)
	aiH := ai.NewHandler(q)
	analyH := analytics.NewHandler(q)

	r.Route("/api", func(api chi.Router) {
		// Public auth endpoints
		api.Post("/auth/login", authH.Login)
		api.Get("/departments", authH.ListDepartments)

		// Protected endpoints
		api.Group(func(p chi.Router) {
			p.Use(middleware.AuthMiddleware(cfg.JWTSecret))

			// Current user profile
			p.Get("/me", profH.GetMe)

			// Document upload to Supabase Storage
			p.Post("/upload", reqH.UploadDocument)

			// Requests (Vacation & Advance)
			p.Post("/requests", reqH.Create)
			p.Get("/requests/my", reqH.ListMy)
			p.Get("/requests/department", reqH.ListDepartment)
			p.Get("/requests/all", reqH.ListAll)
			p.Get("/requests/{id}", reqH.Get)
			p.Post("/requests/{id}/decision", reqH.MakeDecision)
			p.Put("/requests/{id}/resubmit", reqH.Resubmit)

			// Team & Tasks
			p.Get("/team", teamH.ListTeam)
			p.Get("/team/academy-progress", teamH.GetAcademyProgress)
			p.Get("/tasks", teamH.ListTasks)
			p.Post("/tasks", teamH.CreateTask)
			p.Put("/tasks/{id}/assign", teamH.AssignTask)
			p.Put("/tasks/{id}/status", teamH.UpdateTaskStatus)

			// Academy
			p.Get("/courses", acadH.ListCourses)
			p.Get("/courses/hr-oversight", acadH.ListHrOversight)
			p.Post("/courses/remind", acadH.RemindOnboarding)
			p.Get("/courses/{id}", acadH.GetCourse)
			p.Post("/courses/{id}/quiz", acadH.SubmitQuiz)
			p.Put("/courses/{id}/progress", acadH.UpdateProgress)
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

			// Analytics
			p.Get("/analytics", analyH.GetAnalytics)

			// HR Management endpoints (restricted to 'hr' and 'manager')
			p.Group(func(hrGroup chi.Router) {
				hrGroup.Use(middleware.RequireRole("hr", "manager"))
				hrGroup.Post("/hr/employees", hrH.CreateEmployee)
				hrGroup.Get("/hr/employees", hrH.ListEmployees)
				hrGroup.Delete("/hr/employees/{id}", hrH.DeleteEmployee)
				hrGroup.Get("/hr/analytics", hrH.GetAnalytics)
			})
		})
	})

	return r
}
