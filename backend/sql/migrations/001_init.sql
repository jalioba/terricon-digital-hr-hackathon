-- JanaMen schema (also used by sqlc as schema source)

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ru TEXT NOT NULL,
  name_kz TEXT NOT NULL,
  description_ru TEXT NOT NULL DEFAULT '',
  description_kz TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee','manager','hr_admin')),
  department_id INT REFERENCES departments(id),
  manager_id INT REFERENCES users(id),
  company TEXT NOT NULL DEFAULT 'JanaPost',
  position TEXT NOT NULL,
  hired_at DATE NOT NULL,
  vacation_days_left INT NOT NULL DEFAULT 24,
  locale TEXT NOT NULL DEFAULT 'ru'
);

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('vacation','advance')),
  user_id INT NOT NULL REFERENCES users(id),
  department_id INT NOT NULL REFERENCES departments(id),
  date_from DATE,
  date_to DATE,
  days INT NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_history (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_id INT REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '',
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  assignee_id INT NOT NULL REFERENCES users(id),
  created_by INT NOT NULL REFERENCES users(id),
  department_id INT NOT NULL REFERENCES departments(id),
  title TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done'))
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title_ru TEXT NOT NULL,
  title_kz TEXT NOT NULL,
  description_ru TEXT NOT NULL,
  description_kz TEXT NOT NULL,
  content_ru TEXT NOT NULL,
  content_kz TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  question_ru TEXT NOT NULL,
  question_kz TEXT NOT NULL,
  options_ru TEXT[] NOT NULL,
  options_kz TEXT[] NOT NULL,
  correct_index INT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_assignments (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  progress INT NOT NULL DEFAULT 0,
  score INT,
  assigned_by INT REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title_ru TEXT NOT NULL,
  title_kz TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  section TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'ru'
);

CREATE TABLE IF NOT EXISTS ai_escalations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
