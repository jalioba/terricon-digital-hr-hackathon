package notifications

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
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

func (h *Handler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	notifs, err := h.q.ListNotifications(r.Context(), c.UserID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	unreadCount := 0
	for _, n := range notifs {
		if !n.Read {
			unreadCount++
		}
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"notifications": notifs,
		"unread_count":  unreadCount,
	})
}

func (h *Handler) MarkRead(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор уведомления")
		return
	}

	if err := h.q.MarkNotificationRead(r.Context(), db.MarkNotificationReadParams{
		ID:     id,
		UserID: c.UserID,
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	if err := h.q.MarkAllNotificationsRead(r.Context(), c.UserID); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
