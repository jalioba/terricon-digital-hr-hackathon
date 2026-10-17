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
	if c == nil || c.Role != "hr" {
		httputil.Error(w, http.StatusForbidden, "Доступ запрещен: только HR имеет доступ к аналитике")
		return
	}

	reqStats, _ := h.q.AnalyticsRequestsByStatus(r.Context())
	deptStats, _ := h.q.AnalyticsDepartmentStats(r.Context())
	auditList, _ := h.q.AnalyticsApprovalsAudit(r.Context())

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"requests_by_status": reqStats,
		"departments":        deptStats,
		"approvals_audit":    auditList,
	})
}
