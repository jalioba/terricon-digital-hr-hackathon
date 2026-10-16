package profile

import (
	"encoding/json"
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
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	p, err := h.q.GetUserProfile(r.Context(), int32(c.UserID))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "profile not found: "+err.Error())
		return
	}

	// Read-only 1C:ZUP integration status verification
	zupData, _ := h.zup.GetEmployee(p.Email)

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"profile":        p,
		"zup_sync":       "synced",
		"zup_source":     "1С:ЗУП ред. 3.1 КОРП (Mock API)",
		"zup_read_only":  true,
		"zup_record":     zupData,
	})
}

type UpdateLocaleRequest struct {
	Locale string `json:"locale"`
}

func (h *Handler) UpdateLocale(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req UpdateLocaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Locale != "ru" && req.Locale != "kz") {
		httputil.Error(w, http.StatusBadRequest, "locale must be 'ru' or 'kz'")
		return
	}

	if err := h.q.UpdateLocale(r.Context(), db.UpdateLocaleParams{
		ID:     int32(c.UserID),
		Locale: req.Locale,
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update locale: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok", "locale": req.Locale})
}
