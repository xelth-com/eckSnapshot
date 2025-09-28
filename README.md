
# eckSnapshot

**eckSnapshot** is a powerful CLI tool designed for creating codebase snapshots and interacting with them using AI agents. It allows you to package the entire context of a project into a single file, use profiles to focus on specific parts of the system, and directly delegate coding tasks to AI coders like Claude and OpenAI Codex.

This tool is built for a workflow where the user acts as a product owner or high-level architect, providing goals and guidance, while AI agents handle the detailed implementation.

## Core Concepts & Key Features

The project is evolving, and some features are more stable than others.

#### ✅ Stable Features

*   **Repository Snapshots (`snapshot`):** Generate complete or partial snapshots of your project into a single text file, perfectly suited for feeding into Large Language Models (LLMs).
*   **Context Profiling (`--profile`):** Use pre-configured or custom profiles to include only relevant parts of the codebase in a snapshot. This is essential for focusing the AI's attention.
    *   **Usage:** You can combine profiles and ad-hoc glob patterns. Prefix with `-` to exclude.
    *   **Example:** `snapshot --profile "backend,-**/tests/**"` — uses the `backend` profile but excludes all test files.
    *   **Example:** `snapshot --profile "src/**/*.js,-**/*.test.js"` — includes all JS files in `src` but excludes tests.
*   **Direct Coder Integration (`ask-claude`, `ask-gpt`):** Send structured JSON tasks directly to AI agents to perform code modifications.
    *   `ask-claude`: For users with a Claude Pro subscription.
    *   `ask-gpt`: For users with a ChatGPT Plus/Pro subscription (via the `codex` CLI).

#### 🛠️ Implemented but Needs Testing

*   **Vector Indexing for Large Projects (`index`, `query`):** For repositories that are too large to fit into an LLM's context window, a specialized workflow is implemented.
    *   **How it works:** The `index` command breaks down the entire codebase into logical chunks (functions, classes, files), creates vector embeddings for each, and stores them in a local database. The `query` command then performs a semantic search against this index to retrieve only the most relevant code snippets, generating a smaller, context-aware snapshot for the LLM.
    *   **Status:** This functionality is implemented but requires more real-world testing on very large projects to fine-tune its performance and accuracy.

#### 🧪 Experimental Features

*   **Hierarchical Agent Architecture:** The project is designed with a multi-agent hierarchy in mind (Senior Architect delegating to a Junior Architect). This feature is in active development and is not yet fully stable. The primary, well-tested workflow is direct interaction with coders using the `ask-*` commands.
*   **AI-Powered Profile Detection (`profile-detect`):** This command analyzes your project's directory tree and uses an AI to automatically generate context profiles (`.eck/profiles.json`).
    *   **Important Note:** This command requires a subscription to an AI coder (like Claude Pro), as it delegates the analysis task to an LLM.

## Requirements

To use `eck-snapshot` to its full potential, you will need:

1.  **Node.js** (v18.x or higher).
2.  **One of the following AI Assistant setups:**
    *   **Claude:** An active **Claude Pro** subscription and the `claude-code` CLI installed.
    *   **(Alternative) OpenAI Codex:** An active **ChatGPT Plus/Pro** subscription and the `@openai/codex` CLI installed (`npm install -g @openai/codex`).
3.  **(Optional) Google Gemini:** For working with models with large context windows (like Gemini 2.5 Pro) via a web-based OAuth flow, the `gemini-cli` is required.

## Quick Start

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/xelth-com/eckSnapshot.git
    cd eckSnapshot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **(Recommended) Configure Gemini CLI Integration:**
    This command creates the necessary configuration files for `eck-snapshot` to communicate with `gemini-cli`.
    ```bash
    node index.js setup-gemini
    ```

4.  **Start using!**
    You can run commands via `node index.js <command>` or create a symlink for global access: `npm link`.

## Usage Examples

*   **Create a snapshot of only the backend part of the project:**
    ```bash
    node index.js snapshot --profile backend
    ```

*   **Ask Claude to add error handling to a file:**
    ```bash
    node index.js ask-claude '{
      "objective": "Add try-catch block to the processPayment function in paymentService.js",
      "files_to_modify": [
        {
          "path": "src/services/paymentService.js",
          "action": "modify",
          "location": "function processPayment",
          "details": "Wrap the entire function body in a try-catch block. Log the error to the console and re-throw a custom PaymentError."
        }
      ]
    }'
    ```

*   **Ask OpenAI Codex (GPT) to do the same:**
    ```bash
    node index.js ask-gpt '{ ... }' # The JSON payload is the same
    ```

*   **Index a large project for semantic search:**
    ```bash
    node index.js index
    ```

*   **Ask a question to the indexed project:**
    ```bash
    node index.js query "How does the authentication middleware work?"
    ```

## Community & Contribution

Developing and testing tools that leverage large language models is a complex task. Running and debugging large models locally requires significant computational resources.

**I would be very grateful for help with testing `eck-snapshot` on powerful hardware, especially with large local models.** If you have the capability and desire to help, please try running the tool and leave your feedback or bug reports in the [Issues](https://github.com/xelth-com/eckSnapshot/issues) section on GitHub.

---

# Русская версия

## eckSnapshot

**eckSnapshot** — это мощный CLI-инструмент, разработанный для создания снимков (снапшотов) кодовой базы и взаимодействия с ней с помощью ИИ-агентов. Он позволяет упаковать весь контекст проекта в один файл, использовать профили для фокусировки на определённых частях системы и напрямую делегировать задачи по написанию и изменению кода ИИ-кодерам, таким как Claude и OpenAI Codex.

Этот инструмент создан для рабочего процесса, в котором пользователь выступает в роли владельца продукта или архитектора высокого уровня, ставя цели и давая указания, в то время как ИИ-агенты занимаются детальной реализацией.

## Ключевые концепции и возможности

Проект развивается, и некоторые функции более стабильны, чем другие.

#### ✅ Стабильные функции

*   **Создание снимков репозитория (`snapshot`):** Генерируйте полные или частичные снимки вашего проекта в виде одного текстового файла, который идеально подходит для передачи в большие языковые модели (LLM).
*   **Профилирование контекста (`--profile`):** Используйте преднастроенные или свои собственные профили для включения в снимок только релевантных частей кодовой базы. Это ключевая функция для фокусировки внимания ИИ.
    *   **Использование:** Вы можете комбинировать профили и glob-паттерны. Используйте префикс `-` для исключения.
    *   **Пример:** `snapshot --profile "backend,-**/tests/**"` — использует профиль `backend`, но исключает все файлы тестов.
    *   **Пример:** `snapshot --profile "src/**/*.js,-**/*.test.js"` — включает все JS-файлы в `src`, но исключает тесты.
*   **Прямая интеграция с ИИ-кодерами (`ask-claude`, `ask-gpt`):** Отправляйте структурированные JSON-задачи напрямую ИИ-агентам для выполнения изменений в коде.
    *   `ask-claude`: для пользователей с подпиской Claude Pro.
    *   `ask-gpt`: для пользователей с подпиской ChatGPT Plus/Pro (через `codex` CLI).

#### 🛠️ Реализовано, но требует тестирования

*   **Индексация для больших проектов (`index`, `query`):** Для репозиториев, которые слишком велики для контекстного окна LLM, реализован специальный механизм.
    *   **Как это работает:** Команда `index` разбивает всю кодовую базу на логические части (функции, классы, файлы), создает для каждой векторные представления (embeddings) и сохраняет их в локальной базе данных. Затем команда `query` выполняет семантический поиск по этому индексу, чтобы извлечь только наиболее релевантные фрагменты кода, создавая на их основе небольшой, контекстно-зависимый снимок для LLM.
    *   **Статус:** Эта функциональность реализована, но требует дополнительного тестирования на очень больших проектах для отладки производительности и точности.

#### 🧪 Экспериментальные функции

*   **Иерархическая архитектура агентов:** В проекте заложена концепция взаимодействия нескольких уровней ИИ-агентов (Старший и Младший архитектор). Эта функция находится в стадии активной разработки и пока не является полностью стабильной. Основной и отточенный рабочий процесс — это прямое взаимодействие с кодерами через `ask-*` команды.
*   **Автоматическое определение профилей с помощью ИИ (`profile-detect`):** Эта команда анализирует дерево каталогов вашего проекта и использует ИИ для автоматической генерации профилей контекста (`.eck/profiles.json`).
    *   **Важное замечание:** Для работы этой команды требуется подписка на ИИ-кодера (например, Claude Pro), так как она делегирует задачу анализа LLM.

## Требования

Для полноценной работы `eck-snapshot` вам потребуется:

1.  **Node.js** (версия 18.x или выше).
2.  **Один из следующих ИИ-ассистентов:**
    *   **Claude:** Требуется активная подписка **Claude Pro** и установленный `claude-code` CLI.
    *   **(Альтернатива) OpenAI Codex:** Требуется активная подписка **ChatGPT Plus/Pro** и установленный `@openai/codex` CLI (`npm install -g @openai/codex`).
3.  **(Опционально) Google Gemini:** Для работы с моделями с большим контекстным окном (например, Gemini 2.5 Pro) через веб-интерфейс (OAuth) необходим `gemini-cli`.

## Быстрый старт

1.  **Клонируйте репозиторий:**
    ```bash
    git clone https://github.com/xelth-com/eckSnapshot.git
    cd eckSnapshot
    ```

2.  **Установите зависимости:**
    ```bash
    npm install
    ```

3.  **(Рекомендуется) Сконфигурируйте интеграцию с Gemini CLI:**
    Этот шаг создаст необходимые файлы конфигурации для взаимодействия между `eck-snapshot` и `gemini-cli`.
    ```bash
    node index.js setup-gemini
    ```

4.  **Начинайте использовать!**
    Вы можете запускать команды через `node index.js <команда>` или создать символическую ссылку для глобального доступа: `npm link`.

## Примеры использования

*   **Создать снимок только бэкенд-части проекта:**
    ```bash
    node index.js snapshot --profile backend
    ```

*   **Попросить Claude добавить обработку ошибок в файл:**
    ```bash
    node index.js ask-claude '{
      "objective": "Добавить блок try-catch в функцию processPayment в paymentService.js",
      "files_to_modify": [
        {
          "path": "src/services/paymentService.js",
          "action": "modify",
          "location": "function processPayment",
          "details": "Обернуть всё тело функции в блок try-catch. Логировать ошибку в консоль и выбрасывать кастомную ошибку PaymentError."
        }
      ]
    }'
    ```

*   **Попросить OpenAI Codex (GPT) сделать то же самое:**
    ```bash
    node index.js ask-gpt '{ ... }' # Структура JSON-запроса та же
    ```

*   **Проиндексировать большой проект для семантического поиска:**
    ```bash
    node index.js index
    ```

*   **Задать вопрос проиндексированному проекту:**
    ```bash
    node index.js query "Как работает мидлвэр для аутентификации?"
    ```

## Помощь сообщества и контрибьюторы

Разработка и тестирование инструментов, использующих большие языковые модели, — сложная задача. Локальный запуск и отладка больших моделей требует значительных вычислительных ресурсов.

**Я буду очень признателен за помощь в тестировании `eck-snapshot` с большими локальными моделями на мощном оборудовании.** Если у вас есть возможность и желание помочь, пожалуйста, попробуйте запустить инструмент и оставьте свой отзыв или сообщение об ошибке в разделе [Issues](https://github.com/xelth-com/eckSnapshot/issues) на GitHub.