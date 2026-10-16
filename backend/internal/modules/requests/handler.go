package requests

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/httputil"
	"github.com/kilcdevs/janamen/internal/integrations/documentolog"
	"github.com/kilcdevs/janamen/internal/integrations/zup1c"
	"github.com/kilcdevs/janamen/internal/middleware"
)

type Handler struct {
	q   *db.Queries
	zup zup1c.Client
	doc documentolog.Client
}

func NewHandler(q *db.Queries, zup zup1c.Client, doc documentolog.Client) *Handler {
	return &Handler{q: q, zup: zup, doc: doc}
}

type CreateRequestInput struct {
	Type     string  `json:"type"` // vacation | advance
	DateFrom string  `json:"date_from"`
	DateTo   string  `json:"date_to"`
	Days     int     `json:"days"`
	Amount   float64 `json:"amount"`
	Comment  string  `json:"comment"`
}

func (h *Handler) ListRequests(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	deptParam := r.URL.Query().Get("department_id")
	if deptParam != "" {
		targetDept, err := strconv.Atoi(deptParam)
		if err == nil {
			if c.Role == "manager" && targetDept != c.DepartmentID {
				httputil.Error(w, http.StatusForbidden, "forbidden: access to other department data is restricted")
				return
			}
			if c.Role == "employee" {
				httputil.Error(w, http.StatusForbidden, "forbidden: employee cannot view department registry")
				return
			}
			reqs, err := h.q.ListRequestsByDepartment(r.Context(), targetDept)
			if err != nil {
				httputil.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httputil.JSON(w, http.StatusOK, reqs)
			return
		}
	}

	switch c.Role {
	case "hr_admin":
		reqs, err := h.q.ListAllRequests(r.Context())
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, reqs)
	case "manager":
		reqs, err := h.q.ListRequestsByDepartment(r.Context(), c.DepartmentID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, reqs)
	default:
		reqs, err := h.q.ListRequestsByUser(r.Context(), c.UserID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, reqs)
	}
}

func (h *Handler) CreateRequest(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input CreateRequestInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if input.Type != "vacation" && input.Type != "advance" {
		httputil.Error(w, http.StatusBadRequest, "type must be 'vacation' or 'advance'")
		return
	}

	user, err := h.q.GetUser(r.Context(), int32(c.UserID))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "user not found")
		return
	}

	var dateFrom, dateTo *time.Time
	if input.Type == "vacation" {
		if input.DateFrom == "" || input.DateTo == "" || input.Days <= 0 {
			httputil.Error(w, http.StatusBadRequest, "vacation requires valid date_from, date_to and days > 0")
			return
		}
		t1, err1 := time.Parse("2006-01-02", input.DateFrom)
		t2, err2 := time.Parse("2006-01-02", input.DateTo)
		if err1 != nil || err2 != nil || t2.Before(t1) {
			httputil.Error(w, http.StatusBadRequest, "invalid vacation date range")
			return
		}
		dateFrom = &t1
		dateTo = &t2

		if user.VacationDaysLeft < input.Days {
			httputil.Error(w, http.StatusBadRequest, fmt.Sprintf("недостаточно дней отпуска: доступно %d, запрошено %d", user.VacationDaysLeft, input.Days))
			return
		}
	} else if input.Type == "advance" {
		if input.Amount <= 0 {
			httputil.Error(w, http.StatusBadRequest, "advance amount must be greater than 0")
			return
		}
	}

	deptID := 1
	if user.DepartmentID != nil {
		deptID = *user.DepartmentID
	}

	req, err := h.q.CreateRequest(r.Context(), db.CreateRequestParams{
		Type:         input.Type,
		UserID:       c.UserID,
		DepartmentID: deptID,
		DateFrom:     dateFrom,
		DateTo:       dateTo,
		Days:         input.Days,
		Amount:       input.Amount,
		Comment:      input.Comment,
		Status:       "pending_manager",
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create request: "+err.Error())
		return
	}

	reqID := int(req.ID)
	actorID := c.UserID

	// Add timeline history
	_ = h.q.AddHistory(r.Context(), db.AddHistoryParams{
		RequestID: reqID,
		Status:    "created",
		ActorID:   &actorID,
		Note:      "Заявка создана сотрудником",
	})
	_ = h.q.AddHistory(r.Context(), db.AddHistoryParams{
		RequestID: reqID,
		Status:    "pending_manager",
		ActorID:   nil,
		Note:      "Передано на согласование руководителю",
	})

	// Notify department manager if exists
	if user.ManagerID != nil {
		_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
			UserID:  *user.ManagerID,
			Kind:    "request",
			TitleRu: fmt.Sprintf("Новая заявка на согласование от %s", user.FullName),
			TitleKz: fmt.Sprintf("%s қызметкерінен келісуге жаңа өтінім", user.FullName),
			Link:    fmt.Sprintf("/requests/%d", req.ID),
		})
	}

	httputil.JSON(w, http.StatusCreated, req)
}

func (h *Handler) GetRequest(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request id")
		return
	}

	req, err := h.q.GetRequest(r.Context(), int32(id))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "request not found")
		return
	}

	// Strict RBAC check
	if c.Role == "employee" && req.UserID != c.UserID {
		httputil.Error(w, http.StatusForbidden, "forbidden: cannot view request of another user")
		return
	}
	if c.Role == "manager" && req.DepartmentID != c.DepartmentID && req.UserID != c.UserID {
		httputil.Error(w, http.StatusForbidden, "forbidden: cannot view request from another department")
		return
	}

	history, _ := h.q.ListHistory(r.Context(), int(req.ID))

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"request": req,
		"history": history,
	})
}

type DecisionInput struct {
	Comment string `json:"comment"`
}

func (h *Handler) ApproveRequest(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request id")
		return
	}

	req, err := h.q.GetRequest(r.Context(), int32(id))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "request not found")
		return
	}

	if c.Role == "manager" && req.DepartmentID != c.DepartmentID {
		httputil.Error(w, http.StatusForbidden, "forbidden: cannot approve requests of other departments")
		return
	}
	if c.Role == "employee" {
		httputil.Error(w, http.StatusForbidden, "forbidden: employees cannot approve requests")
		return
	}

	var input DecisionInput
	_ = json.NewDecoder(r.Body).Decode(&input)
	note := "Одобрено руководителем"
	if input.Comment != "" {
		note = input.Comment
	}

	reqID := int(req.ID)
	actorID := c.UserID

	// Step 1: Manager approves
	_ = h.q.AddHistory(r.Context(), db.AddHistoryParams{
		RequestID: reqID,
		Status:    "approved",
		ActorID:   &actorID,
		Note:      note,
	})

	// Step 2: External Documentolog mock integration
	docID, _ := h.doc.SubmitForApproval(int(req.ID), req.Type)
	_ = h.q.AddHistory(r.Context(), db.AddHistoryParams{
		RequestID: reqID,
		Status:    "sent_documentolog",
		ActorID:   nil,
		Note:      fmt.Sprintf("Документ отправлен в СЭД Documentolog (ID: %s)", docID),
	})

	// Step 3: External 1C:ZUP mock integration
	emp, _ := h.q.GetUser(r.Context(), int32(req.UserID))
	if req.Type == "vacation" {
		zupDoc, _ := h.zup.PostVacation(emp.Email, int(req.Days))
		newBalance := emp.VacationDaysLeft - req.Days
		if newBalance < 0 {
			newBalance = 0
		}
		_ = h.q.UpdateVacationDays(r.Context(), db.UpdateVacationDaysParams{
			ID:               emp.ID,
			VacationDaysLeft: newBalance,
		})
		_ = h.q.AddHistory(r.Context(), db.AddHistoryParams{
			RequestID: reqID,
			Status:    "completed",
			ActorID:   nil,
			Note:      fmt.Sprintf("Приказ проведён в 1С:ЗУП (№ %s), списано дней: %d, остаток: %d", zupDoc, req.Days, newBalance),
		})
	} else {
		zupDoc, _ := h.zup.PostAdvance(emp.Email, req.Amount)
		_ = h.q.AddHistory(r.Context(), db.AddHistoryParams{
			RequestID: reqID,
			Status:    "completed",
			ActorID:   nil,
			Note:      fmt.Sprintf("Ведомость аванса зарегистрирована в 1С:ЗУП (№ %s)", zupDoc),
		})
	}

	_ = h.q.UpdateRequestStatus(r.Context(), db.UpdateRequestStatusParams{
		ID:     req.ID,
		Status: "completed",
	})

	// Notify employee
	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  req.UserID,
		Kind:    "request",
		TitleRu: fmt.Sprintf("Заявка #%d одобрена и проведена в 1С:ЗУП", req.ID),
		TitleKz: fmt.Sprintf("#%d өтінім мақұлданды және 1С:ЗУП-та өткізілді", req.ID),
		Link:    fmt.Sprintf("/requests/%d", req.ID),
	})

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"status":     "completed",
		"request_id": req.ID,
		"message":    "Заявка успешно согласована и проведена в 1С:ЗУП",
	})
}

func (h *Handler) RejectRequest(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request id")
		return
	}

	req, err := h.q.GetRequest(r.Context(), int32(id))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "request not found")
		return
	}

	if c.Role == "manager" && req.DepartmentID != c.DepartmentID {
		httputil.Error(w, http.StatusForbidden, "forbidden: cannot reject requests of other departments")
		return
	}
	if c.Role == "employee" {
		httputil.Error(w, http.StatusForbidden, "forbidden: employees cannot reject requests")
		return
	}

	var input DecisionInput
	_ = json.NewDecoder(r.Body).Decode(&input)
	note := "Отклонено руководителем"
	if input.Comment != "" {
		note = input.Comment
	}

	reqID := int(req.ID)
	actorID := c.UserID

	_ = h.q.UpdateRequestStatus(r.Context(), db.UpdateRequestStatusParams{
		ID:     req.ID,
		Status: "rejected",
	})
	_ = h.q.AddHistory(r.Context(), db.AddHistoryParams{
		RequestID: reqID,
		Status:    "rejected",
		ActorID:   &actorID,
		Note:      note,
	})

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  req.UserID,
		Kind:    "request",
		TitleRu: fmt.Sprintf("Заявка #%d отклонена: %s", req.ID, note),
		TitleKz: fmt.Sprintf("#%d өтінім қабылданбады: %s", req.ID, note),
		Link:    fmt.Sprintf("/requests/%d", req.ID),
	})

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"status":     "rejected",
		"request_id": req.ID,
	})
}
