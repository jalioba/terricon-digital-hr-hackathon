package profile

import (
	"net/http"

	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/httputil"
	"github.com/kilcdevs/janamen/internal/integrations/zup1c"
	"github.com/kilcdevs/janamen/internal/middleware"
)

type Handler struct {
	q   *db.Queries
	zup zup1c.Client
}

func NewHandler(q *db.Queries, zup zup1c.Client) *Handler {
	return &Handler{q: q, zup: zup}
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	p, err := h.q.GetUserProfile(r.Context(), c.UserID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Профиль не найден: "+err.Error())
		return
	}

	// Read-only 1C:ZUP integration status verification
	zupData, _ := h.zup.GetEmployee(p.Iin)

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"profile":       p,
		"zup_sync":      "synced",
		"zup_source":    "1С:ЗУП ред. 3.1 КОРП (Mock API)",
		"zup_read_only": true,
		"zup_record":    zupData,
	})
}
