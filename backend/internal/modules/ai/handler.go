package ai

import (
	"bytes"
	"context"
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
	Provider string `json:"provider,omitempty"` // "builtin", "gemini", etc.
	ApiKey   string `json:"api_key,omitempty"`
	Lang     string `json:"lang,omitempty"` // "ru" or "kz"
}

type ChatResponse struct {
	Reply       string          `json:"reply"`
	SourceDoc   string          `json:"source_doc,omitempty"`
	SourceSec   string          `json:"source_section,omitempty"`
	SourceUrl   string          `json:"source_url,omitempty"`
	Confidence  float64         `json:"confidence"`
	CanEscalate bool            `json:"can_escalate"`
	Provider    string          `json:"provider"`
	MatchedDocs []db.KbDocument `json:"matched_docs,omitempty"`
}

func isActionCommand(lowerQuery string) bool {
	proceduralPrefixes := []string{
		"как ", "қалай ", "порядок ", "правила ", "инструкция ", "условия ", "какие ", "что нужно для ", "где найти ",
	}
	for _, p := range proceduralPrefixes {
		if strings.Contains(lowerQuery, p) {
			return false
		}
	}

	actionVerbs := []string{
		"создай", "удали", "уволь", "измени", "начисли", "одобри",
		"переведи задачу", "переведи деньги", "отклони", "добавь сотрудника", "добавь пользователя",
		"заблокируй", "зарегистрируй", "қос", "өшір", "бекіт", "жұмыстан шығар", "өшір",
	}
	for _, v := range actionVerbs {
		if strings.Contains(lowerQuery, v) {
			return true
		}
	}
	return false
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

	// Guardrail 1: Strictly reject action commands
	if isActionCommand(lowerQuery) {
		httputil.JSON(w, http.StatusOK, ChatResponse{
			Reply: "Я корпоративный консультант JanaMen. Я отвечаю исключительно на информационные вопросы и не выполняю системные действия или изменения в базе данных.\n\nВы можете выполнить необходимое действие вручную в соответствующем разделе меню («Задачи», «Заявки» или «Сотрудники»).",
			Confidence:  1.0,
			CanEscalate: false,
			Provider:    "guardrail:action_shield",
		})
		return
	}

	// Guardrail 2: Sensitive PII / Colleague salary check
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

	// Guardrail 3: Cross-department role protection for employees
	if c.Role == "employee" && (strings.Contains(lowerQuery, "чужой отдел") || strings.Contains(lowerQuery, "другой отдел")) {
		httputil.JSON(w, http.StatusOK, ChatResponse{
			Reply:       "У вас нет прав доступа к информации других подразделений. Вы можете просматривать данные только своего профиля и регламенты компании.",
			Confidence:  1.0,
			CanEscalate: false,
			Provider:    "guardrail:role_shield",
		})
		return
	}

	// Try DB role-context synthesis if h.q is available
	if h.q != nil {
		handled, resp := h.tryAnswerFromLiveDB(r.Context(), c, query, lowerQuery, req)
		if handled {
			httputil.JSON(w, http.StatusOK, resp)
			return
		}
	}

	// Otherwise, fallback to Knowledge Base RAG
	if h.q == nil {
		httputil.JSON(w, http.StatusOK, ChatResponse{
			Reply:      "База данных временно недоступна.",
			Confidence: 0.0,
			Provider:   "builtin:error",
		})
		return
	}

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

	if bestDoc == nil || bestScore < 2 {
		httputil.JSON(w, http.StatusOK, ChatResponse{
			Reply:       "В официальной базе знаний JanaPost нет подтверждённой информации по вашему вопросу. Корпоративный AI-ассистент отвечает только по подтвержденным регламентам. Вы можете направить обращение в кадровую службу.",
			Confidence:  0.0,
			CanEscalate: true,
			Provider:    "guardrail:no_hallucination",
		})
		return
	}

	// Check if Gemini API key provided
	if req.ApiKey != "" {
		externalReply, err := callExternalLLMWithText("gemini", req.ApiKey, query, bestDoc.Content, bestDoc.Title, bestDoc.Section, c.Role)
		if err == nil && externalReply != "" {
			httputil.JSON(w, http.StatusOK, ChatResponse{
				Reply:       externalReply,
				SourceDoc:   bestDoc.Title,
				SourceSec:   bestDoc.Section,
				SourceUrl:   bestDoc.Url,
				Confidence:  0.95,
				CanEscalate: false,
				Provider:    "gemini:1.5-flash",
			})
			return
		}
	}

	// Built-in RAG response
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

func (h *Handler) tryAnswerFromLiveDB(ctx context.Context, c *middleware.Claims, query, lowerQuery string, req ChatRequest) (bool, ChatResponse) {
	// 1. Vacation days balance
	if (strings.Contains(lowerQuery, "отпуск") || strings.Contains(lowerQuery, "демалыс")) &&
		(strings.Contains(lowerQuery, "остаток") || strings.Contains(lowerQuery, "сколько") || strings.Contains(lowerQuery, "дней") || strings.Contains(lowerQuery, "күн")) {
		prof, err := h.q.GetUserProfile(ctx, c.UserID)
		if err == nil {
			reply := fmt.Sprintf("У вас осталось **%d календарных дней** ежегодного оплачиваемого отпуска.\n\nЗа каждый полный отработанный месяц начисляется 2 дня отпуска (24 дня в год). Заявку на отпуск можно подать в разделе «Заявки» не позднее чем за 14 дней до начала отдыха.", prof.VacationDaysLeft)
			if req.Lang == "kz" {
				reply = fmt.Sprintf("Сізде **%d күнтізбелік күн** жыл сайынғы ақылы демалыс қалды.\n\nӨтінімді демалыс басталуынан 14 күн бұрын «Өтінімдер» бөлімінде бере аласыз.", prof.VacationDaysLeft)
			}
			return true, h.wrapReply(reply, "Личный профиль сотрудника", "Кадровый учет 1С:ЗУП", req, query, c.Role)
		}
	}

	// 2. User's own tasks
	if strings.Contains(lowerQuery, "мои задачи") || strings.Contains(lowerQuery, "какие у меня задачи") || strings.Contains(lowerQuery, "тапсырмаларым") || strings.Contains(lowerQuery, "мои таски") {
		userID := c.UserID
		tasks, err := h.q.ListTasksByUser(ctx, &userID)
		if err == nil {
			if len(tasks) == 0 {
				return true, h.wrapReply("На данный момент у вас нет назначенных активных задач. Все текущие задачи выполнены либо ожидают назначения.", "Мои задачи", "Управление задачами", req, query, c.Role)
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("У вас назначено **%d задач(и)**:\n\n", len(tasks)))
			for i, t := range tasks {
				due := "без срока"
				if t.DueDate != nil {
					due = t.DueDate.Format("02.01.2006")
				}
				statusText := map[string]string{
					"todo":        "К выполнению",
					"in_progress": "В работе",
					"review":      "На проверке",
					"done":        "Завершена",
				}[t.Status]
				sb.WriteString(fmt.Sprintf("%d. **%s** — статус: *%s* (срок: %s)\n", i+1, t.Title, statusText, due))
			}
			return true, h.wrapReply(sb.String(), "Мои задачи", "Задачи сотрудника", req, query, c.Role)
		}
	}

	// 3. User's own requests
	if strings.Contains(lowerQuery, "мои заявки") || strings.Contains(lowerQuery, "статус заявки") || strings.Contains(lowerQuery, "менин отинишим") {
		reqs, err := h.q.ListRequestsByUser(ctx, c.UserID)
		if err == nil {
			if len(reqs) == 0 {
				return true, h.wrapReply("Вы еще не подавали заявок на отпуск или аванс. Оформить заявку можно во вкладке «Заявки».", "Мои заявки", "История заявок", req, query, c.Role)
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("Ваши поданные заявки (всего %d):\n\n", len(reqs)))
			for i, rq := range reqs {
				typeName := "Отпуск"
				if rq.Type == "advance" {
					typeName = "Аванс"
				}
				statusText := map[string]string{
					"pending":         "На согласовании",
					"approved":        "Одобрена",
					"revision_needed": "Требуется доработка",
					"rejected":        "Отклонена",
				}[rq.Status]
				sb.WriteString(fmt.Sprintf("%d. **Заявка на %s** (от %s) — статус: *%s*\n", i+1, typeName, rq.CreatedAt.Format("02.01.2006"), statusText))
			}
			return true, h.wrapReply(sb.String(), "Мои заявки", "История кадровых заявок", req, query, c.Role)
		}
	}

	// 4. Department team members (Manager & HR only)
	if strings.Contains(lowerQuery, "кто в моем отделе") || strings.Contains(lowerQuery, "сотрудники отдела") || strings.Contains(lowerQuery, "моя команда") || strings.Contains(lowerQuery, "состав отдела") || strings.Contains(lowerQuery, "бөлім қызметкерлері") {
		if c.Role == "employee" {
			return true, ChatResponse{
				Reply:       "Информация о полном штатном составе отдела доступна только руководителю подразделения и HR-службе.",
				Confidence:  1.0,
				CanEscalate: false,
				Provider:    "guardrail:role_shield",
			}
		}
		if c.DepartmentID != nil {
			members, err := h.q.ListUsersByDepartment(ctx, c.DepartmentID)
			if err == nil {
				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("В вашем отделе числится **%d сотрудников**:\n\n", len(members)))
				for i, m := range members {
					roleBadge := "Сотрудник"
					if m.Role == "manager" {
						roleBadge = "Руководитель"
					}
					pos := m.Position
					if pos == "" {
						pos = "Специалист"
					}
					sb.WriteString(fmt.Sprintf("%d. **%s** — %s (%s)\n", i+1, m.FullName, pos, roleBadge))
				}
				return true, h.wrapReply(sb.String(), "Штатный состав подразделения", "База данных сотрудников", req, query, c.Role)
			}
		}
	}

	// 5. Department tasks summary (Manager & HR only)
	if strings.Contains(lowerQuery, "задачи отдела") || strings.Contains(lowerQuery, "задачи в отделе") || strings.Contains(lowerQuery, "бөлім тапсырмалары") {
		if c.Role == "employee" {
			return true, ChatResponse{
				Reply:       "Сводка задач всего подразделения доступна только руководителю отдела и HR-службе.",
				Confidence:  1.0,
				CanEscalate: false,
				Provider:    "guardrail:role_shield",
			}
		}
		if c.DepartmentID != nil {
			tasks, err := h.q.ListTasksByDepartment(ctx, *c.DepartmentID)
			if err == nil {
				var todo, inProg, review, done int
				for _, t := range tasks {
					switch t.Status {
					case "todo":
						todo++
					case "in_progress":
						inProg++
					case "review":
						review++
					case "done":
						done++
					}
				}
				reply := fmt.Sprintf("Сводка по задачам вашего отдела (всего: **%d**):\n\n• **К выполнению:** %d\n• **В работе:** %d\n• **На проверке руководителя:** %d\n• **Завершено:** %d\n\nВы можете распределять и проверять задачи во вкладке «Задачи».", len(tasks), todo, inProg, review, done)
				return true, h.wrapReply(reply, "Задачи подразделения", "Управление задачами отдела", req, query, c.Role)
			}
		}
	}

	// 6. Department pending requests for approval (Manager & HR only)
	if strings.Contains(lowerQuery, "заявки на согласовании") || strings.Contains(lowerQuery, "согласование заявок") || strings.Contains(lowerQuery, "заявки к согласованию") || strings.Contains(lowerQuery, "өтінімдерді келісу") {
		if c.Role == "employee" {
			return true, ChatResponse{
				Reply:       "Согласование заявок доступно только непосредственному руководителю подразделения.",
				Confidence:  1.0,
				CanEscalate: false,
				Provider:    "guardrail:role_shield",
			}
		}
		if c.DepartmentID != nil {
			reqs, err := h.q.ListRequestsByDepartment(ctx, *c.DepartmentID)
			if err == nil {
				var pendingList []string
				for _, rq := range reqs {
					if rq.Status == "pending" {
						typeName := "отпуск"
						if rq.Type == "advance" {
							typeName = "аванс"
						}
						pendingList = append(pendingList, fmt.Sprintf("• **%s**: заявка на %s от %s", rq.UserName, typeName, rq.CreatedAt.Format("02.01.2006")))
					}
				}
				if len(pendingList) == 0 {
					return true, h.wrapReply("В вашем отделе сейчас нет заявок, ожидающих согласования.", "Согласование заявок", "Заявки отдела", req, query, c.Role)
				}
				reply := fmt.Sprintf("В вашем отделе ожидает согласования **%d заявок**:\n\n%s\n\nВы можете согласовать или отправить их на доработку во вкладке «Заявки».", len(pendingList), strings.Join(pendingList, "\n"))
				return true, h.wrapReply(reply, "Заявки на согласовании", "Согласование заявок подразделения", req, query, c.Role)
			}
		}
	}

	// 7. Company-wide stats (HR Only)
	if strings.Contains(lowerQuery, "сколько сотрудников в компании") || strings.Contains(lowerQuery, "всего сотрудников") || strings.Contains(lowerQuery, "статистика компании") || strings.Contains(lowerQuery, "список отделов") || strings.Contains(lowerQuery, "сводка по компании") {
		if c.Role != "hr" {
			return true, ChatResponse{
				Reply:       "Общая статистика и сводка по всей компании доступны исключительно HR-директору.",
				Confidence:  1.0,
				CanEscalate: false,
				Provider:    "guardrail:role_shield",
			}
		}
		stats, err := h.q.GetCompanySummaryStats(ctx)
		depts, _ := h.q.ListDepartments(ctx)
		if err == nil {
			var deptNames []string
			for _, d := range depts {
				deptNames = append(deptNames, "• "+d.NameRu)
			}
			reply := fmt.Sprintf("Сводная статистика компании JanaPost:\n\n• **Всего сотрудников в системе:** %d\n• **Подразделений:** %d\n• **Активных задач в работе:** %d\n• **Заявок, ожидающих решения:** %d\n\nОтделы компании:\n%s", stats.TotalUsers, stats.TotalDepartments, stats.ActiveTasks, stats.PendingRequests, strings.Join(deptNames, "\n"))
			return true, h.wrapReply(reply, "Корпоративная аналитика JanaMen", "Сводка компании", req, query, c.Role)
		}
	}

	return false, ChatResponse{}
}

func (h *Handler) wrapReply(baseReply, sourceDoc, sourceSec string, req ChatRequest, query, role string) ChatResponse {
	if req.ApiKey != "" {
		externalReply, err := callExternalLLMWithText("gemini", req.ApiKey, query, baseReply, sourceDoc, sourceSec, role)
		if err == nil && externalReply != "" {
			return ChatResponse{
				Reply:       externalReply,
				SourceDoc:   sourceDoc,
				SourceSec:   sourceSec,
				Confidence:  1.0,
				CanEscalate: false,
				Provider:    "gemini:1.5-flash",
			}
		}
	}

	return ChatResponse{
		Reply:       baseReply,
		SourceDoc:   sourceDoc,
		SourceSec:   sourceSec,
		Confidence:  1.0,
		CanEscalate: false,
		Provider:    "builtin:janamen_rag",
	}
}

func callExternalLLMWithText(provider, apiKey, query, contextText, docTitle, docSec, role string) (string, error) {
	prompt := fmt.Sprintf(`Ты корпоративный HR-консультант платформы JanaMen (JanaPost).
Твоя задача — ТОЛЬКО отвечать на вопросы пользователя на основе предоставленной проверенной информации ниже.
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Выполнять действия по изменению данных (если просят что-то сделать/создать/удалить — вежливо напомни, что ты только отвечаешь на вопросы).
- Придумывать факты, которых нет в контексте.
Роль пользователя: %s

ПРОВЕРЕННАЯ ИНФОРМАЦИЯ ИЗ БАЗЫ:
%s

ВОПРОС ПОЛЬЗОВАТЕЛЯ: %s

Дай вежливый, четкий и структурированный ответ на русском языке. В конце ответа укажи строку:
"📄 Источник: %s (%s)"`, role, contextText, query, docTitle, docSec)

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
