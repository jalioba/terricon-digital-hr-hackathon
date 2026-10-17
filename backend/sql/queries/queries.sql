-- name: GetUserByIIN :one
SELECT * FROM users WHERE iin = $1;

-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserProfile :one
SELECT u.id, u.iin, u.full_name, u.role, u.department_id, u.company, u.position,
       u.hired_at, u.vacation_days_left, u.created_at,
       d.code AS dept_code, d.name_ru AS dept_ru, d.name_kz AS dept_kz
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
WHERE u.id = $1;

-- name: CreateUser :one
INSERT INTO users (iin, password_hash, full_name, role, department_id, company, position, hired_at, vacation_days_left)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListAllUsers :many
SELECT u.id, u.iin, u.full_name, u.role, u.department_id, u.company, u.position,
       u.hired_at, u.vacation_days_left, u.created_at,
       d.code AS dept_code, d.name_ru AS dept_ru, d.name_kz AS dept_kz
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
ORDER BY u.id DESC;

-- name: ListUsersByDepartment :many
SELECT u.id, u.iin, u.full_name, u.role, u.department_id, u.company, u.position,
       u.hired_at, u.vacation_days_left, u.created_at,
       d.code AS dept_code, d.name_ru AS dept_ru, d.name_kz AS dept_kz
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
WHERE u.department_id = $1
ORDER BY u.full_name;

-- name: UpdateVacationDays :exec
UPDATE users SET vacation_days_left = $2 WHERE id = $1;

-- name: ListDepartments :many
SELECT * FROM departments ORDER BY id;

-- name: GetDepartment :one
SELECT * FROM departments WHERE id = $1;

-- name: CreateRequest :one
INSERT INTO requests (
  type, user_id, department_id,
  date_from, date_to, days_count, is_paid,
  amount, desired_date, document_url, comment, status
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING *;

-- name: GetRequest :one
SELECT r.*, u.full_name AS user_name, u.iin AS user_iin, u.role AS user_role,
       d.name_ru AS dept_ru, d.name_kz AS dept_kz,
       approver.full_name AS approver_name
FROM requests r
JOIN users u ON u.id = r.user_id
JOIN departments d ON d.id = r.department_id
LEFT JOIN users approver ON approver.id = r.approved_by
WHERE r.id = $1;

-- name: ListRequestsByUser :many
SELECT r.*, u.full_name AS user_name, d.name_ru AS dept_ru, d.name_kz AS dept_kz,
       approver.full_name AS approver_name
FROM requests r
JOIN users u ON u.id = r.user_id
JOIN departments d ON d.id = r.department_id
LEFT JOIN users approver ON approver.id = r.approved_by
WHERE r.user_id = $1
ORDER BY r.created_at DESC;

-- name: ListRequestsByDepartment :many
SELECT r.*, u.full_name AS user_name, u.position AS user_position,
       d.name_ru AS dept_ru, d.name_kz AS dept_kz,
       approver.full_name AS approver_name
FROM requests r
JOIN users u ON u.id = r.user_id
JOIN departments d ON d.id = r.department_id
LEFT JOIN users approver ON approver.id = r.approved_by
WHERE r.department_id = $1
ORDER BY r.created_at DESC;

-- name: ListAllRequests :many
SELECT r.*, u.full_name AS user_name, u.position AS user_position,
       d.name_ru AS dept_ru, d.name_kz AS dept_kz,
       approver.full_name AS approver_name
FROM requests r
JOIN users u ON u.id = r.user_id
JOIN departments d ON d.id = r.department_id
LEFT JOIN users approver ON approver.id = r.approved_by
ORDER BY r.created_at DESC;

-- name: UpdateRequestDecision :one
UPDATE requests
SET status = $2, manager_comment = $3, approved_by = $4, approved_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- name: AddRequestHistory :exec
INSERT INTO request_history (request_id, status, actor_id, comment)
VALUES ($1, $2, $3, $4);

-- name: ListRequestHistory :many
SELECT h.*, COALESCE(u.full_name, 'Система') AS actor_name
FROM request_history h
LEFT JOIN users u ON u.id = h.actor_id
WHERE h.request_id = $1
ORDER BY h.created_at ASC, h.id ASC;

-- name: CreateTask :one
INSERT INTO tasks (title, description, department_id, created_by, assigned_to, due_date, status)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListTasksByUser :many
SELECT t.*, u.full_name AS creator_name
FROM tasks t
JOIN users u ON u.id = t.created_by
WHERE t.assigned_to = $1
ORDER BY t.due_date NULLS LAST, t.id DESC;

-- name: ListTasksByDepartment :many
SELECT t.*, creator.full_name AS creator_name, assignee.full_name AS assignee_name
FROM tasks t
JOIN users creator ON creator.id = t.created_by
JOIN users assignee ON assignee.id = t.assigned_to
WHERE t.department_id = $1
ORDER BY t.due_date NULLS LAST, t.id DESC;

-- name: UpdateTaskStatus :exec
UPDATE tasks SET status = $2, updated_at = now() WHERE id = $1;

-- name: GetTask :one
SELECT * FROM tasks WHERE id = $1;

-- name: ListCourses :many
SELECT * FROM courses ORDER BY id;

-- name: GetCourse :one
SELECT * FROM courses WHERE id = $1;

-- name: ListQuestions :many
SELECT * FROM quiz_questions WHERE course_id = $1 ORDER BY id;

-- name: GetAssignment :one
SELECT * FROM course_assignments WHERE course_id = $1 AND user_id = $2;

-- name: AssignCourse :exec
INSERT INTO course_assignments (course_id, user_id, status, progress)
VALUES ($1, $2, 'not_started', 0)
ON CONFLICT (course_id, user_id) DO NOTHING;

-- name: CompleteCourse :exec
UPDATE course_assignments
SET status = 'completed', progress = 100, score = $3, completed_at = now()
WHERE course_id = $1 AND user_id = $2;

-- name: ListAssignmentsByUser :many
SELECT a.*, c.title_ru, c.title_kz, c.description_ru, c.description_kz
FROM course_assignments a
JOIN courses c ON c.id = a.course_id
WHERE a.user_id = $1
ORDER BY a.assigned_at DESC;

-- name: ListDepartmentAcademyProgress :many
SELECT u.id AS user_id, u.full_name, u.position,
       COUNT(ca.id)::int AS total_courses,
       COUNT(ca.id) FILTER (WHERE ca.status = 'completed')::int AS completed_courses,
       COALESCE(AVG(ca.progress), 0)::float8 AS avg_progress
FROM users u
LEFT JOIN course_assignments ca ON ca.user_id = u.id
WHERE u.department_id = $1
GROUP BY u.id, u.full_name, u.position
ORDER BY u.full_name;

-- name: CreateNotification :exec
INSERT INTO notifications (user_id, kind, title, message, link)
VALUES ($1, $2, $3, $4, $5);

-- name: ListNotifications :many
SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50;

-- name: MarkNotificationRead :exec
UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications SET read = true WHERE user_id = $1;

-- name: AnalyticsRequestsByStatus :many
SELECT status, COUNT(*)::int AS cnt FROM requests GROUP BY status;

-- name: AnalyticsDepartmentStats :many
SELECT d.id, d.code, d.name_ru, d.name_kz,
       (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id)::int AS employees_count,
       (SELECT COUNT(*) FROM requests r WHERE r.department_id = d.id)::int AS requests_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id AND t.status <> 'done')::int AS open_tasks_count
FROM departments d
ORDER BY d.id;

-- name: AnalyticsApprovalsAudit :many
SELECT r.id, r.type, r.status, r.approved_at,
       requester.full_name AS requester_name,
       approver.full_name AS approver_name,
       d.name_ru AS dept_ru
FROM requests r
JOIN users requester ON requester.id = r.user_id
JOIN departments d ON d.id = r.department_id
LEFT JOIN users approver ON approver.id = r.approved_by
WHERE r.approved_by IS NOT NULL
ORDER BY r.approved_at DESC
LIMIT 100;

-- name: ListKB :many
SELECT * FROM kb_documents ORDER BY id;

-- name: CreateKB :one
INSERT INTO kb_documents (title, section, url, content, keywords, lang)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: DeleteKB :exec
DELETE FROM kb_documents WHERE id = $1;

-- name: CreateEscalation :one
INSERT INTO ai_escalations (user_id, question) VALUES ($1, $2) RETURNING *;

-- name: ListEscalations :many
SELECT e.*, u.full_name FROM ai_escalations e JOIN users u ON u.id = e.user_id ORDER BY e.created_at DESC;

