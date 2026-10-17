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
		tasks, err := h.q.ListTasksByUser(r.Context(), &c.UserID)
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
	DepartmentID int     `json:"department_id"`
	AssigneeID   *int    `json:"assignee_id"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	DueDate      *string `json:"due_date"`
}

func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	if c.Role == "employee" {
		httputil.Error(w, http.StatusForbidden, "Сотрудники не могут создавать новые задачи для отделов")
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

	var deptID int
	var assignedTo *int

	if c.Role == "hr" {
		// HR manager создает задачи и отправляет их по отделам
		if input.DepartmentID > 0 {
			deptID = input.DepartmentID
		} else {
			deptID = 1
		}
		// Исполнитель первоначально не назначен — руководитель отдела назначит его
		assignedTo = nil
	} else if c.Role == "manager" {
		if c.DepartmentID == nil {
			httputil.Error(w, http.StatusBadRequest, "Руководитель не привязан к подразделению")
			return
		}
		deptID = *c.DepartmentID

		// Руководитель может сразу выбрать работника только из своего отдела
		if input.AssigneeID != nil && *input.AssigneeID > 0 {
			assignee, err := h.q.GetUser(r.Context(), *input.AssigneeID)
			if err != nil || assignee.DepartmentID == nil || *assignee.DepartmentID != deptID || assignee.Role != "employee" {
				httputil.Error(w, http.StatusForbidden, "Руководитель может выбирать работников только своего отдела")
				return
			}
			assignedTo = &assignee.ID
		}
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
		AssignedTo:   assignedTo,
		DueDate:      dueDate,
		Status:       "todo",
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка создания задачи: "+err.Error())
		return
	}

	// Уведомления
	if c.Role == "hr" {
		// Оповещаем руководителя отдела о новой поступившей задаче
		deptUsers, _ := h.q.ListUsersByDepartment(r.Context(), &deptID)
		for _, u := range deptUsers {
			if u.Role == "manager" {
				_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
					UserID:  u.ID,
					Kind:    "task",
					Title:   "Новая задача для отдела от HR: " + input.Title,
					Message: "HR-менеджер направил задачу в ваше подразделение. Выберите исполнителя из сотрудников отдела в разделе «К выполнению».",
					Link:    "/tasks",
				})
			}
		}
	} else if assignedTo != nil {
		_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
			UserID:  *assignedTo,
			Kind:    "task",
			Title:   "Вам назначена новая задача: " + input.Title,
			Message: "Руководитель назначил вас исполнителем задачи.",
			Link:    "/tasks",
		})
	}

	httputil.JSON(w, http.StatusCreated, task)
}

type AssignTaskInput struct {
	AssigneeID int `json:"assignee_id"`
}

func (h *Handler) AssignTask(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	if c.Role != "manager" && c.Role != "hr" {
		httputil.Error(w, http.StatusForbidden, "Назначать исполнителей могут только руководитель или HR")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор задачи")
		return
	}

	var input AssignTaskInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	task, err := h.q.GetTask(r.Context(), id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Задача не найдена")
		return
	}

	assignee, err := h.q.GetUser(r.Context(), input.AssigneeID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Выбранный сотрудник не найден")
		return
	}

	if c.Role == "manager" {
		if c.DepartmentID == nil || task.DepartmentID != *c.DepartmentID {
			httputil.Error(w, http.StatusForbidden, "Руководитель может управлять задачами только своего отдела")
			return
		}
		if assignee.DepartmentID == nil || *assignee.DepartmentID != *c.DepartmentID || assignee.Role != "employee" {
			httputil.Error(w, http.StatusForbidden, "Руководитель может выбирать работников только своего отдела")
			return
		}
	}

	if err := h.q.AssignTask(r.Context(), db.AssignTaskParams{
		ID:         task.ID,
		AssignedTo: &assignee.ID,
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка назначения исполнителя: "+err.Error())
		return
	}

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  assignee.ID,
		Kind:    "task",
		Title:   "Вам назначена новая задача: " + task.Title,
		Message: "Руководитель назначил вас исполнителем задачи. Задача доступна во вкладке «Мои задачи».",
		Link:    "/tasks",
	})

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"task_id":     task.ID,
		"assigned_to": assignee.ID,
	})
}

type UpdateTaskStatusInput struct {
	Status        string  `json:"status"` // todo, in_progress, review, done
	ReworkComment *string `json:"rework_comment"`
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
	if input.Status != "todo" && input.Status != "in_progress" && input.Status != "review" && input.Status != "done" {
		httputil.Error(w, http.StatusBadRequest, "Недопустимый статус задачи. Допустимы: todo, in_progress, review, done")
		return
	}

	task, err := h.q.GetTask(r.Context(), id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Задача не найдена")
		return
	}

	switch c.Role {
	case "employee":
		if task.AssignedTo == nil || *task.AssignedTo != c.UserID {
			httputil.Error(w, http.StatusForbidden, "Вы можете менять статус только своих задач")
			return
		}
		// Работник может переводить:
		// 1. из "todo" в "in_progress" (Начать задачу)
		// 2. из "in_progress" в "review" (Задача готова / Отправить руководителю)
		if input.Status == "in_progress" {
			// Начать задачу
		} else if input.Status == "review" {
			// Отправить руководителю на проверку
			deptUsers, _ := h.q.ListUsersByDepartment(r.Context(), &task.DepartmentID)
			for _, u := range deptUsers {
				if u.Role == "manager" {
					_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
						UserID:  u.ID,
						Kind:    "task",
						Title:   "Задача на проверке: " + task.Title,
						Message: "Сотрудник " + c.FullName + " завершил выполнение и отправил задачу на проверку.",
						Link:    "/tasks",
					})
				}
			}
		} else {
			httputil.Error(w, http.StatusForbidden, "Работник может только начать задачу ('В работе') или отправить её на проверку руководителю ('На проверке')")
			return
		}

	case "manager":
		if c.DepartmentID == nil || task.DepartmentID != *c.DepartmentID {
			httputil.Error(w, http.StatusForbidden, "Руководитель может управлять задачами только своего отдела")
			return
		}
		if input.Status == "done" {
			// Руководитель подтверждает задачу
			if task.AssignedTo != nil {
				_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
					UserID:  *task.AssignedTo,
					Kind:    "task",
					Title:   "Задача подтверждена: " + task.Title,
					Message: "Руководитель " + c.FullName + " подтвердил успешное выполнение задачи.",
					Link:    "/tasks",
				})
			}
		} else if input.Status == "in_progress" || input.Status == "todo" {
			// Руководитель отправляет на перевыполнение (доработку)
			reworkMsg := "Руководитель отправил задачу на перевыполнение."
			if input.ReworkComment != nil && strings.TrimSpace(*input.ReworkComment) != "" {
				reworkMsg = *input.ReworkComment
			}
			if task.AssignedTo != nil {
				_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
					UserID:  *task.AssignedTo,
					Kind:    "task",
					Title:   "Задача отправлена на перевыполнение: " + task.Title,
					Message: reworkMsg,
					Link:    "/tasks",
				})
			}
		}

	case "hr":
		// HR имеет право наблюдения и административного управления
	}

	reworkComment := ""
	if input.ReworkComment != nil {
		reworkComment = strings.TrimSpace(*input.ReworkComment)
	}

	if err := h.q.UpdateTaskStatusWithComment(r.Context(), db.UpdateTaskStatusWithCommentParams{
		ID:            task.ID,
		Status:        input.Status,
		ReworkComment: &reworkComment,
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка обновления статуса задачи: "+err.Error())
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"status":         input.Status,
		"rework_comment": reworkComment,
	})
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
