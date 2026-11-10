# Рабочий процесс двух агентов

Документ дополняет `AGENTS.md` и фиксирует конкретный порядок работы OpenCode Lead и Codex Sol.

## 1. Роли и права

| Роль | Что делает | Чего не делает |
|---|---|---|
| OpenCode Lead | Архитектура, issue, приоритеты, ревью, финальное техническое решение, merge | Не работает над задачей Sol параллельно в том же каталоге |
| Codex Sol | Реализация назначенной задачи, тесты, PR | Не выбирает задачи сам, не пушит в `main`, не merge-ит |
| Владелец | Доступы, секреты, branch protection, финальное одобрение | Не обязан разбираться в каждом диффе |

## 2. Статусы задачи

`status:ready` → `status:in-progress` → `status:review` → `status:changes` → `status:merged`

Только Lead переводит задачу в `ready` и создаёт следующую. Sol двигает только `in-progress` → `review`.

## 3. Ветки и коммиты

```bash
git fetch origin
git switch main
git pull --ff-only
git switch -c sol/123-short-task
```

Коммиты небольшие и по смыслу:

```text
feat: ...
fix: ...
refactor: ...
test: ...
docs: ...
chore: ...
```

Перед PR:

```bash
npm run build
npm test
git status
```

## 4. Параллельная работа без конфликтов

По умолчанию агенты работают **по очереди**. Если нужно ускориться:

```bash
# отдельный каталог для Sol
git worktree add ../PVZ_tycoon-sol -b sol/123-short-task origin/main
```

OpenCode Lead остаётся в основном каталоге. После merge рабочий worktree удаляется:

```bash
git worktree remove ../PVZ_tycoon-sol
```

Нельзя запускать два агента в одном каталоге: они будут мешать друг другу в `node_modules`, `dist`, HMR и тестах.

## 5. Передача задачи Sol

Lead создаёт issue по шаблону и пишет:

- **Цель:** что должно измениться.
- **Границы:** какие файлы/модули можно трогать.
- **Вне задачи:** что нельзя менять.
- **Критерии:** как проверить, что готово.
- **Проверка:** build, test, браузерный сценарий.

Sol отвечает в PR:

- что изменено;
- какие проверки запущены;
- что осталось спорным;
- что смотреть ревьюеру.

## 6. Ревью и merge

Lead проверяет:

- diff соответствует issue;
- нет случайных рефакторингов;
- нет секретов и лишних файлов;
- build/test зелёные;
- документация обновлена.

После одобрения — squash merge в `main`. Sol не выполняет merge.

## 7. GitHub-защита

Рекомендуемые настройки `main`:

- Require a pull request before merging.
- Require status checks: `Build and test` из workflow `CI`.
- Require conversation resolution.
- Dismiss stale approvals.
- Do not allow force pushes.
- Do not allow deletions.
- Restrict direct pushes.

Если оба агента используют один GitHub-аккаунт, GitHub не различит их как авторов с точки зрения прав. В этом случае проще всего: **оба работают только через PR, merge делает владелец после ревью Lead**. Если Lead должен merge-ить сам — ему нужен отдельный GitHub-аккаунт/PAT с правом merge, а у Sol не должно быть права merge.

## 8. Первый спринт

1. Lead: CI и базовая защита `main`.
2. Sol: автоматизированный браузерный смоук.
3. Lead: следующий архитектурный срез по roadmap.
4. Sol: реализация по issue.
5. Lead: ревью и merge.
