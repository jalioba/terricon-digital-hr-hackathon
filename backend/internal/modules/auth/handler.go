package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/kilcdevs/janamen/internal/config"
	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/httputil"
	"github.com/kilcdevs/janamen/internal/middleware"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	q   *db.Queries
	cfg config.Config
}

func NewHandler(q *db.Queries, cfg config.Config) *Handler {
	return &Handler{q: q, cfg: cfg}
}

type LoginRequest struct {
	IIN      string `json:"iin"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token   string              `json:"token"`
	Profile db.GetUserProfileRow `json:"profile"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	req.IIN = strings.TrimSpace(req.IIN)
	req.Password = strings.TrimSpace(req.Password)

	if req.IIN == "" || req.Password == "" {
		httputil.Error(w, http.StatusBadRequest, "Необходимо указать ИИН и пароль")
		return
	}

	user, err := h.q.GetUserByIIN(r.Context(), req.IIN)
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, "Пользователь с таким ИИН не найден или неверный пароль")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		httputil.Error(w, http.StatusUnauthorized, "Неверный пароль")
		return
	}

	claims := middleware.Claims{
		UserID:       user.ID,
		IIN:          user.Iin,
		FullName:     user.FullName,
		Role:         user.Role,
		DepartmentID: user.DepartmentID,
	}

	token, err := middleware.GenerateToken(h.cfg.JWTSecret, claims)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка создания токена: "+err.Error())
		return
	}

	profile, err := h.q.GetUserProfile(r.Context(), user.ID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка получения профиля: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, LoginResponse{
		Token:   token,
		Profile: profile,
	})
}

func (h *Handler) ListDepartments(w http.ResponseWriter, r *http.Request) {
	departments, err := h.q.ListDepartments(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки отделов: "+err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, departments)
}
