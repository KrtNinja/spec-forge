---
name: sf-grill
description: 'Spec Forge, обсуждение задачи: от идеи до решения подготовить требования. Выслушивает идею, поручает изучить источники, выясняет требования вопросами и записывает решения. Запускай, когда пользователь хочет начать новую задачу или продолжить обсуждение начатой.'
argument-hint: '[идея словами | имя задачи]'
---

# sf-grill — обсуждение задачи

Сначала вызови `spec_forge` с действием `status` и командой `sf-grill`. Не видишь `spec_forge` — найди его поиском инструментов, пробуя разные запросы.

## Вход

После `/sf-grill` пользователь пишет имя задачи, идею словами или ничего; что это, решаешь ты. Имя задачи передай в `task`, в остальных случаях вызывай `status` без него.

- `status` предложил начатую задачу, а пришла идея — прочитай `brainstorming.md` этой задачи. Та же задача — продолжай её, а идея — новые сведения для обсуждения. Другая — начни новую.
- Новая задача: выслушай идею, если её ещё нет, и спроси имя папки — своё, например принятое в команде (`JIRA-555`), или предложенное тобой латиницей строчными буквами через дефис (`order-search`). Затем `status` с этим именем: он проверит имя.
- `status` ответил «Новая задача» — сразу создай `docs/<имя>/brainstorming.md` по образцу ниже, до изучения источников и вопросов.

Задача выбрана — прочитай её `brainstorming.md`, `questions.md` и `_work/context.md`, если они есть. Факты из `context.md` уже известны: о них пользователя не спрашивай.

## Образец brainstorming.md

```markdown
# Поиск заказа по номеру

## Запрос

Идея пользователя его словами.

## Источники

- `src/search/` — модуль поиска
- https://wiki.example.com/orders — описание заказов

## Решения

## Не входит в задачу

- Поиск в админке
```

Каждая строка «Источников» — пункт, который начинается с пути в обратных апострофах или со ссылки; подзаголовков в разделе нет. Источников нет — раздел пустой. Решения и вопросы — по образцам из правил Spec Forge.

## Источники

- Проверь доступные источники. Сведений мало — спроси пользователя о полезном коде, документации или требованиях. Каждый источник — пункт «Источников», затем снова `status`.
- `status` выдал задание на изучение — передай отдельному агенту задание из ответа `status` как есть и допиши, что нужно выяснить. Сам источники не изучай. Пока агент работает, `status` выдаёт то же задание: повторно не поручай, дождись результата.
- Отдельного агента нет — спроси пользователя: выполнить задание в другом окне или изучить здесь. В другом окне он копирует задание из ответа `status` и сообщает, когда `_work/context.md` готов. Здесь — только с его согласия.
- Недоступные источники: продолжить без них или вернуть доступ — решает пользователь.
- Изучение закончено — снова `status`, затем прочитай `_work/context.md`.
- Нужен факт посреди обсуждения — добавь источник и вызови `status`. Источник уже в «Изучено» `_work/context.md`, а нужного факта нет — убери его пункт из «Изучено» и вызови `status`: задание выдастся снова.
- После изучения кратко изложи, как понял задачу, и сразу задай содержательный вопрос.

## Обсуждение

Веди раунды по `grilling` ниже с такими правилами:

- Раунд показывай блоками до 4 вопросов через инструмент выбора, остальные — следующим блоком после ответа. Вариантов 2–4, рекомендуемый первым, с пометкой «(рекомендую)». Пояснение длиннее двух фраз — коротким сообщением перед блоком. Инструмента выбора нет — нумерованным списком.
- Раскрой участников, действия, условия, бизнес-правила, результаты и существенные исключения. Это проверка полноты, а не анкета: спрашивай то, что вытекает из идеи и ответов.
- Можешь предлагать недостающие возможности и объяснять их пользу.
- После ответов на блок запиши решения в «Решения». Вопрос, записанный в `questions.md`, — пройденная ветка раунда. Тема не входит в задачу по решению пользователя — пункт в «Не входит в задачу».
- Вопросов, которые можно задать сейчас, не осталось — вызови `status` и действуй по его ответу. Подготовить требования предлагай, только если он показал переход: «Обсуждение завершено. Подготовить документ с требованиями?» Варианты: в новой сессии (рекомендую), в этой сессии, продолжить обсуждение. Команду для новой сессии пользователь уже видит в ответе `status`. В этой сессии — запусти скилл `sf-spec`.

<!-- grilling: начало (MIT, см. LICENSE-grilling) -->
Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round and give your recommended answer for each question. Then wait for the user's answers before the next round.

Show the round per the rules above.

Offer the answer choices per the rules above.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), get it through the study task from `status` per the rules above; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Then finish per the rules above.
<!-- grilling: конец -->
