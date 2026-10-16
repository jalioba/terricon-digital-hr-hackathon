package analytics

import (
	"net/http"

	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/httputil"
	"github.com/kilcdevs/janamen/internal/middleware"
)

type Handler struct {
	q *db.Queries
}

func NewHandler(q *db.Queries) *Handler {
	return &Handler{q: q}
}

func (h *Handler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || c.Role != "hr_admin" {
		httputil.Error(w, http.StatusForbidden, "forbidden: only HR Admin can view executive analytics")
		return
	}

	reqStats, _ := h.q.AnalyticsRequests(r.Context())
	deptStats, _ := h.q.AnalyticsDepartments(r.Context())
	learnStats, _ := h.q.AnalyticsLearning(r.Context())

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"requests_by_status": reqStats,
		"departments":        deptStats,
		"learning":           learnStats,
	})
}
