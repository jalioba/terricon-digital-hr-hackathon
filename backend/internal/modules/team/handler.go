package team

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

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

func (h *Handler) ListTeam(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if c.Role == "employee" {
		httputil.Error(w, http.StatusForbidden, "forbidden: employees cannot view team roster")
		return
	}

	deptParam := r.URL.Query().Get("department_id")
	targetDept := c.DepartmentID
	if deptParam != "" {
		d, err := strconv.Atoi(deptParam)
		if err == nil {
			if c.Role == "manager" && d != c.DepartmentID {
				httputil.Error(w, http.StatusForbidden, "forbidden: cannot view team of another department")
				return
			}
			targetDept = d
		}
	}

	if c.Role == "hr_admin" && deptParam == "" {
		users, err := h.q.ListAllUsers(r.Context())
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, users)
		return
	}

	users, err := h.q.ListTeam(r.Context(), db.ListTeamParams{
		DepartmentID: &targetDept,
		ID:           int32(c.UserID),
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, users)
}

func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	switch c.Role {
	case "hr_admin":
		tasks, err := h.q.ListAllTasks(r.Context())
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, tasks)
	case "manager":
		tasks, err := h.q.ListTasksByDepartment(r.Context(), c.DepartmentID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, tasks)
	default:
		tasks, err := h.q.ListTasksByUser(r.Context(), c.UserID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, tasks)
	}
}

type CreateTaskInput struct {
	AssigneeID int    `json:"assignee_id"`
	Title      string `json:"title"`
	DueDate    string `json:"due_date"`
}

func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || (c.Role != "manager" && c.Role != "hr_admin") {
		httputil.Error(w, http.StatusForbidden, "forbidden: only managers and HR can assign tasks")
		return
	}

	var input CreateTaskInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Title == "" || input.AssigneeID <= 0 {
		httputil.Error(w, http.StatusBadRequest, "invalid task data")
		return
	}

	var dueDate *time.Time
	if input.DueDate != "" {
		if t, err := time.Parse("2006-01-02", input.DueDate); err == nil {
			dueDate = &t
		}
	}

	task, err := h.q.CreateTask(r.Context(), db.CreateTaskParams{
		AssigneeID:   input.AssigneeID,
		CreatedBy:    c.UserID,
		DepartmentID: c.DepartmentID,
		Title:        input.Title,
		DueDate:      dueDate,
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create task: "+err.Error())
		return
	}

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  input.AssigneeID,
		Kind:    "task",
		TitleRu: "Вам назначена новая рабочая задача: " + input.Title,
		TitleKz: "Сізге жаңа жұмыс міндеті тағайындалды: " + input.Title,
		Link:    "/dashboard",
	})

	httputil.JSON(w, http.StatusCreated, task)
}

type UpdateTaskStatusInput struct {
	Status string `json:"status"` // open, in_progress, done
}

func (h *Handler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid task id")
		return
	}

	var input UpdateTaskStatusInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || (input.Status != "open" && input.Status != "in_progress" && input.Status != "done") {
		httputil.Error(w, http.StatusBadRequest, "invalid status (must be open, in_progress, or done)")
		return
	}

	if err := h.q.UpdateTaskStatus(r.Context(), db.UpdateTaskStatusParams{
		ID:     int32(id),
		Status: input.Status,
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update task: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"status": input.Status})
}
