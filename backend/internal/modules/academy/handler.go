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

	type CourseItem struct {
		db.Course
		Assigned bool `json:"assigned"`
		Progress int  `json:"progress"`
		Score    *int `json:"score"`
	}

	var result []CourseItem
	for _, cItem := range courses {
		item := CourseItem{Course: cItem}
		if a, ok := assignMap[cItem.ID]; ok {
			item.Assigned = true
			item.Progress = a.Progress
			item.Score = a.Score
		}
		result = append(result, item)
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

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"course":     course,
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
