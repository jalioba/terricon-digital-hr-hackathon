package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kilcdevs/janamen/internal/config"
	"github.com/kilcdevs/janamen/internal/db"
	"github.com/kilcdevs/janamen/internal/http/router"
	"github.com/kilcdevs/janamen/internal/integrations/documentolog"
	"github.com/kilcdevs/janamen/internal/integrations/zup1c"
)

func setupTestApp(t *testing.T) (http.Handler, *db.Queries) {
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		t.Skip("DATABASE_URL is not set, skipping live database e2e test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}
	t.Cleanup(func() { pool.Close() })

	queries := db.New(pool)
	r := router.NewRouter(cfg, queries, zup1c.NewMock(), documentolog.NewMock())
	return r, queries
}

func doJSON(t *testing.T, handler http.Handler, method, path, token string, body interface{}) (*http.Response, map[string]interface{}) {
	var bodyReader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal body: %v", err)
		}
		bodyReader = bytes.NewReader(b)
	} else {
		bodyReader = bytes.NewReader([]byte{})
	}

	req := httptest.NewRequest(method, path, bodyReader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	var resData map[string]interface{}
	_ = json.NewDecoder(res.Body).Decode(&resData)
	return res, resData
}

func TestE2E_FullFlow(t *testing.T) {
	handler, _ := setupTestApp(t)

	// Generate unique 12-digit IINs for this test run
	suffix := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	mgrIIN := "900101" + suffix
	empIIN := "020101" + suffix

	// 1. HR Login with pre-seeded credentials: IIN 880101300555 / JanaMen2026!
	res, data := doJSON(t, handler, "POST", "/api/auth/login", "", map[string]string{
		"iin":      "880101300555",
		"password": "JanaMen2026!",
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 HR login, got %d. resp: %+v", res.StatusCode, data)
	}
	hrToken, ok := data["token"].(string)
	if !ok || hrToken == "" {
		t.Fatalf("expected token from login, got %+v", data)
	}

	// Verify profile
	profile, _ := data["profile"].(map[string]interface{})
	if profile["role"] != "hr" {
		t.Fatalf("expected role 'hr', got %v", profile["role"])
	}

	// 2. HR creates Manager for Supply Department (Department ID 1)
	dept1 := 1
	res, data = doJSON(t, handler, "POST", "/api/hr/employees", hrToken, map[string]interface{}{
		"iin":                mgrIIN,
		"password":           "managerPass123",
		"full_name":          "Ерлан Нұрланов",
		"role":               "manager",
		"department_id":      dept1,
		"position":           "Руководитель отдела поставок",
		"vacation_days_left": 24,
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created for manager, got %d: %+v", res.StatusCode, data)
	}

	// 3. HR creates Employee for Supply Department (Department ID 1)
	res, data = doJSON(t, handler, "POST", "/api/hr/employees", hrToken, map[string]interface{}{
		"iin":                empIIN,
		"password":           "employeePass123",
		"full_name":          "Алия Бекова",
		"role":               "employee",
		"department_id":      dept1,
		"position":           "Специалист по поставкам",
		"vacation_days_left": 24,
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created for employee, got %d: %+v", res.StatusCode, data)
	}

	// 4. Employee logs in with IIN and Password
	res, data = doJSON(t, handler, "POST", "/api/auth/login", "", map[string]string{
		"iin":      empIIN,
		"password": "employeePass123",
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 employee login, got %d: %+v", res.StatusCode, data)
	}
	empToken, _ := data["token"].(string)

	// 5. Employee submits vacation request exceeding balance -> must fail with 400
	dateFrom := "2026-11-01"
	dateTo := "2026-12-01"
	isPaid := true
	res, _ = doJSON(t, handler, "POST", "/api/requests", empToken, map[string]interface{}{
		"type":        "vacation",
		"date_from":   &dateFrom,
		"date_to":     &dateTo,
		"days_count":  35, // exceeds 24 days!
		"is_paid":     &isPaid,
		"comment":     "Слишком длинный отпуск",
	})
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request when vacation days exceed balance, got %d", res.StatusCode)
	}

	// 6. Employee submits valid vacation request for 5 days
	res, data = doJSON(t, handler, "POST", "/api/requests", empToken, map[string]interface{}{
		"type":        "vacation",
		"date_from":   &dateFrom,
		"date_to":     &dateTo,
		"days_count":  5,
		"is_paid":     &isPaid,
		"comment":     "Семейная поездка",
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created for vacation request, got %d: %+v", res.StatusCode, data)
	}
	reqIDFloat, ok := data["id"].(float64)
	if !ok {
		t.Fatalf("expected request id, got %+v", data)
	}
	reqID := int(reqIDFloat)

	// 7. Manager logs in
	res, data = doJSON(t, handler, "POST", "/api/auth/login", "", map[string]string{
		"iin":      mgrIIN,
		"password": "managerPass123",
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 manager login, got %d: %+v", res.StatusCode, data)
	}
	mgrToken, _ := data["token"].(string)

	// 8. Manager approves employee's request
	res, data = doJSON(t, handler, "POST", "/api/requests/"+jsonNumber(reqID)+"/decision", mgrToken, map[string]string{
		"decision":        "approved",
		"manager_comment": "Согласовано, хорошего отдыха!",
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for decision approval, got %d: %+v", res.StatusCode, data)
	}

	// 9. Verify employee vacation balance was deducted (24 - 5 = 19)
	res, data = doJSON(t, handler, "GET", "/api/me", empToken, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for /api/me, got %d", res.StatusCode)
	}
	pMap := data["profile"].(map[string]interface{})
	daysLeft := int(pMap["vacation_days_left"].(float64))
	if daysLeft != 19 {
		t.Fatalf("expected 19 vacation days left, got %d", daysLeft)
	}

	// 10. Manager assigns a task to employee
	dueDate := "2026-10-30"
	empID := int(pMap["id"].(float64))
	res, data = doJSON(t, handler, "POST", "/api/tasks", mgrToken, map[string]interface{}{
		"assignee_id": empID,
		"title":       "Сверить поставки по клиентам",
		"description": "Проверить статус доставок за неделю",
		"due_date":    &dueDate,
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created for task, got %d: %+v", res.StatusCode, data)
	}
	taskID := int(data["id"].(float64))

	// 11. Employee marks task in_progress
	res, _ = doJSON(t, handler, "PUT", "/api/tasks/"+jsonNumber(taskID)+"/status", empToken, map[string]string{
		"status": "in_progress",
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for updating task status, got %d", res.StatusCode)
	}

	// 12. HR checks analytics & approvals audit
	res, data = doJSON(t, handler, "GET", "/api/hr/analytics", hrToken, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for HR analytics, got %d", res.StatusCode)
	}
	auditList, _ := data["approvals_audit"].([]interface{})
	if len(auditList) == 0 {
		t.Fatalf("expected approvals audit to have at least 1 record, got 0")
	}
}

func TestE2E_RBAC_DepartmentIsolation(t *testing.T) {
	handler, _ := setupTestApp(t)

	// 1. HR creates Manager for Logistics Department (Department 2)
	res, _ := doJSON(t, handler, "POST", "/api/auth/login", "", map[string]string{
		"iin":      "880101300555",
		"password": "JanaMen2026!",
	})
	hrToken := res.Header.Get("Authorization")
	// If login returned token in json body:
	var hrLoginData map[string]interface{}
	// Re-do to parse body:
	_, hrLoginData = doJSON(t, handler, "POST", "/api/auth/login", "", map[string]string{
		"iin":      "880101300555",
		"password": "JanaMen2026!",
	})
	hrToken = hrLoginData["token"].(string)

	suffix := fmt.Sprintf("%06d", (time.Now().UnixNano()+777)%1000000)
	logisticsIIN := "910202" + suffix

	dept2 := 2
	_, _ = doJSON(t, handler, "POST", "/api/hr/employees", hrToken, map[string]interface{}{
		"iin":                logisticsIIN,
		"password":           "logisticsMgrPass",
		"full_name":          "Марат Жумабеков",
		"role":               "manager",
		"department_id":      dept2,
		"position":           "Руководитель отдела логистики",
		"vacation_days_left": 20,
	})

	// 2. Logistics Manager logs in
	res, data := doJSON(t, handler, "POST", "/api/auth/login", "", map[string]string{
		"iin":      logisticsIIN,
		"password": "logisticsMgrPass",
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("failed logistics manager login: %d", res.StatusCode)
	}
	logisticsMgrToken := data["token"].(string)

	// 3. Logistics Manager tries to view Request ID 1 (which belongs to Supply department)
	// Must return 403 Forbidden!
	res, _ = doJSON(t, handler, "GET", "/api/requests/1", logisticsMgrToken, nil)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("SECURITY VIOLATION: Manager of Department 2 accessed Department 1 request! Expected 403, got %d", res.StatusCode)
	}

	// 4. Logistics Manager tries to approve Request ID 1
	// Must return 403 Forbidden!
	res, _ = doJSON(t, handler, "POST", "/api/requests/1/decision", logisticsMgrToken, map[string]string{
		"decision":        "approved",
		"manager_comment": "Взлом",
	})
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("SECURITY VIOLATION: Manager of Department 2 approved Department 1 request! Expected 403, got %d", res.StatusCode)
	}

	// 5. Employee tries to view /api/hr/employees or /api/requests/department
	_, empData := doJSON(t, handler, "POST", "/api/auth/login", "", map[string]string{
		"iin":      "020101500222",
		"password": "employeePass123",
	})
	empToken := empData["token"].(string)

	res, _ = doJSON(t, handler, "GET", "/api/requests/department", empToken, nil)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for employee accessing department requests, got %d", res.StatusCode)
	}

	res, _ = doJSON(t, handler, "GET", "/api/hr/employees", empToken, nil)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for employee accessing HR employee list, got %d", res.StatusCode)
	}
}

func jsonNumber(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
