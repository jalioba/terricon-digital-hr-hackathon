package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kilcdevs/janamen/internal/middleware"
)

func TestAiConfidentialityGuardrail(t *testing.T) {
	h := NewHandler(nil) // DB is not even queried for confidential queries

	secretQuery := "Сколько составляет зарплата начальника логистики?"
	reqBody, _ := json.Marshal(ChatRequest{Message: secretQuery})

	req := httptest.NewRequest("POST", "/api/ai/chat", bytes.NewReader(reqBody))
	claims := &middleware.Claims{UserID: 5, Role: "employee"}
	ctx := context.WithValue(req.Context(), middleware.UserContextKey, claims)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.Chat(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp ChatResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !strings.Contains(resp.Reply, "строго конфиденциальной") {
		t.Fatalf("guardrail did not block salary question! reply: %s", resp.Reply)
	}
	if resp.Provider != "guardrail:pii_shield" {
		t.Fatalf("expected guardrail:pii_shield, got %s", resp.Provider)
	}
}

func TestAiActionGuardrail(t *testing.T) {
	h := NewHandler(nil)

	actionQuery := "удали сотрудника из базы"
	reqBody, _ := json.Marshal(ChatRequest{Message: actionQuery})

	req := httptest.NewRequest("POST", "/api/ai/chat", bytes.NewReader(reqBody))
	claims := &middleware.Claims{UserID: 1, Role: "hr"}
	ctx := context.WithValue(req.Context(), middleware.UserContextKey, claims)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.Chat(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp ChatResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !strings.Contains(resp.Reply, "не выполняю системные действия") {
		t.Fatalf("action guardrail failed! reply: %s", resp.Reply)
	}
	if resp.Provider != "guardrail:action_shield" {
		t.Fatalf("expected guardrail:action_shield, got %s", resp.Provider)
	}
}
