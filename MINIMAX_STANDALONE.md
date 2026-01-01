# MiniMax Standalone Setup

**Для тех, кто хочет использовать MiniMax напрямую, без Claude Code**

## Зачем это нужно?

Если у вас нет подписки Claude Pro, или вы хотите использовать только MiniMax для кодинга, этот гайд для вас.

## Установка

### 1. Получите API ключ MiniMax
1. Зарегистрируйтесь на [MiniMax Platform](https://platform.minimax.io/)
2. Получите API ключ
3. Добавьте в `.bashrc` или `.zshrc`:
   ```bash
   export MINIMAX_API_KEY="sk-..."
   ```
4. Перезагрузите терминал или выполните:
   ```bash
   source ~/.bashrc
   ```

### 2. Установите Anthropic SDK

MiniMax совместим с Anthropic API, поэтому используем официальный SDK:

```bash
npm install -g @anthropic-ai/sdk
```

### 3. Создайте скрипт `minimax-cli.js`

Создайте файл в удобном месте (например, `~/bin/minimax-cli.js`):

```javascript
#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/anthropic'
});

const prompt = process.argv.slice(2).join(' ');

if (!prompt) {
  console.error('Usage: minimax-cli <your prompt>');
  process.exit(1);
}

async function chat() {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  console.log(message.content[0].text);
}

chat().catch(console.error);
```

### 4. Сделайте скрипт исполняемым

```bash
chmod +x ~/bin/minimax-cli.js
```

### 5. Добавьте алиас (опционально)

Добавьте в `.bashrc` или `.zshrc`:

```bash
alias minimax="node ~/bin/minimax-cli.js"
```

## Использование

### Простой запрос
```bash
minimax "Объясни что такое Promise в JavaScript"
```

### Для кодинга
```bash
minimax "Напиши функцию для валидации email"
```

### С контекстом проекта (используя eck-snapshot)
```bash
# 1. Создайте снапшот
eck-snapshot --skeleton > snapshot.md

# 2. Отправьте снапшот в MiniMax (через веб-интерфейс или расширенный скрипт)
```

## Расширенная версия с файловым вводом

Создайте `minimax-with-file.js`:

```javascript
#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const client = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/anthropic'
});

const args = process.argv.slice(2);
let prompt = '';

// Если передан флаг --file, читаем файл
const fileIndex = args.indexOf('--file');
if (fileIndex !== -1 && args[fileIndex + 1]) {
  const fileContent = await fs.readFile(args[fileIndex + 1], 'utf-8');
  prompt = fileContent + '\n\n' + args.filter((_, i) => i !== fileIndex && i !== fileIndex + 1).join(' ');
} else {
  prompt = args.join(' ');
}

if (!prompt) {
  console.error('Usage: minimax-with-file [--file snapshot.md] <your prompt>');
  process.exit(1);
}

async function chat() {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  console.log(message.content[0].text);
}

chat().catch(console.error);
```

### Использование с файлом:
```bash
eck-snapshot --skeleton -o snapshot.md
minimax-with-file --file snapshot.md "Проанализируй архитектуру и предложи улучшения"
```

## Ограничения

- Нет интерактивного режима (каждый запрос - отдельный вызов)
- Нет истории сессий
- Для сложных задач лучше использовать Supervisor-Worker режим с Claude Code

## Преимущества

✅ Не требуется Claude Pro подписка
✅ Дешевле чем Claude API
✅ Большой контекст (200K tokens)
✅ Быстрые ответы

## Сравнение стоимости

| Модель | Цена (input) | Цена (output) |
|--------|--------------|---------------|
| MiniMax M2.1 | $0.15/1M tokens | $0.60/1M tokens |
| Claude Sonnet 4 | $3.00/1M tokens | $15.00/1M tokens |

**Экономия: до 20x дешевле!**
