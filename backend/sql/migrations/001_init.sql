-- Clean schema setup for JanaMen Digital HR platform

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name_ru TEXT NOT NULL,
  name_kz TEXT NOT NULL,
  description_ru TEXT NOT NULL DEFAULT '',
  description_kz TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  iin VARCHAR(12) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('employee', 'manager', 'hr')),
  department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  company TEXT NOT NULL DEFAULT 'JanaPost',
  position TEXT NOT NULL DEFAULT '',
  hired_at DATE NOT NULL DEFAULT CURRENT_DATE,
  vacation_days_left INT NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('vacation', 'advance')),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INT NOT NULL REFERENCES departments(id),
  date_from DATE,
  date_to DATE,
  days_count INT NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  desired_date DATE,
  document_url TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  manager_comment TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revision_needed', 'rejected')),
  approved_by INT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_history (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  actor_id INT REFERENCES users(id),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department_id INT NOT NULL REFERENCES departments(id),
  created_by INT NOT NULL REFERENCES users(id),
  assigned_to INT NOT NULL REFERENCES users(id),
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title_ru TEXT NOT NULL,
  title_kz TEXT NOT NULL,
  description_ru TEXT NOT NULL DEFAULT '',
  description_kz TEXT NOT NULL DEFAULT ''
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
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress INT NOT NULL DEFAULT 0,
  score INT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(course_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
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
  lang VARCHAR(10) NOT NULL DEFAULT 'ru'
);

CREATE TABLE IF NOT EXISTS ai_escalations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
