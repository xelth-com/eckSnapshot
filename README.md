
# eckSnapshot

**eckSnapshot** is a powerful CLI tool designed for creating codebase snapshots and interacting with them using AI agents. It allows you to package the entire context of a project into a single file, use profiles to focus on specific parts of the system, and directly delegate coding tasks to AI coders like Claude and OpenAI Codex.

This tool is built for a workflow where the user acts as a product owner or high-level architect, providing goals and guidance, while AI agents handle the detailed implementation.

## Core Architecture & Key Features

The project has evolved to include an intelligent dispatching system that makes it more efficient, reliable, and powerful.

#### ✅ Intelligent AI Dispatcher & Failover System

The heart of the system is no longer a set of simple commands, but an intelligent dispatcher that routes tasks to the best AI agent based on the nature of the request.

*   **For Code Generation (`ask-claude`):** This is the primary command for writing and refactoring code. It now features a **failover system** for maximum reliability. It first attempts to use Claude, which is highly optimized for coding tasks. If the request fails for any reason (API error, service unavailability), the system **automatically and seamlessly retries** the task using the high-quality GPT-5 Codex configuration, notifying you of the switch.

*   **For Analytical Tasks (`profile-detect`, initial setup):** For internal tasks that require understanding the project structure but not writing production code, the dispatcher prioritizes **speed and cost-efficiency**. It first attempts the task using `gpt-5-codex` with a `low` reasoning level for a quick analysis. If that fails, it falls back to the powerful Claude model to ensure the task is completed reliably.

#### ✅ High-Quality & Configurable GPT Coder (`ask-gpt`)

The `ask-gpt` command has been significantly enhanced to provide maximum control and quality for code generation.

*   **Highest Quality by Default:** By default, all requests to `ask-gpt` use the **`gpt-5-codex`** model with a **`high`** reasoning level. This ensures that any direct request to GPT is handled with the deepest possible analysis for the best code quality.

*   **Full Configurability:** You can override the defaults using the `--model` and `--reasoning` flags to tailor the agent's behavior to your specific needs. This allows you to:
    *   Switch to the base **`gpt-5`** model for tasks better suited for natural language, like writing documentation.
    *   Reduce the reasoning level to **`low`** or **`medium`** for simpler, faster code modifications.

#### ✅ Stable Foundational Features

*   **Repository Snapshots (`snapshot`):** Generate complete or partial snapshots of your project into a single text file, perfectly suited for feeding into Large Language Models (LLMs).
*   **Context Profiling (`--profile`):** Use pre-configured or custom profiles to include only relevant parts of the codebase in a snapshot. This is essential for focusing the AI's attention.
    *   **Usage:** You can combine profiles and ad-hoc glob patterns. Prefix with `-` to exclude.
    *   **Example:** `snapshot --profile "backend,-**/tests/**"` — uses the `backend` profile but excludes all test files.
    *   **Example:** `snapshot --profile "src/**/*.js,-**/*.test.js"` — includes all JS files in `src` but excludes tests.

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

*   **Ask Claude to refactor code (with automatic GPT failover):**
    ```bash
    node index.js ask-claude '{"objective": "Refactor the UserService to use the new DatabaseRepository"}'
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

*   **Ask GPT to perform a complex task (uses max quality by default):**
    ```bash
    node index.js ask-gpt '{"objective": "Implement a caching layer for the API using Redis"}'
    ```

*   **Ask GPT to write documentation (overriding the model for better text generation):**
    ```bash
    node index.js ask-gpt '{"objective": "Write JSDoc comments for all functions in utils.js"}' --model gpt-5
    ```

*   **Ask GPT for a simple, quick code modification (overriding reasoning level):**
    ```bash
    node index.js ask-gpt '{"objective": "Rename the variable `user` to `customer` in `billing.js`"}' --reasoning low
    ```

*   **Index a large project for semantic search:**
    ```bash
    node index.js index
    ```

*   **Ask a question to the indexed project:**
    ```bash
    node index.js query "How does the authentication middleware work?"
    ```

## Working with Profiles

Profiles allow you to focus snapshots on specific parts of your codebase, making AI interactions more efficient and targeted.

### Auto-Generating Profiles

The `profile-detect` command analyzes your project structure and automatically creates context profiles:

```bash
node index.js profile-detect
```

This command:
1. Scans your entire project directory tree
2. Uses AI (Claude) to analyze the structure and identify logical components
3. Generates profiles with include/exclude glob patterns
4. Saves them to `.eck/profiles.json`

**Example output:**
```
✨ Detected Profiles:
---------------------------
  - cli
  - core
  - database
  - services
  - utils
  - templates
  - tests
  - config
  - docs

✔ Successfully detected and saved 10 profiles to .eck/profiles.json
```

### Profile File Structure

Profiles are stored in `.eck/profiles.json`:

```json
{
  "backend": {
    "include": ["src/server/**", "src/database/**"],
    "exclude": ["**/*.test.js"]
  },
  "frontend": {
    "include": ["src/client/**", "src/components/**"],
    "exclude": ["**/*.spec.js"]
  },
  "docs": {
    "include": ["docs/**", "*.md"],
    "exclude": []
  }
}
```

### Using Profiles

Once profiles are generated, use them with the `--profile` flag:

**Single profile:**
```bash
node index.js snapshot --profile backend
```

**Multiple profiles:**
```bash
node index.js snapshot --profile "backend,database"
```

**Profile with exclusions:**
```bash
node index.js snapshot --profile "backend,-**/tests/**"
```

**Mix profiles with ad-hoc patterns:**
```bash
node index.js snapshot --profile "backend,src/utils/**,-**/*.test.js"
```

**Benefits:**
- ✅ Smaller, more focused snapshots
- ✅ Faster AI processing
- ✅ More relevant context for AI agents
- ✅ Reusable across multiple snapshot operations

## Advanced Snapshot Compression

For large codebases (especially C/C++ projects with vendor dependencies like ESP-IDF, Android SDK, or Linux kernel), `eck-snapshot` provides powerful compression options to reduce snapshot size while maintaining essential information.

### Code Abstraction (`--abstract [level]`)

The `--abstract` flag uses a tree-sitter-based parser to create lightweight code signatures by removing function bodies and implementation details, keeping only the API surface.

**Syntax:**
```bash
node index.js snapshot --abstract [level]
```

- `level` (optional): 1-9, controls detail level (default: 5)
- Works independently - can be used with or without `--max-lines-per-file`

**What gets removed:**
- ✂️ Function bodies (all levels)
- ✂️ Variable initializations (level ≤ 5)
- ✂️ Array declarations (level ≤ 3)
- ✂️ Comments (level < 7)
- ✂️ Preprocessor conditionals (#if/#ifdef blocks)

**What stays:**
- ✅ `#include` directives
- ✅ `#define` macros
- ✅ Forward declarations (`struct MyStruct;`)
- ✅ Function prototypes without bodies
- ✅ `extern` declarations
- ✅ `typedef` statements (simplified)

**Example:**

```c
// Before (original code)
#include <stdio.h>

/* Configuration */
#define MAX_SIZE 100

struct Point {
    int x;
    int y;
};

int calculate_sum(int a, int b) {
    int result = a + b;
    printf("Sum: %d\n", result);
    return result;
}

// After (--abstract 1)
#include <stdio.h>

#define MAX_SIZE 100

struct Point;
int calculate_sum(int a, int b);
```

**Compression results:** 90-95% reduction for typical C files

### File Truncation (`--max-lines-per-file <number>`)

For vendor headers with thousands of declarations, this option truncates each file to N lines, adding a `[truncated...]` marker.

**Syntax:**
```bash
node index.js snapshot --max-lines-per-file 100
```

- Works with **any** content (full code or abstracted)
- Independent of `--abstract`
- Especially useful for large vendor/generated files

**When to use:**
- Large header files (8000+ lines) that bloat snapshots
- Generated code (protobuf, thrift)
- Vendor SDKs with extensive APIs

### Combining Both Options ⭐ **RECOMMENDED**

For maximum compression, combine both flags:

```bash
node index.js snapshot --abstract 1 --max-lines-per-file 100 --no-tree
```

**Compression comparison (ESP32 project example):**

| Configuration | Size | Reduction | Use Case |
|---------------|------|-----------|----------|
| No flags | ~50MB | 0% | Full source inspection |
| `--abstract 1` | 8.5MB | 83% | API signatures only |
| `--max-lines 100` | ~30MB | 40% | Full code, truncated |
| **Both combined** | **3.0MB** | **94%** | Large projects with vendors |

### Real-World Examples

**1. Analyze your own code (main directory only):**
```bash
node index.js snapshot --abstract 1 --profile "main/**/*.c,main/**/*.h"
# Result: ~60KB
```

**2. Include vendor APIs but keep compact:**
```bash
node index.js snapshot --abstract 1 --max-lines-per-file 75 \
  --profile "**,-build/**,-**/test/**,-**/examples/**"
# Result: ~2.3MB (73% smaller)
```

**3. Debug specific file (full code, no truncation):**
```bash
node index.js snapshot --profile "src/wifi_manager.c"
# Result: Full file with implementation
```

**4. Ultra-compact for CI/documentation:**
```bash
node index.js snapshot --abstract 1 --max-lines-per-file 50 \
  --profile "**,-managed_components/**,-build/**"
# Result: <1MB
```

### Abstraction Levels Guide

| Level | Comments | Variables | Arrays | Use Case |
|-------|----------|-----------|--------|----------|
| **1-3** | None | extern only | Removed | Ultra-minimal API |
| **5** | None | All (no init) | Kept | Default (balanced) |
| **7** | Doc (`/** */`) | All (no init) | Kept | With documentation |
| **9** | All | All (no init) | Kept | Max context |

### Best Practices

1. **For your own code analysis:**
   ```bash
   --abstract 1 --profile "main/**"
   ```

2. **For large projects with dependencies:**
   ```bash
   --abstract 1 --max-lines-per-file 100
   ```

3. **For CI/documentation (readable code):**
   ```bash
   --max-lines-per-file 200  # No abstract
   ```

4. **For extreme compression:**
   ```bash
   --abstract 1 --max-lines-per-file 50
   ```

## Community & Contribution

Developing and testing tools that leverage large language models is a complex task. Running and debugging large models locally requires significant computational resources.

**I would be very grateful for help with testing `eck-snapshot` on powerful hardware, especially with large local models.** If you have the capability and desire to help, please try running the tool and leave your feedback or bug reports in the [Issues](https://github.com/xelth-com/eckSnapshot/issues) section on GitHub.

---

# Русская версия

## eckSnapshot

**eckSnapshot** — это мощный CLI-инструмент, разработанный для создания снимков (снапшотов) кодовой базы и взаимодействия с ней с помощью ИИ-агентов. Он позволяет упаковать весь контекст проекта в один файл, использовать профили для фокусировки на определённых частях системы и напрямую делегировать задачи по написанию и изменению кода ИИ-кодерам, таким как Claude и OpenAI Codex.

Этот инструмент создан для рабочего процесса, в котором пользователь выступает в роли владельца продукта или архитектора высокого уровня, ставя цели и давая указания, в то время как ИИ-агенты занимаются детальной реализацией.

## Ключевая архитектура и возможности

Проект эволюционировал и теперь включает интеллектуальную систему диспетчеризации, которая делает его более эффективным, надежным и мощным.

#### ✅ Интеллектуальный ИИ-диспетчер и система отказоустойчивости

Сердце системы — это уже не набор простых команд, а интеллектуальный диспетчер, который направляет задачи лучшему ИИ-агенту в зависимости от характера запроса.

*   **Для генерации кода (`ask-claude`):** Это основная команда для написания и рефакторинга кода. Теперь она оснащена **системой отказоустойчивости** для максимальной надежности. Сначала она пытается использовать Claude, который отлично оптимизирован для задач кодирования. Если запрос по какой-либо причине завершается неудачей (ошибка API, недоступность сервиса), система **автоматически и бесшовно повторяет** задачу, используя высококачественную конфигурацию GPT-5 Codex, и уведомляет вас о переключении.

*   **Для аналитических задач (`profile-detect`, первоначальная настройка):** Для внутренних задач, требующих понимания структуры проекта, но не написания производственного кода, диспетчер отдает приоритет **скорости и экономической эффективности**. Сначала он пытается выполнить задачу с помощью `gpt-5-codex` с уровнем мышления `low` для быстрого анализа. Если это не удается, он переключается на мощную модель Claude, чтобы гарантировать надежное завершение задачи.

#### ✅ Высококачественный и настраиваемый GPT-кодер (`ask-gpt`)

Команда `ask-gpt` была значительно улучшена для обеспечения максимального контроля и качества при генерации кода.

*   **Высочайшее качество по умолчанию:** По умолчанию все запросы к `ask-gpt` используют модель **`gpt-5-codex`** с **`high`** уровнем мышления. Это гарантирует, что любой прямой запрос к GPT будет обработан с максимально глубоким анализом для наилучшего качества кода.

*   **Полная настраиваемость:** Вы можете переопределить настройки по умолчанию с помощью флагов `--model` и `--reasoning`, чтобы адаптировать поведение агента к вашим конкретным потребностям. Это позволяет вам:
    *   Переключиться на базовую модель **`gpt-5`** для задач, лучше подходящих для естественного языка, например, для написания документации.
    *   Снизить уровень мышления до **`low`** или **`medium`** для более простых и быстрых изменений в коде.

#### ✅ Стабильные базовые функции

*   **Снимки репозитория (`snapshot`):** Генерируйте полные или частичные снимки вашего проекта в виде одного текстового файла, который идеально подходит для передачи в большие языковые модели (LLM).
*   **Профилирование контекста (`--profile`):** Используйте преднастроенные или свои собственные профили для включения в снимок только релевантных частей кодовой базы. Это ключевая функция для фокусировки внимания ИИ.
    *   **Использование:** Вы можете комбинировать профили и glob-паттерны. Используйте префикс `-` для исключения.
    *   **Пример:** `snapshot --profile "backend,-**/tests/**"` — использует профиль `backend`, но исключает все файлы тестов.
    *   **Пример:** `snapshot --profile "src/**/*.js,-**/*.test.js"` — включает все JS-файлы в `src`, но исключает тесты.

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

*   **Попросить Claude провести рефакторинг (с автоматическим переключением на GPT в случае сбоя):**
    ```bash
    node index.js ask-claude '{"objective": "Провести рефакторинг UserService для использования нового DatabaseRepository"}'
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

*   **Попросить GPT выполнить сложную задачу (использует максимальное качество по умолчанию):**
    ```bash
    node index.js ask-gpt '{"objective": "Реализовать слой кэширования для API с использованием Redis"}'
    ```

*   **Попросить GPT написать документацию (переопределяя модель для лучшей генерации текста):**
    ```bash
    node index.js ask-gpt '{"objective": "Написать комментарии в формате JSDoc для всех функций в utils.js"}' --model gpt-5
    ```

*   **Попросить GPT внести простое и быстрое изменение (переопределяя уровень мышления):**
    ```bash
    node index.js ask-gpt '{"objective": "Переименовать переменную `user` в `customer` в файле `billing.js`"}' --reasoning low
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