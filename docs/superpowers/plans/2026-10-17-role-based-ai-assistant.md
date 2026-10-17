# Role-Based AI Assistant with Hybrid Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the dedicated AI Assistant tab (`/ai`) providing role-based data access (Employee, Manager, HR) with strict Q&A-only guardrails, zero actions execution, and a hybrid engine supporting offline built-in RAG and optional Google Gemini 1.5 Flash.

**Architecture:** 
- The backend `POST /api/ai/chat` inspects authenticated user claims, enforces action & PII guardrails, gathers live DB role context (vacation days, tasks, requests, team members), and generates grounded answers using either Gemini 1.5 Flash (when API key provided) or the built-in deterministic RAG engine.
- The Angular frontend introduces `AiComponent` on `/ai`, featuring role-tailored quick prompt chips, real-time message stream, source citations, API key modal with `localStorage` persistence, and clear disclaimers.

**Tech Stack:** Go (chi, sqlc, net/http), PostgreSQL (Supabase), Angular 19 (Standalone, Signals, SCSS, RxJS).

---

### Task 1: Backend Role-Context Queries, Guardrails & Hybrid Engine

**Files:**
- Modify: `backend/sql/queries/queries.sql`
- Modify: `backend/internal/modules/ai/handler.go`
- Test: `backend/internal/modules/ai/ai_test.go`

- [ ] **Step 1: Write backend tests for AI guardrails and role-based responses**

Update `backend/internal/modules/ai/ai_test.go` to test action command rejection, PII blocking, and role-based data responses:

```go
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kilcdevs/janamen/internal/middleware"
)

func TestAIGuardrailsActionRefusal(t *testing.T) {
	h := &Handler{}
	reqBody := `{"message":"удали сотрудника с базы"}`
	req := httptest.NewRequest("POST", "/api/ai/chat", bytes.NewBufferString(reqBody))
	req.Header.Set("Content-Type", "application/json")
	
	ctx := context.WithValue(req.Context(), middleware.ClaimsKey, &middleware.Claims{
		UserID: 1, Role: "hr", FullName: "HR Director",
	})
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	h.Chat(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp ChatResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if resp.Provider != "guardrail:action_shield" {
		t.Errorf("expected provider guardrail:action_shield, got %s", resp.Provider)
	}
}
```

- [ ] **Step 2: Add queries to `backend/sql/queries/queries.sql`**

Ensure queries exist for quick context gathering:
```sql
-- name: GetUserStatsForAI :one
SELECT u.id, u.full_name, u.role, u.department_id, u.position, u.vacation_days_left,
       COALESCE(d.name_ru, '') as department_name
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
WHERE u.id = $1;

-- name: CountUserTasksByStatus :many
SELECT status, COUNT(*) as count
FROM tasks
WHERE assigned_to = $1
GROUP BY status;

-- name: CountDepartmentTasksByStatus :many
SELECT status, COUNT(*) as count
FROM tasks
WHERE department_id = $1
GROUP BY status;

-- name: CountUserRequestsByStatus :many
SELECT status, COUNT(*) as count
FROM requests
WHERE user_id = $1
GROUP BY status;

-- name: CountDepartmentRequestsByStatus :many
SELECT status, COUNT(*) as count
FROM requests
WHERE department_id = $1
GROUP BY status;

-- name: GetCompanyStatsForAI :one
SELECT 
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM departments) as total_departments,
  (SELECT COUNT(*) FROM requests WHERE status = 'pending') as pending_requests,
  (SELECT COUNT(*) FROM tasks WHERE status = 'in_progress') as active_tasks;
```

Run sqlc: `sqlc generate` in `backend/`.

- [ ] **Step 3: Enhance `backend/internal/modules/ai/handler.go`**

Implement:
1. `detectActionCommand(query string) bool`: Detects verbs like "создай", "удали", "измени", "начисли", "одобри", "переведи", "отклони", "сделай" and returns immediate guardrail rejection message.
2. `detectPIIorUnauthorized(role string, query string) (bool, string)`: Blocks cross-department or colleague salary questions.
3. `buildRoleContext(ctx context.Context, claims *middleware.Claims, query string) (string, string)`:
   - For `employee`: pulls personal vacation balance, active tasks, active requests, KB.
   - For `manager`: personal data + department team count/names, department tasks, department requests waiting for approval.
   - For `hr`: full company metrics, all departments, all pending requests.
4. Integrate hybrid logic:
   - If `req.ApiKey != ""` (or fallback to environment variable `GEMINI_API_KEY`), call `callGeminiWithContext`.
   - If no key or error, synthesize answer using built-in deterministic RAG generator citing source.

- [ ] **Step 4: Run backend tests and verify build**

Run: `go test ./internal/modules/ai/...`
Run: `go build ./cmd/api`
Expected: PASS and clean build.

- [ ] **Step 5: Commit Task 1 changes**

```bash
git add backend/
git commit -m "feat(backend): implement role-based context and action guardrails in AI handler"
```

---

### Task 2: Frontend AI Service & Component

**Files:**
- Create: `frontend/src/app/core/services/ai.service.ts`
- Create: `frontend/src/app/features/ai/ai.component.ts`
- Create: `frontend/src/app/features/ai/ai.component.html`
- Create: `frontend/src/app/features/ai/ai.component.scss`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Create `frontend/src/app/core/services/ai.service.ts`**

Define interface `ChatMessage`, `ChatRequest`, `ChatResponse` and methods:
- `sendMessage(message: string, apiKey?: string, lang?: string): Observable<ChatResponse>`
- `getStoredApiKey(): string`
- `setStoredApiKey(key: string): void`
- `clearStoredApiKey(): void`

- [ ] **Step 2: Create `frontend/src/app/features/ai/ai.component.ts`**

Implement component with Angular Signals:
- State signals: `messages = signal<ChatMessage[]>([])`, `isLoading = signal(false)`, `apiKey = signal('')`, `isKeyModalOpen = signal(false)`, `inputText = signal('')`.
- Quick prompt chips computed based on `authService.currentUser()?.role`:
  - `employee`: "Сколько у меня дней отпуска?", "Какие у меня текущие задачи?", "Как рассчитывается отпуск?", "Условия получения аванса"
  - `manager`: "Кто в моем отделе?", "Какие задачи отдела сейчас в работе?", "Есть ли заявки на согласовании?", "Порядок согласования отпуска"
  - `hr`: "Сколько сотрудников в компании?", "Сводка по заявкам сотрудников", "Список отделов компании", "Регламенты базы знаний"
- Methods: `sendMessage(text?: string)`, `openKeyModal()`, `saveKey()`, `removeKey()`, `clearChat()`.

- [ ] **Step 3: Create `frontend/src/app/features/ai/ai.component.html`**

Structure layout:
- Header bar: Title "Jana AI Ассистент", Status pill (Online), Engine Badge ("Встроенный движок (0 ₸)" or "Google Gemini 1.5 Flash"), Actions ("Ключ Gemini", "Очистить").
- Welcome banner & Role Quick Prompt chips.
- Message list: user message bubble vs AI assistant bubble with source tag and provider badge.
- Loading indicator ("Ассистент думает...").
- Input box with Send button.
- Security disclaimer footer.
- API Key configuration modal.

- [ ] **Step 4: Create `frontend/src/app/features/ai/ai.component.scss`**

Style with JanaMen modern theme:
- Clean card bubbles, responsive layout, smooth scroll.
- Distinct source tags (`badge-blue` for DB data, `badge-green` for regulations).
- Modal styles matching design system.

- [ ] **Step 5: Update `frontend/src/app/app.routes.ts`**

Replace `PlaceholderComponent` for `/ai`:
```typescript
import { AiComponent } from './features/ai/ai.component';
// ...
{ path: 'ai', component: AiComponent, data: { title: 'Jana AI Ассистент', icon: 'bot' } },
```

- [ ] **Step 6: Verify frontend build**

Run: `bun run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 7: Commit Task 2 changes**

```bash
git add frontend/
git commit -m "feat(frontend): create role-based AiComponent with quick prompts and Gemini settings"
```

---

### Task 3: Integration, Restart Services & End-to-End Verification

**Files:**
- Restart backend process `task-1671` with new binary.
- Test in browser.

- [ ] **Step 1: Restart Go backend**
Build and restart backend daemon on `http://localhost:8080`.

- [ ] **Step 2: End-to-End Browser Verification**
Using browser automation:
1. Log in as Employee (`990202300777`):
   - Navigate to `/ai`.
   - Verify role chips show employee prompts.
   - Ask "Сколько у меня дней отпуска?" -> verify response shows exact vacation days from DB with source tag.
   - Test action refusal: Type "удали задачу" -> verify AI refuses to perform actions and explains its advisory role.
2. Log in as Manager (`850303300888`):
   - Navigate to `/ai`.
   - Ask "Кто в моем отделе?" -> verify response lists department members.
   - Ask "Какие задачи отдела в работе?" -> verify response summarizes department tasks.
3. Log in as HR (`880101300555`):
   - Navigate to `/ai`.
   - Ask "Сколько сотрудников в компании?" -> verify company-wide user count.
4. Test Gemini Key modal:
   - Open modal, verify input field and instructions.
   - Verify engine badge updates when key is saved / removed.

- [ ] **Step 3: Commit Task 3 changes and capture demonstration recording**
Record browser session and commit final adjustments.
