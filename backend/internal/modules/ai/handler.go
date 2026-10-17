package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
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

type ChatRequest struct {
	Message  string `json:"message"`
	Provider string `json:"provider"` // "builtin", "gemini", "openai", "groq", "local"
	ApiKey   string `json:"api_key,omitempty"`
	Lang     string `json:"lang,omitempty"` // ru or kz
}

type ChatResponse struct {
	Reply       string       `json:"reply"`
	SourceDoc   string       `json:"source_doc,omitempty"`
	SourceSec   string       `json:"source_section,omitempty"`
	SourceUrl   string       `json:"source_url,omitempty"`
	Confidence  float64      `json:"confidence"`
	CanEscalate bool         `json:"can_escalate"`
	Provider    string       `json:"provider"`
	MatchedDocs []db.KbDocument `json:"matched_docs,omitempty"`
}

func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Message) == "" {
		httputil.Error(w, http.StatusBadRequest, "message is required")
		return
	}

	query := strings.TrimSpace(req.Message)
	lowerQuery := strings.ToLower(query)

	// Guardrail 1: Sensitive PII / Colleague salary check
	confidentialTerms := []string{
		"зарплат колле", "оклад колле", "сколько получает", "зарплата начальник", "оклад директор",
		"жалақы әріптес", "айлық әріптес", "бастықтың жалақысы", "құпия деректер", "пароли других",
	}
	for _, term := range confidentialTerms {
		if strings.Contains(lowerQuery, term) {
			httputil.JSON(w, http.StatusOK, ChatResponse{
				Reply:       "Информация о заработной плате и персональных данных сотрудников является строго конфиденциальной и защищена регламентом безопасности JanaPost. Доступ к персональным данным коллег запрещён.",
				Confidence:  1.0,
				CanEscalate: false,
				Provider:    "guardrail:pii_shield",
			})
			return
		}
	}

	// Retrieve all KB documents
	docs, err := h.q.ListKB(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to query knowledge base: "+err.Error())
		return
	}

	// Score documents by keyword overlap
	words := strings.Fields(lowerQuery)
	var bestDoc *db.KbDocument
	var bestScore int

	for _, doc := range docs {
		score := 0
		docText := strings.ToLower(doc.Title + " " + doc.Section + " " + doc.Keywords + " " + doc.Content)
		for _, w := range words {
			cleanW := strings.Trim(w, "?!.,;:()\"'")
			if len(cleanW) >= 3 && strings.Contains(docText, cleanW) {
				score += 2
				if strings.Contains(strings.ToLower(doc.Keywords), cleanW) {
					score += 3
				}
			}
		}
		if score > bestScore {
			bestScore = score
			d := doc
			bestDoc = &d
		}
	}

	// Guardrail 2: If no relevant KB document found or score too low -> refuse to hallucinate
	if bestDoc == nil || bestScore < 2 {
		httputil.JSON(w, http.StatusOK, ChatResponse{
			Reply:       "В официальной базе знаний JanaPost нет подтверждённой информации по вашему вопросу. AI Jana не придумывает регламенты от себя. Вы можете направить вопрос в кадровую службу.",
			Confidence:  0.0,
			CanEscalate: true,
			Provider:    "guardrail:no_hallucination",
		})
		return
	}

	// If user provided Gemini/OpenAI API key and chose external provider
	if (req.Provider == "gemini" || req.Provider == "openai" || req.Provider == "groq") && req.ApiKey != "" {
		externalReply, err := callExternalLLM(req.Provider, req.ApiKey, query, bestDoc)
		if err == nil && externalReply != "" {
			httputil.JSON(w, http.StatusOK, ChatResponse{
				Reply:       externalReply,
				SourceDoc:   bestDoc.Title,
				SourceSec:   bestDoc.Section,
				SourceUrl:   bestDoc.Url,
				Confidence:  0.95,
				CanEscalate: false,
				Provider:    req.Provider + " (augmented RAG)",
			})
			return
		}
	}

	// Built-in intelligent RAG response (fast, deterministic, zero-hallucination)
	replyText := fmt.Sprintf("%s\n\n📄 Источник: «%s», %s", bestDoc.Content, bestDoc.Title, bestDoc.Section)
	if req.Lang == "kz" {
		replyText = fmt.Sprintf("%s\n\n📄 Дереккөз: «%s», %s", bestDoc.Content, bestDoc.Title, bestDoc.Section)
	}

	httputil.JSON(w, http.StatusOK, ChatResponse{
		Reply:       replyText,
		SourceDoc:   bestDoc.Title,
		SourceSec:   bestDoc.Section,
		SourceUrl:   bestDoc.Url,
		Confidence:  float64(bestScore) / 10.0,
		CanEscalate: false,
		Provider:    "builtin:janamen_rag",
		MatchedDocs: []db.KbDocument{*bestDoc},
	})
}

func callExternalLLM(provider, apiKey, query string, doc *db.KbDocument) (string, error) {
	prompt := fmt.Sprintf(`Ты корпоративный HR-ассистент AI Jana платформы JanaPost.
Ответь на вопрос сотрудника, опираясь ИСКЛЮЧИТЕЛЬНО на официальный регламент ниже.
Не выдумывай факты. Если в тексте нет ответа, скажи, что нет данных.
В конце ответа ОБЯЗАТЕЛЬНО укажи:
"Источник: %s, %s"

ОФИЦИАЛЬНЫЙ РЕГЛАМЕНТ:
Название: %s
Раздел: %s
Текст: %s

ВОПРОС СОТРУДНИКА: %s`, doc.Title, doc.Section, doc.Title, doc.Section, doc.Content, query)

	if provider == "gemini" {
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=%s", apiKey)
		payload := map[string]interface{}{
			"contents": []map[string]interface{}{
				{"parts": []map[string]string{{"text": prompt}}},
			},
		}
		body, _ := json.Marshal(payload)
		resp, err := http.Post(url, "application/json", bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		respBytes, _ := io.ReadAll(resp.Body)
		var res struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}
		if err := json.Unmarshal(respBytes, &res); err == nil && len(res.Candidates) > 0 && len(res.Candidates[0].Content.Parts) > 0 {
			return res.Candidates[0].Content.Parts[0].Text, nil
		}
	}
	return "", fmt.Errorf("provider error")
}

type EscalateRequest struct {
	Question string `json:"question"`
}

func (h *Handler) Escalate(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req EscalateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Question) == "" {
		httputil.Error(w, http.StatusBadRequest, "question is required")
		return
	}

	esc, err := h.q.CreateEscalation(r.Context(), db.CreateEscalationParams{
		UserID:   c.UserID,
		Question: req.Question,
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create escalation: "+err.Error())
		return
	}

	// Notify HR Director (find HR user)
	_ = h.q.CreateNotification(r.Context(), db.CreateNotificationParams{
		UserID:  1,
		Kind:    "escalation",
		Title:   fmt.Sprintf("Новое обращение к HR от %s", c.FullName),
		Message: req.Question,
		Link:    "/admin/escalations",
	})

	httputil.JSON(w, http.StatusCreated, map[string]interface{}{
		"status":        "created",
		"escalation_id": esc.ID,
		"message":       "Ваше обращение передано в кадровую службу. HR свяжется с вами в течение рабочего дня.",
	})
}

func (h *Handler) ListKB(w http.ResponseWriter, r *http.Request) {
	docs, err := h.q.ListKB(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, docs)
}

func (h *Handler) CreateKB(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || c.Role != "hr" {
		httputil.Error(w, http.StatusForbidden, "forbidden: only HR admin can add KB documents")
		return
	}

	var input db.CreateKBParams
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}

	doc, err := h.q.CreateKB(r.Context(), input)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, doc)
}

func (h *Handler) DeleteKB(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || c.Role != "hr" {
		httputil.Error(w, http.StatusForbidden, "forbidden: only HR admin can delete KB documents")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.q.DeleteKB(r.Context(), id); err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) ListEscalations(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r.Context())
	if c == nil || c.Role != "hr" {
		httputil.Error(w, http.StatusForbidden, "forbidden: only HR admin can view escalations")
		return
	}

	escs, err := h.q.ListEscalations(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, escs)
}
