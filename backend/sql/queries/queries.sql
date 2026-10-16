-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: ListDemoUsers :many
SELECT u.id, u.email, u.full_name, u.role, u.position, d.name_ru AS dept_ru, d.name_kz AS dept_kz
FROM users u LEFT JOIN departments d ON d.id = u.department_id
ORDER BY u.role DESC, u.id;

-- name: GetUserProfile :one
SELECT u.*, d.code AS dept_code, d.name_ru AS dept_ru, d.name_kz AS dept_kz,
       COALESCE(m.full_name, '') AS manager_name
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN users m ON m.id = u.manager_id
WHERE u.id = $1;

-- name: ListTeam :many
SELECT * FROM users WHERE department_id = $1 AND id <> $2 ORDER BY full_name;

-- name: ListAllUsers :many
SELECT * FROM users ORDER BY full_name;

-- name: UpdateVacationDays :exec
UPDATE users SET vacation_days_left = $2 WHERE id = $1;

-- name: UpdateLocale :exec
UPDATE users SET locale = $2 WHERE id = $1;

-- name: ListDepartments :many
SELECT * FROM departments ORDER BY id;

-- name: CreateRequest :one
INSERT INTO requests (type, user_id, department_id, date_from, date_to, days, amount, comment, status)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *;

-- name: GetRequest :one
SELECT r.*, u.full_name AS user_name FROM requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1;

-- name: ListRequestsByUser :many
SELECT r.*, u.full_name AS user_name FROM requests r JOIN users u ON u.id = r.user_id
WHERE r.user_id = $1 ORDER BY r.created_at DESC;

-- name: ListRequestsByDepartment :many
SELECT r.*, u.full_name AS user_name FROM requests r JOIN users u ON u.id = r.user_id
WHERE r.department_id = $1 ORDER BY r.created_at DESC;

-- name: ListAllRequests :many
SELECT r.*, u.full_name AS user_name FROM requests r JOIN users u ON u.id = r.user_id
ORDER BY r.created_at DESC;

-- name: UpdateRequestStatus :exec
UPDATE requests SET status = $2 WHERE id = $1;

-- name: AddHistory :exec
INSERT INTO request_history (request_id, status, actor_id, note) VALUES ($1,$2,$3,$4);

-- name: ListHistory :many
SELECT h.*, COALESCE(u.full_name,'System') AS actor_name
FROM request_history h LEFT JOIN users u ON u.id = h.actor_id
WHERE h.request_id = $1 ORDER BY h.at, h.id;

-- name: ListTasksByUser :many
SELECT t.*, u.full_name AS creator_name FROM tasks t JOIN users u ON u.id = t.created_by
WHERE t.assignee_id = $1 ORDER BY t.due_date;

-- name: ListTasksByDepartment :many
SELECT t.*, u.full_name AS creator_name FROM tasks t JOIN users u ON u.id = t.created_by
WHERE t.department_id = $1 ORDER BY t.due_date;

-- name: ListAllTasks :many
SELECT t.*, u.full_name AS creator_name FROM tasks t JOIN users u ON u.id = t.created_by
ORDER BY t.due_date;

-- name: CreateTask :one
INSERT INTO tasks (assignee_id, created_by, department_id, title, due_date)
VALUES ($1,$2,$3,$4,$5) RETURNING *;

-- name: UpdateTaskStatus :exec
UPDATE tasks SET status = $2 WHERE id = $1;

-- name: GetTask :one
SELECT * FROM tasks WHERE id = $1;

-- name: ListCourses :many
SELECT * FROM courses ORDER BY id;

-- name: GetCourse :one
SELECT * FROM courses WHERE id = $1;

-- name: ListQuestions :many
SELECT * FROM quiz_questions WHERE course_id = $1 ORDER BY id;

-- name: ListAssignmentsByUser :many
SELECT a.*, c.title_ru, c.title_kz, c.description_ru, c.description_kz
FROM course_assignments a JOIN courses c ON c.id = a.course_id
WHERE a.user_id = $1 ORDER BY a.assigned_at DESC;

-- name: GetAssignment :one
SELECT * FROM course_assignments WHERE course_id = $1 AND user_id = $2;

-- name: AssignCourse :exec
INSERT INTO course_assignments (course_id, user_id, assigned_by) VALUES ($1,$2,$3)
ON CONFLICT (course_id, user_id) DO NOTHING;

-- name: UpdateProgress :exec
UPDATE course_assignments SET progress = $3 WHERE course_id = $1 AND user_id = $2 AND progress < $3;

-- name: CompleteCourse :exec
UPDATE course_assignments SET progress = 100, score = $3, completed_at = now()
WHERE course_id = $1 AND user_id = $2;

-- name: CreateNotification :exec
INSERT INTO notifications (user_id, kind, title_ru, title_kz, link) VALUES ($1,$2,$3,$4,$5);

-- name: ListNotifications :many
SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50;

-- name: MarkNotificationRead :exec
UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2;

-- name: MarkAllRead :exec
UPDATE notifications SET read = true WHERE user_id = $1;

-- name: ListKB :many
SELECT * FROM kb_documents ORDER BY id;

-- name: CreateKB :one
INSERT INTO kb_documents (title, section, url, content, keywords, lang)
VALUES ($1,$2,$3,$4,$5,$6) RETURNING *;

-- name: DeleteKB :exec
DELETE FROM kb_documents WHERE id = $1;

-- name: CreateEscalation :one
INSERT INTO ai_escalations (user_id, question) VALUES ($1,$2) RETURNING *;

-- name: ListEscalations :many
SELECT e.*, u.full_name FROM ai_escalations e JOIN users u ON u.id = e.user_id ORDER BY e.created_at DESC;

-- name: AnalyticsRequests :many
SELECT status, COUNT(*)::int AS cnt FROM requests GROUP BY status;

-- name: AnalyticsDepartments :many
SELECT d.name_ru, d.name_kz,
  (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id)::int AS employees,
  (SELECT COUNT(*) FROM requests r WHERE r.department_id = d.id)::int AS requests,
  (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id AND t.status <> 'done')::int AS open_tasks
FROM departments d ORDER BY d.id;

-- name: AnalyticsLearning :one
SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE progress = 100)::int AS completed,
       COALESCE(AVG(progress),0)::float8 AS avg_progress
FROM course_assignments;
