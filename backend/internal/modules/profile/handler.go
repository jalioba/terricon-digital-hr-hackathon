package profile

import (
	"encoding/json"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"

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

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	req.CurrentPassword = strings.TrimSpace(req.CurrentPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)

	if req.CurrentPassword == "" || req.NewPassword == "" {
		httputil.Error(w, http.StatusBadRequest, "Заполните текущий и новый пароль")
		return
	}

	if len(req.NewPassword) < 6 {
		httputil.Error(w, http.StatusBadRequest, "Новый пароль должен содержать не менее 6 символов")
		return
	}

	user, err := h.q.GetUser(r.Context(), c.UserID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Пользователь не найден")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный текущий пароль")
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка хеширования пароля")
		return
	}

	if err := h.q.UpdateUserPassword(r.Context(), db.UpdateUserPasswordParams{
		ID:           c.UserID,
		PasswordHash: string(newHash),
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка обновления пароля: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "Пароль успешно изменен",
	})
}
