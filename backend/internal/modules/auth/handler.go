package auth

import (
	"encoding/json"
	"net/http"

	"github.com/kilcdevs/janamen/internal/config"
	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/httputil"
	"github.com/kilcdevs/janamen/internal/middleware"
)

type Handler struct {
	q   *db.Queries
	cfg config.Config
}

func NewHandler(q *db.Queries, cfg config.Config) *Handler {
	return &Handler{q: q, cfg: cfg}
}

type DemoLoginRequest struct {
	UserID int    `json:"user_id"`
	Email  string `json:"email"`
}

type AuthResponse struct {
	Token   string                `json:"token"`
	User    db.User               `json:"user"`
	Profile db.GetUserProfileRow `json:"profile"`
}

func (h *Handler) ListDemoUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.q.ListDemoUsers(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to list demo users: "+err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, users)
}

func (h *Handler) DemoLogin(w http.ResponseWriter, r *http.Request) {
	var req DemoLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	var user db.User
	var err error
	if req.UserID > 0 {
		user, err = h.q.GetUser(r.Context(), int32(req.UserID))
	} else if req.Email != "" {
		user, err = h.q.GetUserByEmail(r.Context(), req.Email)
	} else {
		httputil.Error(w, http.StatusBadRequest, "must provide user_id or email")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	var deptID int
	if user.DepartmentID != nil {
		deptID = *user.DepartmentID
	}

	claims := middleware.Claims{
		UserID:       int(user.ID),
		Email:        user.Email,
		FullName:     user.FullName,
		Role:         user.Role,
		DepartmentID: deptID,
	}

	token, err := middleware.GenerateToken(h.cfg.JWTSecret, claims)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate token: "+err.Error())
		return
	}

	profile, _ := h.q.GetUserProfile(r.Context(), user.ID)

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"token":   token,
		"user":    user,
		"profile": profile,
	})
}
