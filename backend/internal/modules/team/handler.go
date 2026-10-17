package team

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
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
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	if c.Role == "employee" {
		if c.DepartmentID == nil {
			httputil.JSON(w, http.StatusOK, []interface{}{})
			return
		}
		users, err := h.q.ListUsersByDepartment(r.Context(), c.DepartmentID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки списка коллег: "+err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, users)
		return
	}

	deptParam := r.URL.Query().Get("department_id")
	if c.Role == "manager" {
		if c.DepartmentID == nil {
			httputil.Error(w, http.StatusBadRequest, "Руководитель не привязан к отделу")
			return
		}
		if deptParam != "" {
			d, err := strconv.Atoi(deptParam)
			if err == nil && d != *c.DepartmentID {
				httputil.Error(w, http.StatusForbidden, "Доступ запрещен: руководитель не имеет доступа к данным других отделов")
				return
			}
		}
		users, err := h.q.ListUsersByDepartment(r.Context(), c.DepartmentID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки списка сотрудников отдела: "+err.Error())
			return
		}
		httputil.JSON(w, http.StatusOK, users)
		return
	}

	// HR role
	if deptParam != "" {
		d, err := strconv.Atoi(deptParam)
		if err == nil {
			users, err := h.q.ListUsersByDepartment(r.Context(), &d)
			if err != nil {
				httputil.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httputil.JSON(w, http.StatusOK, users)
			return
		}
	}

	users, err := h.q.ListAllUsers(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, users)
}

func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	switch c.Role {
	case "hr":
		deptParam := r.URL.Query().Get("department_id")
		if deptParam != "" && deptParam != "all" {
			d, err := strconv.Atoi(deptParam)
			if err == nil {
				tasks, err := h.q.ListTasksByDepartment(r.Context(), d)
				if err != nil {
					httputil.Error(w, http.StatusInternalServerError, err.Error())
					return
				}
				if tasks == nil {
					tasks = []db.ListTasksByDepartmentRow{}
				}
				httputil.JSON(w, http.StatusOK, tasks)
				return
			}
		}
		// HR sees all tasks across all departments by default
		tasks, err := h.q.ListAllTasks(r.Context())
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		if tasks == nil {
			tasks = []db.ListAllTasksRow{}
		}
		httputil.JSON(w, http.StatusOK, tasks)

	case "manager":
		if c.DepartmentID == nil {
			httputil.Error(w, http.StatusBadRequest, "Руководитель не привязан к отделу")
			return
		}
		tasks, err := h.q.ListTasksByDepartment(r.Context(), *c.DepartmentID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		if tasks == nil {
			tasks = []db.ListTasksByDepartmentRow{}
		}
		httputil.JSON(w, http.StatusOK, tasks)

	default: // employee
		tasks, err := h.q.ListTasksByUser(r.Context(), c.UserID)
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		if tasks == nil {
			tasks = []db.ListTasksByUserRow{}
		}
		httputil.JSON(w, http.StatusOK, tasks)
	}
}

type CreateTaskInput struct {
	AssigneeID  int     `json:"assignee_id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	DueDate     *string `json:"due_date"`
}

func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	var input CreateTaskInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		httputil.Error(w, http.StatusBadRequest, "Необходимо указать название задачи")
		return
	}

	// Default assignee to self if not specified
	if input.AssigneeID <= 0 {
		input.AssigneeID = c.UserID
	}

	assignee, err := h.q.GetUser(r.Context(), input.AssigneeID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Исполнитель не найден")
		return
	}

	deptID := 1
	if c.Role == "manager" {
		if c.DepartmentID == nil || assignee.DepartmentID == nil || *assignee.DepartmentID != *c.DepartmentID {
			httputil.Error(w, http.StatusForbidden, "Руководитель может назначать задачи только сотрудникам своего подразделения")
			return
		}
		deptID = *c.DepartmentID
	} else if c.Role == "employee" {
		if c.DepartmentID != nil {
			deptID = *c.DepartmentID
		}
	} else if assignee.DepartmentID != nil {
		deptID = *assignee.DepartmentID
	}

	var dueDate *time.Time
	if input.DueDate != nil && *input.DueDate != "" {
		if t, err := time.Parse("2006-01-02", *input.DueDate); err == nil {
			dueDate = &t
		}
	}

	task, err := h.q.CreateTask(r.Context(), db.CreateTaskParams{
		Title:        input.Title,
		Description:  input.Description,
		DepartmentID: deptID,
		CreatedBy:    c.UserID,
		AssignedTo:   assignee.ID,
		DueDate:      dueDate,
		Status:       "todo",
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка создания задачи: "+err.Error())
		return
	}

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  assignee.ID,
		Kind:    "task",
		Title:   "Вам назначена новая задача: " + input.Title,
		Message: input.Description,
		Link:    "/tasks",
	})

	httputil.JSON(w, http.StatusCreated, task)
}

type UpdateTaskStatusInput struct {
	Status string `json:"status"` // todo, in_progress, done
}

func (h *Handler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор задачи")
		return
	}

	var input UpdateTaskStatusInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	input.Status = strings.TrimSpace(strings.ToLower(input.Status))
	if input.Status != "todo" && input.Status != "in_progress" && input.Status != "done" {
		httputil.Error(w, http.StatusBadRequest, "Статус должен быть 'todo', 'in_progress' или 'done'")
		return
	}

	task, err := h.q.GetTask(r.Context(), id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Задача не найдена")
		return
	}

	// Verify permission: assignee, department manager, or HR
	if c.Role == "employee" && task.AssignedTo != c.UserID {
		httputil.Error(w, http.StatusForbidden, "Вы можете менять статус только своих задач")
		return
	}
	if c.Role == "manager" && task.AssignedTo != c.UserID {
		if c.DepartmentID == nil || task.DepartmentID != *c.DepartmentID {
			httputil.Error(w, http.StatusForbidden, "Руководитель может управлять задачами только своего отдела")
			return
		}
	}

	if err := h.q.UpdateTaskStatus(r.Context(), db.UpdateTaskStatusParams{
		ID:     task.ID,
		Status: input.Status,
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка обновления статуса задачи: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"status": input.Status})
}

func (h *Handler) GetAcademyProgress(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	if c.Role == "employee" {
		httputil.Error(w, http.StatusForbidden, "Доступ запрещен: только руководитель и HR могут просматривать сводку обучения")
		return
	}

	deptID := 1
	if c.Role == "manager" {
		if c.DepartmentID == nil {
			httputil.Error(w, http.StatusBadRequest, "Руководитель не привязан к отделу")
			return
		}
		deptID = *c.DepartmentID
	} else if c.Role == "hr" {
		deptParam := r.URL.Query().Get("department_id")
		if deptParam != "" {
			if d, err := strconv.Atoi(deptParam); err == nil {
				deptID = d
			}
		}
	}

	progressList, err := h.q.ListDepartmentAcademyProgress(r.Context(), &deptID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки прогресса обучения: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, progressList)
}
