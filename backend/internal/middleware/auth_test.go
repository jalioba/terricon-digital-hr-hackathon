package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGenerateAndParseToken(t *testing.T) {
	secret := "test-secret-123456"
	deptID := 1
	claims := Claims{
		UserID:       5,
		IIN:          "010203500123",
		FullName:     "Алия Бекова",
		Role:         "employee",
		DepartmentID: &deptID,
	}

	tokenStr, err := GenerateToken(secret, claims)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Verify AuthMiddleware extracts claims
	handler := AuthMiddleware(secret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := GetClaims(r.Context())
		if c == nil {
			t.Fatal("claims expected in context, got nil")
		}
		if c.UserID != 5 || c.Role != "employee" || c.IIN != "010203500123" {
			t.Fatalf("unexpected claims: %+v", c)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestRequireRole(t *testing.T) {
	secret := "test-secret"
	employeeClaims := Claims{UserID: 5, Role: "employee"}
	tokenStr, _ := GenerateToken(secret, employeeClaims)

	// Protected handler requiring manager or hr
	protected := AuthMiddleware(secret)(RequireRole("manager", "hr")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	req := httptest.NewRequest("GET", "/admin/metrics", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()

	protected.ServeHTTP(rec, req)

	// Employee must get 403 Forbidden!
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for employee accessing manager route, got %d", rec.Code)
	}
}
