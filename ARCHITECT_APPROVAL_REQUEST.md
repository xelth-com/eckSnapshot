# Запрос на одобрение Архитектором: Улучшение eckSnapshot

**Дата:** 2025-12-31  
**Задача:** Добавить умную фильтрацию .eck директории  
**Цель:** Архитектор видит документацию, но не видит секреты

---

## 🎯 Проблема

**Текущее состояние (setup.json:377):**
```json
"dirsToIgnore": [
  ".eck/"  // ← Весь .eck полностью игнорируется
]
```

**Последствия:**
- ❌ Архитектор НЕ видит ARCHITECTURE.md, WORKFLOWS.md, DELEGATION_GUIDE.md
- ❌ Нет контекста о проекте для планирования
- ✅ Секреты защищены (но слишком агрессивно)

---

## ✅ Предлагаемое решение

### Изменение 1: Убрать .eck из полного игнорирования

**Файл:** `setup.json`  
**Строка:** 377

**Было:**
```json
"dirsToIgnore": [
  "node_modules/",
  ".git/",
  ".eck/",         // ← УБРАТЬ
  "dist/",
  "build/",
  ...
]
```

**Станет:**
```json
"dirsToIgnore": [
  "node_modules/",
  ".git/",
  // ".eck/" удалена - теперь обрабатывается отдельной логикой
  "dist/",
  "build/",
  ...
]
```

---

### Изменение 2: Добавить секцию eckDirectoryFiltering

**Файл:** `setup.json`  
**Место:** Внутри секции `"fileFiltering": { ... }`  
**Позиция:** После строки 331, перед `"filesToIgnore"`

**Добавить:**
```json
"fileFiltering": {
  "eckDirectoryFiltering": {
    "_comment": "Smart filtering for .eck directory - include architect docs, exclude secrets",
    "enabled": true,
    "defaultBehavior": "include",
    
    "confidentialPatterns": [
      "**/SERVER_ACCESS.md",
      "**/REMOTE_DEVELOPMENT.md",
      "**/README.md",
      "**/TROUBLESHOOTING.md",
      "**/MIGRATION_TEMPLATES.md",
      "**/SECRETS_REFERENCE.md",
      "**/DEPLOYMENT_KEYS.md",
      "**/credentials*.md",
      "**/secrets*.md",
      "**/*_ACCESS.md",
      "**/*_CREDENTIALS.md",
      "**/*_SECRETS.md"
    ],
    
    "confidentialDirectories": [
      "**/snapshots/",
      "**/backups/",
      "**/private/",
      "**/confidential/"
    ],
    
    "alwaysIncludePatterns": [
      "**/ARCHITECTURE.md",
      "**/STACK.md",
      "**/WORKFLOWS.md",
      "**/DELEGATION_GUIDE.md",
      "**/OPERATIONS.md",
      "**/CONTEXT.md",
      "**/ENVIRONMENT.md",
      "**/JOURNAL.md",
      "**/ROADMAP.md",
      "**/TECH_DEBT.md",
      "**/API_SPEC.md",
      "**/DESIGN.md"
    ],
    
    "projectOverrides": {
      "_comment": "Allow projects to customize via .eck/snapshot-config.json",
      "enabled": true,
      "configFile": ".eck/snapshot-config.json"
    }
  },
  
  "filesToIgnore": [
    // ... существующий список ...
  ]
}
```

---

## 🔧 Требуемые изменения в коде

### Файл 1: src/core/fileScanner.js (или аналог)

**Найти функцию фильтрации файлов и добавить:**

```javascript
// Где-то в функции shouldIncludeFile() или filterFiles()

// ДОБАВИТЬ ПЕРЕД ОБЫЧНОЙ ФИЛЬТРАЦИЕЙ:
if (relativePath.startsWith('.eck/')) {
  return applyEckDirectoryFiltering(relativePath, config);
}
```

---

### Файл 2: src/utils/eckFiltering.js (НОВЫЙ ФАЙЛ)

**Создать новый файл с логикой фильтрации:**

```javascript
const minimatch = require('minimatch');
const path = require('path');
const fs = require('fs');

/**
 * Apply smart filtering to .eck directory files
 * @param {string} filePath - Relative file path within .eck directory
 * @param {object} config - Configuration from setup.json
 * @returns {boolean} - true if file should be included
 */
function applyEckDirectoryFiltering(filePath, config) {
  const eckConfig = config.fileFiltering?.eckDirectoryFiltering;
  
  // If filtering disabled, exclude everything (backward compatibility)
  if (!eckConfig || !eckConfig.enabled) {
    return false;
  }
  
  // Load project overrides if exist
  let projectOverrides = null;
  if (eckConfig.projectOverrides?.enabled) {
    projectOverrides = loadProjectOverrides(eckConfig.projectOverrides.configFile);
  }
  
  // Priority 1: alwaysIncludePatterns (highest priority)
  if (matchesAnyPattern(filePath, eckConfig.alwaysIncludePatterns)) {
    return true;
  }
  
  // Priority 2: confidentialPatterns
  if (matchesAnyPattern(filePath, eckConfig.confidentialPatterns)) {
    return false;
  }
  
  // Priority 3: confidentialDirectories
  if (isInConfidentialDirectory(filePath, eckConfig.confidentialDirectories)) {
    return false;
  }
  
  // Priority 4: Project overrides
  if (projectOverrides) {
    const override = checkProjectOverride(filePath, projectOverrides);
    if (override !== null) return override;
  }
  
  // Priority 5: defaultBehavior
  return eckConfig.defaultBehavior === 'include';
}

/**
 * Check if file matches any of the patterns
 */
function matchesAnyPattern(filePath, patterns) {
  if (!patterns || !Array.isArray(patterns)) return false;
  
  return patterns.some(pattern => {
    // Support glob patterns with minimatch
    return minimatch(filePath, pattern, { matchBase: true });
  });
}

/**
 * Check if file is in confidential directory
 */
function isInConfidentialDirectory(filePath, directories) {
  if (!directories || !Array.isArray(directories)) return false;
  
  return directories.some(dir => {
    const normalizedDir = dir.replace(/\*\*/g, '').replace(/\/$/, '');
    return filePath.includes(normalizedDir);
  });
}

/**
 * Load project-specific override configuration
 */
function loadProjectOverrides(configFile) {
  try {
    const configPath = path.join(process.cwd(), configFile);
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    // Silently fail if config doesn't exist or is invalid
    console.warn(`Warning: Could not load project overrides from ${configFile}`);
  }
  return null;
}

/**
 * Check project-specific overrides
 */
function checkProjectOverride(filePath, projectOverrides) {
  const eckFiltering = projectOverrides.eckDirectoryFiltering;
  if (!eckFiltering) return null;
  
  // Check additional confidential patterns
  if (eckFiltering.additionalConfidential) {
    if (matchesAnyPattern(filePath, eckFiltering.additionalConfidential)) {
      return false;
    }
  }
  
  // Check additional public patterns
  if (eckFiltering.additionalPublic) {
    if (matchesAnyPattern(filePath, eckFiltering.additionalPublic)) {
      return true;
    }
  }
  
  return null; // No override, continue with default logic
}

module.exports = {
  applyEckDirectoryFiltering,
  matchesAnyPattern,
  isInConfidentialDirectory
};
```

---

## 📁 Структура файлов для изменения

```
eckSnapshot/
├── setup.json                    ← ИЗМЕНИТЬ (2 места)
│                                    1. Убрать ".eck/" из dirsToIgnore
│                                    2. Добавить eckDirectoryFiltering секцию
├── src/
│   ├── core/
│   │   └── fileScanner.js        ← ИЗМЕНИТЬ (добавить проверку .eck)
│   └── utils/
│       └── eckFiltering.js       ← СОЗДАТЬ (новый файл)
└── README.md                     ← ОБНОВИТЬ (документация)
```

---

## 🧪 Как протестировать

### Тест 1: Базовый snapshot

```bash
cd /home/xelth-com/eckwms
eck-snapshot

# Проверить что в snapshot ЕСТЬ:
grep "ARCHITECTURE.md" .eck/snapshots/latest.md ✅
grep "WORKFLOWS.md" .eck/snapshots/latest.md ✅

# Проверить что в snapshot НЕТ:
grep "SERVER_ACCESS.md" .eck/snapshots/latest.md ❌
grep "snapshots/" .eck/snapshots/latest.md ❌
```

### Тест 2: Project overrides

**Создать:** `/home/xelth-com/eckwms/.eck/snapshot-config.json`
```json
{
  "eckDirectoryFiltering": {
    "additionalConfidential": [
      "INTERNAL_DOCS.md"
    ]
  }
}
```

**Результат:** INTERNAL_DOCS.md тоже исключается

---

### Тест 3: Отключение фильтрации

**В .eck/snapshot-config.json:**
```json
{
  "eckDirectoryFiltering": {
    "enabled": false
  }
}
```

**Результат:** Весь .eck игнорируется (как раньше, обратная совместимость)

---

## 📊 Влияние на другие проекты

### Проекты БЕЗ .eck директории:
- ✅ Никакого влияния (работает как раньше)

### Проекты С .eck директорией:
- ✅ По умолчанию включаются все .eck файлы КРОМЕ конфиденциальных
- ✅ Могут настроить через .eck/snapshot-config.json
- ✅ Могут отключить через config

### Обратная совместимость:
- ✅ Старые проекты продолжат работать
- ✅ Новая функция опциональна (можно отключить)
- ✅ Не ломает существующие snapshots

---

## 💡 Дополнительная идея: Флаг командной строки

**Опционально можно добавить:**

```bash
# Включить все .eck файлы (даже секретные) - для внутреннего использования
eck-snapshot --include-all-eck

# Исключить весь .eck (как раньше)
eck-snapshot --exclude-eck

# По умолчанию - умная фильтрация
eck-snapshot
```

---

## 🚀 План реализации

### Минимальная версия (быстро):
1. Обновить setup.json (2 изменения)
2. Обновить fileScanner.js (добавить if для .eck)
3. Создать eckFiltering.js (логика фильтрации)
4. Тестировать на eckwms

**Время:** ~30-60 минут работы

---

### Полная версия (с доп. фичами):
1. Минимальная версия +
2. Добавить CLI флаги --include-all-eck, --exclude-eck
3. Обновить README с примерами
4. Создать тесты для фильтрации
5. Добавить verbose logging

**Время:** ~2-3 часа работы

---

## ✅ Рекомендация

**Начать с минимальной версии:**
1. Простая, понятная
2. Решает основную проблему
3. Не ломает существующую функциональность
4. Легко тестировать
5. Можно расширить позже

---

## 📝 Вопросы для Архитектора

1. **Одобряешь концепцию умной фильтрации?**
   - Включать .eck по умолчанию
   - Исключать по паттернам конфиденциальности

2. **Паттерны конфиденциальности достаточны?**
   - `*_ACCESS.md`, `*_CREDENTIALS.md`, `*_SECRETS.md`
   - `snapshots/`, `backups/`, `private/`

3. **Нужны ли CLI флаги?**
   - `--include-all-eck`, `--exclude-eck`

4. **Минимальная или полная версия?**
   - Минимальная - быстро, просто
   - Полная - больше фич, больше времени

---

## 🎓 Обучающая документация для users

**После реализации добавить в README.md секцию:**

```markdown
## .eck Directory Smart Filtering

By default, eckSnapshot intelligently filters the .eck directory:

**Included (for Architect):**
- ARCHITECTURE.md, STACK.md, WORKFLOWS.md
- CONTEXT.md, ENVIRONMENT.md, JOURNAL.md
- Any documentation files

**Excluded (confidential):**
- SERVER_ACCESS.md, REMOTE_DEVELOPMENT.md
- Files matching *_ACCESS.md, *_CREDENTIALS.md, *_SECRETS.md
- Directories: snapshots/, backups/, private/

**Customize per project:**
Create `.eck/snapshot-config.json`:
```json
{
  "eckDirectoryFiltering": {
    "additionalConfidential": ["MY_INTERNAL_DOC.md"],
    "additionalPublic": ["MY_PUBLIC_DOC.md"]
  }
}
```

**Disable .eck filtering:**
```json
{
  "eckDirectoryFiltering": {
    "enabled": false
  }
}
```
```

---

## 📊 Матрица принятия решений для Архитектора

| Критерий | Минимальная версия | Полная версия |
|----------|-------------------|---------------|
| **Решает проблему** | ✅ Да | ✅ Да |
| **Время реализации** | ✅ Быстро (30-60 мин) | ⏳ Долго (2-3 часа) |
| **Риск багов** | ✅ Низкий | ⚠️ Средний |
| **Гибкость** | ✅ Достаточно | ✅✅ Максимальная |
| **Тестирование** | ✅ Простое | ⏳ Сложное |
| **Документация** | ✅ Минимум | 📝 Подробная |
| **CLI флаги** | ❌ Нет | ✅ Есть |
| **Обратная совместимость** | ✅ Да | ✅ Да |

---

## 💡 Рекомендация Архитектору

### Вариант А: Минимальная версия (РЕКОМЕНДУЮ)

**Что делаем:**
1. setup.json - 2 изменения
2. fileScanner.js - 1 проверка
3. eckFiltering.js - создать утилиту
4. Тестировать на eckwms

**Плюсы:**
- ✅ Быстро реализуется
- ✅ Низкий риск
- ✅ Решает основную проблему
- ✅ Можно расширить позже

**Минусы:**
- ⚠️ Нет CLI флагов (но можно добавить потом)

---

### Вариант Б: Полная версия

**Дополнительно:**
- CLI флаги --include-all-eck, --exclude-eck
- Verbose logging
- Unit tests
- Расширенная документация

**Плюсы:**
- ✅ Максимальная гибкость
- ✅ Лучший UX

**Минусы:**
- ⏳ Больше времени
- ⚠️ Больше кода для тестирования

---

## 🎯 Решение Архитектора

**Прошу указать:**

1. ✅ / ❌ Одобряешь концепцию?
2. ✅ / ❌ Паттерны конфиденциальности достаточны?
3. A / B Какую версию реализовать? (A - минимальная, B - полная)
4. 📝 Есть ли дополнительные требования?

---

**После одобрения:** Кодер (Claude) реализует изменения

---

## 📎 Приложение: Конкретные изменения JSON

### Полный блок для вставки в setup.json:

**Место вставки:** После строки 331 `"fileFiltering": {`

```json
  "eckDirectoryFiltering": {
    "_comment": "Smart filtering for .eck directory - include architect docs, exclude secrets. This allows architects to see project documentation while keeping credentials and deployment details private.",
    "enabled": true,
    "defaultBehavior": "include",
    "confidentialPatterns": [
      "**/SERVER_ACCESS.md",
      "**/REMOTE_DEVELOPMENT.md",
      "**/README.md",
      "**/TROUBLESHOOTING.md",
      "**/MIGRATION_TEMPLATES.md",
      "**/SECRETS_REFERENCE.md",
      "**/DEPLOYMENT_KEYS.md",
      "**/credentials*.md",
      "**/secrets*.md",
      "**/*_ACCESS.md",
      "**/*_CREDENTIALS.md",
      "**/*_SECRETS.md"
    ],
    "confidentialDirectories": [
      "**/snapshots/",
      "**/backups/",
      "**/private/",
      "**/confidential/"
    ],
    "alwaysIncludePatterns": [
      "**/ARCHITECTURE.md",
      "**/STACK.md",
      "**/WORKFLOWS.md",
      "**/DELEGATION_GUIDE.md",
      "**/OPERATIONS.md",
      "**/CONTEXT.md",
      "**/ENVIRONMENT.md",
      "**/JOURNAL.md",
      "**/ROADMAP.md",
      "**/TECH_DEBT.md",
      "**/API_SPEC.md",
      "**/DESIGN.md"
    ],
    "projectOverrides": {
      "_comment": "Allow projects to customize filtering via .eck/snapshot-config.json",
      "enabled": true,
      "configFile": ".eck/snapshot-config.json"
    }
  },
```

**Что удалить:** Строка 377 - `".eck/",` из `dirsToIgnore`

---

**Дата создания:** 2025-12-31  
**Автор:** Claude Code  
**Статус:** Ожидает одобрения Архитектора
