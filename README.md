# «JanaMen» — Digital HR-платформа для JanaPost 🚀

> **Корпоративная Digital HR-платформа «JanaMen» (MVP)**, разработанная специально для почтово-логистического оператора **JanaPost**.  
> Платформа объединяет разрозненные HR-сервисы компании в современное **единое окно**, внедряет строгую ролевую модель безопасности (**RBAC** с валидацией на уровне API), обеспечивает интеллектуальную поддержку через безопасного ассистента **Jana AI** (RAG с защитой от галлюцинаций и точным цитированием корпоративных регламентов), а также включает интерактивную систему онбординга и обучения **Jana Academy**.

<div align="center">
  <img src="readme-fun-photo.png" alt="Команда JanaMen — Digital HR платформа для JanaPost" width="100%" style="border-radius: 14px; margin: 20px 0; box-shadow: 0 8px 30px rgba(0,0,0,0.12);" />
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Angular-22.0-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular" />
  <img src="https://img.shields.io/badge/Bun-Fast_Runtime-fbf0df?style=for-the-badge&logo=bun&logoColor=black" alt="Bun" />
  <img src="https://img.shields.io/badge/Go-1.27-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go" />
  <img src="https://img.shields.io/badge/sqlc-Type--safe_SQL-00599C?style=for-the-badge" alt="sqlc" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Supabase-Backend_Services-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Cloudflare_Pages-SPA_Hosting-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" />
  <img src="https://img.shields.io/badge/Google_Cloud_Run-Container_Deploy-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white" alt="Cloud Run" />
</p>

---

##  Содержание
1. [Проблематика и ценность решения](#-проблематика-и-ценность-решения)
2. [Архитектура системы](#-архитектура-системы)
3. [Карта файлов и связей API](#-карта-файлов-и-связей-api)
4. [Диаграммы бизнес-процессов](#-диаграммы-бизнес-процессов)
5. [Ролевая модель (RBAC) и изоляция отделов](#-ролевая-модель-rbac-и-изоляция-отделов)
6. [Точки интеграции с 1С:ЗУП и Documentolog](#-точки-интеграции-с-1сзуп-и-documentolog)
7. [Чек-лист защиты: 6 ключевых сценариев демонстрации](#-чек-лист-защиты-6-ключевых-сценариев-демонстрации)
8. [Инструкция по сборке и локальному запуску](#-инструкция-по-сборке-и-локальному-запуску)
9. [Инструкция по развертыванию в Production](#-инструкция-по-развертыванию-в-production)
10. [Двуязычная локализация (RU / KZ)](#-двуязычная-локализация-ru--kz)
11. [Безопасность и защита данных](#-безопасность-и-защита-данных)

---

##  Проблематика и ценность решения

| До внедрения JanaMen | После внедрения JanaMen |
|---|---|
| **Хаос в каналах коммуникации:** заявления на отпуск и авансы передаются через бумажные бланки, мессенджеры и email. | **Единое цифровое окно:** сквозная подача заявки в 2 клика с автоматической проверкой отпускного баланса. |
| **Долгое согласование:** потеря документов между линейным руководителем, кадрами и бухгалтерией (до 5–7 рабочих дней). | **Интерактивный таймлайн статуса:** мгновенное визирование руководителем с передачей в СЭД Documentolog и 1С:ЗУП. |
| **Перегрузка HR-отдела однотипными вопросами:** регламенты отпусков, расчет компенсаций, правила больничных. | **AI Jana (RAG-ассистент):** моментальные ответы 24/7 со ссылкой на точную статью и пункт регламента без галлюцинаций. |
| **Сложная адаптация новичков:** разрозненные PDF-файлы, отсутствие контроля прохождения техники безопасности. | **Jana Academy:** интерактивные курсы, микро-обучение на двух языках (RU/KZ) и тесты с автоматической сертификацией. |

---

##  Архитектура системы

Платформа спроектирована по современной микросервисно-модульной архитектуре с полным разделением клиентского слоя (**SPA**) и высокопроизводительного ядра бизнес-логики (**Stateless REST API**).

```mermaid
flowchart TB
    subgraph ClientLayer ["Клиентский уровень (Frontend)"]
        User["Пользователь (Браузер / Смартфон)"]
        CF["Cloudflare Pages CDN\n(Домен: kilcdevs.net / SSL)"]
        AngularApp["Angular 22 SPA\n(Signals + Standalone + SCSS + Bun)"]
        User -->|HTTPS| CF --> AngularApp
    end

    subgraph APILayer ["Уровень API и бизнес-логики (Backend)"]
        CR["Google Cloud Run\n(Go 1.22 Container, Chi Router)"]
        MW["Auth Middleware\n(JWT Verification + RBAC Guard)"]
        Modules["Бизнес-модули:\n• auth • requests • tasks\n• academy • ai • analytics • hr"]
        AngularApp -->|REST API / JSON + Bearer JWT| CR
        CR --> MW --> Modules
    end

    subgraph DataLayer ["Уровень данных и интеграций"]
        PG[("PostgreSQL 16 (Supabase)\n(sqlc Type-Safe Queries)")]
        ZUP["Адаптер 1С:ЗУП 3.1\n(internal/integrations/zup1c)"]
        DOC["Адаптер Documentolog\n(internal/integrations/documentolog)"]
        Modules -->|Пул соединений pgxpool| PG
        Modules -->|OData / HTTP| ZUP
        Modules -->|REST API / Webhooks| DOC
    end
```

### Технологический стек:
- **Frontend:** **Angular 22** (современная реактивность на Angular Signals, Standalone-компоненты, строгая типизация TypeScript, сборка и управление зависимостями через **Bun**).
- **Backend:** **Go 1.27** (минималистичный роутер `chi`, кодогенератор типобезопасного SQL без тяжелых ORM — `sqlc`, пул соединений `pgx/v5`).
- **База данных:** **PostgreSQL 16** (хостинг на Supabase, нормализованная реляционная схема с каскадными связями и внешними ключами).
- **Инфраструктура и деплой:**
  - Фронтенд: **Cloudflare Pages** с автоматической маршрутизацией SPA через `_redirects`.
  - Бэкенд: **Google Cloud Run** (легковесный Docker-контейнер на базе `alpine`).

---

##  Карта файлов и связей API

Архитектура репозитория строго разделена на фронтенд (`frontend/`) и бэкенд (`backend/`).

### Структура проекта
```
DigitalHR/
├── .env.example                       # Шаблон переменных окружения
├── docker-compose.yml                 # Спецификация локального запуска контейнеров
├── readme-fun-photo.png               # Фотография команды проекта
├── docs/                              # Документация ТЗ и регламенты
│   └── support.md
├── backend/                           # Go REST API сервис
│   ├── cmd/api/main.go                # Точка входа приложения
│   ├── internal/
│   │   ├── config/config.go           # Конфигурация из .env (включая PASSWORD_HR)
│   │   ├── database/bootstrap.go      # Подключение к PG, миграции и синхронизация пароля HR
│   │   ├── db/                        # Сгенерированные sqlc структуры и методы
│   │   ├── http/
│   │   │   ├── router/router.go       # Маршрутизация Chi и назначение RBAC-фильтров
│   │   │   └── httputil/httputil.go   # Единый формат JSON ответов
│   │   ├── middleware/auth.go         # Проверка JWT и проверка ролей (RequireRole)
│   │   ├── integrations/
│   │   │   ├── zup1c/zup1c.go         # Адаптер интеграции с 1С:ЗУП 3.1
│   │   │   └── documentolog/documentolog.go # Адаптер интеграции с СЭД Documentolog
│   │   └── modules/
│   │       ├── auth/                  # Авторизация по ИИН и bcrypt паролю
│   │       ├── profile/               # Личный профиль сотрудника и смена пароля
│   │       ├── requests/              # Заявки на отпуск и аванс, таймлайн согласования
│   │       ├── team/                  # Задачи отделов, канбан-доска, распределение
│   │       ├── academy/               # Курсы, уроки, тесты и надзор за обучением
│   │       ├── ai/                    # RAG-ассистент AI Jana, KB и эскалации
│   │       ├── hr/                    # Создание и управление штатом сотрудников
│   │       ├── analytics/             # Сквозная HR-аналитика компании
│   │       └── notifications/         # Центр уведомлений
│   └── sql/
│       ├── migrations/001_init.sql    # Схема таблиц БД
│       ├── queries/queries.sql        # Запросы sqlc
│       └── seed/seed.sql              # Базовые отделы, курсы и база знаний
└── frontend/                          # Angular 22 клиент
    └── src/app/
        ├── core/
        │   ├── guards/auth.guard.ts   # Route guards: authGuard и rootRedirectGuard
        │   └── services/
        │       ├── api.service.ts     # HTTP-клиент с интерцептором Bearer JWT
        │       ├── auth.service.ts    # Управление сессией, сигналами пользователя и ролями
        │       └── i18n.service.ts    # Двуязычный словарь (RU / KZ)
        ├── shared/
        │   └── components/
        │       ├── header/            # Шапка, мобильное меню, уведомления, профиль
        │       ├── icon/              # SVG-иконки
        │       └── spotlight-tour/    # Интерактивный гид по разделам платформы
        └── features/
            ├── login/                 # Страница входа по ИИН и паролю
            ├── profile/               # Ролевой кабинет (HR / Руководитель / Работник)
            ├── tasks/                 # Канбан-доска задач подразделения
            ├── requests/              # Реестр и подача заявок на отпуск и аванс
            ├── academy/               # LMS-каталог курсов, уроки и онлайн-квизы
            ├── ai/                    # Чат с AI Jana, цитирование регламентов
            ├── hr-employees/          # Администрирование сотрудников компании
            └── analytics/             # Метрики задач, заявок и обучения
```

### Сводная таблица связей между Frontend и Backend API

| Раздел Frontend | Файлы компонента | Endpoint Backend | Метод | Описание операции | Ролевой доступ |
|---|---|---|:---:|---|:---:|
| **Вход** | `login.component.ts` | `/api/auth/login` | `POST` | Проверка ИИН и пароля (bcrypt), выдача JWT | Публичный |
| **Профиль** | `profile.component.ts` | `/api/me` | `GET` | Получение досье текущего пользователя | Все роли |
| **Пароль** | `profile.component.ts` | `/api/profile/password` | `PUT` | Безопасная смена пароля текущего пользователя | Все роли |
| **Задачи** | `tasks.component.ts` | `/api/tasks` | `GET` | Получение задач (личных / отдела / компании) | Все роли |
| **Задачи** | `tasks.component.ts` | `/api/tasks` | `POST` | Создание нового поручения с дедлайном | Руководитель, HR |
| **Задачи** | `tasks.component.ts` | `/api/tasks/{id}/status` | `PUT` | Перемещение задачи (todo → in_progress → done) | Все роли |
| **Заявки** | `requests.component.ts` | `/api/requests` | `POST` | Подача заявления на отпуск/аванс | Работник, Руководитель |
| **Заявки** | `requests.component.ts` | `/api/requests/my` | `GET` | Реестр личных заявок с историей | Все роли |
| **Заявки** | `requests.component.ts` | `/api/requests/department` | `GET` | Заявки своего отдела на рассмотрение | Руководитель, HR |
| **Заявки** | `requests.component.ts` | `/api/requests/{id}/decision` | `POST` | Согласование / Отклонение заявки | Руководитель, HR |
| **Academy** | `academy.component.ts` | `/api/courses` | `GET` | Каталог обязательных и развивающих курсов | Все роли |
| **Academy** | `academy.component.ts` | `/api/courses/{id}/quiz` | `POST` | Проверка ответов теста, расчет проходного балла | Все роли |
| **AI Jana** | `ai.component.ts` | `/api/ai/chat` | `POST` | RAG-поиск по регламентам, ответ с цитированием | Все роли |
| **AI Jana** | `ai.component.ts` | `/api/ai/escalate` | `POST` | Создание тикета эскалации при отсутствии ответа | Все роли |
| **Персонал** | `hr-employees.component.ts` | `/api/hr/employees` | `GET` | Реестр всех сотрудников и балансов отпусков | Руководитель, HR |
| **Персонал** | `hr-employees.component.ts` | `/api/hr/employees` | `POST` | Создание нового профиля работника в системе | HR-директор |
| **Аналитика** | `analytics.component.ts` | `/api/hr/analytics` | `GET` | Сводные метрики отделов, задач и заявок | Руководитель, HR |

---

##  Диаграммы бизнес-процессов

### 1. Сквозной процесс согласования отпуска (E2E)

```mermaid
sequenceDiagram
    autonumber
    actor Emp as Работник (Алия)
    participant UI as JanaMen Frontend
    participant API as Backend (Go API)
    participant DB as PostgreSQL (Supabase)
    actor Mgr as Руководитель (Ерлан)
    participant DOC as СЭД Documentolog
    participant ZUP as 1С:ЗУП 3.1

    Emp->>UI: Выбор дат отпуска (10 дней)
    UI->>UI: Проверка остатка: 10 <= 24 (ОК)
    Emp->>UI: Нажатие «Подать заявку»
    UI->>API: POST /api/requests (Bearer JWT)
    API->>DB: INSERT INTO requests (status='pending')
    API->>DB: INSERT INTO request_history (status='pending')
    API-->>UI: 201 Created (id=42, status='pending')
    
    Note over Mgr,API: Руководитель входит в свой кабинет
    Mgr->>UI: Открытие вкладки «Заявки отдела»
    UI->>API: GET /api/requests/department
    API-->>UI: Список заявок отдела поставок
    Mgr->>UI: Нажатие «Согласовать»
    UI->>API: POST /api/requests/42/decision {"decision":"approved"}
    
    API->>DB: UPDATE requests SET status='approved'
    API->>DB: UPDATE users SET vacation_days_left = 24 - 10 = 14
    API->>DOC: doc.SubmitForApproval(42, "vacation")
    DOC-->>API: docID="DOC-vacation-00042"
    API->>ZUP: zup.PostVacation(IIN, 10)
    ZUP-->>API: docNumber="1C-ZUP-VAC-1010"
    API->>DB: INSERT INTO notifications (уведомление работнику)
    API-->>UI: 200 OK (статус обновлен)
    
    Emp->>UI: Обновление экрана
    UI-->>Emp: Статус «Одобрена», списано 10 дней отпуска, таймлайн завершен
```

---

### 2. Пайплайн безопасности и RAG-ассистента AI Jana

```mermaid
flowchart TD
    Start["Вопрос пользователя в чате"] --> CheckSafety{"Проверка Guardrails\n(ПДн, зарплаты, чужие данные?)"}
    
    CheckSafety -->|Да: запрос чужих ПДн| BlockMsg["⛔ Блокировка ответа:\n'Запрос нарушает политику конфиденциальности персональных данных компании'"]
    
    CheckSafety -->|Нет: штатный кадровый вопрос| SearchKB["Семантический поиск по регламентам\n(kb_documents в БД PostgreSQL)"]
    
    SearchKB --> Found{"Регламент найден в базе?"}
    
    Found -->|Да| GenAnswer["Формирование ответа с цитированием:\n• Точный текст правила\n• 📄 Источник: Регламент, Раздел, Пункт"]
    
    Found -->|Нет| NoHallucination["Защита от галлюцинаций:\n'В официальных регламентах нет точной информации'"]
    NoHallucination --> EscalateBtn["Отображение кнопки:\n'📩 Создать обращение в HR'"]
```

---

##  Ролевая модель (RBAC) и изоляция отделов

В платформе реализована строгая ролевая модель, где права проверяются **как в пользовательском интерфейсе, так и на уровне бэкенда через Go middleware `RequireRole`**:

| Возможность | Работник (Employee) | Руководитель (Manager) | HR-директор (HR Admin) |
|---|:---:|:---:|:---:|
| Просмотр своего профиля и баланса отпуска | ✅ | ✅ | ✅ |
| Смена своего пароля | ✅ | ✅ | ✅ |
| Подача заявки на отпуск / аванс | ✅ | ✅ | ❌ *(подает как сотрудник)* |
| Просмотр и изменение статусов личных задач | ✅ | ✅ | ✅ |
| Назначение задач сотрудникам своего отдела | ❌ | ✅ | ✅ |
| Согласование заявок сотрудников своего отдела | ❌ | ✅ | ✅ |
| **Доступ к заявкам и задачам ЧУЖИХ отделов** | ⛔ **403 Forbidden** | ⛔ **403 Forbidden** | ✅ *(Сквозной доступ)* |
| Добавление новых сотрудников в компанию | ❌ | ❌ | ✅ |
| Сквозная HR-аналитика по всем подразделениям | ❌ | Частично *(свой отдел)* | ✅ *(Вся компания)* |

### Структура подразделений компании JanaPost:
1. **Отдел поставок заказов** (`code: supply`) — обработка клиентских отправлений, поставки и дистрибуция.
2. **Отдел логистики и склада** (`code: logistics`) — складской учет, инвентаризация, прием и распределение грузов.
3. **Отдел IT и поддержки** (`code: it_support`) — инфраструктура, клиентская и техническая поддержка.

---

## 🔌 Точки интеграции с 1С:ЗУП и Documentolog

В соответствии с требованиями ТЗ в кодовой базе бэкенда архитектурно выделены **независимые модули-адаптеры**:
- `backend/internal/integrations/zup1c/zup1c.go`
- `backend/internal/integrations/documentolog/documentolog.go`

В кодовой базе реализована слабая связанность через Go `interface`, что позволяет мгновенно переключить Mock-реализацию на боевые Production-клиенты в `backend/cmd/api/main.go` без переписывания бизнес-логики сервиса.

### 1. Интеграция с «1С:ЗУП 3.1 КОРП»

#### Интерфейс адаптера:
```go
type Client interface {
    // GetEmployee возвращает официальные кадровые данные из 1С по ИИН (должность, остаток отпуска)
    GetEmployee(iin string) (EmployeeRecord, error)
    
    // PostVacation регистрирует приказ на отпуск в 1С:ЗУП после утверждения
    PostVacation(iin string, days int) (docNumber string, err error)
    
    // PostAdvance создает расчетную ведомость на выплату аванса
    PostAdvance(iin string, amount float64) (docNumber string, err error)
}
```

#### Точки подключения в Production:
1. **Кадровые данные сотрудников (OData / REST):**
   - **Endpoint 1С:** `GET /odata/standard.odata/Catalog_Сотрудники?$filter=ИНН eq '{iin}'&$format=json`
   - **Endpoint 1С:** `GET /odata/standard.odata/InformationRegister_ОстаткиОтпусков?$filter=Сотрудник_Key eq guid'{guid}'&$format=json`
   - **Преобразование данных:** маппинг полей `Наименование` → `full_name`, `ТекущаяДолжность` → `position`, `КоличествоДней` → `vacation_days_left`.
2. **Проведение отпуска (Создание документа):**
   - **Endpoint 1С:** `POST /odata/standard.odata/Document_ОтпускаОрганизаций`
   - **Payload:**
     ```json
     {
       "Date": "2026-10-18T10:00:00",
       "Сотрудник_Key": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
       "ДатаНачала": "2026-11-01",
       "ДатаОкончания": "2026-11-14",
       "ДнейОтпуска": 14,
       "Проведен": true
     }
     ```
   - **Ответ 1С:** `Номер` документа (сохраняется в таймлайне заявки JanaMen).
3. **Настройки в `.env` для включения:**
   ```env
   ZUP_BASE_URL=https://1c.janapost.kz/zup/odata/standard.odata
   ZUP_USERNAME=ws_janamen
   ZUP_PASSWORD=SuperSecretPassword1C
   ```

---

### 2. Интеграция с СЭД «Documentolog»

#### Интерфейс адаптера:
```go
type Client interface {
    // SubmitForApproval регистрирует проект электронного приказа и запускает маршрут согласования
    SubmitForApproval(requestID int, kind string) (docID string, err error)
    
    // GetStatus опрашивает СЭД о статусе подписания документа электронной цифровой подписью (ЭЦП)
    GetStatus(docID string) (string, error)
}
```

#### Точки подключения в Production:
1. **Регистрация приказа и запуск маршрута согласования:**
   - **Endpoint Documentolog:** `POST /api/v1/documents`
   - **Headers:** `Authorization: Bearer {DOC_API_TOKEN}`, `Content-Type: application/json`
   - **Payload:**
     ```json
     {
       "template_code": "ORDER_VACATION_V2",
       "initiator_iin": "020101343200",
       "attributes": {
         "request_id": 42,
         "period_from": "2026-11-01",
         "period_to": "2026-11-14",
         "days_count": 14
       },
       "route": [
         { "role": "MANAGER", "iin": "900101300111", "order": 1 },
         { "role": "HR_DIRECTOR", "iin": "880101300555", "order": 2 }
       ]
     }
     ```
   - **Ответ Documentolog:** `{"document_id": "DOC-2026-98124", "status": "on_route"}`.
2. **Входящий Webhook от Documentolog (Двусторонняя синхронизация):**
   - Создается эндпоинт в роутере `router.go`: `POST /api/webhooks/documentolog`.
   - При подписании всеми сторонами Documentolog отправляет событие:
     ```json
     {
       "event": "document.signed",
       "document_id": "DOC-2026-98124",
       "request_id": 42,
       "signed_at": "2026-10-18T10:45:00Z"
     }
     ```
   - Бэкенд автоматически переводит заявку в статус `completed`, проводит списание в 1С:ЗУП и уведомляет сотрудника.
3. **Настройки в `.env` для включения:**
   ```env
   DOCUMENTOLOG_API_URL=https://sed.janapost.kz/api/v1
   DOCUMENTOLOG_TOKEN=doc_token_live_abc123
   DOCUMENTOLOG_WEBHOOK_SECRET=whsec_janamen_2026
   ```

---

##  Чек-лист защиты: 6 ключевых сценариев демонстрации

Все сценарии полностью проверены и готовы к демонстрации перед членами жюри:

### Сценарий 1. Вход и обзор единого окна (Dashboard)
- Заходим на страницу авторизации `http://localhost:4200/login`.
- Вводим учетные данные работника: ИИН `020101343200`, пароль `JanaMen2026!`.
- Попадаем в личный кабинет: сверху отображается навигация сотрудника (*«Задачи»*, *«Заявки»*, *«Jana Academy»*, *«Jana AI»*). Шапка не перегружена функциями HR.
- Открываем профиль: видим баланс отпуска (19/24 дня), стаж, личные задачи и статус учетной записи.

### Сценарий 2. Оформление заявки со сквозным таймлайном
- Переходим в раздел **«Заявки»** ➔ нажимаем **«Подать заявку»**.
- Выбираем тип *«Заявка на ежегодный оплачиваемый отпуск»*, указываем даты.
- Система автоматически проверяет лимит дней: если запрошено больше доступного остатка, появляется предупреждение.
- Отправляем заявку: в карточке открывается интерактивный таймлайн:  
  `Создана сотрудником` ➔ `На согласовании у руководителя` ➔ `Отправлена в Documentolog` ➔ `Проведена в 1С:ЗУП`.

### Сценарий 3. Роль Руководителя и безопасность (RBAC & 403 Forbidden)
- Выходим и авторизуемся как Руководитель отдела поставок: ИИН `900101300111`, пароль `JanaMen2026!`.
- Руководитель открывает раздел «Заявки» и видит только заявки сотрудников **своего подразделения**.
- Нажимает «Согласовать»: статус меняется, у сотрудника списываются дни отпуска, в колокольчик уходит уведомление.
- **Проверка безопасности:** если попытаться запросить данные чужого отдела через консоль/API, сервер вернет жесткую ошибку **`403 Forbidden`**.

### Сценарий 4. Интерактивное обучение в Jana Academy
- Переходим в раздел **«Jana Academy»**.
- Открываем обязательный курс *«Информационная безопасность»*.
- Изучаем 4 интерактивных урока и нажимаем **«Пройти тестирование»**.
- Отвечаем на вопросы квиза: при наборе от 70% система поздравляет с успешной сдачей, фиксирует прогресс 100% и отправляет сертификационное уведомление в профиль.

### Сценарий 5. Точный ответ AI Jana (RAG с цитированием регламентов)
- Открываем вкладку **«Jana AI»**.
- Задаем регламентный вопрос: *«Как рассчитывается ежегодный отпуск?»*.
- AI Jana мгновенно выдает ответ с цитированием официального источника:  
  ` Источник: «Регламент ежегодных отпусков», Раздел 2. Расчёт отпуска`.

### Сценарий 6. Защита от галлюцинаций и Guardrails
- Задаем провокационный вопрос: *«Какая зарплата у моего начальника Ерлана?»*.  
  ➔ AI Jana **блокирует запрос**, ссылаясь на Закон РК о персональных данных и корпоративную этику.
- Задаем абстрактный вопрос: *«Какая погода завтра на Марсе?»*.  
  ➔ AI Jana **отказывается выдумывать**, сообщает об отсутствии информации во внутренних регламентах и предлагает кнопку **«Создать обращение в HR»**.

---

##  Инструкция по сборке и локальному запуску

### Системные требования:
- **Node.js** >= 20.x или **Bun** >= 1.1 *(рекомендуется Bun)*
- **Go** >= 1.22
- **PostgreSQL** 15+ (или бесплатный проект на Supabase)
- **Git**

---

### Настройка переменных окружения

В корневой директории проекта создайте файл `.env` на основе шаблона [.env.example](file:///c:/Users/karag/CODES/DigitalHR/.env.example):

```env
# База данных PostgreSQL (Supabase Pooler / Direct)
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-eu-north-1.pooler.supabase.com:5432/postgres

# Порт бэкенда
PORT=8080

# JWT Секретный ключ подписи сессий
JWT_SECRET=janamen-production-super-secret-key-2026

# Разрешенные CORS-домены
CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200,https://kilcdevs.net

# Автозаполнение БД при первом старте (департаменты, курсы, регламенты)
AUTO_SEED=true

# Пароль учетной записи HR-директора (динамически синхронизируется в БД при старте)
PASSWORD_HR=admin123
```

> [!NOTE]
> Значение `PASSWORD_HR` в [.env](file:///c:/Users/karag/CODES/DigitalHR/.env) автоматически хэшируется бэкендом алгоритмом bcrypt при запуске и связывается с учетной записью HR-директора (`880101300555`).

---

### Вариант 1. Запуск через Docker Compose (Все в 1 команду)

```bash
docker compose up --build
```
- Бэкенд запустится на `http://localhost:8080`.
- База данных автоматически проведет миграции и заполнится демо-данными.

---

### Вариант 2. Локальный запуск (Разработка)

#### 1. Запуск Backend (Go):
```bash
cd backend
go run ./cmd/api
```
*Консоль подтвердит:*
```
Connected to PostgreSQL successfully
Database schema migrated
HR administrator password synchronized with PASSWORD_HR from environment
Server listening on http://localhost:8080
```

#### 2. Запуск Frontend (Angular + Bun):
```bash
cd frontend
bun install
bun start
```
*Приложение откроется по адресу: **`http://localhost:4200`**.*

---

##  Инструкция по развертыванию в Production

### 1. Frontend: Деплой на Cloudflare Pages (Домен `kilcdevs.net`)

1. **Сборка продакшн-бандла:**
   ```bash
   cd frontend
   bun run build
   ```
2. **Публикация через Cloudflare Wrangler:**
   ```bash
   bun x wrangler pages deploy dist/frontend/browser --project-name=janamen
   ```
3. **Маршрутизация SPA:**  
   В директории `frontend/public/_redirects` настроено правило:
   ```
   /*    /index.html   200
   ```
   Это исключает ошибки 404 при обновлении страниц Angular роутера в браузере.

---

### 2. Backend: Деплой на Google Cloud Run

1. **Сборка и отправка Docker-образа в Google Artifact Registry:**
   ```bash
   gcloud builds submit --tag gcr.io/[PROJECT_ID]/janamen-backend backend/
   ```
2. **Развертывание контейнера:**
   ```bash
   gcloud run deploy janamen-backend \
     --image gcr.io/[PROJECT_ID]/janamen-backend \
     --platform managed \
     --region europe-west1 \
     --allow-unauthenticated \
     --set-env-vars DATABASE_URL="[SUPABASE_URL]",JWT_SECRET="[JWT_SECRET]",PASSWORD_HR="[PASSWORD_HR]"
   ```
---

##  Двуязычная локализация (RU / KZ)

Платформа спроектирована с учетом языкового законодательства Республики Казахстан и поддерживает мгновенное переключение языка без перезагрузки страницы.

- **Архитектура i18n:** сервис [i18n.service.ts](file:///c:/Users/karag/CODES/DigitalHR/frontend/src/app/core/services/i18n.service.ts) с реактивным сигналом `currentLang = signal<'ru' | 'kz'>('ru')`.
- **База данных:** таблицы `departments`, `courses`, `kb_documents` имеют двуязычные колонки:
  - `name_ru` / `name_kz`
  - `title_ru` / `title_kz`
  - `description_ru` / `description_kz`
- **Jana AI:** отвечает на том языке, на котором пользователь задал вопрос (русский или казахский).

---

##  Безопасность и защита данных

1. **Криптографическая защита паролей:** пароли сотрудников хранятся исключительно в виде bcrypt-хэшей (стоимость `bcrypt.DefaultCost = 10`), открытые пароли нигде не сохраняются.
2. **Безопасность JWT:** токены подписываются алгоритмом HMAC-SHA256 с валидацией срока жизни (`exp`) и идентификатора пользователя (`user_id`).
3. **Межсайтовая защита (CORS):** строгий белый список доверенных доменов (`localhost:4200`, `kilcdevs.net`).
4. **Изоляция подразделений:** доступ на чтение и редактирование заявок и задач проверяется на уровне SQL-запросов (WHERE `department_id = $1`).

---

<div align="center">
  <b>Разработано от лица команды 22❤️</b><br />
</div>
