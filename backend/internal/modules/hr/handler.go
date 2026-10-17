package hr

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

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

type CreateEmployeeRequest struct {
	IIN              string `json:"iin"`
	Password         string `json:"password"`
	FullName         string `json:"full_name"`
	Role             string `json:"role"` // 'employee' or 'manager'
	DepartmentID     *int   `json:"department_id"`
	Position         string `json:"position"`
	Company          string `json:"company"`
	VacationDaysLeft int    `json:"vacation_days_left"`
}

func (h *Handler) CreateEmployee(w http.ResponseWriter, r *http.Request) {
	var req CreateEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	req.IIN = strings.TrimSpace(req.IIN)
	req.FullName = strings.TrimSpace(req.FullName)
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))
	req.Position = strings.TrimSpace(req.Position)

	if len(req.IIN) != 12 {
		httputil.Error(w, http.StatusBadRequest, "ИИН должен состоять ровно из 12 цифр")
		return
	}
	if req.FullName == "" {
		httputil.Error(w, http.StatusBadRequest, "ФИО обязательно для заполнения")
		return
	}
	if len(req.Password) < 6 {
		httputil.Error(w, http.StatusBadRequest, "Пароль должен содержать не менее 6 символов")
		return
	}
	if req.Role != "employee" && req.Role != "manager" && req.Role != "hr" {
		httputil.Error(w, http.StatusBadRequest, "Роль должна быть 'employee', 'manager' или 'hr'")
		return
	}
	claims := middleware.GetClaims(r.Context())
	if claims != nil && claims.Role == "manager" {
		if req.Role == "hr" {
			httputil.Error(w, http.StatusForbidden, "Руководитель не может создавать учетные записи с ролью HR")
			return
		}
		// Manager can strictly only add employees to their own department
		req.DepartmentID = claims.DepartmentID
	}

	if req.Role != "hr" && req.DepartmentID == nil {
		httputil.Error(w, http.StatusBadRequest, "Для сотрудника и руководителя необходимо выбрать отдел")
		return
	}

	// Verify department exists if provided
	if req.DepartmentID != nil {
		_, err := h.q.GetDepartment(r.Context(), *req.DepartmentID)
		if err != nil {
			httputil.Error(w, http.StatusBadRequest, "Указанный отдел не существует")
			return
		}
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка хеширования пароля")
		return
	}

	company := req.Company
	if company == "" {
		company = "JanaPost"
	}
	vacationDays := req.VacationDaysLeft
	if vacationDays <= 0 {
		vacationDays = 24
	}

	createdUser, err := h.q.CreateUser(r.Context(), db.CreateUserParams{
		Iin:              req.IIN,
		PasswordHash:     string(hash),
		FullName:         req.FullName,
		Role:             req.Role,
		DepartmentID:     req.DepartmentID,
		Company:          company,
		Position:         req.Position,
		HiredAt:          time.Now(),
		VacationDaysLeft: vacationDays,
	})
	if err != nil {
		if strings.Contains(err.Error(), "users_iin_key") || strings.Contains(err.Error(), "duplicate") {
			httputil.Error(w, http.StatusConflict, "Сотрудник с таким ИИН уже зарегистрирован в системе")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "Ошибка создания профиля сотрудника: "+err.Error())
		return
	}

	// Send welcome notification
	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  createdUser.ID,
		Kind:    "welcome",
		Title:   "Добро пожаловать в JanaMen!",
		Message: "Ваш профиль в сервисе JanaPost успешно создан HR-службой.",
		Link:    "/dashboard",
	})

	profile, err := h.q.GetUserProfile(r.Context(), createdUser.ID)
	if err != nil {
		httputil.JSON(w, http.StatusCreated, createdUser)
		return
	}

	httputil.JSON(w, http.StatusCreated, profile)
}

func (h *Handler) ListEmployees(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		httputil.Error(w, http.StatusUnauthorized, "Не авторизован")
		return
	}

	// Managers only see employees and managers belonging to their own department
	if claims.Role == "manager" {
		if claims.DepartmentID == nil {
			httputil.JSON(w, http.StatusOK, []db.ListUsersByDepartmentRow{})
			return
		}
		users, err := h.q.ListUsersByDepartment(r.Context(), claims.DepartmentID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки списка сотрудников отдела: "+err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, users)
		return
	}

	// HR manager and administrators see all employees across all departments
	users, err := h.q.ListAllUsers(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки списка сотрудников: "+err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, users)
}

func (h *Handler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	statusStats, err := h.q.AnalyticsRequestsByStatus(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки статистики заявок: "+err.Error())
		return
	}

	deptStats, err := h.q.AnalyticsDepartmentStats(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки статистики по отделам: "+err.Error())
		return
	}

	auditList, err := h.q.AnalyticsApprovalsAudit(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки аудита согласований: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"requests_by_status": statusStats,
		"departments":        deptStats,
		"approvals_audit":    auditList,
	})
}
