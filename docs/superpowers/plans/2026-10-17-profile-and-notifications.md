# Profile and Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full Profile page (`/profile`) with 1C:ZUP synchronization status, leave stats, and password change, along with the interactive Notification Center dropdown in the header.

**Architecture:**
- Backend: Expose `PUT /api/profile/password` verifying current password with bcrypt and updating password_hash in PostgreSQL.
- Frontend Header: Notification bell with badge, popover dropdown with category filters, "mark all read", and routing links.
- Frontend Profile: Comprehensive corporate dossier with KPI cards, leave balance, tenure calculation, activity summary, and password change modal/form.

**Tech Stack:** Go (chi, sqlc, bcrypt), PostgreSQL, Angular 19, SCSS, RxJS.

---

### Task 1: Backend Password Change Endpoint

**Files:**
- Modify: `backend/sql/queries/queries.sql`
- Modify: `backend/internal/modules/profile/handler.go`
- Modify: `backend/internal/http/router/router.go`

- [ ] **Step 1: Add UpdatePassword query to `backend/sql/queries/queries.sql`**
```sql
-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;
```
Run `sqlc generate`.

- [ ] **Step 2: Implement ChangePassword in `backend/internal/modules/profile/handler.go`**
Verify current password, hash new password with `bcrypt.DefaultCost`, update DB, return JSON response.

- [ ] **Step 3: Register route in `backend/internal/http/router/router.go`**
`p.Put("/profile/password", profH.ChangePassword)`

- [ ] **Step 4: Compile and test backend**
`go build ./cmd/api`

- [ ] **Step 5: Commit Task 1**

---

### Task 2: Frontend Notification Center in Header

**Files:**
- Modify: `frontend/src/app/shared/components/header/header.component.ts`
- Modify: `frontend/src/app/shared/components/header/header.component.html`
- Modify: `frontend/src/app/shared/components/header/header.component.scss`

- [ ] **Step 1: Wire NotificationService in HeaderComponent**
Inject `NotificationService`, load notifications on init, compute unreadCount, toggle notification popover signal.

- [ ] **Step 2: Update Header HTML with Notification Bell and Popover**
Render bell icon with unread count badge, popover container with notification items, "mark all as read" button, empty state, and navigate-on-click logic.

- [ ] **Step 3: Style popover in Header SCSS**
Clean floating popover with arrow, subtle shadow, unread item highlight, and responsive handling.

- [ ] **Step 4: Commit Task 2**

---

### Task 3: Frontend Profile Feature Page

**Files:**
- Create: `frontend/src/app/features/profile/profile.component.ts`
- Create: `frontend/src/app/features/profile/profile.component.html`
- Create: `frontend/src/app/features/profile/profile.component.scss`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Create ProfileComponent Typescript**
Load profile via `GET /api/me`, compute tenure (стаж) from `hired_at`, manage password change form state and submission.

- [ ] **Step 2: Create ProfileComponent Template**
Hero section with avatar and 1C:ZUP badge, KPI cards (vacation days left, tenure, department, position), activity summary, and password change card.

- [ ] **Step 3: Style ProfileComponent SCSS**
Corporate modern styling matching JanaMen design system.

- [ ] **Step 4: Update `app.routes.ts`**
Replace `PlaceholderComponent` with `ProfileComponent`.

- [ ] **Step 5: Test compilation**
`bun run build`

- [ ] **Step 6: Commit Task 3**

---

### Task 4: Integration, Restart Services & End-to-End Verification

**Files:**
- Restart backend process.
- Browser test in browser_subagent:
  - Test Notification popover: open, view items, click item to navigate, mark all read.
  - Test Profile page: view dossier, verify vacation days and tenure, test changing password and logging in with new password.
