package analytics

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

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

type LessonTopic struct {
	ID         int    `json:"id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	Completed  bool   `json:"completed"`
	InProgress bool   `json:"in_progress"`
}

type CourseDetail struct {
	CourseID      int           `json:"course_id"`
	TitleRu       string        `json:"title_ru"`
	TitleKz       string        `json:"title_kz"`
	DescriptionRu string        `json:"description_ru"`
	Track         string        `json:"track"`
	Status        string        `json:"status"`
	Progress      int           `json:"progress"`
	Score         *int          `json:"score"`
	Lessons       []LessonTopic `json:"lessons"`
}

type AcademyLearner struct {
	UserID            int            `json:"user_id"`
	FullName          string         `json:"full_name"`
	Position          string         `json:"position"`
	Role              string         `json:"role"`
	DepartmentID      *int           `json:"department_id"`
	DeptRu            string         `json:"dept_ru"`
	TotalCourses      int            `json:"total_courses"`
	CompletedCourses  int            `json:"completed_courses"`
	AvgProgress       float64        `json:"avg_progress"`
	PlatformCompleted int            `json:"platform_completed"`
	PlatformScore     int            `json:"platform_score"`
	CoursesDetail     []CourseDetail `json:"courses_detail"`
}

type TaskItem struct {
	ID            int        `json:"id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	DepartmentID  int        `json:"department_id"`
	DeptNameRu    string     `json:"dept_name_ru"`
	DeptCode      string     `json:"dept_code"`
	CreatedBy     *int       `json:"created_by"`
	AssignedTo    *int       `json:"assigned_to"`
	DueDate       *time.Time `json:"due_date"`
	Status        string     `json:"status"`
	ReworkComment *string    `json:"rework_comment"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	CreatorName   *string    `json:"creator_name"`
	AssigneeName  *string    `json:"assignee_name"`
	IsOverdue     bool       `json:"is_overdue"`
	DaysOverdue   int        `json:"days_overdue"`
}

type DepartmentStat struct {
	ID              int     `json:"id"`
	Code            string  `json:"code"`
	NameRu          string  `json:"name_ru"`
	TasksTotal      int     `json:"tasks_total"`
	TasksCompleted  int     `json:"tasks_completed"`
	TasksInProgress int     `json:"tasks_in_progress"`
	TasksOverdue    int     `json:"tasks_overdue"`
	CompletionRate  float64 `json:"completion_rate"`
	RequestsTotal   int     `json:"requests_total"`
	LearnersCount   int     `json:"learners_count"`
}

type RawLesson struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

func (h *Handler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || (c.Role != "hr" && c.Role != "manager") {
		httputil.Error(w, http.StatusForbidden, "Доступ запрещен: только HR и руководители имеют доступ к аналитике")
		return
	}

	ctx := r.Context()
	now := time.Now()

	// 1. Tasks
	allTasks, err := h.q.ListAllTasks(ctx)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка получения списка задач: "+err.Error())
		return
	}

	var taskItems []TaskItem
	tasksDone := 0
	tasksInProgress := 0
	tasksOverdue := 0

	for _, t := range allTasks {
		isOverdue := false
		daysOverdue := 0
		if t.DueDate != nil && t.Status != "done" && t.DueDate.Before(now) {
			isOverdue = true
			diff := now.Sub(*t.DueDate)
			daysOverdue = int(math.Max(1, math.Floor(diff.Hours()/24)))
			tasksOverdue++
		}

		if t.Status == "done" {
			tasksDone++
		} else {
			tasksInProgress++
		}

		taskItems = append(taskItems, TaskItem{
			ID:            t.ID,
			Title:         t.Title,
			Description:   t.Description,
			DepartmentID:  t.DepartmentID,
			DeptNameRu:    t.DeptNameRu,
			DeptCode:      t.DeptCode,
			CreatedBy:     t.CreatedBy,
			AssignedTo:    t.AssignedTo,
			DueDate:       t.DueDate,
			Status:        t.Status,
			ReworkComment: t.ReworkComment,
			CreatedAt:     t.CreatedAt,
			UpdatedAt:     t.UpdatedAt,
			CreatorName:   t.CreatorName,
			AssigneeName:  t.AssigneeName,
			IsOverdue:     isOverdue,
			DaysOverdue:   daysOverdue,
		})
	}
	if taskItems == nil {
		taskItems = []TaskItem{}
	}

	taskCompletionRate := 0.0
	if len(allTasks) > 0 {
		taskCompletionRate = math.Round((float64(tasksDone)/float64(len(allTasks))*100)*10) / 10
	}

	// 2. Requests
	allRequests, err := h.q.ListAllRequests(ctx)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "Ошибка получения списка заявок: "+err.Error())
		return
	}
	if allRequests == nil {
		allRequests = []db.ListAllRequestsRow{}
	}

	reqApproved := 0
	reqPending := 0
	reqRevision := 0
	reqRejected := 0
	totalAdvanceAmount := 0.0
	totalVacationDays := 0

	for _, r := range allRequests {
		switch r.Status {
		case "approved":
			reqApproved++
			if r.Type == "advance" {
				totalAdvanceAmount += r.Amount
			} else if r.Type == "vacation" {
				totalVacationDays += r.DaysCount
			}
		case "pending":
			reqPending++
		case "revision_needed":
			reqRevision++
		case "rejected":
			reqRejected++
		}
	}

	// 3. Departments & Breakdown
	departments, _ := h.q.ListDepartments(ctx)
	deptStatsMap := make(map[int]*DepartmentStat)
	for _, d := range departments {
		deptStatsMap[d.ID] = &DepartmentStat{
			ID:     d.ID,
			Code:   d.Code,
			NameRu: d.NameRu,
		}
	}

	for _, t := range taskItems {
		if ds, ok := deptStatsMap[t.DepartmentID]; ok {
			ds.TasksTotal++
			if t.Status == "done" {
				ds.TasksCompleted++
			} else {
				ds.TasksInProgress++
			}
			if t.IsOverdue {
				ds.TasksOverdue++
			}
		}
	}

	for _, r := range allRequests {
		if ds, ok := deptStatsMap[r.DepartmentID]; ok {
			ds.RequestsTotal++
		}
	}

	// 4. Academy Progress & Details
	progressRows, _ := h.q.ListAllUsersAcademyProgress(ctx)
	courses, _ := h.q.ListCourses(ctx)

	// Pre-parse courses lessons
	courseLessonMap := make(map[int][]RawLesson)
	for _, c := range courses {
		var lessons []RawLesson
		if len(c.Lessons) > 0 {
			_ = json.Unmarshal(c.Lessons, &lessons)
		}
		courseLessonMap[c.ID] = lessons
	}

	var academyLearners []AcademyLearner
	completedOnboardingCount := 0
	totalScoreSum := 0
	scoreCount := 0
	var totalProgressSum float64

	for _, p := range progressRows {
		if p.DepartmentID != nil {
			if ds, ok := deptStatsMap[*p.DepartmentID]; ok {
				ds.LearnersCount++
			}
		}

		if p.PlatformCompleted > 0 {
			completedOnboardingCount++
		}
		totalProgressSum += p.AvgProgress

		// Fetch user assignments for detailed course breakdown
		assignments, _ := h.q.ListAssignmentsByUser(ctx, p.UserID)
		assignMap := make(map[int]db.ListAssignmentsByUserRow)
		for _, a := range assignments {
			assignMap[a.CourseID] = a
			if a.Score != nil {
				totalScoreSum += *a.Score
				scoreCount++
			}
		}

		var userCourses []CourseDetail
		for _, c := range courses {
			// Check course relevance for user's role and department
			isRelevant := false
			if c.Track == "platform" {
				if c.TargetRole == p.Role || c.TargetRole == "all" {
					isRelevant = true
				}
			} else {
				if c.DepartmentID == nil || (p.DepartmentID != nil && *c.DepartmentID == *p.DepartmentID) {
					if c.TargetRole == p.Role || c.TargetRole == "all" {
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

			if a, exists := assignMap[c.ID]; exists {
				status = a.Status
				progress = a.Progress
				score = a.Score
			}

			userCourses = append(userCourses, CourseDetail{
				CourseID:      c.ID,
				TitleRu:       c.TitleRu,
				TitleKz:       c.TitleKz,
				DescriptionRu: c.DescriptionRu,
				Track:         c.Track,
				Status:        status,
				Progress:      progress,
				Score:         score,
				Lessons:       []LessonTopic{},
			})
		}
		if userCourses == nil {
			userCourses = []CourseDetail{}
		}

		academyLearners = append(academyLearners, AcademyLearner{
			UserID:            p.UserID,
			FullName:          p.FullName,
			Position:          p.Position,
			Role:              p.Role,
			DepartmentID:      p.DepartmentID,
			DeptRu:            p.DeptRu,
			TotalCourses:      p.TotalCourses,
			CompletedCourses:  p.CompletedCourses,
			AvgProgress:       math.Round(p.AvgProgress*10) / 10,
			PlatformCompleted: p.PlatformCompleted,
			PlatformScore:     p.PlatformScore,
			CoursesDetail:     userCourses,
		})
	}
	if academyLearners == nil {
		academyLearners = []AcademyLearner{}
	}

	var departmentStatsList []DepartmentStat
	for _, d := range departments {
		if ds, ok := deptStatsMap[d.ID]; ok {
			if ds.TasksTotal > 0 {
				ds.CompletionRate = math.Round((float64(ds.TasksCompleted)/float64(ds.TasksTotal)*100)*10) / 10
			}
			departmentStatsList = append(departmentStatsList, *ds)
		}
	}
	if departmentStatsList == nil {
		departmentStatsList = []DepartmentStat{}
	}

	avgCompanyProgress := 0.0
	if len(progressRows) > 0 {
		avgCompanyProgress = math.Round((totalProgressSum/float64(len(progressRows)))*10) / 10
	}

	avgTestScore := 0.0
	if scoreCount > 0 {
		avgTestScore = math.Round((float64(totalScoreSum)/float64(scoreCount))*10) / 10
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"summary": map[string]interface{}{
			"tasks": map[string]interface{}{
				"total":           len(allTasks),
				"completed":       tasksDone,
				"in_progress":     tasksInProgress,
				"overdue":         tasksOverdue,
				"completion_rate": taskCompletionRate,
			},
			"requests": map[string]interface{}{
				"total":                len(allRequests),
				"approved":             reqApproved,
				"pending":              reqPending,
				"revision":             reqRevision,
				"rejected":             reqRejected,
				"total_advance_amount": totalAdvanceAmount,
				"total_vacation_days":  totalVacationDays,
			},
			"academy": map[string]interface{}{
				"total_learners":       len(progressRows),
				"completed_onboarding": completedOnboardingCount,
				"avg_progress":         avgCompanyProgress,
				"avg_score":            avgTestScore,
			},
		},
		"departments": departmentStatsList,
		"tasks":       taskItems,
		"requests":    allRequests,
		"academy":     academyLearners,
	})
}
