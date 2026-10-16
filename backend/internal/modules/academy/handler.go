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
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
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
		Assigned bool   `json:"assigned"`
		Progress int    `json:"progress"`
		Score    *int   `json:"score"`
	}

	var result []CourseItem
	for _, cItem := range courses {
		item := CourseItem{Course: cItem}
		if a, ok := assignMap[int(cItem.ID)]; ok {
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
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid course id")
		return
	}

	course, err := h.q.GetCourse(r.Context(), int32(id))
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "course not found")
		return
	}

	questions, _ := h.q.ListQuestions(r.Context(), id)
	assign, _ := h.q.GetAssignment(r.Context(), db.GetAssignmentParams{
		CourseID: id,
		UserID:   c.UserID,
	})

	type SafeQuestion struct {
		ID         int32    `json:"id"`
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
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	courseID, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid course id")
		return
	}

	var input SubmitQuizInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid quiz submission")
		return
	}

	questions, err := h.q.ListQuestions(r.Context(), courseID)
	if err != nil || len(questions) == 0 {
		httputil.Error(w, http.StatusBadRequest, "no questions for this course")
		return
	}

	correctCount := 0
	for _, q := range questions {
		ans, ok := input.Answers[strconv.Itoa(int(q.ID))]
		if ok && ans == int(q.CorrectIndex) {
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

		course, _ := h.q.GetCourse(r.Context(), int32(courseID))

		// Trigger notification
		_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
			UserID:  c.UserID,
			Kind:    "academy",
			TitleRu: fmt.Sprintf("Поздравляем! Курс «%s» успешно пройден на %d%%", course.TitleRu, scorePercent),
			TitleKz: fmt.Sprintf("Құттықтаймыз! «%s» курсы сәтті %d%% аяқталды", course.TitleKz, scorePercent),
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
	if c == nil || c.Role != "hr_admin" {
		httputil.Error(w, http.StatusForbidden, "forbidden: only HR Admin can assign courses")
		return
	}

	var input AssignInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.CourseID <= 0 || input.UserID <= 0 {
		httputil.Error(w, http.StatusBadRequest, "invalid course_id or user_id")
		return
	}

	_ = h.q.AssignCourse(r.Context(), db.AssignCourseParams{
		CourseID:   input.CourseID,
		UserID:     input.UserID,
		AssignedBy: &c.UserID,
	})

	course, _ := h.q.GetCourse(r.Context(), int32(input.CourseID))

	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  input.UserID,
		Kind:    "academy",
		TitleRu: fmt.Sprintf("HR назначил вам курс «%s»", course.TitleRu),
		TitleKz: fmt.Sprintf("HR сізге «%s» курсын тағайындады", course.TitleKz),
		Link:    fmt.Sprintf("/academy/%d", input.CourseID),
	})

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}
