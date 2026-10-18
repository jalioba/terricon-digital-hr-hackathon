package academy

import (
	"encoding/json"
	"fmt"
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

type CourseItem struct {
	ID            int             `json:"id"`
	TitleRu       string          `json:"title_ru"`
	TitleKz       string          `json:"title_kz"`
	DescriptionRu string          `json:"description_ru"`
	DescriptionKz string          `json:"description_kz"`
	Track         string          `json:"track"`
	TargetRole    string          `json:"target_role"`
	DepartmentID  *int            `json:"department_id"`
	Lessons       json.RawMessage `json:"lessons"`
	Assigned      bool            `json:"assigned"`
	Status        string          `json:"status"`
	Progress      int             `json:"progress"`
	Score         *int            `json:"score"`
}

func (h *Handler) ListCourses(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	courses, err := h.q.ListCourses(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	assignments, _ := h.q.ListAssignmentsByUser(r.Context(), c.UserID)
	assignMap := make(map[int]db.ListAssignmentsByUserRow)
	for _, a := range assignments {
		assignMap[a.CourseID] = a
	}

	var result []CourseItem
	for _, cItem := range courses {
		lessonsRaw := json.RawMessage(cItem.Lessons)
		if len(cItem.Lessons) == 0 {
			lessonsRaw = json.RawMessage("[]")
		}

		item := CourseItem{
			ID:            cItem.ID,
			TitleRu:       cItem.TitleRu,
			TitleKz:       cItem.TitleKz,
			DescriptionRu: cItem.DescriptionRu,
			DescriptionKz: cItem.DescriptionKz,
			Track:         cItem.Track,
			TargetRole:    cItem.TargetRole,
			DepartmentID:  cItem.DepartmentID,
			Lessons:       lessonsRaw,
			Status:        "not_started",
			Progress:      0,
		}

		if a, ok := assignMap[cItem.ID]; ok {
			item.Assigned = true
			item.Status = a.Status
			item.Progress = a.Progress
			item.Score = a.Score
		}

		// Filter for current user's role and department
		// HR can see all courses
		if c.Role == "hr" {
			result = append(result, item)
			continue
		}

		// Track 1 (Platform): matched by role
		if item.Track == "platform" {
			if item.TargetRole == c.Role || item.TargetRole == "all" {
				result = append(result, item)
			}
			continue
		}

		// Track 2 (Job): matched by department AND role
		if item.Track == "job" {
			deptMatches := item.DepartmentID == nil || (c.DepartmentID != nil && *item.DepartmentID == *c.DepartmentID)
			roleMatches := item.TargetRole == "all" || item.TargetRole == c.Role
			if deptMatches && roleMatches {
				result = append(result, item)
			}
		}
	}

	if result == nil {
		result = []CourseItem{}
	}

	httputil.JSON(w, http.StatusOK, result)
}

func (h *Handler) GetCourse(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор курса")
		return
	}

	course, err := h.q.GetCourse(r.Context(), id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "Курс не найден")
		return
	}

	questions, _ := h.q.ListQuestions(r.Context(), id)
	assign, _ := h.q.GetAssignment(r.Context(), db.GetAssignmentParams{
		CourseID: id,
		UserID:   c.UserID,
	})

	type SafeQuestion struct {
		ID         int      `json:"id"`
		CourseID   int      `json:"course_id"`
		QuestionRu string   `json:"question_ru"`
		QuestionKz string   `json:"question_kz"`
		OptionsRu  []string `json:"options_ru"`
		OptionsKz  []string `json:"options_kz"`
	}
	var safeQ []SafeQuestion
	for _, q := range questions {
		safeQ = append(safeQ, SafeQuestion{
			ID:         q.ID,
			CourseID:   q.CourseID,
			QuestionRu: q.QuestionRu,
			QuestionKz: q.QuestionKz,
			OptionsRu:  q.OptionsRu,
			OptionsKz:  q.OptionsKz,
		})
	}
	if safeQ == nil {
		safeQ = []SafeQuestion{}
	}

	lessonsRaw := json.RawMessage(course.Lessons)
	if len(course.Lessons) == 0 {
		lessonsRaw = json.RawMessage("[]")
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"course": map[string]interface{}{
			"id":             course.ID,
			"title_ru":       course.TitleRu,
			"title_kz":       course.TitleKz,
			"description_ru": course.DescriptionRu,
			"description_kz": course.DescriptionKz,
			"track":          course.Track,
			"target_role":    course.TargetRole,
			"department_id":  course.DepartmentID,
			"lessons":        lessonsRaw,
		},
		"questions":  safeQ,
		"assignment": assign,
	})
}

type SubmitQuizInput struct {
	Answers map[string]int `json:"answers"` // question_id -> selected_index
}

func (h *Handler) SubmitQuiz(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	idStr := chi.URLParam(r, "id")
	courseID, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор курса")
		return
	}

	var input SubmitQuizInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат ответов квиза")
		return
	}

	questions, err := h.q.ListQuestions(r.Context(), courseID)
	if err != nil || len(questions) == 0 {
		httputil.Error(w, http.StatusBadRequest, "Вопросы для данного курса не найдены")
		return
	}

	correctCount := 0
	for _, q := range questions {
		ans, ok := input.Answers[strconv.Itoa(q.ID)]
		if ok && ans == q.CorrectIndex {
			correctCount++
		}
	}

	scorePercent := (correctCount * 100) / len(questions)
	passed := scorePercent >= 60

	scoreVal := scorePercent
	if passed {
		_ = h.q.CompleteCourse(r.Context(), db.CompleteCourseParams{
			CourseID: courseID,
			UserID:   c.UserID,
			Score:    &scoreVal,
		})

		course, _ := h.q.GetCourse(r.Context(), courseID)

		// Trigger notification
		_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
			UserID:  c.UserID,
			Kind:    "academy",
			Title:   fmt.Sprintf("Поздравляем! Курс «%s» успешно пройден на %d%%", course.TitleRu, scorePercent),
			Message: "Результат зафиксирован в вашем профиле.",
			Link:    fmt.Sprintf("/academy/%d", courseID),
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"course_id": courseID,
		"passed":    passed,
		"score":     scorePercent,
		"correct":   correctCount,
		"total":     len(questions),
		"progress":  map[bool]int{true: 100, false: 50}[passed],
		"message":   map[bool]string{true: "Курс успешно завершён!", false: "Тест не пройден. Попробуйте ещё раз."}[passed],
	})
}

type AssignInput struct {
	CourseID int `json:"course_id"`
	UserID   int `json:"user_id"`
}

func (h *Handler) AssignCourse(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || (c.Role != "hr" && c.Role != "manager") {
		httputil.Error(w, http.StatusForbidden, "Назначать курсы могут только HR и руководитель")
		return
	}

	var input AssignInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.CourseID <= 0 || input.UserID <= 0 {
		httputil.Error(w, http.StatusBadRequest, "Неверные параметры курса или сотрудника")
		return
	}

	_ = h.q.AssignCourse(r.Context(), db.AssignCourseParams{
		CourseID: input.CourseID,
		UserID:   input.UserID,
	})

	course, _ := h.q.GetCourse(r.Context(), input.CourseID)

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  input.UserID,
		Kind:    "academy",
		Title:   fmt.Sprintf("Вам назначен курс «%s»", course.TitleRu),
		Message: "Пройдите учебные материалы и проверочный тест в Jana Academy.",
		Link:    fmt.Sprintf("/academy/%d", input.CourseID),
	})

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}

type UpdateProgressInput struct {
	Progress int `json:"progress"`
}

func (h *Handler) UpdateProgress(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "Неавторизован")
		return
	}

	idStr := chi.URLParam(r, "id")
	courseID, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный идентификатор курса")
		return
	}

	var input UpdateProgressInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Неверный формат запроса")
		return
	}

	if input.Progress < 0 {
		input.Progress = 0
	} else if input.Progress > 100 {
		input.Progress = 100
	}

	_ = h.q.UpdateCourseProgress(r.Context(), db.UpdateCourseProgressParams{
		CourseID: courseID,
		UserID:   c.UserID,
		Progress: input.Progress,
	})

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"course_id": courseID,
		"progress":  input.Progress,
	})
}

type UserCourseTest struct {
	CourseID int    `json:"course_id"`
	TitleRu  string `json:"title_ru"`
	TitleKz  string `json:"title_kz"`
	Track    string `json:"track"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
	Score    *int   `json:"score"`
}

type HrOversightUserItem struct {
	UserID            int              `json:"user_id"`
	FullName          string           `json:"full_name"`
	Position          string           `json:"position"`
	Role              string           `json:"role"`
	DepartmentID      *int             `json:"department_id"`
	DeptRu            string           `json:"dept_ru"`
	TotalCourses      int              `json:"total_courses"`
	CompletedCourses  int              `json:"completed_courses"`
	AvgProgress       float64          `json:"avg_progress"`
	PlatformCompleted int              `json:"platform_completed"`
	PlatformScore     int              `json:"platform_score"`
	Courses           []UserCourseTest `json:"courses"`
}

func (h *Handler) ListHrOversight(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || (c.Role != "hr" && c.Role != "manager") {
		httputil.Error(w, http.StatusForbidden, "Доступ запрещен: только HR и руководители могут просматривать сводку обучения")
		return
	}

	list, err := h.q.ListAllUsersAcademyProgress(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка загрузки сводки онбординга: "+err.Error())
		return
	}

	allCourses, _ := h.q.ListCourses(r.Context())

	var result []HrOversightUserItem
	for _, u := range list {
		// Manager only sees members of their own department
		if c.Role == "manager" && (c.DepartmentID == nil || u.DepartmentID == nil || *u.DepartmentID != *c.DepartmentID) {
			continue
		}

		assignments, _ := h.q.ListAssignmentsByUser(r.Context(), u.UserID)
		assignMap := make(map[int]db.ListAssignmentsByUserRow)
		for _, a := range assignments {
			assignMap[a.CourseID] = a
		}

		var userCourses []UserCourseTest
		for _, crs := range allCourses {
			// Check course relevance for user's role and department
			isRelevant := false
			if crs.Track == "platform" {
				if crs.TargetRole == u.Role || crs.TargetRole == "all" {
					isRelevant = true
				}
			} else {
				// Track 2: job
				if crs.DepartmentID == nil || (u.DepartmentID != nil && *crs.DepartmentID == *u.DepartmentID) {
					if crs.TargetRole == u.Role || crs.TargetRole == "all" {
						isRelevant = true
					}
				}
			}

			if !isRelevant {
				continue
			}

			status := "not_started"
			progress := 0
			var score *int

			if a, ok := assignMap[crs.ID]; ok {
				status = a.Status
				progress = a.Progress
				score = a.Score
			}

			userCourses = append(userCourses, UserCourseTest{
				CourseID: crs.ID,
				TitleRu:  crs.TitleRu,
				TitleKz:  crs.TitleKz,
				Track:    crs.Track,
				Status:   status,
				Progress: progress,
				Score:    score,
			})
		}
		if userCourses == nil {
			userCourses = []UserCourseTest{}
		}

		result = append(result, HrOversightUserItem{
			UserID:            u.UserID,
			FullName:          u.FullName,
			Position:          u.Position,
			Role:              u.Role,
			DepartmentID:      u.DepartmentID,
			DeptRu:            u.DeptRu,
			TotalCourses:      len(userCourses),
			CompletedCourses:  u.CompletedCourses,
			AvgProgress:       u.AvgProgress,
			PlatformCompleted: u.PlatformCompleted,
			PlatformScore:     u.PlatformScore,
			Courses:           userCourses,
		})
	}
	if result == nil {
		result = []HrOversightUserItem{}
	}

	httputil.JSON(w, http.StatusOK, result)
}

type RemindInput struct {
	UserID   int    `json:"user_id"`
	CourseID *int   `json:"course_id"`
	Message  string `json:"message"`
}

func (h *Handler) RemindOnboarding(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || (c.Role != "hr" && c.Role != "manager") {
		httputil.Error(w, http.StatusForbidden, "Отправлять напоминания может только HR или руководитель")
		return
	}

	var input RemindInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.UserID <= 0 {
		httputil.Error(w, http.StatusBadRequest, "Неверные параметры сотрудника")
		return
	}

	msg := input.Message
	if msg == "" {
		msg = "Напоминаем о необходимости завершить тестирование по профессиональным регламентам в Jana Academy."
	}

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  input.UserID,
		Kind:    "academy",
		Title:   "Напоминание: Тестирование в Jana Academy",
		Message: msg,
		Link:    "/academy",
	})

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "reminder_sent"})
}

