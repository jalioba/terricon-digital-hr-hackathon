package requests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kilcdevs/janamen/internal/config"
	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/httputil"
	"github.com/kilcdevs/janamen/internal/integrations/documentolog"
	"github.com/kilcdevs/janamen/internal/integrations/zup1c"
	"github.com/kilcdevs/janamen/internal/middleware"
)

type Handler struct {
	q   *db.Queries
	cfg config.Config
	zup zup1c.Client
	doc documentolog.Client
}

func NewHandler(q *db.Queries, cfg config.Config, zup zup1c.Client, doc documentolog.Client) *Handler {
	return &Handler{q: q, cfg: cfg, zup: zup, doc: doc}
}

type CreateRequestPayload struct {
	Type        string   `json:"type"` // 'vacation' or 'advance'
	DateFrom    *string  `json:"date_from"`
	DateTo      *string  `json:"date_to"`
	DaysCount   int      `json:"days_count"`
	IsPaid      *bool    `json:"is_paid"`
	Amount      float64  `json:"amount"`
	DesiredDate *string  `json:"desired_date"`
	DocumentURL string   `json:"document_url"`
	Comment     string   `json:"comment"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	var req CreateRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	req.Type = strings.TrimSpace(strings.ToLower(req.Type))
	if req.Type != "vacation" && req.Type != "advance" {
		httputil.Error(w, http.StatusBadRequest, "Тип заявки должен быть 'vacation' или 'advance'")
		return
	}

	user, err := h.q.GetUser(r.Context(), c.UserID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Пользователь не найден")
		return
	}

	var deptID int
	if user.DepartmentID != nil {
		deptID = *user.DepartmentID
	} else {
		// Default to supply department if user is HR without department
		deptID = 1
	}

	var dateFrom *time.Time
	var dateTo *time.Time
	var desiredDate *time.Time
	isPaid := true
	if req.IsPaid != nil {
		isPaid = *req.IsPaid
	}

	if req.Type == "vacation" {
		if req.DateFrom != nil && *req.DateFrom != "" {
			t, err := time.Parse("2006-01-02", *req.DateFrom)
			if err != nil {
				httputil.Error(w, http.StatusBadRequest, "Неверный формат даты начала (ожидается ГГГГ-ММ-ДД)")
				return
			}
			dateFrom = &t
		}
		if req.DateTo != nil && *req.DateTo != "" {
			t, err := time.Parse("2006-01-02", *req.DateTo)
			if err != nil {
				httputil.Error(w, http.StatusBadRequest, "Неверный формат даты окончания (ожидается ГГГГ-ММ-ДД)")
				return
			}
			dateTo = &t
		}

		if isPaid && req.DaysCount > user.VacationDaysLeft {
			httputil.Error(w, http.StatusBadRequest, fmt.Sprintf("Запрошено %d дней, но доступный остаток составляет %d дней", req.DaysCount, user.VacationDaysLeft))
			return
		}
	} else if req.Type == "advance" {
		if req.Amount <= 0 {
			httputil.Error(w, http.StatusBadRequest, "Сумма аванса должна быть больше 0")
			return
		}
		if req.DesiredDate != nil && *req.DesiredDate != "" {
			t, err := time.Parse("2006-01-02", *req.DesiredDate)
			if err != nil {
				httputil.Error(w, http.StatusBadRequest, "Неверный формат даты выплаты (ожидается ГГГГ-ММ-ДД)")
				return
			}
			desiredDate = &t
		}
	}

	createdReq, err := h.q.CreateRequest(r.Context(), db.CreateRequestParams{
		Type:         req.Type,
		UserID:       user.ID,
		DepartmentID: deptID,
		DateFrom:     dateFrom,
		DateTo:       dateTo,
		DaysCount:    req.DaysCount,
		IsPaid:       isPaid,
		Amount:       req.Amount,
		DesiredDate:  desiredDate,
		DocumentUrl:  req.DocumentURL,
		Comment:      req.Comment,
		Status:       "pending",
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка создания заявки: "+err.Error())
		return
	}

	// Add creation history
	_ = h.q.AddRequestHistory(r.Context(), db.AddRequestHistoryParams{
		RequestID: createdReq.ID,
		Status:    "pending",
		ActorID:   &user.ID,
		Comment:   "Заявка создана сотрудником и передана на рассмотрение",
	})

	// Notification to manager or HR
	if user.Role == "employee" {
		// Notify department managers
		deptUsers, _ := h.q.ListUsersByDepartment(r.Context(), &deptID)
		for _, u := range deptUsers {
			if u.Role == "manager" {
				_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
					UserID:  u.ID,
					Kind:    "request",
					Title:   "Новая заявка на согласование",
					Message: fmt.Sprintf("Сотрудник %s подал заявку на %s", user.FullName, req.Type),
					Link:    fmt.Sprintf("/requests/%d", createdReq.ID),
				})
			}
		}
	} else if user.Role == "manager" {
		// Notify HR director
		allUsers, _ := h.q.ListAllUsers(r.Context())
		for _, u := range allUsers {
			if u.Role == "hr" {
				_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
					UserID:  u.ID,
					Kind:    "request",
					Title:   "Заявка от руководителя подразделения",
					Message: fmt.Sprintf("Руководитель %s подал заявку на %s", user.FullName, req.Type),
					Link:    fmt.Sprintf("/requests/%d", createdReq.ID),
				})
			}
		}
	}

	httputil.JSON(w, http.StatusCreated, createdReq)
}

func (h *Handler) ListMy(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	list, err := h.q.ListRequestsByUser(r.Context(), c.UserID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки ваших заявок: "+err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, list)
}

func (h *Handler) ListDepartment(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	if c.Role == "employee" {
		httputil.Error(w, http.StatusForbidden, "Доступ запрещен: сотрудники не могут просматривать заявки отдела")
		return
	}

	var deptID int
	if c.DepartmentID != nil {
		deptID = *c.DepartmentID
	} else {
		httputil.Error(w, http.StatusBadRequest, "У вас не назначен отдел")
		return
	}

	list, err := h.q.ListRequestsByDepartment(r.Context(), deptID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки заявок отдела: "+err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, list)
}

func (h *Handler) ListAll(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || c.Role != "hr" {
		httputil.Error(w, http.StatusForbidden, "Доступ запрещен: только HR имеет доступ ко всем заявкам компании")
		return
	}

	list, err := h.q.ListAllRequests(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки списка всех заявок: "+err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, list)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	idStr := chi.URLParam(r, "id")
	var id int
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор заявки")
		return
	}

	req, err := h.q.GetRequest(r.Context(), id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Заявка не найдена")
		return
	}

	// RBAC check
	if c.Role == "employee" && req.UserID != c.UserID {
		httputil.Error(w, http.StatusForbidden, "Доступ запрещен: вы можете просматривать только собственные заявки")
		return
	}
	if c.Role == "manager" && req.UserID != c.UserID {
		if c.DepartmentID == nil || req.DepartmentID != *c.DepartmentID {
			httputil.Error(w, http.StatusForbidden, "Доступ запрещен: руководитель не имеет доступа к данным других отделов")
			return
		}
	}

	history, _ := h.q.ListRequestHistory(r.Context(), req.ID)

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"request": req,
		"history": history,
	})
}

type DecisionPayload struct {
	Decision       string `json:"decision"` // 'approved', 'revision_needed', 'rejected'
	ManagerComment string `json:"manager_comment"`
}

func (h *Handler) MakeDecision(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	idStr := chi.URLParam(r, "id")
	var id int
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор заявки")
		return
	}

	var payload DecisionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	decision := strings.TrimSpace(strings.ToLower(payload.Decision))
	if decision != "approved" && decision != "revision_needed" && decision != "rejected" {
		httputil.Error(w, http.StatusBadRequest, "Решение должно быть 'approved', 'revision_needed' или 'rejected'")
		return
	}

	req, err := h.q.GetRequest(r.Context(), id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Заявка не найдена")
		return
	}

	// RBAC permission check:
	// If requester is a manager, only HR can approve/reject!
	if req.UserRole == "manager" && c.Role != "hr" {
		httputil.Error(w, http.StatusForbidden, "Заявки руководителей согласуются исключительно HR-службой")
		return
	}
	// If requester is employee, only their department manager or HR can approve/reject
	if req.UserRole == "employee" {
		if c.Role != "hr" {
			if c.Role != "manager" || c.DepartmentID == nil || req.DepartmentID != *c.DepartmentID {
				httputil.Error(w, http.StatusForbidden, "Руководитель может согласовывать только заявки своего подразделения")
				return
			}
		}
	}

	// Update decision
	updatedReq, err := h.q.UpdateRequestDecision(r.Context(), db.UpdateRequestDecisionParams{
		ID:             req.ID,
		Status:         decision,
		ManagerComment: payload.ManagerComment,
		ApprovedBy:     &c.UserID,
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка сохранения решения: "+err.Error())
		return
	}

	// If approved and vacation is paid, deduct days
	if decision == "approved" && req.Type == "vacation" && req.IsPaid {
		user, uErr := h.q.GetUser(r.Context(), req.UserID)
		if uErr == nil {
			newDays := user.VacationDaysLeft - req.DaysCount
			if newDays < 0 {
				newDays = 0
			}
			_ = h.q.UpdateVacationDays(r.Context(), db.UpdateVacationDaysParams{
				ID:               user.ID,
				VacationDaysLeft: newDays,
			})
		}
		// Register in Documentolog and 1C:ZUP
		_, _ = h.doc.SubmitForApproval(req.ID, req.Type)
		_, _ = h.zup.PostVacation(req.UserIin, req.DaysCount)
	} else if decision == "approved" && req.Type == "advance" {
		_, _ = h.doc.SubmitForApproval(req.ID, req.Type)
		_, _ = h.zup.PostAdvance(req.UserIin, req.Amount)
	}

	// Add timeline history
	actionText := "Заявка одобрена"
	if decision == "revision_needed" {
		actionText = "Заявка возвращена на доработку"
	} else if decision == "rejected" {
		actionText = "Заявка отклонена"
	}
	if payload.ManagerComment != "" {
		actionText += fmt.Sprintf(": %s", payload.ManagerComment)
	}

	_ = h.q.AddRequestHistory(r.Context(), db.AddRequestHistoryParams{
		RequestID: req.ID,
		Status:    decision,
		ActorID:   &c.UserID,
		Comment:   actionText,
	})

	// Notify requester
	var notifTitle string
	switch decision {
	case "approved":
		notifTitle = "Ваша заявка одобрена! ✅"
	case "revision_needed":
		notifTitle = "Ваша заявка возвращена на доработку ⚠️"
	case "rejected":
		notifTitle = "Ваша заявка отклонена ❌"
	}

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  req.UserID,
		Kind:    "request",
		Title:   notifTitle,
		Message: payload.ManagerComment,
		Link:    fmt.Sprintf("/requests/%d", req.ID),
	})

	httputil.JSON(w, http.StatusOK, updatedReq)
}

func (h *Handler) UploadDocument(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	// 10 MB max
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Слишком большой файл (максимум 10 МБ)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Файл не передан (ожидается поле 'file')")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".pdf" && ext != ".webp" {
		httputil.Error(w, http.StatusBadRequest, "Разрешены только форматы JPG, PNG, WEBP и PDF")
		return
	}

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка чтения файла")
		return
	}

	fileName := fmt.Sprintf("req_%d_%d%s", c.UserID, time.Now().UnixNano(), ext)
	uploadURL := fmt.Sprintf("%s/storage/v1/object/documents/%s", strings.TrimRight(h.cfg.SupabaseURL, "/"), fileName)

	supabaseReq, err := http.NewRequestWithContext(r.Context(), "POST", uploadURL, bytes.NewReader(fileBytes))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка создания запроса к хранилищу")
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	supabaseReq.Header.Set("Content-Type", contentType)
	supabaseReq.Header.Set("Authorization", "Bearer "+h.cfg.SupabaseKey)
	supabaseReq.Header.Set("apikey", h.cfg.SupabaseKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(supabaseReq)
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated) {
		statusCode := http.StatusInternalServerError
		if resp != nil {
			statusCode = resp.StatusCode
		}
		httputil.Error(w, statusCode, "Ошибка загрузки файла в Supabase Storage")
		return
	}
	defer resp.Body.Close()

	publicURL := fmt.Sprintf("%s/storage/v1/object/public/documents/%s", strings.TrimRight(h.cfg.SupabaseURL, "/"), fileName)
	httputil.JSON(w, http.StatusOK, map[string]string{
		"url": publicURL,
	})
}
