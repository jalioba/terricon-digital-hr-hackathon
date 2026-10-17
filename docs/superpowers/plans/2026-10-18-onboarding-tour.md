# Интерактивный Spotlight-онбординг Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать интерактивный тур с подсветкой элементов (Spotlight-тур) и перелетами по вкладкам («Задачи» → «Заявки» → «Jana AI» → «Академия») в качестве обучающей Программы 1 (онбординг по платформе) в Jana Academy, с автоматической фиксацией 100% прогресса по завершении.

**Architecture:** Нативный Angular-сервис `OnboardingTourService` с состоянием на Signals координирует шаги тура, навигацию `Router.navigate()` и расчет позиций подсветки; глобальный компонент `SpotlightTourComponent` рендерит SVG/CSS затемненную маску с вырезом под активный элемент и всплывающую карточку-подсказку со стрелкой; страницы размечаются селекторами `data-tour`.

**Tech Stack:** Angular 19 (Standalone components, Signals, Router, Animations), SCSS, TypeScript.

---

### Task 1: OnboardingTourService
**Files:**
- Create: `frontend/src/app/core/services/onboarding-tour.service.ts`

- [ ] **Step 1: Создать сервис OnboardingTourService**
Определить интерфейсы `TourStep`, шаги для ролей `employee` и `manager`, сигналы `isActive`, `currentStepIndex`, `currentStep`, `targetRect`, методы `startTour()`, `nextStep()`, `prevStep()`, `skipTour()`, `completeTour()`, и расчет координат `updateTargetRect()`.

- [ ] **Step 2: Проверить компиляцию**
Run: `bun run build` в `frontend`
Expected: Успешная компиляция без ошибок.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/app/core/services/onboarding-tour.service.ts
git commit -m "feat(tour): implement OnboardingTourService with Signals and route management"
```

---

### Task 2: SpotlightTourComponent (Overlay & Tooltip)
**Files:**
- Create: `frontend/src/app/shared/components/spotlight-tour/spotlight-tour.component.ts`
- Create: `frontend/src/app/shared/components/spotlight-tour/spotlight-tour.component.html`
- Create: `frontend/src/app/shared/components/spotlight-tour/spotlight-tour.component.scss`
- Modify: `frontend/src/app/app.ts`
- Modify: `frontend/src/app/app.html`

- [ ] **Step 1: Создать компонент SpotlightTourComponent**
Реализовать:
- Затемняющий оверлей с динамическим вырезом (`clip-path` / SVG / `box-shadow`) вокруг координат `targetRect()`.
- Зеленую пульсирующую рамку вокруг целевого элемента.
- Всплывающую карточку подсказки (бейдж шага, заголовок, текст, кнопки «Пропустить», «← Назад», «Далее →» / «Завершить тур»).
- Автоматический расчет позиции (сверху / снизу / по центру) в зависимости от положения на экране.
- Обработку закрытия по клавише `Escape` и стрелок клавиатуры.

- [ ] **Step 2: Включить компонент в корневой App**
Добавить `SpotlightTourComponent` в imports `frontend/src/app/app.ts` и разместить `<app-spotlight-tour></app-spotlight-tour>` в `frontend/src/app/app.html`.

- [ ] **Step 3: Проверить сборку**
Run: `bun run build` в `frontend`
Expected: `Application bundle generation complete`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/app/shared/components/spotlight-tour frontend/src/app/app.ts frontend/src/app/app.html
git commit -m "feat(tour): create SpotlightTourComponent and mount into root application"
```

---

### Task 3: Разметка `data-tour` селекторов на страницах
**Files:**
- Modify: `frontend/src/app/shared/components/header/header.component.html`
- Modify: `frontend/src/app/features/tasks/tasks.component.html`
- Modify: `frontend/src/app/features/requests/requests.component.html`
- Modify: `frontend/src/app/features/ai/ai.component.html`
- Modify: `frontend/src/app/features/academy/academy.component.html`

- [ ] **Step 1: Добавить атрибуты `data-tour` в Header**
- Вкладки навигации: `data-tour="header-nav"`
- Блок профиля и уведомлений: `data-tour="header-actions"`

- [ ] **Step 2: Добавить атрибуты `data-tour` в Tasks**
- Канбан-доска: `data-tour="tasks-kanban-board"`
- Действия по карточке (кнопка «Начать» / «Задача готова»): `data-tour="task-action-btn"`

- [ ] **Step 3: Добавить атрибуты `data-tour` в Requests**
- Кнопка создания заявки: `data-tour="requests-create-btn"`

- [ ] **Step 4: Добавить атрибуты `data-tour` в AI**
- Поле ввода диалога / быстрое действие: `data-tour="ai-chat-input"`

- [ ] **Step 5: Добавить атрибуты `data-tour` в Academy**
- Блок части 1 (платформа): `data-tour="academy-track-platform"`
- Блок части 2 (профессиональные курсы): `data-tour="academy-track-job"`

- [ ] **Step 6: Проверить сборку**
Run: `bun run build` в `frontend`
Expected: 0 errors.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/app/shared/components/header/header.component.html frontend/src/app/features/tasks/tasks.component.html frontend/src/app/features/requests/requests.component.html frontend/src/app/features/ai/ai.component.html frontend/src/app/features/academy/academy.component.html
git commit -m "feat(tour): add data-tour markup across views"
```

---

### Task 4: Интеграция запуска тура и сохранения прогресса в Jana Academy
**Files:**
- Modify: `frontend/src/app/features/academy/academy.component.ts`
- Modify: `frontend/src/app/features/academy/academy.component.html`

- [ ] **Step 1: Подключить OnboardingTourService в AcademyComponent**
Инжектировать сервис, добавить метод `startPlatformTour()`, вызываемый при клике на кнопку «Начать обучение» в блоке Части 1.

- [ ] **Step 2: Реализовать фиксацию 100% прогресса при завершении тура**
При вызове `completeTour()` сервиса:
- Обновлять курс платформы: `status = 'completed'`, `progress = 100`, `score = 100`.
- Показывать всплывающее уведомление об успешном прохождении онбординга.
- Обновлять кнопку на «Пройти тур повторно».

- [ ] **Step 3: Проверить сборку**
Run: `bun run build` в `frontend`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/app/features/academy/academy.component.ts frontend/src/app/features/academy/academy.component.html
git commit -m "feat(tour): integrate interactive tour trigger and 100% progress completion in Jana Academy"
```

---

### Task 5: Визуальное тестирование и верификация в браузере
**Files:**
- Verification via browser subagent / screenshots.

- [ ] **Step 1: Тестирование сценария Сотрудника (`Employee`)**
Войти как Бекова Алия (Сотрудник), перейти в Jana Academy, нажать «Начать интерактивный тур».
Проверить переход по 6 шагам:
1. Академия (`/academy`) -> подсветка Части 1
2. Задачи (`/tasks`) -> подсветка Канбан-доски и кнопки действий
3. Заявки (`/requests`) -> подсветка кнопки «Подать заявку»
4. AI (`/ai`) -> подсветка ввода вопросов ассистенту
5. Шапка -> подсветка уведомлений и профиля
6. Возврат в Академию -> фиксация 100% прогресса и статус «Курс завершен ✅»

- [ ] **Step 2: Тестирование сценария Руководителя (`Manager`)**
Войти как Ибраев Тимур (Руководитель IT), запустить тур, проверить управленческие шаги и фиксацию результата.

- [ ] **Step 3: Сохранить скриншоты подтверждения**
Зафиксировать в отчете.
