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
	// Informational inquiries, question words, procedure lookups, status checks, or help requests are NEVER action commands.
	informationalWords := []string{
		"как ", "қалай ", "порядок ", "правила ", "инструкция ", "условия ", "какие ", "что нужно для ",
		"где найти ", "где ", "почему ", "когда ", "можно ли ", "хочу ", "нужно ", "подскажи ",
		"помоги ", "расскажи ", "регламент", "процедура ", "статус ", "список ", "сводка ",
		"информация ", "полномочия", "возможности", "что ты ", "кто ты", "помощь", "привет",
		"сәлем", "көмек", "текущие задачи", "поданных заявок", "больничн", "аванс", "отпуск",
	}
	for _, p := range informationalWords {
		if strings.Contains(lowerQuery, p) {
			return false
		}
	}

	actionVerbs := []string{
		"создай", "удали", "уволь", "начисли", "одобри",
		"переведи задачу", "переведи деньги", "отклони", "добавь сотрудника", "добавь пользователя",
		"заблокируй", "зарегистрируй", "қос", "өшір", "бекіт", "жұмыстан шығар",
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

	// Guardrail 1: Strictly reject mutating action commands
	if isActionCommand(lowerQuery) {
		httputil.JSON(w, http.StatusOK, ChatResponse{
			Reply: "Я корпоративный консультант **JAŃA AI**. Я отвечаю на любые информационные вопросы и предоставляю справки по процессам компании, но не выполняю системные действия по изменению базы данных.\n\nВы можете выполнить необходимое действие самостоятельно в соответствующем разделе системы:\n• **Задачи** — создание, распределение и смена статуса задач;\n• **Заявки** — оформление и согласование отпусков или авансов;\n• **Сотрудники** — управление профилями и штатным расписанием (для HR).",
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

	// Guardrail 3: Cross-department role protection for employees (bad-faith cross-department snooping)
	if c.Role == "employee" && (strings.Contains(lowerQuery, "чужой отдел") || strings.Contains(lowerQuery, "другой отдел")) {
		httputil.JSON(w, http.StatusOK, ChatResponse{
			Reply:       "Вы можете просматривать регламенты компании и данные своего подразделения. Для получения расширенного доступа обратитесь к руководителю своего отдела или в кадровую службу.",
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

	// Score documents by keyword overlap with stem matching
	words := strings.Fields(lowerQuery)
	var bestDoc *db.KbDocument
	var bestScore int

	cleanWords := make([]string, 0, len(words))
	for _, w := range words {
		cw := strings.Trim(w, "?!.,;:()\"'")
		if len([]rune(cw)) >= 3 {
			cleanWords = append(cleanWords, cw)
		}
	}

	for _, doc := range docs {
		score := 0
		docText := strings.ToLower(doc.Title + " " + doc.Section + " " + doc.Keywords + " " + doc.Content)
		for _, w := range cleanWords {
			if strings.Contains(docText, w) {
				score += 3
			} else {
				// Prefix stem check for Russian declensions (e.g. "регламенты" -> "регламент")
				runes := []rune(w)
				if len(runes) >= 5 {
					stem := string(runes[:len(runes)-2])
					if strings.Contains(docText, stem) {
						score += 2
					}
				} else if len(runes) >= 4 {
					stem := string(runes[:len(runes)-1])
					if strings.Contains(docText, stem) {
						score += 2
					}
				}
			}
			if strings.Contains(strings.ToLower(doc.Keywords), w) {
				score += 3
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
			Reply:       "Я корпоративный консультант платформы JanaMen. По вашему запросу я могу предоставить проверенную информацию по регламентам компании:\n\n• **Отпуска:** расчет дней, график, подача заявления за 14 дней\n• **Аванс:** выплата 15 числа, размер до 50% оклада\n• **Больничные:** оформление ЭЛН, передача в HR за 3 дня\n• **Обучение:** курсы и тесты в Jana Academy\n• **Задачи и Заявки:** оперативные статусы из базы данных\n\n*Выберите готовый вопрос на панели подсказок выше или уточните ваш запрос.*",
			Confidence:  0.8,
			CanEscalate: true,
			Provider:    "builtin:janamen_rag",
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
	// 0. Capabilities, help, permissions, and welcome
	if strings.Contains(lowerQuery, "полномочия") || strings.Contains(lowerQuery, "что ты умеешь") || strings.Contains(lowerQuery, "кто ты") ||
		strings.Contains(lowerQuery, "возможности") || strings.Contains(lowerQuery, "помощь") || strings.Contains(lowerQuery, "привет") ||
		strings.Contains(lowerQuery, "сәлем") || strings.Contains(lowerQuery, "көмек") || strings.Contains(lowerQuery, "что ты можешь") {
		var roleDesc string
		switch c.Role {
		case "hr":
			roleDesc = "HR-директор. Вам доступна полная кадровая аналитика, реестр всех заявок и задач компании, структура подразделений и управление базой знаний."
		case "manager":
			roleDesc = "Руководитель подразделения. Вам доступен штатный состав вашего отдела, статус задач команды, согласование заявок сотрудников и личный кадровый профиль."
		default:
			roleDesc = "Сотрудник компании. Вам доступен личный остаток отпуска, назначенные текущие задачи, статус поданных заявок и все регламенты компании."
		}
		reply := fmt.Sprintf("Здравствуйте, **%s**! 👋\n\nЯ интеллектуальный HR-ассистент **JAŃA AI** платформы JanaPost.\n\nВаша роль в системе: **%s**\n\n**Мои основные полномочия и возможности:**\n• 📊 **Оперативные данные:** баланс отпусков, назначенные задачи, статусы поданных заявок;\n• 👥 **Команда и отдел:** состав подразделения, распределение задач, заявки на согласовании;\n• 📈 **Аналитика компании:** численность персонала, структура отделов, сводка по заявкам;\n• 📄 **База регламентов:** порядок расчёта отпусков, выплата авансов, больничные листы, обучение в Jana Academy.\n\n*Для быстрой проверки выберите любой готовый вопрос на панели выше!*", c.FullName, roleDesc)
		return true, h.wrapReply(reply, "Справка о возможностях JAŃA AI", "Интеллектуальный помощник", req, query, c.Role)
	}

	// 1. Vacation days balance
	if (strings.Contains(lowerQuery, "отпуск") || strings.Contains(lowerQuery, "демалыс")) &&
		(strings.Contains(lowerQuery, "остаток") || strings.Contains(lowerQuery, "сколько") || strings.Contains(lowerQuery, "дней") || strings.Contains(lowerQuery, "күн") || strings.Contains(lowerQuery, "баланс")) {
		prof, err := h.q.GetUserProfile(ctx, c.UserID)
		if err == nil {
			reply := fmt.Sprintf("У вас осталось **%d календарных дней** ежегодного оплачиваемого отпуска.\n\n• **Начисление:** 2 дня за каждый полный отработанный месяц (24 дня в год).\n• **Подача заявления:** оформляется во вкладке «Заявки» не позднее чем за 14 дней до начала отпуска.\n• **Согласование:** заявка автоматически направляется руководителю и в кадровую службу.", prof.VacationDaysLeft)
			if req.Lang == "kz" {
				reply = fmt.Sprintf("Сізде **%d күнтізбелік күн** жыл сайынғы ақылы демалыс қалды.\n\n• **Есептелуі:** әр толық жұмыс айы үшін 2 күн (жылына 24 күн).\n• **Өтінім беру:** демалыс басталуынан 14 күн бұрын «Өтінімдер» бөлімінде беріледі.", prof.VacationDaysLeft)
			}
			return true, h.wrapReply(reply, "Личный профиль сотрудника", "Кадровый учет 1С:ЗУП", req, query, c.Role)
		}
	}

	// 2. User's own tasks (Employee quick prompt: "Какие у меня текущие задачи?")
	if strings.Contains(lowerQuery, "текущие задачи") || strings.Contains(lowerQuery, "мои задачи") || strings.Contains(lowerQuery, "какие у меня задачи") ||
		strings.Contains(lowerQuery, "тапсырмаларым") || strings.Contains(lowerQuery, "мои таски") || strings.Contains(lowerQuery, "мои задания") ||
		(strings.Contains(lowerQuery, "задач") && (strings.Contains(lowerQuery, "мои") || strings.Contains(lowerQuery, "меня") || strings.Contains(lowerQuery, "текущ"))) {
		userID := c.UserID
		tasks, err := h.q.ListTasksByUser(ctx, &userID)
		if err == nil {
			if len(tasks) == 0 {
				return true, h.wrapReply("На данный момент у вас нет назначенных активных задач. Все назначенные задачи выполнены либо ожидают постановки в разделе «Задачи».", "Мои задачи", "Канбан-система JanaMen", req, query, c.Role)
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
			sb.WriteString("\n*Вы можете обновить статус выполнения задачи во вкладке «Задачи».*")
			return true, h.wrapReply(sb.String(), "Мои задачи", "Канбан-система JanaMen", req, query, c.Role)
		}
	}

	// 3. User's own requests (Employee quick prompt: "Статус моих поданных заявок")
	if strings.Contains(lowerQuery, "поданных заявок") || strings.Contains(lowerQuery, "мои заявки") || strings.Contains(lowerQuery, "статус заявки") ||
		strings.Contains(lowerQuery, "статус заявок") || strings.Contains(lowerQuery, "статус моих") || strings.Contains(lowerQuery, "менин отинишим") ||
		strings.Contains(lowerQuery, "заявкаларым") || (strings.Contains(lowerQuery, "заявк") && (strings.Contains(lowerQuery, "мои") || strings.Contains(lowerQuery, "поданн"))) {
		reqs, err := h.q.ListRequestsByUser(ctx, c.UserID)
		if err == nil {
			if len(reqs) == 0 {
				return true, h.wrapReply("У вас пока нет поданных заявок на отпуск или аванс. Оформить новую заявку можно во вкладке меню «Заявки».", "Мои заявки", "История кадровых заявок", req, query, c.Role)
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("Ваши поданные кадровые заявки (всего: **%d**):\n\n", len(reqs)))
			for i, rq := range reqs {
				typeName := "Отпуск"
				details := ""
				if rq.Type == "advance" {
					typeName = "Аванс"
					details = fmt.Sprintf("сумма: %.0f ₸", rq.Amount)
				} else {
					dateStr := "даты не указаны"
					if rq.DateFrom != nil && rq.DateTo != nil {
						dateStr = fmt.Sprintf("%s – %s (%d дн.)", rq.DateFrom.Format("02.01.2006"), rq.DateTo.Format("02.01.2006"), rq.DaysCount)
					}
					details = dateStr
				}
				statusText := map[string]string{
					"pending":         "⏳ На согласовании",
					"approved":        "✅ Одобрена",
					"revision_needed": "⚠️ Требуется доработка",
					"rejected":        "❌ Отклонена",
				}[rq.Status]
				sb.WriteString(fmt.Sprintf("%d. **Заявка на %s** (%s) — статус: *%s* (от %s)\n", i+1, typeName, details, statusText, rq.CreatedAt.Format("02.01.2006")))
			}
			sb.WriteString("\n*История согласования и комментарии руководителя доступны в разделе «Заявки».*")
			return true, h.wrapReply(sb.String(), "Мои заявки", "История кадровых заявок Documentolog", req, query, c.Role)
		}
	}

	// 4. Department team members (Manager quick prompt: "Кто в моем отделе?")
	if strings.Contains(lowerQuery, "кто в моем отделе") || strings.Contains(lowerQuery, "сотрудники отдела") || strings.Contains(lowerQuery, "моя команда") ||
		strings.Contains(lowerQuery, "состав отдела") || strings.Contains(lowerQuery, "бөлім қызметкерлері") {
		var deptID *int
		if c.DepartmentID != nil {
			deptID = c.DepartmentID
		} else if c.Role == "hr" {
			// HR sees all departments overview
			depts, _ := h.q.ListDepartments(ctx)
			users, _ := h.q.ListAllUsers(ctx)
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("В компании зарегистрировано **%d сотрудников** в **%d отделах**:\n\n", len(users), len(depts)))
			for _, d := range depts {
				count := 0
				for _, u := range users {
					if u.DepartmentID != nil && *u.DepartmentID == d.ID {
						count++
					}
				}
				sb.WriteString(fmt.Sprintf("• **%s:** %d сотр. (%s)\n", d.NameRu, count, d.Code))
			}
			sb.WriteString("\n*Подробный список сотрудников каждого отдела доступен во вкладке «Сотрудники».*")
			return true, h.wrapReply(sb.String(), "Штатный состав компании", "База данных сотрудников", req, query, c.Role)
		}

		if deptID != nil {
			members, err := h.q.ListUsersByDepartment(ctx, deptID)
			if err == nil && len(members) > 0 {
				var sb strings.Builder
				deptName := "вашем отделе"
				if len(members) > 0 && members[0].DeptRu != nil {
					deptName = fmt.Sprintf("отделе «%s»", *members[0].DeptRu)
				}
				sb.WriteString(fmt.Sprintf("В %s числится **%d сотрудников**:\n\n", deptName, len(members)))
				for i, m := range members {
					roleBadge := "Сотрудник"
					if m.Role == "manager" {
						roleBadge = "Руководитель"
					} else if m.Role == "hr" {
						roleBadge = "HR"
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
		return true, h.wrapReply("Вы числитесь в штате компании JanaPost. Список коллег и контактные данные можно уточнить в кадровой службе или во вкладке «Моя команда».", "Команда", "Кадровый учет", req, query, c.Role)
	}

	// 5. Department tasks summary (Manager quick prompt: "Какие задачи отдела сейчас в работе?")
	if strings.Contains(lowerQuery, "задачи отдела сейчас в работе") || strings.Contains(lowerQuery, "задачи отдела") || strings.Contains(lowerQuery, "задачи в отделе") || strings.Contains(lowerQuery, "бөлім тапсырмалары") ||
		(strings.Contains(lowerQuery, "задачи") && strings.Contains(lowerQuery, "в работе")) {
		if c.DepartmentID != nil {
			tasks, err := h.q.ListTasksByDepartment(ctx, *c.DepartmentID)
			if err == nil {
				var todo, inProg, review, done int
				var activeList []string
				for _, t := range tasks {
					switch t.Status {
					case "todo":
						todo++
					case "in_progress":
						inProg++
						assignee := "Не назначен"
						if t.AssigneeName != nil && *t.AssigneeName != "" {
							assignee = *t.AssigneeName
						}
						activeList = append(activeList, fmt.Sprintf("• **%s** (Исполнитель: %s)", t.Title, assignee))
					case "review":
						review++
					case "done":
						done++
					}
				}
				reply := fmt.Sprintf("Сводка по задачам отдела (всего: **%d**):\n\n• **К выполнению:** %d\n• **В работе:** %d\n• **На проверке руководителя:** %d\n• **Завершено:** %d", len(tasks), todo, inProg, review, done)
				if len(activeList) > 0 {
					reply += "\n\n**Текущие задачи в работе:**\n" + strings.Join(activeList, "\n")
				}
				reply += "\n\n*Вы можете распределять и проверять задачи во вкладке «Задачи».*"
				return true, h.wrapReply(reply, "Задачи подразделения", "Канбан-система JanaMen", req, query, c.Role)
			}
		} else if c.Role == "hr" {
			tasks, err := h.q.ListAllTasks(ctx)
			if err == nil {
				reply := fmt.Sprintf("В компании зарегистрировано **%d задач**. Из них активных: в работе и на проверке. Вы можете посмотреть канбан-доски всех отделов во вкладке «Задачи».", len(tasks))
				return true, h.wrapReply(reply, "Задачи компании", "Канбан-система JanaMen", req, query, c.Role)
			}
		}
	}

	// 6. Department pending requests for approval (Manager quick prompt: "Есть ли заявки на согласовании?")
	if strings.Contains(lowerQuery, "заявки на согласовании") || strings.Contains(lowerQuery, "согласование заявок") ||
		strings.Contains(lowerQuery, "заявки к согласованию") || strings.Contains(lowerQuery, "өтінімдерді келісу") {
		var reqs []db.ListRequestsByDepartmentRow
		var err error
		if c.DepartmentID != nil {
			reqs, err = h.q.ListRequestsByDepartment(ctx, *c.DepartmentID)
		} else if c.Role == "hr" {
			allReqs, aErr := h.q.ListAllRequests(ctx)
			if aErr == nil {
				var pendingList []string
				for _, rq := range allReqs {
					if rq.Status == "pending" {
						typeName := "отпуск"
						if rq.Type == "advance" {
							typeName = "аванс"
						}
						pendingList = append(pendingList, fmt.Sprintf("• **%s** (%s): заявка на %s от %s", rq.UserName, rq.DeptRu, typeName, rq.CreatedAt.Format("02.01.2006")))
					}
				}
				if len(pendingList) == 0 {
					return true, h.wrapReply("В компании сейчас нет заявок, ожидающих согласования. Все кадровые запросы обработаны.", "Согласование заявок", "Кадровые заявки", req, query, c.Role)
				}
				reply := fmt.Sprintf("В компании ожидает решения **%d заявок**:\n\n%s\n\nВы можете согласовать их в разделе «Заявки».", len(pendingList), strings.Join(pendingList, "\n"))
				return true, h.wrapReply(reply, "Заявки на согласовании", "Общий реестр заявок Documentolog", req, query, c.Role)
			}
		}

		if err == nil && c.DepartmentID != nil {
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
				return true, h.wrapReply("В вашем отделе сейчас нет заявок, ожидающих согласования. Все поступившие запросы обработаны.", "Согласование заявок", "Заявки отдела", req, query, c.Role)
			}
			reply := fmt.Sprintf("В вашем отделе ожидает согласования **%d заявок**:\n\n%s\n\nВы можете согласовать или отправить их на доработку во вкладке «Заявки».", len(pendingList), strings.Join(pendingList, "\n"))
			return true, h.wrapReply(reply, "Заявки на согласовании", "Согласование заявок подразделения", req, query, c.Role)
		}
	}

	// 7. Company Headcount & Stats (HR quick prompt: "Сколько сотрудников в компании?")
	if strings.Contains(lowerQuery, "сколько сотрудников в компании") || strings.Contains(lowerQuery, "всего сотрудников") ||
		strings.Contains(lowerQuery, "статистика компании") || strings.Contains(lowerQuery, "сводка по компании") ||
		strings.Contains(lowerQuery, "численность компании") {
		stats, err := h.q.GetCompanySummaryStats(ctx)
		depts, _ := h.q.ListDepartments(ctx)
		if err == nil {
			var deptNames []string
			for _, d := range depts {
				deptNames = append(deptNames, "• "+d.NameRu)
			}
			reply := fmt.Sprintf("Сводная статистика компании JanaPost:\n\n• **Всего сотрудников в системе:** %d\n• **Подразделений:** %d\n• **Активных задач в работе:** %d\n• **Заявок, ожидающих решения:** %d\n\n**Отделы компании:**\n%s", stats.TotalUsers, stats.TotalDepartments, stats.ActiveTasks, stats.PendingRequests, strings.Join(deptNames, "\n"))
			return true, h.wrapReply(reply, "Корпоративная аналитика JanaMen", "Сводка компании", req, query, c.Role)
		}
	}

	// 8. Company Departments List (HR quick prompt: "Список подразделений компании")
	if strings.Contains(lowerQuery, "список подразделений компании") || strings.Contains(lowerQuery, "список подразделений") ||
		strings.Contains(lowerQuery, "подразделен") || strings.Contains(lowerQuery, "список отделов") ||
		strings.Contains(lowerQuery, "отделы компании") || strings.Contains(lowerQuery, "бөлімдер") ||
		strings.Contains(lowerQuery, "структура компании") {
		depts, err := h.q.ListDepartments(ctx)
		if err == nil {
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("В структуре компании JanaPost функционирует **%d ключевых подразделений**:\n\n", len(depts)))
			for i, d := range depts {
				sb.WriteString(fmt.Sprintf("%d. **%s** (%s)\n   • *Код:* `%s`\n   • *Назначение:* %s\n\n", i+1, d.NameRu, d.NameKz, d.Code, d.DescriptionRu))
			}
			sb.WriteString("*Сотрудники и задачи каждого подразделения доступны в разделах «Сотрудники» и «Задачи».*")
			return true, h.wrapReply(sb.String(), "Организационная структура", "Справочник подразделений", req, query, c.Role)
		}
	}

	// 9. Company Requests Summary for HR (HR quick prompt: "Сводка по заявкам сотрудников")
	if strings.Contains(lowerQuery, "сводка по заявкам сотрудников") || strings.Contains(lowerQuery, "сводка по заявкам") ||
		strings.Contains(lowerQuery, "заявкам сотрудников") || strings.Contains(lowerQuery, "заявки компании") ||
		(strings.Contains(lowerQuery, "заявк") && strings.Contains(lowerQuery, "сводка")) {
		allReqs, err := h.q.ListAllRequests(ctx)
		if err == nil {
			var pending, approved, revision, rejected int
			for _, rq := range allReqs {
				switch rq.Status {
				case "pending":
					pending++
				case "approved":
					approved++
				case "revision_needed":
					revision++
				case "rejected":
					rejected++
				}
			}
			reply := fmt.Sprintf("Сводка по кадровым заявкам сотрудников компании (всего: **%d**):\n\n• ⏳ **Ожидают согласования:** %d\n• ✅ **Одобрено:** %d\n• ⚠️ **Требуется доработка:** %d\n• ❌ **Отклонено:** %d\n\nВсе заявки фиксируются в электронном архиве Documentolog и синхронизируются с 1С:ЗУП. Полный реестр доступен во вкладке «Заявки».", len(allReqs), pending, approved, revision, rejected)
			return true, h.wrapReply(reply, "Сводка кадровых заявок", "Электронный документооборот Documentolog", req, query, c.Role)
		}
	}

	// 10. Regulations in Knowledge Base (HR quick prompt: "Какие регламенты есть в базе знаний?")
	if strings.Contains(lowerQuery, "какие регламенты есть в базе знаний") || strings.Contains(lowerQuery, "регламенты в базе знаний") ||
		strings.Contains(lowerQuery, "список регламентов") || strings.Contains(lowerQuery, "базе знаний") ||
		strings.Contains(lowerQuery, "база знаний") || strings.Contains(lowerQuery, "какие регламенты") ||
		strings.Contains(lowerQuery, "регламент") {
		docs, err := h.q.ListKB(ctx)
		if err == nil && len(docs) > 0 {
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("В корпоративной базе знаний JanaPost содержится **%d официальных регламентов**:\n\n", len(docs)))
			for i, d := range docs {
				sb.WriteString(fmt.Sprintf("%d. 📄 **%s** — *%s*\n   • Темы: %s\n", i+1, d.Title, d.Section, d.Keywords))
			}
			sb.WriteString("\n*Вы можете задать мне любой вопрос по содержанию этих регламентов, и я предоставлю точную выдержку правил.*")
			return true, h.wrapReply(sb.String(), "Корпоративная база знаний", "Регламенты JanaPost", req, query, c.Role)
		}
	}

	// 11. Vacation Approval Workflow (Manager quick prompt: "Порядок согласования отпуска")
	if strings.Contains(lowerQuery, "порядок согласования отпуска") || strings.Contains(lowerQuery, "согласование отпуска") ||
		strings.Contains(lowerQuery, "как согласовать отпуск") || strings.Contains(lowerQuery, "согласования отпуска") {
		reply := "**Порядок согласования ежегодного отпуска:**\n\n" +
			"1. **Подача заявления:** Сотрудник формирует электронную заявку в разделе «Заявки» не позднее чем за 14 дней до даты начала отдыха.\n" +
			"2. **Проверка руководителем:** Руководитель проверяет отсутствие накладок в графике смен и остаток дней во вкладке «Заявки» -> «Заявки отдела».\n" +
			"3. **Принятие решения:** Руководитель нажимает «Одобрить» либо «На доработку» с указанием обязательного комментария.\n" +
			"4. **Электронная проводка:** После согласования заявка автоматически передается в Documentolog и табель 1С:ЗУП для начисления отпускных выплат."
		return true, h.wrapReply(reply, "Регламент ежегодных отпусков", "Раздел 3. Порядок оформления", req, query, c.Role)
	}

	// 12. Advance Payment Terms (Manager & Employee quick prompt: "Условия получения аванса" / "Условия и порядок выплаты аванса")
	if strings.Contains(lowerQuery, "условия получения аванса") || strings.Contains(lowerQuery, "условия и порядок выплаты аванса") ||
		strings.Contains(lowerQuery, "выплаты аванса") || strings.Contains(lowerQuery, "выплата аванса") || strings.Contains(lowerQuery, "получения аванса") ||
		(strings.Contains(lowerQuery, "аванс") && (strings.Contains(lowerQuery, "условия") || strings.Contains(lowerQuery, "порядок") || strings.Contains(lowerQuery, "как"))) {
		reply := "**Условия и порядок выплаты аванса:**\n\n" +
			"• **Плановый аванс:** выплачивается 15 числа каждого месяца всем штатным сотрудникам компании.\n" +
			"• **Дополнительный аванс:** оформляется через раздел «Заявки» -> «Заявка на аванс».\n" +
			"• **Лимит суммы:** размер запрашиваемого аванса не может превышать 50% от должностного оклада сотрудника.\n" +
			"• **Согласование:** решение по заявке принимает непосредственный руководитель подразделения и бухгалтерия в течение 1 рабочего дня."
		return true, h.wrapReply(reply, "Положение об авансе", "Раздел 1. Условия выплаты", req, query, c.Role)
	}

	// 13. Sick Leave / Illness Guide (Employee quick prompt: "Что делать при болезни и больничном?")
	if strings.Contains(lowerQuery, "болезни и больничном") || strings.Contains(lowerQuery, "больничный") ||
		strings.Contains(lowerQuery, "заболел") || strings.Contains(lowerQuery, "лист нетрудоспособности") {
		reply := "**Порядок действий при болезни и оформлении больничного листа:**\n\n" +
			"1. **Уведомление:** В первый день нетрудоспособности обязательно уведомите непосредственного руководителя (по телефону или корпоративной почте).\n" +
			"2. **Открытие листа:** Обратитесь в поликлинику или медицинское учреждение для открытия электронного листа временной нетрудоспособности (ЭЛН).\n" +
			"3. **Передача в HR:** В течение 3 рабочих дней после закрытия больничного передайте номер ЭЛН в кадровую службу через платформу.\n" +
			"4. **Расчет и выплата:** Пособие по временной нетрудоспособности начисляется бухгалтерией согласно трудовому законодательству РК в ближайший расчетный день."
		return true, h.wrapReply(reply, "Регламент больничных листов", "Раздел 1. Действия работника", req, query, c.Role)
	}

	// 14. Vacation Calculation Rules (Employee quick prompt: "Как рассчитывается ежегодный отпуск?")
	if strings.Contains(lowerQuery, "как рассчитывается ежегодный отпуск") || strings.Contains(lowerQuery, "рассчитывается ежегодный отпуск") ||
		strings.Contains(lowerQuery, "расчет отпуска") || strings.Contains(lowerQuery, "расчет ежегодного") {
		reply := "**Правила расчета ежегодного оплачиваемого отпуска:**\n\n" +
			"• **Продолжительность:** базовый ежегодный оплачиваемый отпуск составляет **24 календарных дня** в год.\n" +
			"• **Формула начисления:** за каждый полный отработанный месяц сотруднику начисляется ровно **2 календарных дня** отпуска.\n" +
			"• **Дробление:** отпуск может быть разделен на части, при этом основная непрерывная часть должна составлять не менее 14 календарных дней.\n" +
			"• **Сроки подачи:** заявка оформляется не позднее чем за 14 дней до планируемого начала отдыха."
		return true, h.wrapReply(reply, "Регламент ежегодных отпусков", "Раздел 2. Расчёт отпуска", req, query, c.Role)
	}

	// 15. How to submit request / change password
	if strings.Contains(lowerQuery, "как подать заявку") || strings.Contains(lowerQuery, "как оформить заявку") || strings.Contains(lowerQuery, "подать заявку") {
		reply := "**Как подать кадровое заявление (отпуск / аванс):**\n\n" +
			"1. Перейдите во вкладку меню **«Заявки»**.\n" +
			"2. Нажмите кнопку **«Подать заявку»**.\n" +
			"3. Выберите тип: **«Ежегодный отпуск»** или **«Аванс»**.\n" +
			"4. Укажите необходимые даты (для отпуска) либо сумму (для аванса) и добавьте комментарий при необходимости.\n" +
			"5. Нажмите **«Отправить на согласование»** — заявка мгновенно поступит вашему руководителю."
		return true, h.wrapReply(reply, "Инструкция пользователя", "Раздел «Заявки» платформы JanaMen", req, query, c.Role)
	}

	if strings.Contains(lowerQuery, "сменить пароль") || strings.Contains(lowerQuery, "изменить пароль") || strings.Contains(lowerQuery, "парол") {
		reply := "**Как изменить пароль от учетной записи:**\n\n" +
			"1. Нажмите на имя своего профиля в правом верхнем углу либо перейдите во вкладку профиля.\n" +
			"2. Введите текущий пароль и новый пароль (минимум 8 символов: заглавные и строчные буквы, цифры и спецсимвол).\n" +
			"3. Нажмите **«Сохранить пароль»**.\n\n*При возникновении сложностей со входом обратитесь в IT-службу.*"
		return true, h.wrapReply(reply, "Политика безопасности", "Парольная политика JanaPost", req, query, c.Role)
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
