import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo, createContext, useContext } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  Plus,
  Check,
  Type,
  ArrowRightCircle,
  ArrowLeftCircle,
  Trash2,
  Layers,
  BookOpen,
  MessageCircle,
  Library,
  Pencil,
  Folder,
  FolderPlus,
  Target,
  Languages,
  Sun,
  Moon,
  RotateCcw,
  BookMarked,
  ChevronDown,
  Highlighter,
  Copy,
  NotebookPen,
  X,
  Video,
  Play,
  Pause,
  Minus,
  Atom,
  Mic,
  Keyboard,
  BookHeart,
  Home,
  RefreshCw,
  History,
  Quote,
} from "lucide-react";

// Offline storage shim: outside Claude's artifact sandbox, window.storage
// doesn't exist — back it with the browser's own localStorage instead.
// Same async shape, so the rest of the app needs zero changes.
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(key);
      if (raw === null) throw new Error("not found");
      return { key, value: raw, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix) {
      const keys = Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix));
      return { keys, prefix, shared: false };
    },
  };
}

// Set only by the separate prayers-only deploy (a different GitHub Pages
// site, built from this same source, for handing the app to someone who
// only needs Молитвы) — everywhere else this is false and every mode
// behaves exactly as it always has. True hides every mode but prayers from
// ModeSwitch and starts the app straight on it; nothing else about the
// dashboard (title, tagline, theme/language toggles, refresh button) is
// mode-aware in a way this needs to touch separately.
const ONLY_PRAYERS = import.meta.env.VITE_ONLY_PRAYERS === "true";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=Katibeh&display=swap');
@keyframes atomPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@keyframes homeButtonBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.home-button-bounce svg {
  animation: homeButtonBounce 2.2s ease-in-out infinite;
}`;

// Neumorphic surfaces: page, cards, and chips all share one base tone per
// theme — shape reads through soft dual-offset shadows (a light source
// top-left, its shadow bottom-right), not through fill-color contrast.
// bg/chip/card are deliberately identical: every "surface" is carved from
// the same material as the page behind it. cardEdge stays a faint neutral
// tint (not fully transparent) so borderless affordances — the dashed
// "create" invite, an unchecked checkbox's outline — still read without
// needing shadows of their own. shadowLight/shadowDark are the two offset
// shadows raised elements use; cardHighlight is the thin top-edge sheen
// layered on top of the largest raised surfaces (flashcards, deck tiles).
// The one color accent anywhere in the app is danger (#D93C3C, red) —
// reserved for delete/destructive actions; every shadow and every other
// accent role (mustard, mint, waiting) is a neutral gray-blue, never a hue.
const LIGHT_PALETTE = {
  bg: "#E8ECF1",
  bgGlow: "#EEF2F6",
  chip: "#E8ECF1",
  bgDeep: "#F7F9FB",
  card: "#E8ECF1",
  cardEdge: "#D3D9E1",
  cardHighlight: "rgba(255,255,255,0.85)",
  shadowLight: "rgba(255,255,255,0.85)",
  shadowDark: "rgba(163,177,198,0.55)",
  ink: "#2E3742",
  mint: "#4A5568",
  mintDeep: "#3D4652",
  mustard: "#3D4652",
  fadeText: "#7B8794",
  cream: "#2E3742",
  waiting: "#9AA5B1",
  danger: "#D93C3C",
};

const DARK_PALETTE = {
  bg: "#1E2530",
  bgGlow: "#242C38",
  chip: "#1E2530",
  bgDeep: "#F0F2F5",
  card: "#1E2530",
  cardEdge: "#2C3542",
  cardHighlight: "rgba(255,255,255,0.05)",
  shadowLight: "rgba(255,255,255,0.05)",
  shadowDark: "rgba(0,0,0,0.5)",
  ink: "#EDF0F3",
  mint: "#B0B8C2",
  mintDeep: "#C7CDD5",
  mustard: "#4A5568",
  fadeText: "#8B94A0",
  cream: "#EDF0F3",
  waiting: "#626B78",
  danger: "#D93C3C",
};

const ThemeContext = createContext(LIGHT_PALETTE);
function useTheme() {
  return useContext(ThemeContext);
}

// Whether transcription is shown is a single app-wide toggle (persisted like
// the theme), not per-screen local state — flip it once, it stays on
// everywhere: language cards, focus atoms, Слово cards alike.
const TranscriptionContext = createContext([false, () => {}]);
function useTranscription() {
  return useContext(TranscriptionContext);
}

// Same persisted-app-wide-toggle pattern as transcription: "Реверс" (deck
// practice card direction) survives leaving and re-entering Изучение языка,
// across sessions, until the user flips it again themselves.
const ReversedContext = createContext([false, () => {}]);
function useReversed() {
  return useContext(ReversedContext);
}

// App-wide interface language (RU/EN), persisted like theme/transcription.
// Every translated string is looked up by its Russian source text as the
// key — the app was written entirely in Russian, so the existing copy
// doubles as a stable, readable key without inventing a parallel key set.
// A key with no "en" entry (not yet catalogued) or no interpolation just
// falls back to the Russian text itself, so missing entries degrade to
// Russian rather than breaking.
const LanguageContext = createContext(["ru", () => {}]);
function useLanguage() {
  return useContext(LanguageContext);
}

const STRINGS = {
  "Спецификации": { en: "Instructions" },
  "Изучение языка": { en: "Language" },
  "Мои цели": { en: "Focus" },
  "Слово": { en: "Word" },
  "Твои колоды": { en: "Your decks" },
  "Твои цели": { en: "Your goals" },
  "Твои слова": { en: "Your words" },
  "Твои тексты": { en: "Your texts" },
  "Small pieces. Big change.": { en: "Small pieces. Big change." },
  "Тёмная тема": { en: "Dark theme" },
  "Светлая тема": { en: "Light theme" },
  "Сохранить": { en: "Save" },
  "Отмена": { en: "Cancel" },
  "Назад": { en: "Back" },
  "Home": { en: "Home" },
  "Обновить": { en: "Refresh" },
  "Размер текста": { en: "Text size" },
  "Продолжать с последней карточки": { en: "Resume from last card" },
  "Всегда начинать с первой карточки": { en: "Always start from the first card" },
  "Уменьшить размер текста": { en: "Decrease text size" },
  "Увеличить размер текста": { en: "Increase text size" },
  "Да": { en: "Yes" },
  "Удалить": { en: "Delete" },
  "Редактировать": { en: "Edit" },
  "редактировать": { en: "edit" },
  "транскрипция": { en: "transcription" },
  "Реверс": { en: "Reverse" },
  "перемешать колоду": { en: "shuffle deck" },
  "обнулить активные": { en: "reset active" },
  "Выделить всё": { en: "Select all" },
  "Снять выделение": { en: "Deselect all" },
  "Скопировано": { en: "Copied" },
  "Удалить выбранное": { en: "Delete selected" },
  "Копировать (N)": { ru: (n) => `Копировать (${n})`, en: (n) => `Copy (${n})` },
  "Удалить N записей?": {
    ru: (n) => `Удалить ${n} ${pluralRu(n, "запись", "записи", "записей")}?`,
    en: (n) => `Delete ${n} ${n === 1 ? "record" : "records"}?`,
  },
  "Выбрать": { en: "Select" },
  "Новая спецификация": { en: "New instruction" },
  "Скопируй текст перед вставкой": { en: "Copy text before pasting" },
  "Пока пусто — нажми «+», чтобы быстро набросать первую спецификацию.": {
    en: "Nothing yet — tap “+” to jot down your first instruction.",
  },
  "↑ в долгий ящик": { en: "↑ to the long box" },
  "нет транскрипции": { en: "no transcription" },
  "Перевод не указан": { en: "No translation given" },
  "тап — вернуть · смахни вверх — в долгий ящик": { en: "tap to flip back · swipe up for the long box" },
  "тап — перевернуть · смахни вверх — в долгий ящик": { en: "tap to flip · swipe up for the long box" },
  "Английский текст *": { en: "English text *" },
  "Перевод": { en: "Translation" },
  "Транскрипция": { en: "Transcription" },
  "Заметка (когда используется)": { en: "Note (when it's used)" },
  "Обнулить актив цели «N»?": {
    ru: (name) => `Обнулить актив цели «${name}»? Все активные карточки вернутся в долгий ящик.`,
    en: (name) => `Reset active cards for the goal “${name}”? All active cards will return to the long box.`,
  },
  "Да, обнулить": { en: "Yes, reset" },
  "В активной колоде пока пусто.": { en: "Nothing active in this deck yet." },
  "Загляни во вкладку «Долгий ящик» и перенеси туда карточки, которые готов повторять.": {
    en: "Check the “Long box” tab and move over the cards you're ready to practice.",
  },
  "Обнулить активные": { en: "Reset active" },
  "обнулить активные": { en: "reset active" },
  "Редактировать карточку": { en: "Edit card" },
  "Предыдущая": { en: "Previous" },
  "Следующая": { en: "Next" },
  "Поменять местами лицевую и обратную стороны карточки": { en: "Swap the card's front and back side" },
  ": вкл": { en: ": on" },
  "Удалить навсегда?": { en: "Delete forever?" },
  "Перенести в активную колоду": { en: "Move to active deck" },
  "Отложить в долгий ящик": { en: "Set aside to the long box" },
  "Долгий ящик (N)": { ru: (n) => `Долгий ящик (${n})`, en: (n) => `Long box (${n})` },
  "всё в актив": { en: "all to active" },
  "Пусто. Новые карточки, которые ты добавляешь, сначала попадают сюда — и карточки, которые ты уже знаешь и отложил из актива.": {
    en: "Empty. New cards you add land here first — as do cards you already know and set aside from active.",
  },
  "В активной колоде (N)": { ru: (n) => `В активной колоде (${n})`, en: (n) => `In the active deck (${n})` },
  "всё в долгий ящик": { en: "all to the long box" },
  "Пока ничего не выбрано для повторения.": { en: "Nothing picked for practice yet." },
  "Можно вставить сразу целый список — каждая строка станет отдельной карточкой.": {
    en: "You can paste a whole list at once — each line becomes its own card.",
  },
  "Формат одной строки:": { en: "Format for one line:" },
  "текст - перевод - транскрипция - заметка": { en: "text - translation - transcription - note" },
  "Обязательно только первое поле, остальное — по желанию.": { en: "Only the first field is required, the rest are optional." },
  "How's it going? - Как дела? - хаузит гоуин - неформальное приветствие среди друзей\nresilient - стойкий - ризИльент\nworthwhile\nIt's up to you. - Решать тебе.": {
    en: "How's it going? - How are you? - howz it goin - an informal greeting among friends\nresilient\nworthwhile\nIt's up to you.",
  },
  "строк: N": { ru: (n) => `строк: ${n}`, en: (n) => `lines: ${n}` },
  "вставь одну или несколько строк": { en: "paste one or more lines" },
  "Добавлено": { en: "Added" },
  "Добавить N карточек": { ru: (n) => `Добавить ${n} карточек`, en: (n) => `Add ${n} cards` },
  "Добавить в долгий ящик": { en: "Add to the long box" },
  "Добавить": { en: "Add" },
  "Повторение": { en: "Practice" },
  "Долгий ящик": { en: "Long box" },
  "Переименовать колоду": { en: "Rename deck" },
  "Удалить колоду «N»": { ru: (name) => `Удалить колоду «${name}»`, en: (name) => `Delete deck “${name}”` },
  "Удалить колоду «N» навсегда, вместе со всеми карточками?": {
    ru: (name) => `Удалить колоду «${name}» навсегда, вместе со всеми карточками?`,
    en: (name) => `Delete the deck “${name}” forever, along with all its cards?`,
  },
  "Создать": { en: "Create" },
  "Колод пока нет. Создай первую, чтобы начать добавлять карточки.": {
    en: "No decks yet. Create your first one to start adding cards.",
  },
  "Создать колоду": { en: "Create deck" },
  "Название колоды": { en: "Deck name" },
  "N активных": { ru: (n) => `${n} активных`, en: (n) => `${n} active` },
  "N в долгом ящике": { ru: (n) => `${n} в долгом ящике`, en: (n) => `${n} in the long box` },
  "Новая колода": { en: "New deck" },
  "N активных · N всего": { ru: (a, b) => `${a} активных · ${b} всего`, en: (a, b) => `${a} active · ${b} total` },
  "Удалить?": { en: "Delete?" },
  "Разбить на карточки": { en: "Split into cards" },
  "разбить на подкарточки": { en: "split into sub-cards" },
  "Переименовать цель": { en: "Rename goal" },
  "Наверх": { en: "Up" },
  "Повторение (N активных во всей цели)": {
    ru: (n) => `Повторение (${n} активных во всей цели)`,
    en: (n) => `Practice (${n} active across the goal)`,
  },
  "Здесь пока пусто. Добавь карточки — каждую потом можно «разбить» на подкатегории.": {
    en: "Nothing here yet. Add cards — each one can later be “split” into subcategories.",
  },
  "Добавить карточки сюда": { en: "Add cards here" },
  "Удалить цель «N»": { ru: (name) => `Удалить цель «${name}»`, en: (name) => `Delete goal “${name}”` },
  "Удалить цель «N» навсегда, вместе со всем деревом?": {
    ru: (name) => `Удалить цель «${name}» навсегда, вместе со всем деревом?`,
    en: (name) => `Delete the goal “${name}” forever, along with its whole tree?`,
  },
  "Целей пока нет. Создай первую — язык, молитвы, личный бренд, любой проект.": {
    en: "No goals yet. Create your first one — language, prayer, personal brand, any project.",
  },
  "Создать цель": { en: "Create goal" },
  "Название цели": { en: "Goal name" },
  "N карточек всего": { ru: (n) => `${n} карточек всего`, en: (n) => `${n} cards total` },
  "Новая цель": { en: "New goal" },
  "Название текста": { en: "Text title" },
  "Вставь текст целиком — разбивка на страницы произойдёт автоматически": {
    en: "Paste the whole text — it'll be split into pages automatically",
  },
  "Разбиваю на страницы…": { en: "Splitting into pages…" },
  "Предыдущая страница": { en: "Previous page" },
  "Следующая страница": { en: "Next page" },
  "Текстов пока нет. Вставь первый — абзацы, отрывки, что угодно длинное.": {
    en: "No texts yet. Paste your first one — paragraphs, excerpts, anything long.",
  },
  "Добавить текст": { en: "Add text" },
  "В этом тексте не найдено ни одного заголовка «##».": { en: "No “##” headings were found in this text." },
  "Добавить в Vocabulary": { en: "Add to Vocabulary" },
  "Пока пусто — выдели любой текст в приложении и нажми «Добавить в Vocabulary».": {
    en: "Nothing yet — select any text in the app and tap “Add to Vocabulary”.",
  },
  "Мои цитаты": { en: "My Quotes" },
  "Добавить в цитаты": { en: "Add to Quotes" },
  "Лицевая сторона (цитата) *": { en: "Front side (quote) *" },
  "Оборотная сторона (перевод/пояснение)": { en: "Back side (translation/note)" },
  "Нет перевода/пояснения. Нажми карандаш, чтобы добавить.": {
    en: "No translation or note yet. Tap the pencil to add one.",
  },
  "Цитат пока нет. Выдели любой текст в приложении и нажми «Добавить в цитаты».": {
    en: "No quotes yet. Select any text in the app and tap “Add to Quotes”.",
  },
  "Выдели любой текст в приложении и нажми «Добавить в цитаты» — или загляни в «Долгий ящик» и верни карточки в актив.": {
    en: "Select any text in the app and tap “Add to Quotes” — or check the long box and bring cards back to the active deck.",
  },
  "Пусто. Карточки, отправленные свайпом вверх, появляются здесь.": {
    en: "Empty. Cards you swipe up land here.",
  },
  "Колода": { en: "Deck" },
  "Без колоды": { en: "No deck" },
  "Добавить в колоду": { en: "Add to deck" },
  "Убрать из колоды": { en: "Remove from deck" },
  "Все цитаты": { en: "All Quotes" },
  "Список": { en: "List" },
  "Удалить карточку": { en: "Delete card" },
  "Удалить эту карточку навсегда?": { en: "Delete this card permanently?" },
  "Цитат пока нет в этой колоде.": { en: "No quotes in this deck yet." },
  "Скопировать всё (N)": { ru: (n) => `Скопировать всё (${n})`, en: (n) => `Copy all (${n})` },
  "Удалить весь список (N) безвозвратно?": {
    ru: (n) => `Удалить весь список (${n}) безвозвратно?`,
    en: (n) => `Delete the whole list (${n}) permanently?`,
  },
  "Очистить весь список": { en: "Clear the whole list" },
  "Название слова": { en: "Word title" },
  "Разметка: «## Заголовок» — новая вкладка; обычная строка — карточка (english - перевод - транскрипция - контекст); строка с «>» — пример-потомок предыдущей карточки": {
    en: "Markup: “## Heading” starts a new tab; a plain line is a card (english - translation - transcription - context); a line starting with “>” is the previous card's nested example",
  },
  "Слов пока нет. Добавь первое — с разметкой «## / > ».": { en: "No words yet. Add your first one — using “## / >” markup." },
  "Новое слово": { en: "New word" },
  "В этом разделе пока нет карточек.": { en: "No cards in this section yet." },
  "Видео": { en: "Video" },
  "Твои видео": { en: "Your videos" },
  "Ссылка на YouTube-видео": { en: "YouTube video link" },
  "Не удалось распознать ссылку на YouTube-видео": { en: "Couldn't recognize that as a YouTube video link" },
  "Вставь текст или субтитры к видео": { en: "Paste the text or subtitles for the video" },
  "Видео пока нет. Добавь первое по ссылке.": { en: "No videos yet. Add your first one by link." },
  "Добавить видео": { en: "Add video" },
  "Увеличить скорость прокрутки": { en: "Increase scroll speed" },
  "Уменьшить скорость прокрутки": { en: "Decrease scroll speed" },
  "Перетащить границу видео/текста (полоска — прогресс видео)": {
    en: "Drag the video/text divider (the bar also shows video progress)",
  },
  "Увеличить размер шрифта": { en: "Increase font size" },
  "Уменьшить размер шрифта": { en: "Decrease font size" },
  "Сначала": { en: "From the beginning" },
  "Перемотка назад (двойной тап, повторный тап — ещё −10 сек)": {
    en: "Rewind (double-tap, tap again for another −10s)",
  },
  "Перемотка вперёд (двойной тап, повторный тап — ещё +10 сек)": {
    en: "Fast-forward (double-tap, tap again for another +10s)",
  },
  "Остановить прокрутку текста": { en: "Stop text auto-scroll" },
  "Запустить прокрутку текста": { en: "Start text auto-scroll" },

  "Атомы": { en: "Atoms" },
  "Твои атомы": { en: "Your atoms" },
  "Дай мне имя": { en: "Give me a name" },
  "Нет описания": { en: "No description" },
  "Поток мыслей пуст": { en: "No thoughts yet" },
  "Название": { en: "Title" },
  "Описание": { en: "Description" },
  "Поток мыслей": { en: "Thoughts" },
  "Редактировать название": { en: "Edit title" },
  "Редактировать описание": { en: "Edit description" },
  "Редактировать поток мыслей": { en: "Edit thoughts" },
  "Микрофон": { en: "Microphone" },
  "Клавиатура": { en: "Keyboard" },
  "Говори — я слушаю…": { en: "Speak — I'm listening…" },
  "Остановить запись": { en: "Stop recording" },
  "Голосовой ввод не поддерживается этим браузером": {
    en: "Voice input isn't supported by this browser",
  },
  "Добавить дочерний элемент": { en: "Add a child item" },
  "Удалить атом": { en: "Delete atom" },
  "Увеличить масштаб": { en: "Zoom in" },
  "Уменьшить масштаб": { en: "Zoom out" },

  "Молитвы": { en: "Prayers" },
  "Твои молитвы": { en: "Your prayers" },
  "Молитв пока нет. Добавь первую.": { en: "No prayers yet. Add the first one." },
  "Добавить молитву": { en: "Add a prayer" },
  "Название молитвы": { en: "Prayer name" },
  "Язык транскрипции": { en: "Transcription language" },
  "Русский": { en: "Russian" },
  "Английский": { en: "English" },
  "Туркменский": { en: "Turkmen" },
  "Турецкий": { en: "Turkish" },
  "Промт для чат-бота": { en: "Prompt for the chatbot" },
  "Скопировать": { en: "Copy" },
  "Скопировано": { en: "Copied" },
  "Текст": { en: "Text" },
  "Карточки": { en: "Cards" },
  "Ответ чат-бота": { en: "Chatbot reply" },
  "Вставьте сюда весь ответ чат-бота целиком": { en: "Paste the chatbot's entire reply here" },
  "Нет карточек": { en: "No cards" },
  "Нет текста": { en: "No text" },
  "Удалить молитву": { en: "Delete prayer" },
};

// t("Русский ключ") -> localized string; t("шаблон с N", n) -> localized,
// interpolated string, for entries whose value is a {ru, en} function pair.
function translate(lang, key, ...args) {
  const entry = STRINGS[key];
  if (!entry) return key;
  const val = lang === "en" && entry.en !== undefined ? entry.en : entry.ru ?? key;
  return typeof val === "function" ? val(...args) : val;
}

// A component consuming its own Provider still reads the context's default
// value, not the state it's about to provide — App() itself builds `t`
// from its local `lang` state directly instead of this hook, for that
// reason. Every descendant uses useT() as normal.
function useT() {
  const [lang] = useLanguage();
  return (key, ...args) => translate(lang, key, ...args);
}

function LanguageToggle({ lang, onToggle }) {
  const PALETTE = useTheme();
  return (
    <button
      onClick={onToggle}
      title={lang === "ru" ? "Switch to English" : "Переключить на русский"}
      className="px-2.5 py-2 rounded-full flex items-center justify-center text-xs font-medium"
      style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: "0.03em" }}
    >
      {lang === "ru" ? "EN" : "RU"}
    </button>
  );
}

function ThemeToggle({ isDark, onToggle, size = 15 }) {
  const PALETTE = useTheme();
  return (
    <button
      onClick={onToggle}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
      className="p-2 rounded-full flex items-center justify-center"
      style={{ background: PALETTE.chip, color: PALETTE.fadeText }}
    >
      {isDark ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}

// Sits in the same top-row control group as LanguageToggle/ThemeToggle,
// shown only on the Молитвы dashboard — the explicit, on-demand
// replacement for pull-to-refresh there. `onRefresh` is the real re-fetch
// from storage (usePrayers().refresh), not a decorative spin: the spin is
// just feedback that the click registered, driven by local state rather
// than by whether the fetch actually changed anything.
function RefreshButton({ onRefresh }) {
  const PALETTE = useTheme();
  const t = useT();
  const [spinning, setSpinning] = useState(false);
  const handleClick = () => {
    onRefresh();
    setSpinning(true);
    setTimeout(() => setSpinning(false), 500);
  };
  return (
    <button
      onClick={handleClick}
      aria-label={t("Обновить")}
      title={t("Обновить")}
      className="p-2 rounded-full flex items-center justify-center"
      style={{ background: PALETTE.chip, color: PALETTE.fadeText }}
    >
      <RefreshCw size={15} style={{ transition: "transform 0.5s ease", transform: spinning ? "rotate(360deg)" : "rotate(0deg)" }} />
    </button>
  );
}

// Icon-only "back to this section's dashboard" button, fixed to a
// constant on-screen position so it's always reachable without scrolling
// — replaces every screen's former in-flow "← Home" text button.
function HomeButton({ onClick }) {
  const PALETTE = useTheme();
  const t = useT();
  return (
    <button
      onClick={onClick}
      aria-label={t("Home")}
      className="fixed z-40 flex items-center justify-center rounded-full home-button-bounce"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 20px)",
        left: "calc(env(safe-area-inset-left, 0px) + 16px)",
        width: "42px",
        height: "42px",
        background: PALETTE.card,
        color: PALETTE.fadeText,
        boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}`,
      }}
    >
      <Home size={18} />
    </button>
  );
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Splits one "text - перевод - транскрипция - заметка" line into fields.
// Shared by the bulk-add textarea and the Word-document parser below, so
// both accept exactly the same line format.
function parseCardLine(line) {
  const parts = line
    .split(/\s-\s|=|—/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    en: parts[0] || line,
    ru: parts[1] || "",
    tr: parts[2] || "",
    note: parts[3] || "",
  };
}

function parseImport(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ id: uid(), status: "waiting", ...parseCardLine(line) }))
    .filter((item) => item.en);
}

// ---- "Слово" documents: a text laid out with the study-word protocol
// (## headings -> tabs, plain lines -> cards, "> " lines -> that card's
// nested example children) is parsed fresh from its raw body every time —
// it's read-only content, not a separate mutable store. ----
function parseWordDocument(body) {
  const tabs = [];
  let currentTab = null;
  let currentParent = null;

  for (const raw of (body || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("##")) {
      const title = line.replace(/^##+\s*/, "").trim() || `Раздел ${tabs.length + 1}`;
      currentTab = { id: uid(), title, cards: [] };
      tabs.push(currentTab);
      currentParent = null;
      continue;
    }

    if (!currentTab) continue; // content before the first heading has no tab to belong to

    if (line.startsWith(">")) {
      const content = line.slice(1).trim();
      if (!content || !currentParent) continue;
      currentParent.children.push({ id: uid(), ...parseCardLine(content) });
      continue;
    }

    const card = { id: uid(), ...parseCardLine(line), children: [] };
    currentTab.cards.push(card);
    currentParent = card;
  }

  return tabs;
}

// Russian plural agreement: 1 запись, 2-4 записи, 5+/11-14 записей.
function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DECK_ICONS = [MessageCircle, Library, Layers, BookOpen];

// ════════════════════════════════════════════════════════════════════════
// LANGUAGE MODE — flat decks of cards. Starts empty; the user creates every
// deck and card themselves, nothing is preloaded.
// ════════════════════════════════════════════════════════════════════════

function useDecks() {
  const [decks, setDecks] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("decks-v1", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setDecks(parsed);
      }
    } catch (e) {
      // nothing saved yet — keep the empty start
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setDecks(next);
    try {
      await window.storage.set("decks-v1", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  const setDeckItems = useCallback(
    (deckId, items) => {
      persist(decks.map((d) => (d.id === deckId ? { ...d, items } : d)));
    },
    [decks, persist]
  );

  const addDeck = useCallback(
    (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist([...decks, { id: uid(), name: trimmed, items: [] }]);
    },
    [decks, persist]
  );

  const renameDeck = useCallback(
    (deckId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist(decks.map((d) => (d.id === deckId ? { ...d, name: trimmed } : d)));
    },
    [decks, persist]
  );

  const deleteDeck = useCallback(
    (deckId) => {
      persist(decks.filter((d) => d.id !== deckId));
    },
    [decks, persist]
  );

  return { decks, setDeckItems, addDeck, renameDeck, deleteDeck, refresh };
}

// ---- Card: tap (native onClick) flips it, touch-drag upward sends it to the long box ----
function IndexCard({ item, flipped, onFlip, rotation, showTranscription, onSwipeUp, reversed }) {
  const PALETTE = useTheme();
  const t = useT();
  const showEnglishSide = reversed ? flipped : !flipped;
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef(null);
  const drag = useRef({ startY: 0, startX: 0, active: false, suppressClick: false });

  // Native (non-passive) listeners, not React's onTouch* props — only a
  // non-passive touchmove listener can call preventDefault, which is what
  // stops the browser from stepping in with its own gesture (page scroll,
  // pull-to-refresh, edge-swipe-back) once a drag has moved far enough to
  // not be a tap. Without that claim, an unrecognized gesture (anything but
  // straight-up) could get handed to the browser mid-drag — our touchend
  // never fires (a touchcancel does, or nothing), leaving the card stuck
  // partway, or the browser's own gesture fires instead (e.g. a pull-to-
  // refresh reload, landing back on the dashboard). Claiming the touch and
  // always resolving through our own touchend/touchcancel avoids both.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      drag.current = { startY: t.clientY, startX: t.clientX, active: true, suppressClick: false };
      setDragging(true);
    };

    const onTouchMove = (e) => {
      if (!drag.current.active || !e.touches[0]) return;
      const t = e.touches[0];
      const dyNow = t.clientY - drag.current.startY;
      const dxNow = t.clientX - drag.current.startX;
      // Only a clear upward drag has an action bound to it (swipe to the
      // long box). Everything else — down, sideways, diagonal — has none,
      // so the card stays fully put: no partial visual response.
      const isSwipeUp = dyNow < 0 && Math.abs(dyNow) > Math.abs(dxNow) * 1.5;
      if (isSwipeUp) {
        e.preventDefault();
        setDy(dyNow);
      } else {
        // Past a small threshold this is a real drag, not tap jitter —
        // claim it so the browser doesn't hijack it natively, but the
        // card itself still doesn't move.
        if (Math.abs(dyNow) > 8 || Math.abs(dxNow) > 8) e.preventDefault();
        setDy(0);
      }
    };

    const endDrag = () => {
      drag.current.active = false;
      setDragging(false);
      setDy((currentDy) => {
        if (currentDy < -90) {
          drag.current.suppressClick = true;
          onSwipeUp && onSwipeUp();
        }
        return 0;
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endDrag, { passive: true });
    el.addEventListener("touchcancel", endDrag, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endDrag);
      el.removeEventListener("touchcancel", endDrag);
    };
  }, [onSwipeUp]);

  const handleClick = () => {
    if (drag.current.suppressClick) {
      drag.current.suppressClick = false;
      return;
    }
    onFlip && onFlip();
  };

  const swipeProgress = Math.min(Math.max(-dy / 90, 0), 1);

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className="relative w-full max-w-md cursor-pointer"
      style={{ perspective: "1200px" }}
    >
      {swipeProgress > 0 && (
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-sm whitespace-nowrap"
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            background: PALETTE.waiting,
            color: "#fff",
            opacity: swipeProgress,
          }}
        >
          {t("↑ в долгий ящик")}
        </div>
      )}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: PALETTE.cardEdge,
          transform: `rotate(${rotation + 3}deg) translateY(6px)`,
          boxShadow: `4px 4px 10px ${PALETTE.shadowDark}`,
        }}
      />
      <div
        className="relative rounded-2xl px-8 py-14 flex flex-col items-center justify-center text-center"
        style={{
          background: PALETTE.card,
          transform: `translateY(${dy}px) rotate(${rotation}deg)`,
          transition: dragging ? "none" : "transform 0.35s cubic-bezier(.2,.8,.3,1)",
          opacity: 1 - swipeProgress * 0.5,
          minHeight: "260px",
          boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
          border: `1px solid ${PALETTE.cardEdge}`,
        }}
      >
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 w-10 h-3 rounded-full"
          style={{ background: "rgba(140,155,165,0.18)" }}
        />
        {showEnglishSide ? (
          <>
            {/* The term currently being studied — not selectable/capturable
                into Vocabulary, since adding a word to a vocabulary list
                while it's already the thing being actively learned is
                pointless. Everything else on the card (transcription,
                translation, note) stays selectable. */}
            <p
              className="select-none"
              style={{
                fontFamily: "'Fraunces', serif",
                color: PALETTE.ink,
                fontSize: item.en.length > 40 ? "1.5rem" : "2rem",
                fontWeight: 500,
                lineHeight: 1.3,
              }}
            >
              {item.en}
            </p>
            {showTranscription && (
              <p
                className="mt-3"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: PALETTE.mintDeep,
                  fontSize: "1.05rem",
                  letterSpacing: "0.02em",
                }}
              >
                [{item.tr || t("нет транскрипции")}]
              </p>
            )}
          </>
        ) : (
          <>
            <p
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                color: PALETTE.mintDeep,
                fontSize: "1.35rem",
                fontWeight: 500,
                lineHeight: 1.4,
              }}
            >
              {item.ru || t("Перевод не указан")}
            </p>
            {item.note && (
              <p
                className="mt-3 px-2"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: PALETTE.waiting,
                  fontSize: "0.9rem",
                  fontStyle: "italic",
                  lineHeight: 1.4,
                }}
              >
                {item.note}
              </p>
            )}
          </>
        )}
        <p
          className="absolute bottom-4 text-xs tracking-wide"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#AEB8BE" }}
        >
          {flipped ? t("тап — вернуть · смахни вверх — в долгий ящик") : t("тап — перевернуть · смахни вверх — в долгий ящик")}
        </p>
      </div>
    </div>
  );
}

// ---- Reusable structured edit/create form: en (required), ru, tr, note ----
function CardForm({ initial, onSave, onCancel, saveLabel }) {
  const PALETTE = useTheme();
  const t = useT();
  const [en, setEn] = useState(initial?.en || "");
  const [ru, setRu] = useState(initial?.ru || "");
  const [tr, setTr] = useState(initial?.tr || "");
  const [note, setNote] = useState(initial?.note || "");

  const fieldStyle = {
    background: PALETTE.card,
    color: PALETTE.ink,
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: "0.95rem",
    border: `1px solid ${PALETTE.cardEdge}`,
  };
  const labelStyle = {
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: PALETTE.fadeText,
    fontSize: "0.75rem",
    letterSpacing: "0.03em",
  };

  const handleSave = () => {
    if (!en.trim()) return;
    onSave({ en: en.trim(), ru: ru.trim(), tr: tr.trim(), note: note.trim() });
  };

  return (
    <div className="w-full max-w-md flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t("Английский текст *")}</label>
        <input
          autoFocus
          value={en}
          onChange={(e) => setEn(e.target.value)}
          className="rounded-xl px-3 py-2 outline-none"
          style={fieldStyle}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t("Перевод")}</label>
        <input value={ru} onChange={(e) => setRu(e.target.value)} className="rounded-xl px-3 py-2 outline-none" style={fieldStyle} />
      </div>
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t("Транскрипция")}</label>
        <input value={tr} onChange={(e) => setTr(e.target.value)} className="rounded-xl px-3 py-2 outline-none" style={fieldStyle} />
      </div>
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t("Заметка (когда используется)")}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="rounded-xl px-3 py-2 outline-none resize-none"
          style={fieldStyle}
        />
      </div>
      <div className="flex gap-2 mt-1">
        <button
          onClick={handleSave}
          disabled={!en.trim()}
          className="flex-1 rounded-full py-2.5 text-sm font-medium disabled:opacity-40"
          style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {saveLabel ?? t("Сохранить")}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-full py-2.5 text-sm"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Отмена")}
        </button>
      </div>
    </div>
  );
}

// `resetScopeName`, when provided (Focus mode only), shows a "reset all
// active back to waiting" button scoped to the whole current goal tree.
function PracticeView({ deck, resetScopeName, deckKey }) {
  const PALETTE = useTheme();
  const t = useT();
  const activeItems = deck.items.filter((i) => i.status === "active");
  // Sequence tracked by id, not index — so removing/editing one card in
  // place (swiping it to the long box, saving an edit) never has to guess
  // at index math. Only a genuine deck/goal switch (deckKey changing)
  // rebuilds the sequence from scratch and resets position to the start;
  // within the same deck, moveCurrentToWaiting below updates orderIds and
  // pos itself so browsing position survives a card leaving the active set.
  const [orderIds, setOrderIds] = useState(() => activeItems.map((i) => i.id));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rotation, setRotation] = useState(-1.5);
  const [showTranscription, setShowTranscription] = useTranscription();
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [reversed, setReversed] = useReversed();

  useEffect(() => {
    setOrderIds(deck.items.filter((i) => i.status === "active").map((i) => i.id));
    setPos(0);
    setFlipped(false);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey]);

  const resetAllActive = () => {
    deck.setItems(deck.items.map((i) => (i.status === "active" ? { ...i, status: "waiting" } : i)));
    setConfirmReset(false);
  };

  if (confirmReset) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger, maxWidth: "320px" }}>
          {t("Обнулить актив цели «N»?", resetScopeName)}
        </p>
        <div className="flex gap-2">
          <button
            onClick={resetAllActive}
            className="text-sm px-4 py-2 rounded-full"
            style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Да, обнулить")}
          </button>
          <button
            onClick={() => setConfirmReset(false)}
            className="text-sm px-4 py-2 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Отмена")}
          </button>
        </div>
      </div>
    );
  }

  if (!activeItems.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          {t("В активной колоде пока пусто.")}
        </p>
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.9rem" }}>
          {t("Загляни во вкладку «Долгий ящик» и перенеси туда карточки, которые готов повторять.")}
        </p>
      </div>
    );
  }

  const currentId = orderIds[pos] ?? orderIds[0];
  const item = activeItems.find((i) => i.id === currentId) || activeItems[0];

  const goTo = (newPos) => {
    setRotation((Math.random() - 0.5) * 4);
    setFlipped(false);
    setEditing(false);
    setPos((newPos + orderIds.length) % orderIds.length);
  };

  const handleShuffle = () => {
    setOrderIds(shuffleArr(orderIds));
    setPos(0);
    setFlipped(false);
    setEditing(false);
    setRotation((Math.random() - 0.5) * 4);
  };

  const moveCurrentToWaiting = () => {
    const removedId = item.id;
    deck.setItems(deck.items.map((i) => (i.id === removedId ? { ...i, status: "waiting" } : i)));
    const nextOrder = orderIds.filter((id) => id !== removedId);
    setOrderIds(nextOrder);
    setPos((p) => Math.min(p, Math.max(nextOrder.length - 1, 0)));
  };

  const saveEdit = (fields) => {
    deck.setItems(deck.items.map((i) => (i.id === item.id ? { ...i, ...fields } : i)));
    setEditing(false);
    setFlipped(false);
  };

  return (
    <div className="flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-md flex items-center justify-between mb-6 gap-2 flex-wrap">
        <span
          className="text-sm shrink-0"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mustard, letterSpacing: "0.05em" }}
        >
          {pos + 1} / {orderIds.length}
        </span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {resetScopeName && (
            <button
              onClick={() => setConfirmReset(true)}
              title={t("Обнулить активные")}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.chip, color: PALETTE.fadeText }}
            >
              <RotateCcw size={14} /> {t("обнулить активные")}
            </button>
          )}
          <button
            onClick={() => setEditing((e) => !e)}
            title={t("Редактировать карточку")}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              background: editing ? PALETTE.mustard : PALETTE.chip,
              color: editing ? PALETTE.bgDeep : PALETTE.fadeText,
            }}
          >
            <Pencil size={14} /> {t("редактировать")}
          </button>
          <button
            onClick={() => setShowTranscription((s) => !s)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              background: showTranscription ? PALETTE.mustard : PALETTE.chip,
              color: showTranscription ? PALETTE.bgDeep : PALETTE.fadeText,
            }}
          >
            <Type size={14} /> {t("транскрипция")}
          </button>
        </div>
      </div>

      {editing ? (
        <CardForm initial={item} onSave={saveEdit} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <IndexCard
            key={item.id}
            item={item}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
            rotation={rotation}
            showTranscription={showTranscription}
            onSwipeUp={moveCurrentToWaiting}
            reversed={reversed}
          />

          <div className="flex items-center gap-6 mt-10">
            <button
              onClick={() => goTo(pos - 1)}
              className="rounded-full flex items-center justify-center"
              style={{
                width: "56px",
                height: "56px",
                background: PALETTE.mustard,
                color: PALETTE.bgDeep,
                boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}`,
              }}
              aria-label={t("Предыдущая")}
            >
              <ChevronLeft size={28} strokeWidth={2.5} />
            </button>

            <button
              onClick={() => goTo(pos + 1)}
              className="rounded-full flex items-center justify-center"
              style={{
                width: "56px",
                height: "56px",
                background: PALETTE.mustard,
                color: PALETTE.bgDeep,
                boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}`,
              }}
              aria-label={t("Следующая")}
            >
              <ChevronRight size={28} strokeWidth={2.5} />
            </button>
          </div>

          <button
            onClick={() => {
              setReversed((r) => !r);
              setFlipped(false);
            }}
            title={t("Поменять местами лицевую и обратную стороны карточки")}
            className="flex items-center gap-2 mt-4 text-sm px-3 py-1.5 rounded-full"
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              background: reversed ? PALETTE.mustard : PALETTE.chip,
              color: reversed ? PALETTE.bgDeep : PALETTE.fadeText,
            }}
          >
            <RotateCcw size={14} /> {t("Реверс")}{reversed ? t(": вкл") : ""}
          </button>

          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 mt-4 text-sm"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
          >
            <Shuffle size={15} /> {t("перемешать колоду")}
          </button>
        </>
      )}
    </div>
  );
}

function ListView({ deck }) {
  const PALETTE = useTheme();
  const t = useT();
  const waiting = deck.items.filter((i) => i.status === "waiting");
  const active = deck.items.filter((i) => i.status === "active");
  const [confirmId, setConfirmId] = useState(null);

  const moveTo = (id, status) => {
    deck.setItems(deck.items.map((i) => (i.id === id ? { ...i, status } : i)));
  };
  const removeItem = (id) => {
    deck.setItems(deck.items.filter((i) => i.id !== id));
    setConfirmId(null);
  };
  const moveAllToActive = () => {
    deck.setItems(deck.items.map((i) => (i.status === "waiting" ? { ...i, status: "active" } : i)));
  };
  const moveAllToWaiting = () => {
    deck.setItems(deck.items.map((i) => (i.status === "active" ? { ...i, status: "waiting" } : i)));
  };

  const Row = ({ item }) => (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2"
      style={{
        background: PALETTE.chip,
        border: `1px solid ${PALETTE.cardEdge}`,
        boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}`,
      }}
    >
      <div className="min-w-0">
        <p
          className="truncate"
          style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.05rem" }}
        >
          {item.en}
        </p>
        {item.ru && (
          <p
            className="truncate"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.8rem" }}
          >
            {item.ru}
          </p>
        )}
      </div>

      {confirmId === item.id ? (
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}
          >
            {t("Удалить навсегда?")}
          </span>
          <button
            onClick={() => removeItem(item.id)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Да")}
          </button>
          <button
            onClick={() => setConfirmId(null)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Отмена")}
          </button>
        </div>
      ) : (
        <div className="flex items-center shrink-0">
          {item.status === "waiting" ? (
            <button
              onClick={() => moveTo(item.id, "active")}
              title={t("Перенести в активную колоду")}
              className="p-1.5 rounded-full"
              style={{ color: PALETTE.mint, background: "rgba(120,132,148,0.16)" }}
            >
              <ArrowRightCircle size={22} />
            </button>
          ) : (
            <button
              onClick={() => moveTo(item.id, "waiting")}
              title={t("Отложить в долгий ящик")}
              className="p-1.5 rounded-full"
              style={{ color: PALETTE.waiting, background: "rgba(124,140,153,0.14)" }}
            >
              <ArrowLeftCircle size={22} />
            </button>
          )}

          <span
            className="mx-3 inline-block"
            style={{ width: "1px", height: "22px", background: "rgba(0,0,0,0.08)" }}
          />

          <button
            onClick={() => setConfirmId(item.id)}
            title={t("Удалить")}
            className="p-1.5"
            style={{ color: "#5B6275" }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="px-6 py-8 max-w-md mx-auto w-full">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="flex items-center gap-2"
          style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.2rem" }}
        >
          <Layers size={18} style={{ color: PALETTE.waiting }} /> {t("Долгий ящик (N)", waiting.length)}
        </h3>
        {waiting.length > 0 && (
          <button
            onClick={moveAllToActive}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{ background: PALETTE.mint, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("всё в актив")}
          </button>
        )}
      </div>
      {waiting.length === 0 ? (
        <p
          className="mb-6 text-sm"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
        >
          {t("Пусто. Новые карточки, которые ты добавляешь, сначала попадают сюда — и карточки, которые ты уже знаешь и отложил из актива.")}
        </p>
      ) : (
        <div className="mb-8">
          {waiting.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3
          className="flex items-center gap-2"
          style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.2rem" }}
        >
          <BookOpen size={18} style={{ color: PALETTE.mint }} /> {t("В активной колоде (N)", active.length)}
        </h3>
        {active.length > 0 && (
          <button
            onClick={moveAllToWaiting}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("всё в долгий ящик")}
          </button>
        )}
      </div>
      {active.length === 0 ? (
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.9rem" }}>
          {t("Пока ничего не выбрано для повторения.")}
        </p>
      ) : (
        active.map((item) => <Row key={item.id} item={item} />)
      )}
    </div>
  );
}

// ---- Bulk-add form: one line per card, reused by language decks and by the
// "add children" / "split" flows in Focus mode ----
function BulkAddForm({ onAdd, onDone, doneLabel }) {
  const PALETTE = useTheme();
  const t = useT();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const lineCount = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;

  const handleSave = () => {
    const parsed = parseImport(text);
    if (!parsed.length) return;
    onAdd(parsed);
    setSaved(true);
    setText("");
    setTimeout(() => setSaved(false), 1500);
    setTimeout(() => onDone && onDone(), 900);
  };

  return (
    <div className="px-6 py-8 max-w-md mx-auto w-full">
      <p
        className="text-sm mb-1 px-3 py-2 rounded-lg"
        style={{
          fontFamily: "'IBM Plex Sans', sans-serif",
          color: PALETTE.mustard,
          background: "rgba(120,132,148,0.12)",
        }}
      >
        {t("Можно вставить сразу целый список — каждая строка станет отдельной карточкой.")}
      </p>
      <p className="text-sm mb-5 mt-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        {t("Формат одной строки:")}{" "}
        <span style={{ color: PALETTE.mustard }}>{t("текст - перевод - транскрипция - заметка")}</span>.
        {" "}{t("Обязательно только первое поле, остальное — по желанию.")}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t(
          "How's it going? - Как дела? - хаузит гоуин - неформальное приветствие среди друзей\nresilient - стойкий - ризИльент\nworthwhile\nIt's up to you. - Решать тебе."
        )}
        rows={12}
        className="w-full rounded-xl p-4 outline-none resize-none"
        style={{
          background: PALETTE.card,
          color: PALETTE.ink,
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: "0.95rem",
          border: `1px solid ${PALETTE.cardEdge}`,
        }}
      />

      <div
        className="flex items-center justify-between mt-2 mb-4 text-xs"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
      >
        <span>{lineCount > 0 ? t("строк: N", lineCount) : t("вставь одну или несколько строк")}</span>
      </div>

      <button
        onClick={handleSave}
        disabled={!text.trim()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium disabled:opacity-40"
        style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {saved ? <Check size={18} /> : <Plus size={18} />}
        {saved ? t("Добавлено") : lineCount > 1 ? t("Добавить N карточек", lineCount) : doneLabel ?? t("Добавить в долгий ящик")}
      </button>
    </div>
  );
}

function DeckHome({ deckId, title, deck, onBack, onRename, onDelete, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const t = useT();
  const [tab, setTab] = useState("practice");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const waitingCount = deck.items.filter((i) => i.status === "waiting").length;

  const tabs = [
    { key: "practice", label: t("Повторение") },
    { key: "list", label: waitingCount ? t("Долгий ящик (N)", waitingCount) : t("Долгий ящик") },
    { key: "add", label: t("Добавить") },
  ];

  const saveRename = () => {
    if (nameDraft.trim()) onRename(deckId, nameDraft);
    setRenaming(false);
  };

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <HomeButton onClick={onBack} />
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center gap-2">
            {!renaming && (
              <>
                <h2
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontStyle: "italic",
                    color: PALETTE.cream,
                    fontSize: "1.4rem",
                  }}
                >
                  {title}
                </h2>
                <button
                  onClick={() => {
                    setNameDraft(title);
                    setRenaming(true);
                  }}
                  title={t("Переименовать колоду")}
                  style={{ color: PALETTE.fadeText }}
                >
                  <Pencil size={15} />
                </button>
              </>
            )}
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          </div>
        </div>

        {renaming && (
          <div className="flex items-center gap-2 mb-3">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 outline-none"
              style={{
                background: PALETTE.card,
                color: PALETTE.ink,
                fontFamily: "'IBM Plex Sans', sans-serif",
                border: `1px solid ${PALETTE.cardEdge}`,
              }}
            />
            <button
              onClick={saveRename}
              className="px-3 py-2 rounded-xl text-sm"
              style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              {t("Сохранить")}
            </button>
            <button
              onClick={() => setRenaming(false)}
              className="px-3 py-2 rounded-xl text-sm"
              style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              {t("Отмена")}
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-2">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className="flex-1 text-xs py-2 rounded-full"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                background: tab === tabItem.key ? PALETTE.mustard : PALETTE.chip,
                color: tab === tabItem.key ? PALETTE.bgDeep : PALETTE.fadeText,
              }}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "practice" && <PracticeView deck={deck} deckKey={deckId} />}
      {tab === "list" && <ListView deck={deck} />}
      {tab === "add" && <BulkAddForm onAdd={(items) => deck.setItems([...deck.items, ...items])} onDone={() => setTab("list")} />}

      <div className="max-w-md mx-auto w-full px-6 pb-10 pt-2">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#B7BFC5" }}
          >
            {t("Удалить колоду «N»", title)}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="text-xs"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}
            >
              {t("Удалить колоду «N» навсегда, вместе со всеми карточками?", title)}
            </span>
            <button
              onClick={() => onDelete(deckId)}
              className="text-xs px-3 py-1.5 rounded-full shrink-0"
              style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              {t("Да")}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-3 py-1.5 rounded-full shrink-0"
              style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              {t("Отмена")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTile({ label, placeholder, onCreate, big }) {
  const PALETTE = useTheme();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const formRef = useRef(null);

  const submit = () => {
    if (nameDraft.trim()) {
      onCreate(nameDraft);
      setNameDraft("");
      setCreating(false);
    }
  };

  const handleFocus = () => {
    // Give the input+button block room above a mobile keyboard: center it in
    // the (shrunk) visual viewport rather than leaving it pinned at the edge.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  if (!creating) {
    return (
      <button
        onClick={() => setCreating(true)}
        className={
          big
            ? "relative rounded-[28px] flex flex-col items-center justify-center gap-3 w-full max-w-xs py-14"
            : "relative rounded-[28px] pt-10 pb-6 px-4 flex flex-col items-center justify-center gap-2 min-h-[172px]"
        }
        style={{ background: "transparent", border: `2px dashed ${PALETTE.cardEdge}` }}
      >
        <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: PALETTE.chip }}>
          <Plus size={24} style={{ color: PALETTE.mustard }} />
        </span>
        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.9rem", color: PALETTE.fadeText }}>
          {label}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={formRef}
      className={
        big
          ? "rounded-[28px] p-4 flex flex-col gap-2 justify-center w-full max-w-xs"
          : "rounded-[28px] p-4 flex flex-col gap-2 justify-center min-h-[172px]"
      }
      style={{ background: PALETTE.card, border: `1px solid ${PALETTE.cardEdge}` }}
    >
      <input
        autoFocus
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="rounded-xl px-3 py-2 outline-none text-sm"
        style={{
          background: PALETTE.card,
          color: PALETTE.ink,
          fontFamily: "'IBM Plex Sans', sans-serif",
          border: `1px solid ${PALETTE.cardEdge}`,
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!nameDraft.trim()}
          className="flex-1 rounded-xl py-2 text-sm disabled:opacity-40"
          style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Создать")}
        </button>
        <button
          onClick={() => {
            setCreating(false);
            setNameDraft("");
          }}
          className="flex-1 rounded-xl py-2 text-sm"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Отмена")}
        </button>
      </div>
    </div>
  );
}

// Fixed-height tile name: clamps to 2 lines with an ellipsis so every grid
// tile stays the same height regardless of how long the name is.
function TileName({ children }) {
  const PALETTE = useTheme();
  return (
    <span
      className="mt-3 text-center line-clamp-2"
      style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", lineHeight: 1.2, overflow: "hidden", color: PALETTE.ink }}
    >
      {children}
    </span>
  );
}

function LanguageDashboard({ decks, onOpen, onAddDeck }) {
  const PALETTE = useTheme();
  const t = useT();
  const countActive = (d) => d.items.filter((i) => i.status === "active").length;
  const countWaiting = (d) => d.items.filter((i) => i.status === "waiting").length;

  if (decks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-16">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, textAlign: "center" }}>
          {t("Колод пока нет. Создай первую, чтобы начать добавлять карточки.")}
        </p>
        <CreateTile label={t("Создать колоду")} placeholder={t("Название колоды")} onCreate={onAddDeck} big />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 w-full max-w-lg pt-8">
      {/* "+ New deck" is the first tile, not the last — creating a deck is
          a frequent action and used to require scrolling to the bottom of
          however many decks already existed to reach it. */}
      <CreateTile label={t("Новая колода")} placeholder={t("Название колоды")} onCreate={onAddDeck} />
      {decks.map((deck, i) => {
        const Icon = DECK_ICONS[i % DECK_ICONS.length];
        const iconColor = i % 2 === 0 ? PALETTE.mustard : PALETTE.ink;
        return (
          <button
            key={deck.id}
            onClick={() => onOpen(deck.id)}
            className="relative rounded-[28px] pt-10 pb-6 px-4 flex flex-col items-center transition-transform hover:-translate-y-1"
            style={{
              height: "182px",
              background: PALETTE.card,
              boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
              border: `1px solid ${PALETTE.cardEdge}`,
            }}
          >
            <span
              className="absolute -top-7 w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: PALETTE.card,
                boxShadow: `5px 5px 10px ${PALETTE.shadowDark}, -5px -5px 10px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
                border: `1px solid ${PALETTE.cardEdge}`,
              }}
            >
              <Icon size={22} strokeWidth={1.8} style={{ color: iconColor }} />
            </span>
            <TileName>{deck.name}</TileName>
            <div className="flex-1" />
            <span
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem", color: PALETTE.mintDeep }}
            >
              {t("N активных", countActive(deck))}
            </span>
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.7rem", color: PALETTE.waiting }}>
              {t("N в долгом ящике", countWaiting(deck))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// FOCUS MODE — "Мои цели": a tree per goal (categories → … → atoms). Atoms
// reuse the exact same card mechanics as the language mode (IndexCard,
// CardForm, flip/swipe/edit). Starts empty, same as language mode.
// ════════════════════════════════════════════════════════════════════════

function useGoals() {
  const [goals, setGoals] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("goals-v1", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setGoals(parsed);
      }
    } catch (e) {
      // nothing saved yet — keep the empty start
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setGoals(next);
    try {
      await window.storage.set("goals-v1", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  const addGoal = useCallback(
    (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist([...goals, { id: uid(), name: trimmed, children: [] }]);
    },
    [goals, persist]
  );

  const renameGoal = useCallback(
    (goalId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist(goals.map((g) => (g.id === goalId ? { ...g, name: trimmed } : g)));
    },
    [goals, persist]
  );

  const deleteGoal = useCallback(
    (goalId) => {
      persist(goals.filter((g) => g.id !== goalId));
    },
    [goals, persist]
  );

  const setGoalChildren = useCallback(
    (goalId, children) => {
      persist(goals.map((g) => (g.id === goalId ? { ...g, children } : g)));
    },
    [goals, persist]
  );

  return { goals, addGoal, renameGoal, deleteGoal, setGoalChildren, refresh };
}

function collectAtoms(node) {
  if (node.type === "atom") return [node];
  return (node.children || []).flatMap(collectAtoms);
}

function countAtomsByStatus(node, status) {
  return collectAtoms(node).filter((a) => a.status === status).length;
}

// Immutable helpers over a tree (an array of category/atom nodes)
function mapNodeInTree(children, id, fn) {
  return children.map((n) => {
    if (n.id === id) return fn(n);
    if (n.type === "category") return { ...n, children: mapNodeInTree(n.children, id, fn) };
    return n;
  });
}
function removeNodeFromTree(children, id) {
  return children
    .filter((n) => n.id !== id)
    .map((n) => (n.type === "category" ? { ...n, children: removeNodeFromTree(n.children, id) } : n));
}
function findNodeInTree(children, id) {
  for (const n of children) {
    if (n.id === id) return n;
    if (n.type === "category") {
      const found = findNodeInTree(n.children, id);
      if (found) return found;
    }
  }
  return null;
}
// Append newAtoms as children of `parentId` (null = tree root). If the
// target node is currently an atom, it is first converted into a category —
// this is the "разбить" (split) operation.
function addAtomsToTree(children, parentId, newAtoms) {
  const freshAtoms = newAtoms.map((a) => ({ ...a, type: "atom" }));
  if (parentId === null) return [...children, ...freshAtoms];
  return children.map((n) => {
    if (n.id === parentId) {
      const base = n.type === "atom" ? { ...n, type: "category", children: [] } : n;
      return { ...base, children: [...(base.children || []), ...freshAtoms] };
    }
    if (n.type === "category") return { ...n, children: addAtomsToTree(n.children, parentId, newAtoms) };
    return n;
  });
}

// Small folder/atom row used while browsing a goal's tree
function NodeRow({ node, onOpen, onSplit, onDelete, onToggleStatus }) {
  const PALETTE = useTheme();
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCategory = node.type === "category";
  const activeCount = isCategory ? countAtomsByStatus(node, "active") : 0;
  const totalCount = isCategory ? collectAtoms(node).length : 0;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2"
      style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}` }}
    >
      <button onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        {isCategory ? (
          <Folder size={20} style={{ color: PALETTE.mustard, flexShrink: 0 }} />
        ) : (
          <span
            className="shrink-0 rounded-full"
            style={{
              width: "10px",
              height: "10px",
              background: node.status === "active" ? PALETTE.mint : PALETTE.waiting,
            }}
          />
        )}
        <div className="min-w-0">
          <p className="truncate" style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.05rem" }}>
            {node.en}
          </p>
          {isCategory ? (
            <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.78rem" }}>
              {t("N активных · N всего", activeCount, totalCount)}
            </p>
          ) : (
            node.ru && (
              <p className="truncate" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.8rem" }}>
                {node.ru}
              </p>
            )
          )}
        </div>
      </button>

      {confirmDelete ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
            {t("Удалить?")}
          </span>
          <button
            onClick={() => onDelete(node.id)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Да")}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Отмена")}
          </button>
        </div>
      ) : (
        <div className="flex items-center shrink-0 gap-1">
          {!isCategory && (
            <button
              onClick={() => onToggleStatus(node)}
              title={node.status === "waiting" ? t("Перенести в активную колоду") : t("Отложить в долгий ящик")}
              className="p-1.5 rounded-full"
              style={{
                color: node.status === "waiting" ? PALETTE.mint : PALETTE.waiting,
                background: node.status === "waiting" ? "rgba(120,132,148,0.16)" : "rgba(124,140,153,0.14)",
              }}
            >
              {node.status === "waiting" ? <ArrowRightCircle size={20} /> : <ArrowLeftCircle size={20} />}
            </button>
          )}
          <button onClick={() => onSplit(node.id)} title={t("Разбить на карточки")} className="p-1.5 rounded-full" style={{ color: PALETTE.mint }}>
            <FolderPlus size={18} />
          </button>
          <button onClick={() => setConfirmDelete(true)} title={t("Удалить")} className="p-1.5" style={{ color: "#5B6275" }}>
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// Full-screen single atom view: same card mechanics as PracticeView, plus
// the ability to split this atom into a category right from here.
function AtomView({ atom, onBack, onSave, onSplit }) {
  const PALETTE = useTheme();
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showTranscription, setShowTranscription] = useTranscription();

  const saveEdit = (fields) => {
    onSave({ ...atom, ...fields });
    setEditing(false);
    setFlipped(false);
  };

  return (
    <div className="flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-md flex items-center justify-between mb-6 gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          <ArrowLeft size={16} /> {t("Назад")}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((e) => !e)}
            title={t("Редактировать карточку")}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: editing ? PALETTE.mustard : PALETTE.chip, color: editing ? PALETTE.bgDeep : PALETTE.fadeText }}
          >
            <Pencil size={14} /> {t("редактировать")}
          </button>
          <button
            onClick={() => setShowTranscription((s) => !s)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: showTranscription ? PALETTE.mustard : PALETTE.chip, color: showTranscription ? PALETTE.bgDeep : PALETTE.fadeText }}
          >
            <Type size={14} /> {t("транскрипция")}
          </button>
        </div>
      </div>

      {editing ? (
        <CardForm initial={atom} onSave={saveEdit} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <IndexCard item={atom} flipped={flipped} onFlip={() => setFlipped((f) => !f)} rotation={-1.5} showTranscription={showTranscription} onSwipeUp={undefined} />
          <button
            onClick={onSplit}
            className="flex items-center gap-2 mt-8 text-sm px-4 py-2 rounded-full"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mint, background: PALETTE.chip }}
          >
            <FolderPlus size={16} /> {t("разбить на подкарточки")}
          </button>
        </>
      )}
    </div>
  );
}

function GoalHome({ goal, onBack, onRename, onDelete, onSetChildren, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const t = useT();
  const [path, setPath] = useState([]); // array of category node ids from the root
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(goal.name);
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(false);
  const [addTarget, setAddTarget] = useState(undefined); // undefined = closed, null = root, id = category/split target
  const [openAtomId, setOpenAtomId] = useState(null);
  const [practicing, setPracticing] = useState(false);

  const crumbs = [{ id: null, name: goal.name }];
  for (const id of path) {
    const node = findNodeInTree(goal.children, id);
    if (!node) break;
    crumbs.push({ id, name: node.en });
  }
  // resolve current level's children by walking the path from root
  let currentChildren = goal.children;
  for (const id of path) {
    const node = findNodeInTree(goal.children, id);
    currentChildren = node ? node.children : [];
  }
  const currentParentId = path.length ? path[path.length - 1] : null;

  const updateChildren = (fn) => onSetChildren(goal.id, fn(goal.children));

  const handleSplit = (nodeId) => setAddTarget(nodeId);
  const handleAddHere = () => setAddTarget(currentParentId);
  const handleAdd = (newAtoms) => {
    updateChildren((children) => addAtomsToTree(children, addTarget, newAtoms));
    setAddTarget(undefined);
  };
  const handleDeleteNode = (nodeId) => {
    updateChildren((children) => removeNodeFromTree(children, nodeId));
    if (openAtomId === nodeId) setOpenAtomId(null);
  };
  const handleToggleStatus = (node) => {
    updateChildren((children) => mapNodeInTree(children, node.id, (n) => ({ ...n, status: n.status === "waiting" ? "active" : "waiting" })));
  };
  const handleSaveAtom = (updatedAtom) => {
    updateChildren((children) => mapNodeInTree(children, updatedAtom.id, () => updatedAtom));
  };

  const saveRename = () => {
    if (nameDraft.trim()) onRename(goal.id, nameDraft);
    setRenaming(false);
  };

  // Aggregated practice deck: all active atoms across the WHOLE goal tree
  const allAtoms = goal.children.flatMap(collectAtoms);
  const practiceDeck = {
    items: allAtoms,
    setItems: (nextItems) => {
      updateChildren((children) => {
        let next = children;
        for (const item of nextItems) {
          next = mapNodeInTree(next, item.id, (n) => ({ ...n, ...item }));
        }
        return next;
      });
    },
  };

  if (practicing) {
    return (
      <div className="min-h-screen" style={{ background: PALETTE.bg }}>
        <div className="max-w-md mx-auto w-full px-6 pt-8 flex items-center justify-between">
          <button onClick={() => setPracticing(false)} className="flex items-center gap-1 text-sm mb-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            <ArrowLeft size={16} /> {goal.name}
          </button>
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
        <PracticeView deck={practiceDeck} resetScopeName={goal.name} deckKey={goal.id} />
      </div>
    );
  }

  if (openAtomId) {
    const atom = findNodeInTree(goal.children, openAtomId);
    if (atom) {
      return (
        <div className="min-h-screen" style={{ background: PALETTE.bg }}>
          <AtomView
            atom={atom}
            onBack={() => setOpenAtomId(null)}
            onSave={handleSaveAtom}
            onSplit={() => {
              setAddTarget(openAtomId);
              setOpenAtomId(null);
            }}
          />
        </div>
      );
    }
    setOpenAtomId(null);
  }

  if (addTarget !== undefined) {
    return (
      <div className="min-h-screen" style={{ background: PALETTE.bg }}>
        <div className="max-w-md mx-auto w-full px-6 pt-8">
          <button onClick={() => setAddTarget(undefined)} className="flex items-center gap-1 text-sm mb-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            <ArrowLeft size={16} /> {t("Отмена")}
          </button>
        </div>
        <BulkAddForm onAdd={handleAdd} onDone={() => setAddTarget(undefined)} doneLabel={t("Добавить")} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <HomeButton onClick={onBack} />
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center gap-2">
            {!renaming && (
              <>
                <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.3rem" }}>
                  <Target size={16} style={{ display: "inline", marginRight: 6, color: PALETTE.mustard }} />
                  {goal.name}
                </h2>
                <button
                  onClick={() => {
                    setNameDraft(goal.name);
                    setRenaming(true);
                  }}
                  title={t("Переименовать цель")}
                  style={{ color: PALETTE.fadeText }}
                >
                  <Pencil size={15} />
                </button>
              </>
            )}
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          </div>
        </div>

        {renaming && (
          <div className="flex items-center gap-2 mb-3">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 outline-none"
              style={{ background: PALETTE.card, color: PALETTE.ink, fontFamily: "'IBM Plex Sans', sans-serif", border: `1px solid ${PALETTE.cardEdge}` }}
            />
            <button onClick={saveRename} className="px-3 py-2 rounded-xl text-sm" style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              {t("Сохранить")}
            </button>
            <button onClick={() => setRenaming(false)} className="px-3 py-2 rounded-xl text-sm" style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              {t("Отмена")}
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 mb-3 overflow-x-auto">
          {path.length > 0 && (
            <button onClick={() => setPath((p) => p.slice(0, -1))} title={t("Наверх")} className="p-1.5 rounded-full mr-1 shrink-0" style={{ background: PALETTE.chip, color: PALETTE.fadeText }}>
              <ArrowUp size={14} />
            </button>
          )}
          {crumbs.map((c, i) => (
            <React.Fragment key={c.id ?? "root"}>
              {i > 0 && <ChevronRightSmall size={12} style={{ color: PALETTE.fadeText, flexShrink: 0 }} />}
              <button
                onClick={() => setPath(path.slice(0, i))}
                className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: i === crumbs.length - 1 ? PALETTE.bgDeep : PALETTE.fadeText,
                  background: i === crumbs.length - 1 ? PALETTE.mustard : "transparent",
                }}
              >
                {c.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={() => setPracticing(true)}
          disabled={allAtoms.filter((a) => a.status === "active").length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium mb-4 disabled:opacity-40"
          style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Повторение (N активных во всей цели)", allAtoms.filter((a) => a.status === "active").length)}
        </button>
      </div>

      <div className="px-6 max-w-md mx-auto w-full pb-4">
        {currentChildren.length === 0 ? (
          <p className="text-sm mb-4" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            {t("Здесь пока пусто. Добавь карточки — каждую потом можно «разбить» на подкатегории.")}
          </p>
        ) : (
          currentChildren.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              onOpen={() => (node.type === "category" ? setPath((p) => [...p, node.id]) : setOpenAtomId(node.id))}
              onSplit={handleSplit}
              onDelete={handleDeleteNode}
              onToggleStatus={handleToggleStatus}
            />
          ))
        )}

        <button
          onClick={handleAddHere}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium mt-2"
          style={{ background: PALETTE.chip, color: PALETTE.mint, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          <Plus size={18} /> {t("Добавить карточки сюда")}
        </button>
      </div>

      <div className="max-w-md mx-auto w-full px-6 pb-10 pt-4">
        {!confirmDeleteGoal ? (
          <button onClick={() => setConfirmDeleteGoal(true)} className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#B7BFC5" }}>
            {t("Удалить цель «N»", goal.name)}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
              {t("Удалить цель «N» навсегда, вместе со всем деревом?", goal.name)}
            </span>
            <button onClick={() => onDelete(goal.id)} className="text-xs px-3 py-1.5 rounded-full shrink-0" style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}>
              {t("Да")}
            </button>
            <button onClick={() => setConfirmDeleteGoal(false)} className="text-xs px-3 py-1.5 rounded-full shrink-0" style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              {t("Отмена")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FocusDashboard({ goals, onOpen, onAddGoal }) {
  const PALETTE = useTheme();
  const t = useT();
  const countActive = (g) => g.children.flatMap(collectAtoms).filter((a) => a.status === "active").length;
  const countTotal = (g) => g.children.flatMap(collectAtoms).length;

  if (goals.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-16">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, textAlign: "center" }}>
          {t("Целей пока нет. Создай первую — язык, молитвы, личный бренд, любой проект.")}
        </p>
        <CreateTile label={t("Создать цель")} placeholder={t("Название цели")} onCreate={onAddGoal} big />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 w-full max-w-lg pt-8">
      {goals.map((goal) => (
        <button
          key={goal.id}
          onClick={() => onOpen(goal.id)}
          className="relative rounded-[28px] pt-10 pb-6 px-4 flex flex-col items-center transition-transform hover:-translate-y-1"
          style={{ height: "182px", background: PALETTE.card, boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`, border: `1px solid ${PALETTE.cardEdge}` }}
        >
          <span
            className="absolute -top-7 w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: PALETTE.card, boxShadow: `5px 5px 10px ${PALETTE.shadowDark}, -5px -5px 10px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`, border: `1px solid ${PALETTE.cardEdge}` }}
          >
            <Target size={22} strokeWidth={1.8} style={{ color: PALETTE.mustard }} />
          </span>
          <TileName>{goal.name}</TileName>
          <div className="flex-1" />
          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem", color: PALETTE.mintDeep }}>
            {t("N активных", countActive(goal))}
          </span>
          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.7rem", color: PALETTE.waiting }}>
            {t("N карточек всего", countTotal(goal))}
          </span>
        </button>
      ))}
      <CreateTile label={t("Новая цель")} placeholder={t("Название цели")} onCreate={onAddGoal} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PAGES MODE — a flat list of long-form texts, read a page at a time. No
// active/waiting status, no folders: just paste a text and read it.
// ════════════════════════════════════════════════════════════════════════

// Generic CRUD store for a flat list of {id, title, body} documents, keyed
// by storageKey — backs both "Pages" texts and "Слово" documents, which are
// otherwise unrelated stores that just happen to share the same shape.
function useTextDocs(storageKey) {
  const [texts, setTexts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get(storageKey, false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setTexts(parsed);
      }
    } catch (e) {
      // nothing saved yet
    }
  }, [storageKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(
    async (next) => {
      setTexts(next);
      try {
        await window.storage.set(storageKey, JSON.stringify(next), false);
      } catch (e) {
        console.error("Storage error", e);
      }
    },
    [storageKey]
  );

  const addText = useCallback(
    (title, body) => {
      if (!title.trim() || !body.trim()) return;
      persist([...texts, { id: uid(), title: title.trim(), body: body.trim() }]);
    },
    [texts, persist]
  );
  const updateText = useCallback(
    (id, title, body) => {
      if (!title.trim() || !body.trim()) return;
      persist(texts.map((t) => (t.id === id ? { ...t, title: title.trim(), body: body.trim() } : t)));
    },
    [texts, persist]
  );
  const deleteText = useCallback(
    (id) => {
      persist(texts.filter((t) => t.id !== id));
    },
    [texts, persist]
  );
  // Removes every id in one persist() call — calling deleteText in a loop
  // would have each call read the same stale `texts` closure and only the
  // last one would stick, silently losing the rest of the batch.
  const deleteTexts = useCallback(
    (ids) => {
      const idSet = new Set(ids);
      persist(texts.filter((t) => !idSet.has(t.id)));
    },
    [texts, persist]
  );

  return { texts, addText, updateText, deleteText, deleteTexts, refresh };
}

function TextForm({ initial, onSave, onCancel, titlePlaceholder, bodyPlaceholder }) {
  const PALETTE = useTheme();
  const t = useT();
  const [title, setTitle] = useState(initial?.title || "");
  const [body, setBody] = useState(initial?.body || "");

  const fieldStyle = {
    background: PALETTE.card,
    color: PALETTE.ink,
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: "0.95rem",
    border: `1px solid ${PALETTE.cardEdge}`,
  };

  return (
    <div className="px-6 py-8 max-w-md mx-auto w-full flex flex-col gap-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={titlePlaceholder ?? t("Название текста")}
        className="rounded-xl px-3 py-2 outline-none"
        style={fieldStyle}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={bodyPlaceholder ?? t("Вставь текст целиком — разбивка на страницы произойдёт автоматически")}
        rows={14}
        className="rounded-xl p-4 outline-none resize-none"
        style={fieldStyle}
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSave(title, body)}
          disabled={!title.trim() || !body.trim()}
          className="flex-1 rounded-full py-2.5 text-sm font-medium disabled:opacity-40"
          style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Сохранить")}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-full py-2.5 text-sm"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Отмена")}
        </button>
      </div>
    </div>
  );
}

// Splits `body` into pages that actually fit the given element's box, by
// incrementally growing a hidden same-width/typography measuring node until
// it overflows, then starting a new page — real layout measurement rather
// than a guessed character count, so it adapts to any screen/font size.
function paginateIntoElement(body, measureEl, maxHeight) {
  const tokens = [];
  body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((para, i) => {
      if (i > 0) tokens.push({ brk: true });
      para.split(/\s+/).forEach((w) => w && tokens.push({ text: w }));
    });

  const pages = [];
  const mkP = () => {
    const p = document.createElement("p");
    p.style.margin = "0 0 1em";
    return p;
  };
  measureEl.innerHTML = "";
  measureEl.appendChild(mkP());
  const fits = () => measureEl.scrollHeight <= maxHeight;
  const closePage = () => {
    pages.push(measureEl.innerHTML);
    measureEl.innerHTML = "";
    measureEl.appendChild(mkP());
  };

  let i = 0;
  let guard = 0;
  const guardLimit = tokens.length * 3 + 10;
  while (i < tokens.length && guard < guardLimit) {
    guard++;
    const tok = tokens[i];
    if (tok.brk) {
      measureEl.appendChild(mkP());
      if (!fits()) {
        measureEl.removeChild(measureEl.lastElementChild);
        closePage();
        continue;
      }
      i++;
      continue;
    }
    const lastP = measureEl.lastElementChild;
    const before = lastP.textContent;
    lastP.textContent = before ? `${before} ${tok.text}` : tok.text;
    if (!fits()) {
      lastP.textContent = before;
      const isOnlyEmptyParagraph = measureEl.children.length === 1 && !before;
      if (isOnlyEmptyParagraph) {
        // a single word taller than the page — place it anyway so we don't spin forever
        lastP.textContent = tok.text;
        closePage();
        i++;
        continue;
      }
      closePage();
      continue; // retry the same token on the fresh page
    }
    i++;
  }
  if (measureEl.innerHTML.trim()) pages.push(measureEl.innerHTML);
  return pages.length ? pages : ["<p></p>"];
}

function PagesReader({ text, onBack, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const t = useT();
  const wrapRef = useRef(null);
  const measureRef = useRef(null);
  const [pages, setPages] = useState(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setPages(null);
    setIdx(0);
  }, [text.id]);

  useLayoutEffect(() => {
    function recompute() {
      const wrap = wrapRef.current;
      const measure = measureRef.current;
      if (!wrap || !measure) return;
      const nextPages = paginateIntoElement(text.body, measure, wrap.clientHeight);
      setPages(nextPages);
      setIdx((prev) => Math.min(prev, nextPages.length - 1));
    }
    recompute();
    const ro = new ResizeObserver(() => recompute());
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text.id, text.body]);

  const readingStyle = {
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: "1rem",
    lineHeight: 1.7,
    color: PALETTE.ink,
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: PALETTE.bg }}>
      <HomeButton onClick={onBack} />
      <div className="max-w-md mx-auto w-full px-6 pt-8 flex items-center justify-between shrink-0">
        <h2 className="truncate px-2 flex-1 text-center" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.1rem" }}>
          {text.title}
        </h2>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>

      <div className="max-w-md mx-auto w-full px-6 flex-1 flex flex-col min-h-0 py-4">
        <div
          ref={wrapRef}
          className="flex-1 min-h-0 rounded-2xl p-6 overflow-hidden"
          style={{ background: PALETTE.card, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}` }}
        >
          {pages ? (
            <div style={readingStyle} dangerouslySetInnerHTML={{ __html: pages[idx] }} />
          ) : (
            <p style={{ ...readingStyle, color: PALETTE.fadeText }}>{t("Разбиваю на страницы…")}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 py-6 shrink-0">
          <button
            onClick={() => setIdx((p) => Math.max(0, p - 1))}
            disabled={idx === 0}
            className="rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ width: "48px", height: "48px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}` }}
            aria-label={t("Предыдущая страница")}
          >
            <ChevronLeft size={24} strokeWidth={2.5} />
          </button>
          <span className="text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mustard, letterSpacing: "0.05em" }}>
            {pages ? `${idx + 1} / ${pages.length}` : "…"}
          </span>
          <button
            onClick={() => setIdx((p) => Math.min((pages?.length || 1) - 1, p + 1))}
            disabled={!pages || idx >= pages.length - 1}
            className="rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ width: "48px", height: "48px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}` }}
            aria-label={t("Следующая страница")}
          >
            <ChevronRight size={24} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Hidden measuring node: identical width/typography to the visible page,
          used to figure out how much text actually fits before it overflows. */}
      <div
        ref={measureRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          transform: "translateX(-200%)",
          boxSizing: "border-box",
          width: wrapRef.current ? `${wrapRef.current.clientWidth}px` : "300px",
          padding: "1.5rem", // matches the visible page's p-6, so the measured text-flow width is identical
          ...readingStyle,
          visibility: "hidden",
        }}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// "Слово" documents — a text laid out with the study-word protocol renders
// as dynamic tabs (one per "##" heading) of ordinary flip-cards, reusing
// the same list -> drill-into-children -> flip-card navigation already
// built for Focus mode, just for this one read-only, two-level structure
// derived fresh from the text's raw body. No active/waiting here at all.
// ════════════════════════════════════════════════════════════════════════

// emphasizeMeaning flips which field reads as the headline: in the
// "Значения" tab the meaning is what the user is actually scanning for
// (the word itself is already known — it's in the screen title), so the
// translation gets the large serif treatment and the word shrinks down.
// The text block itself never truncates to a single line any more — it
// wraps fully, capped at maxHeight with its own scroll for the rare very
// long example, rather than clipping the example/nuance text with an
// ellipsis the way a fixed-size row used to.
function WordCardRow({ card, onOpen, emphasizeMeaning }) {
  const PALETTE = useTheme();
  const hasChildren = card.children && card.children.length > 0;
  const bigStyle = { fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.05rem", lineHeight: 1.35 };
  const smallStyle = { fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.8rem", lineHeight: 1.35 };
  const meaningFirst = emphasizeMeaning && card.ru;

  return (
    <button
      onClick={onOpen}
      className="flex items-start justify-between gap-3 px-4 py-3 rounded-2xl mb-2 w-full text-left"
      style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}` }}
    >
      <div className="min-w-0 flex-1 overflow-y-auto" style={{ maxHeight: "9.5rem" }}>
        {meaningFirst ? (
          <>
            <p style={bigStyle}>{card.ru}</p>
            <p className="mt-0.5" style={smallStyle}>
              {card.en}
            </p>
          </>
        ) : (
          <>
            <p style={bigStyle}>{card.en}</p>
            {card.ru && (
              <p className="mt-0.5" style={smallStyle}>
                {card.ru}
              </p>
            )}
          </>
        )}
      </div>
      {hasChildren && (
        <span
          className="flex items-center gap-1 shrink-0 text-xs px-2 py-1 rounded-full mt-0.5"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.card, color: PALETTE.mintDeep }}
        >
          {card.children.length} <ChevronRightSmall size={12} />
        </span>
      )}
    </button>
  );
}

// Compact mind-map style position indicator for the "Слово" screen: the
// word itself is the root, its tabs branch off as siblings, and the path
// grows one node deeper for each level the user has drilled into (a
// meaning's examples, then the open example itself) — tapping any node,
// at any depth, jumps straight there instead of stepping back one level
// at a time. Rendered above both the card list and the single-card flip
// view, since the old text breadcrumb used to vanish in the latter.
// The word's own screen title (rendered once, in the header above) is the
// tree's root — this only draws the branches hanging off it, starting with
// a connector so the tabs visibly stem from that title instead of floating.
function WordTree({ tabs, tabIndex, onSelectTab, parentCard, onSelectParent, openCard }) {
  const PALETTE = useTheme();
  const connector = <ChevronDown size={12} style={{ color: PALETTE.fadeText, opacity: 0.55 }} />;
  const pillStyle = (isActive) => ({
    fontFamily: "'IBM Plex Sans', sans-serif",
    background: isActive ? PALETTE.mustard : PALETTE.chip,
    color: isActive ? PALETTE.bgDeep : PALETTE.fadeText,
  });

  return (
    <div className="max-w-md mx-auto w-full px-6 flex flex-col items-center gap-1 mb-2">
      {connector}
      <div className="flex flex-wrap justify-center gap-1.5">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(i)}
            className="truncate px-3 py-1.5 rounded-full text-xs"
            style={{ ...pillStyle(i === tabIndex), maxWidth: "160px" }}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {parentCard && (
        <>
          {connector}
          <button
            onClick={onSelectParent}
            className="truncate px-3 py-1.5 rounded-full text-xs"
            style={{ ...pillStyle(!openCard), maxWidth: "220px" }}
          >
            {parentCard.en}
          </button>
        </>
      )}
      {openCard && (
        <>
          {connector}
          <span className="truncate px-3 py-1.5 rounded-full text-xs" style={{ ...pillStyle(true), maxWidth: "220px" }}>
            {openCard.en}
          </span>
        </>
      )}
    </div>
  );
}

function WordCardView({ card, onBack, onPrev, onNext, position, total }) {
  const PALETTE = useTheme();
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  const [showTranscription, setShowTranscription] = useTranscription();

  useEffect(() => {
    setFlipped(false);
  }, [card.id]);

  const canStep = total > 1;

  return (
    <div className="flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-md flex items-center justify-between mb-6 gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm shrink-0" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          <ArrowLeft size={16} /> {t("Назад")}
        </button>
        {canStep && (
          <span className="text-sm shrink-0" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mustard, letterSpacing: "0.05em" }}>
            {position + 1} / {total}
          </span>
        )}
        <button
          onClick={() => setShowTranscription((s) => !s)}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full shrink-0"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: showTranscription ? PALETTE.mustard : PALETTE.chip, color: showTranscription ? PALETTE.bgDeep : PALETTE.fadeText }}
        >
          <Type size={14} /> {t("транскрипция")}
        </button>
      </div>
      <IndexCard item={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} rotation={-1.5} showTranscription={showTranscription} onSwipeUp={undefined} />

      {canStep && (
        <div className="flex items-center gap-6 mt-10">
          <button
            onClick={onPrev}
            className="rounded-full flex items-center justify-center"
            style={{ width: "56px", height: "56px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}` }}
            aria-label={t("Предыдущая")}
          >
            <ChevronLeft size={28} strokeWidth={2.5} />
          </button>
          <button
            onClick={onNext}
            className="rounded-full flex items-center justify-center"
            style={{ width: "56px", height: "56px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}` }}
            aria-label={t("Следующая")}
          >
            <ChevronRight size={28} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}

function WordView({ text, onBack, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const t = useT();
  const tabs = useMemo(() => parseWordDocument(text.body), [text.body]);
  const [tabIndex, setTabIndex] = useState(0);
  const [openParentId, setOpenParentId] = useState(null);
  const [openCardIndex, setOpenCardIndex] = useState(null);

  useEffect(() => {
    setTabIndex(0);
    setOpenParentId(null);
    setOpenCardIndex(null);
  }, [text.id]);

  const activeTab = tabs[tabIndex] || null;
  const parentCard = activeTab && openParentId ? activeTab.cards.find((c) => c.id === openParentId) : null;
  const emphasizeMeaning = !!(activeTab && /^значен/i.test(activeTab.title.trim()));

  // The navigable list for whichever card-flip context is open: a parent's
  // children when drilled in, otherwise the tab's own leaf cards (the only
  // top-level cards that open directly instead of drilling down).
  const cardList = parentCard ? parentCard.children : activeTab ? activeTab.cards.filter((c) => c.children.length === 0) : [];
  const openCard = openCardIndex != null ? cardList[openCardIndex] : null;
  const goToCard = (newIndex) => {
    if (!cardList.length) return;
    setOpenCardIndex((newIndex + cardList.length) % cardList.length);
  };
  const goToTab = (i) => {
    setTabIndex(i);
    setOpenParentId(null);
    setOpenCardIndex(null);
  };
  const goToParent = () => setOpenCardIndex(null);

  const header = (
    <>
      <HomeButton onClick={onBack} />
      <div className="max-w-md mx-auto w-full px-6 pt-8 flex items-center justify-between">
        <h2 className="truncate px-2 flex-1 text-center" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.1rem" }}>
          {text.title}
        </h2>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>
    </>
  );

  const tree = tabs.length > 0 && (
    <WordTree
      tabs={tabs}
      tabIndex={tabIndex}
      onSelectTab={goToTab}
      parentCard={parentCard}
      onSelectParent={goToParent}
      openCard={openCard}
    />
  );

  if (openCard) {
    return (
      <div className="min-h-screen" style={{ background: PALETTE.bg }}>
        {header}
        {tree}
        <WordCardView
          card={openCard}
          onBack={() => setOpenCardIndex(null)}
          onPrev={() => goToCard(openCardIndex - 1)}
          onNext={() => goToCard(openCardIndex + 1)}
          position={openCardIndex}
          total={cardList.length}
        />
      </div>
    );
  }

  if (!tabs.length) {
    return (
      <div className="min-h-screen" style={{ background: PALETTE.bg }}>
        {header}
        <p className="px-6 pt-8 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          {t("В этом тексте не найдено ни одного заголовка «##».")}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      {header}
      {tree}
      <div className="max-w-md mx-auto w-full px-6 pt-2 pb-10">
        {parentCard ? (
          parentCard.children.map((child, i) => (
            <WordCardRow key={child.id} card={child} onOpen={() => setOpenCardIndex(i)} emphasizeMeaning={false} />
          ))
        ) : activeTab.cards.length === 0 ? (
          <p className="text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            {t("В этом разделе пока нет карточек.")}
          </p>
        ) : (
          activeTab.cards.map((card) => (
            <WordCardRow
              key={card.id}
              card={card}
              emphasizeMeaning={emphasizeMeaning}
              onOpen={() =>
                card.children.length > 0
                  ? setOpenParentId(card.id)
                  : setOpenCardIndex(cardList.findIndex((c) => c.id === card.id))
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

// Full-screen create/edit form for a text — mirrors DeckHome/GoalHome: its
// own screen, no dashboard tagline/mode-switch chrome above it.
function PagesFormScreen({ initial, onCancel, onSave, titlePlaceholder, bodyPlaceholder }) {
  const PALETTE = useTheme();
  const t = useT();
  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-sm"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
        >
          <ArrowLeft size={16} /> {t("Отмена")}
        </button>
      </div>
      <TextForm initial={initial} onCancel={onCancel} onSave={onSave} titlePlaceholder={titlePlaceholder} bodyPlaceholder={bodyPlaceholder} />
    </div>
  );
}

// A flat list of {id, title, body} documents with create/edit/delete — backs
// both the Pages dashboard and the Слово dashboard, which only differ in
// copy and icon.
function PagesList({ texts, onOpen, onCreate, onEdit, onDelete, emptyText, createLabel, rowIcon: RowIcon = BookOpen }) {
  const PALETTE = useTheme();
  const t = useT();
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const resolvedEmptyText = emptyText ?? t("Текстов пока нет. Вставь первый — абзацы, отрывки, что угодно длинное.");
  const resolvedCreateLabel = createLabel ?? t("Добавить текст");

  return (
    <div className="w-full max-w-md px-6 pt-8">
      {texts.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-10">
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, textAlign: "center" }}>
            {resolvedEmptyText}
          </p>
          <button
            onClick={onCreate}
            className="flex flex-col items-center justify-center gap-3 w-full max-w-xs py-14 rounded-[28px]"
            style={{ background: "transparent", border: `2px dashed ${PALETTE.cardEdge}` }}
          >
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: PALETTE.chip }}>
              <Plus size={24} style={{ color: PALETTE.mustard }} />
            </span>
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.9rem", color: PALETTE.fadeText }}>{resolvedCreateLabel}</span>
          </button>
        </div>
      ) : (
        <>
          {texts.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2"
              style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}` }}
            >
              <button onClick={() => onOpen(doc.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <RowIcon size={18} style={{ color: PALETTE.mustard, flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="truncate" style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.05rem" }}>
                    {doc.title}
                  </p>
                  <p className="truncate" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.8rem" }}>
                    {doc.body.slice(0, 60)}
                  </p>
                </div>
              </button>

              {confirmDeleteId === doc.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onDelete(doc.id);
                      setConfirmDeleteId(null);
                    }}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    {t("Да")}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    {t("Отмена")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center shrink-0 gap-1">
                  <button onClick={() => onEdit(doc.id)} title={t("Редактировать")} className="p-1.5" style={{ color: PALETTE.fadeText }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(doc.id)} title={t("Удалить")} className="p-1.5" style={{ color: "#5B6275" }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <button
            onClick={onCreate}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium mt-2 mb-10"
            style={{ background: PALETTE.chip, color: PALETTE.mint, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            <Plus size={18} /> {resolvedCreateLabel}
          </button>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// VOCABULARY — a flat, ever-growing scratch list of highlighted words and
// phrases, captured from anywhere text is shown in the app. No structure,
// no translation, no parsing: just strings in, copy-all out.
// ════════════════════════════════════════════════════════════════════════

function useVocabulary() {
  const [entries, setEntries] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("vocabulary-v1", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setEntries(parsed);
      }
    } catch (e) {
      // nothing saved yet
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setEntries(next);
    try {
      await window.storage.set("vocabulary-v1", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  const addEntry = useCallback(
    (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      persist([...entries, { id: uid(), text: trimmed }]);
    },
    [entries, persist]
  );
  const deleteEntry = useCallback(
    (id) => {
      persist(entries.filter((e) => e.id !== id));
    },
    [entries, persist]
  );
  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  return { entries, addEntry, deleteEntry, clearAll, refresh };
}

// ════════════════════════════════════════════════════════════════════════
// QUOTES — "Мои цитаты": highlighted passages of any length, captured the
// same way as Vocabulary (via SelectionCapture) but kept as their own flat
// collection of two-sided cards (quote on the front, an initially-empty
// translation/note on the back) rather than single words. Reuses the
// active/waiting ("долгий ящик") status convention from the language decks.
// ════════════════════════════════════════════════════════════════════════
function useQuotes() {
  const [quotes, setQuotesState] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("quotes-v1", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setQuotesState(parsed);
      }
    } catch (e) {
      // nothing saved yet
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setQuotesState(next);
    try {
      await window.storage.set("quotes-v1", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  const setItems = useCallback((next) => persist(next), [persist]);

  const addFromSelection = useCallback(
    (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      persist([...quotes, { id: uid(), front: trimmed, back: "", status: "active", createdAt: Date.now() }]);
    },
    [quotes, persist]
  );

  return { quotes, setItems, addFromSelection, refresh };
}

// The id of the always-present, undeletable "Все цитаты" deck — it isn't a
// real stored deck (nothing in quote-decks-v1 ever has this id); it's a
// virtual view over every quote in `quotes-v1`, exactly the set that
// addFromSelection above appends to. Every quote is automatically "in" it
// with no membership bookkeeping needed.
const ALL_QUOTES_DECK_ID = "__all_quotes__";

// A separate collection of named decks scoped only to Мои цитаты — not the
// same decks as "Изучение языка". A deck here is {id, name, quoteIds}: a
// set of references into the canonical quotes-v1 list, not copies of the
// cards themselves. A quote can belong to several decks (or none, besides
// the implicit "Все цитаты") at once — adding it to a deck never removes
// it from anywhere else, so nothing is ever "lost" by filing it away.
function useQuoteDecks() {
  const [decks, setDecksState] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("quote-decks-v1", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        // Decks saved by an earlier version of this feature (before decks
        // held quoteIds at all) would otherwise crash every .quoteIds.*
        // call downstream — with no error boundary in this app, that
        // takes the whole thing to a blank white screen, not just this
        // section. Normalizing on load is cheap insurance against that.
        if (Array.isArray(parsed)) {
          setDecksState(parsed.map((d) => (Array.isArray(d.quoteIds) ? d : { ...d, quoteIds: [] })));
        }
      }
    } catch (e) {
      // nothing saved yet
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setDecksState(next);
    try {
      await window.storage.set("quote-decks-v1", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  // initialQuoteIds lets a caller create-and-file-into-this-deck as one
  // atomic update — calling addQuoteToDeck right after addDeck would read
  // `decks` from a stale closure that doesn't have the brand-new deck yet.
  const addDeck = useCallback(
    (name, initialQuoteIds = []) => {
      const trimmed = (name || "").trim();
      if (!trimmed) return null;
      const id = uid();
      persist([...decks, { id, name: trimmed, quoteIds: initialQuoteIds }]);
      return id;
    },
    [decks, persist]
  );

  const addQuoteToDeck = useCallback(
    (deckId, quoteId) => {
      persist(decks.map((d) => (d.id === deckId && !d.quoteIds.includes(quoteId) ? { ...d, quoteIds: [...d.quoteIds, quoteId] } : d)));
    },
    [decks, persist]
  );

  const removeQuoteFromDeck = useCallback(
    (deckId, quoteId) => {
      persist(decks.map((d) => (d.id === deckId ? { ...d, quoteIds: d.quoteIds.filter((id) => id !== quoteId) } : d)));
    },
    [decks, persist]
  );

  // A deck deletion removes only the deck itself, never the quotes it
  // referenced — they stay put in "Все цитаты" and in any other deck.
  const removeQuoteEverywhere = useCallback(
    (quoteId) => {
      persist(decks.map((d) => (d.quoteIds.includes(quoteId) ? { ...d, quoteIds: d.quoteIds.filter((id) => id !== quoteId) } : d)));
    },
    [decks, persist]
  );

  return { decks, addDeck, addQuoteToDeck, removeQuoteFromDeck, removeQuoteEverywhere, refresh };
}

// Mounted once at the app root regardless of mode/screen: watches the
// document's text selection and floats two small independent buttons next
// to whatever the user just highlighted — "Добавить в Vocabulary" (single
// words/phrases) and "Добавить в цитаты" (any length, becomes a quote
// card). They're stacked in one anchored column rather than each finding
// its own position, so they never overlap or fight over screen space.
// onMouseDown/onTouchStart call preventDefault so pressing a button doesn't
// first collapse the selection it's meant to capture.
function SelectionCapture({ onAddVocab, onAddQuote }) {
  const PALETTE = useTheme();
  const t = useT();
  const [sel, setSel] = useState(null);

  useEffect(() => {
    const updateFromSelection = () => {
      const selection = window.getSelection();
      const text = selection && !selection.isCollapsed ? selection.toString().trim() : "";
      if (!text || !selection.rangeCount) {
        setSel(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setSel(null);
        return;
      }
      // Android's system Copy/Share selection menu normally renders above
      // the selected text, so anchoring below (rect.bottom) keeps clear of
      // it — except when the selection is too close to the top of the
      // viewport for the menu to fit up there: in that case Android flips
      // its own menu to below the selection instead, landing right where
      // our "always below" button would sit. SYSTEM_MENU_CLEARANCE is an
      // empirical estimate of the system menu's height; when there isn't
      // room above for it, assume it flipped below and place our button to
      // whichever side has more horizontal room instead, so the two never
      // compete for the same space regardless of which way it flips.
      // Android also draws two small draggable "ear" handles at the start
      // and end of the selection, extending roughly 20-24px past the text
      // itself (below and to the sides) so the user can drag them to
      // resize the selection. The button doesn't need to hug the text —
      // it just needs to clear both the system menu and these handles — so
      // every offset below is padded past that handle size with room to
      // spare, not just past the text's own edge.
      const SYSTEM_MENU_CLEARANCE = 56;
      const HANDLE_CLEARANCE = 30;
      // Two stacked buttons now sit at this anchor instead of one, so the
      // clamps that used to leave room for a single ~40px-tall button leave
      // room for the taller two-button column instead.
      if (rect.top >= SYSTEM_MENU_CLEARANCE) {
        const top = Math.min(rect.bottom + HANDLE_CLEARANCE, window.innerHeight - 96);
        const left = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90);
        setSel({ text, placement: "below", top, left });
      } else {
        const spaceRight = window.innerWidth - rect.right;
        const spaceLeft = rect.left;
        const placement = spaceRight >= spaceLeft ? "right" : "left";
        const top = Math.min(Math.max(rect.top + rect.height / 2, 52), window.innerHeight - 52);
        const left =
          placement === "right"
            ? Math.min(rect.right + HANDLE_CLEARANCE, window.innerWidth - 8)
            : Math.max(rect.left - HANDLE_CLEARANCE, 8);
        setSel({ text, placement, top, left });
      }
    };
    // Scroll re-derives the button from the live selection instead of just
    // hiding it, so it tracks/repositions through scrolling (including a
    // section like Video whose subtitle panel auto-scrolls continuously
    // during playback) rather than vanishing on every scroll tick.
    document.addEventListener("selectionchange", updateFromSelection);
    window.addEventListener("scroll", updateFromSelection, true);
    return () => {
      document.removeEventListener("selectionchange", updateFromSelection);
      window.removeEventListener("scroll", updateFromSelection, true);
    };
  }, []);

  if (!sel) return null;

  const handleAdd = (onAdd) => {
    onAdd(sel.text);
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  const transform =
    sel.placement === "right" ? "translate(0, -50%)" : sel.placement === "left" ? "translate(-100%, -50%)" : "translate(-50%, 0)";

  const buttonBaseStyle = {
    fontFamily: "'IBM Plex Sans', sans-serif",
    boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}`,
  };

  return (
    <div
      className="fixed flex flex-col items-stretch gap-1.5"
      style={{ top: `${sel.top}px`, left: `${sel.left}px`, transform, zIndex: 9999 }}
    >
      {onAddVocab && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => handleAdd(onAddVocab)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={{ ...buttonBaseStyle, background: PALETTE.mustard, color: PALETTE.bgDeep }}
        >
          <Highlighter size={14} /> {t("Добавить в Vocabulary")}
        </button>
      )}
      {onAddQuote && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => handleAdd(onAddQuote)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={{ ...buttonBaseStyle, background: PALETTE.card, color: PALETTE.mustard, border: `1px solid ${PALETTE.mustard}` }}
        >
          <Quote size={14} /> {t("Добавить в цитаты")}
        </button>
      )}
    </div>
  );
}

// The Vocabulary dashboard: no drill-down, no create form — entries only
// ever arrive via SelectionCapture. Just a flat list with per-row delete,
// a copy-everything action (the primary use case), and a guarded clear-all.
function VocabularyList({ entries, onDelete, onClearAll }) {
  const PALETTE = useTheme();
  const t = useT();
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(entries.map((e) => e.text).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Clipboard error", e);
    }
  };

  return (
    <div className="w-full max-w-md px-6 pt-8 pb-10">
      {entries.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          {t("Пока пусто — выдели любой текст в приложении и нажми «Добавить в Vocabulary».")}
        </p>
      ) : (
        <>
          <button
            onClick={handleCopyAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium mb-4"
            style={{ background: copied ? PALETTE.mint : PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t("Скопировано") : t("Скопировать всё (N)", entries.length)}
          </button>

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2"
              style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}` }}
            >
              <p
                className="min-w-0 flex-1"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.cream, fontSize: "0.95rem", overflowWrap: "break-word" }}
              >
                {entry.text}
              </p>
              {confirmDeleteId === entry.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onDelete(entry.id);
                      setConfirmDeleteId(null);
                    }}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    {t("Да")}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: PALETTE.card, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    {t("Отмена")}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(entry.id)} title={t("Удалить")} className="p-1.5 shrink-0" style={{ color: "#5B6275" }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}

          <div className="mt-4">
            {confirmClear ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
                  {t("Удалить весь список (N) безвозвратно?", entries.length)}
                </span>
                <button
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full shrink-0"
                  style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  {t("Да")}
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-xs px-3 py-1.5 rounded-full shrink-0"
                  style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  {t("Отмена")}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#B7BFC5" }}>
                {t("Очистить весь список")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// VIDEO — saved YouTube videos with attached subtitle text, played through
// the YouTube IFrame Player API right inside the app. A draggable handle
// between the video and the text panel adjusts how much screen each gets;
// dragged to the top, the video collapses into a compact audio-only panel
// (play/pause, progress, timing) without ever destroying the player, so
// playback continues uninterrupted across the transition.
// ════════════════════════════════════════════════════════════════════════

function extractYouTubeId(url) {
  const m = (url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function deriveVideoTitle(body, existingTitles) {
  const firstLine = (body || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine) {
    return firstLine.length > 60 ? `${firstLine.slice(0, 60).trimEnd()}…` : firstLine;
  }
  let maxN = 0;
  for (const title of existingTitles) {
    const m = /^Видео №(\d+)$/.exec(title);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `Видео №${maxN + 1}`;
}

// One shared loader for the YouTube IFrame API script/callback, since more
// than one VideoPlayerScreen could mount over a session — window.YT is a
// global singleton regardless of how many players exist.
let ytApiPromise = null;
function loadYouTubeIframeAPI() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function useVideos() {
  const [videos, setVideos] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("videos-v1", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setVideos(parsed);
      }
    } catch (e) {
      // nothing saved yet
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setVideos(next);
    try {
      await window.storage.set("videos-v1", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  // Returns false (and leaves state untouched) when the URL doesn't parse
  // to a video id, so the form screen can show an inline error instead of
  // silently saving a broken record.
  const addVideo = useCallback(
    (url, body) => {
      const youtubeId = extractYouTubeId(url);
      if (!youtubeId || !body.trim()) return false;
      const title = deriveVideoTitle(body, videos.map((v) => v.title));
      persist([...videos, { id: uid(), title, youtubeId, body: body.trim() }]);
      return true;
    },
    [videos, persist]
  );

  const updateVideo = useCallback(
    (id, url, body) => {
      const youtubeId = extractYouTubeId(url);
      if (!youtubeId || !body.trim()) return false;
      const title = deriveVideoTitle(body, videos.filter((v) => v.id !== id).map((v) => v.title));
      persist(videos.map((v) => (v.id === id ? { ...v, youtubeId, title, body: body.trim() } : v)));
      return true;
    },
    [videos, persist]
  );

  const deleteVideo = useCallback(
    (id) => {
      persist(videos.filter((v) => v.id !== id));
    },
    [videos, persist]
  );

  return { videos, addVideo, updateVideo, deleteVideo, refresh };
}

function VideoFormScreen({ initial, onCancel, onSave }) {
  const PALETTE = useTheme();
  const t = useT();
  const [url, setUrl] = useState(initial ? `https://youtu.be/${initial.youtubeId}` : "");
  const [body, setBody] = useState(initial?.body || "");
  const [error, setError] = useState(false);

  const fieldStyle = {
    background: PALETTE.card,
    color: PALETTE.ink,
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: "0.95rem",
    border: `1px solid ${PALETTE.cardEdge}`,
  };

  const handleSave = () => {
    if (onSave(url, body) === false) setError(true);
  };

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <button onClick={onCancel} className="flex items-center gap-1 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          <ArrowLeft size={16} /> {t("Отмена")}
        </button>
      </div>
      <div className="px-6 pt-4 pb-8 max-w-md mx-auto w-full flex flex-col gap-3">
        <input
          autoFocus
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(false);
          }}
          placeholder={t("Ссылка на YouTube-видео")}
          className="rounded-xl px-3 py-2 outline-none"
          style={fieldStyle}
        />
        {error && (
          <p className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
            {t("Не удалось распознать ссылку на YouTube-видео")}
          </p>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("Вставь текст или субтитры к видео")}
          rows={14}
          className="rounded-xl p-4 outline-none resize-none"
          style={fieldStyle}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!url.trim() || !body.trim()}
            className="flex-1 rounded-full py-2.5 text-sm font-medium disabled:opacity-40"
            style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Сохранить")}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-full py-2.5 text-sm"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {t("Отмена")}
          </button>
        </div>
      </div>
    </div>
  );
}

const VIDEO_MIN_SPLIT = 0;
const VIDEO_MAX_SPLIT = 0.72;
const VIDEO_DEFAULT_SPLIT = 0.4;
const VIDEO_AUDIO_THRESHOLD = 0.14;
// Keeps the iframe rendered at a real (if tiny) pixel size even fully
// "collapsed" to audio mode, so playback never stalls — the audio-mode
// overlay covers it regardless of this floor, at its own comfortable height.
const VIDEO_MIN_LIVE_PX = 36;
const AUDIO_PANEL_HEIGHT_PX = 60;
const VIDEO_SCROLL_SPEED_MIN = 0;
const VIDEO_SCROLL_SPEED_MAX = 25;
const VIDEO_SCROLL_SPEED_STEP = 1;
const VIDEO_SCROLL_SPEED_DEFAULT = 5;
// px/sec of auto-scroll per unit of the 1-25 speed scale.
const SCROLL_PX_PER_SEC_PER_SPEED = 4.4;
// Font size is chosen on a plain integer 1-15 scale (same whole-step feel
// as the speed scale) and mapped onto a practical rem range: small enough
// to be useful on a tablet at level 1, large enough for low-vision users
// at level 15.
const VIDEO_FONT_LEVEL_MIN = 1;
const VIDEO_FONT_LEVEL_MAX = 15;
const VIDEO_FONT_LEVEL_STEP = 1;
const VIDEO_FONT_LEVEL_DEFAULT = 4;
const VIDEO_FONT_REM_MIN = 0.7;
const VIDEO_FONT_REM_MAX = 2.2;
function fontLevelToRem(level) {
  return VIDEO_FONT_REM_MIN + ((level - VIDEO_FONT_LEVEL_MIN) * (VIDEO_FONT_REM_MAX - VIDEO_FONT_REM_MIN)) / (VIDEO_FONT_LEVEL_MAX - VIDEO_FONT_LEVEL_MIN);
}
const SEEK_STEP_SECONDS = 10;
const DOUBLE_TAP_MS = 350;

function VideoPlayerScreen({ video, onBack, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const t = useT();
  const regionRef = useRef(null);
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const textPanelRef = useRef(null);
  const dragRef = useRef({ startY: 0, startSplit: VIDEO_DEFAULT_SPLIT, regionHeight: 0 });
  const manualScrollUntil = useRef(0);
  const rafRef = useRef(null);
  const tapBurstRef = useRef({ left: { count: 0, last: 0 }, right: { count: 0, last: 0 } });
  const seekFlashTimeoutRef = useRef(null);
  const scrollAccumRef = useRef(0);
  const percentLabelRef = useRef(null);

  const [split, setSplit] = useState(VIDEO_DEFAULT_SPLIT);
  const [dragging, setDragging] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(VIDEO_SCROLL_SPEED_DEFAULT);
  const [fontLevel, setFontLevel] = useState(VIDEO_FONT_LEVEL_DEFAULT);
  const [scrollPlaying, setScrollPlaying] = useState(true);
  // { side: "left" | "right", seconds: number } | null
  const [seekFlash, setSeekFlash] = useState(null);

  const isAudioMode = split < VIDEO_AUDIO_THRESHOLD;

  // Best-effort nudge to get mobile Chrome to auto-hide its address bar on
  // entry, instead of making the user scroll once manually — without it,
  // the extra bar height can clip the bottom control row until they do.
  // This is a browser affordance a page can only request, never guarantee:
  // scrolling 1px is the standard trick and it works because the layout is
  // sized with 100vh (h-screen), which mobile Chrome measures as if the
  // bar were already hidden, leaving just enough real scroll slack for
  // this to register. It depends on browser/OS/timing and may simply do
  // nothing on some devices — that's an accepted, unfixable limitation,
  // not a bug to chase further.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.scrollTo(0, 1);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Mount the YouTube player once per video, tear it down on unmount/video change.
  useEffect(() => {
    let cancelled = false;
    let player = null;
    setPlayerReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !YT || !hostRef.current) return;
      player = new YT.Player(hostRef.current, {
        videoId: video.youtubeId,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            setPlayerReady(true);
            setDuration(player.getDuration() || 0);
          },
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            if (e.data === YT.PlayerState.PLAYING) setDuration(player.getDuration() || 0);
          },
        },
      });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      if (player && player.destroy) player.destroy();
      playerRef.current = null;
    };
  }, [video.id, video.youtubeId]);

  // Keep the iframe's actual pixel size in sync with the video area, even
  // while it's visually covered by the audio-mode overlay.
  useEffect(() => {
    if (!playerRef.current || !playerRef.current.setSize || !regionRef.current) return;
    const w = regionRef.current.clientWidth;
    const h = Math.max(split * (regionRef.current.clientHeight || 0), VIDEO_MIN_LIVE_PX);
    playerRef.current.setSize(w, h);
  }, [split, playerReady]);

  // Poll playback position while playing (the IFrame API has no time-update event).
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 250);
    return () => clearInterval(id);
  }, [playing]);

  // Auto-scroll the subtitle panel autonomously at the chosen speed,
  // independent of video play/pause — it keeps running through a paused
  // video and only stops when the user pauses it with the dedicated
  // scroll play/stop control, or this screen unmounts. A recent manual
  // scroll (touch/wheel) suspends it briefly so the two don't fight each
  // other, and — critically — it also suspends the instant a text
  // selection exists inside the panel: programmatically moving scrollTop
  // while a native selection is anchored in the same element can silently
  // collapse that selection on some mobile browsers, which is exactly what
  // made picking a word for Vocabulary unreliable here (this is the only
  // screen in the app with continuous auto-scroll running under the text
  // the user is trying to select).
  useEffect(() => {
    let last = performance.now();
    let suspended = false;
    const hasSelectionInside = (el) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.anchorNode) return false;
      return el.contains(sel.anchorNode) || (sel.focusNode && el.contains(sel.focusNode));
    };
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      const el = textPanelRef.current;
      if (el) {
        if (!scrollPlaying || now <= manualScrollUntil.current || hasSelectionInside(el)) {
          suspended = true;
        } else {
          // A fractional per-frame delta (e.g. ~0.4px at 60fps) gets
          // silently truncated to an integer if written straight to
          // el.scrollTop and read back each frame, so the panel never
          // visibly moves — accumulate the true position in a ref instead
          // and only round on write. Resync that ref to the DOM's actual
          // position right after a suspension ends, so resuming doesn't
          // jump back to wherever auto-scroll last was.
          if (suspended) {
            scrollAccumRef.current = el.scrollTop;
            suspended = false;
          }
          scrollAccumRef.current += SCROLL_PX_PER_SEC_PER_SPEED * speed * dt;
          el.scrollTop = scrollAccumRef.current;
        }
        // The marker sits at the panel's vertical center, not its top, so
        // the text already sitting below it (half a screen's worth) counts
        // toward "read" from the very first frame — otherwise the percent
        // would claim 0% while a chunk of text is visibly already past the
        // marker line.
        const pastMarker = el.scrollTop + el.clientHeight / 2;
        const pct = el.scrollHeight > 0 ? Math.min(100, Math.max(0, Math.round((pastMarker / el.scrollHeight) * 100))) : 0;
        if (percentLabelRef.current) percentLabelRef.current.textContent = `${pct}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [speed, scrollPlaying]);

  const toggleScrollPlaying = () => setScrollPlaying((p) => !p);

  const suspendAutoScroll = () => {
    manualScrollUntil.current = performance.now() + 2500;
  };

  const startDrag = (e) => {
    e.preventDefault();
    const region = regionRef.current;
    if (!region) return;
    dragRef.current = { startY: e.clientY, startSplit: split, regionHeight: region.clientHeight || 1 };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const { startY, startSplit, regionHeight } = dragRef.current;
      const delta = (e.clientY - startY) / regionHeight;
      setSplit(Math.min(VIDEO_MAX_SPLIT, Math.max(VIDEO_MIN_SPLIT, startSplit + delta)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };

  const adjustSpeed = (delta) => {
    setSpeed((s) => Math.min(VIDEO_SCROLL_SPEED_MAX, Math.max(VIDEO_SCROLL_SPEED_MIN, Math.round(s + delta))));
  };

  const adjustFontLevel = (delta) => {
    setFontLevel((l) => Math.min(VIDEO_FONT_LEVEL_MAX, Math.max(VIDEO_FONT_LEVEL_MIN, Math.round(l + delta))));
  };

  const restartFromBeginning = () => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(0, true);
    playerRef.current.playVideo();
    setCurrentTime(0);
  };

  const seekBy = (delta) => {
    if (!playerRef.current || !duration) return;
    const next = Math.min(duration, Math.max(0, currentTime + delta));
    playerRef.current.seekTo(next, true);
    setCurrentTime(next);
  };

  // Manual tap-burst detection (rather than relying on native dblclick)
  // works reliably across mobile browsers regardless of touch-action/zoom
  // settings, mirroring YouTube's own left/right double-tap-to-seek gesture
  // — including how consecutive taps within the burst accumulate: the first
  // tap only arms it, the second tap seeks ±10s, and every further tap
  // within the window seeks another ±10s on top, with the running total
  // shown next to the tapped side.
  const handleZoneTap = (side) => {
    const now = Date.now();
    const burst = tapBurstRef.current[side];
    burst.count = now - burst.last < DOUBLE_TAP_MS ? burst.count + 1 : 1;
    burst.last = now;
    if (burst.count < 2) return;
    seekBy(side === "left" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
    setSeekFlash({ side, seconds: (burst.count - 1) * SEEK_STEP_SECONDS });
    if (seekFlashTimeoutRef.current) clearTimeout(seekFlashTimeoutRef.current);
    seekFlashTimeoutRef.current = setTimeout(() => setSeekFlash(null), 700);
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: PALETTE.bg }}>
      <HomeButton onClick={onBack} />
      {/* Compact mode should have no wasted air: the header itself shrinks
          its own top/bottom padding once the video collapses, instead of
          keeping the same generous spacing that only makes sense when the
          video is actually visible below it. */}
      <div className={`max-w-md mx-auto w-full px-6 flex items-center justify-between shrink-0 ${isAudioMode ? "pt-3 pb-1" : "pt-8 pb-2"}`}>
        <h2 className="truncate px-2 text-center flex-1" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.05rem" }}>
          {video.title}
        </h2>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>

      <div
        ref={regionRef}
        className="flex-1 min-h-0 flex flex-col max-w-md mx-auto w-full px-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <div
          className="relative rounded-2xl overflow-hidden shrink-0"
          style={{
            height: isAudioMode ? `${AUDIO_PANEL_HEIGHT_PX}px` : `${split * 100}%`,
            background: PALETTE.chip,
          }}
        >
          {/* This wrapper — not hostRef itself — carries the absolute
              positioning: the YouTube API replaces hostRef's div with an
              iframe in place, which does not inherit its class list, so
              position/size have to live on a div that survives the swap. */}
          <div className="absolute inset-0">
            <div ref={hostRef} />
          </div>
          {isAudioMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6" style={{ background: PALETTE.chip }}>
              {/* Tap zones flanking the play/pause button: repeated taps
                  within the burst window seek ±10s each, accumulating like
                  YouTube's own gesture (2 taps = 10s, 3 = 20s, ...). These
                  zones render plain digits, not the subtitle text, but
                  still sit on top of a scrollable screen — user-select:
                  none keeps a tap here from ever being mistaken for a word
                  selection and popping the Vocabulary button over the
                  seek indicator. The restart button sits inline with
                  play/pause (not floating in a corner) so the two read as
                  one row at one vertical level. */}
              <div
                className="w-full flex items-center justify-center relative"
                style={{ height: "52px", userSelect: "none", WebkitUserSelect: "none" }}
              >
                <div
                  onClick={() => handleZoneTap("left")}
                  aria-label={t("Перемотка назад (двойной тап, повторный тап — ещё −10 сек)")}
                  className="absolute inset-y-0 left-0 flex items-center justify-start pl-3"
                  style={{ width: "36%" }}
                >
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: PALETTE.mustard,
                      opacity: seekFlash?.side === "left" ? 1 : 0,
                      transition: "opacity 0.2s",
                    }}
                  >
                    −{seekFlash?.side === "left" ? seekFlash.seconds : SEEK_STEP_SECONDS}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    disabled={!playerReady}
                    className="rounded-full flex items-center justify-center disabled:opacity-40"
                    style={{
                      width: "52px",
                      height: "52px",
                      background: PALETTE.mustard,
                      color: PALETTE.bgDeep,
                      boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}`,
                    }}
                  >
                    {playing ? <Pause size={22} /> : <Play size={22} style={{ marginLeft: "2px" }} />}
                  </button>
                  <button
                    onClick={restartFromBeginning}
                    disabled={!playerReady}
                    aria-label={t("Сначала")}
                    className="rounded-full flex items-center justify-center disabled:opacity-40"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: PALETTE.chip,
                      color: PALETTE.ink,
                      boxShadow: `2px 2px 5px ${PALETTE.shadowDark}, -2px -2px 5px ${PALETTE.shadowLight}`,
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
                <div
                  onClick={() => handleZoneTap("right")}
                  aria-label={t("Перемотка вперёд (двойной тап, повторный тап — ещё +10 сек)")}
                  className="absolute inset-y-0 right-0 flex items-center justify-end pr-3"
                  style={{ width: "36%" }}
                >
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: PALETTE.mustard,
                      opacity: seekFlash?.side === "right" ? 1 : 0,
                      transition: "opacity 0.2s",
                    }}
                  >
                    +{seekFlash?.side === "right" ? seekFlash.seconds : SEEK_STEP_SECONDS}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* The draggable video/text divider doubles as the video's own
            progress bar — a tap here was never used for seeking, so
            merging the two loses nothing and buys back vertical space
            that a separate handle + separate progress row used to cost.
            A small dot cluster below (not on) the bar hints that this
            whole strip — bar, percent, and dots alike — is draggable. */}
        <div
          onPointerDown={startDrag}
          className="w-full shrink-0 flex flex-col items-center"
          style={{
            paddingTop: "6px",
            paddingBottom: "5px",
            touchAction: "none",
            cursor: "row-resize",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          aria-label={t("Перетащить границу видео/текста (полоска — прогресс видео)")}
        >
          <div className="w-full flex items-center gap-2">
            <div
              className="flex-1 rounded-full"
              style={{ height: "6px", background: PALETTE.bg, boxShadow: `inset 2px 2px 4px ${PALETTE.shadowDark}, inset -2px -2px 4px ${PALETTE.shadowLight}` }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%`, background: PALETTE.mustard }}
              />
            </div>
            <span
              className="text-[10px] shrink-0"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, minWidth: "24px", textAlign: "right" }}
            >
              {duration ? Math.round((currentTime / duration) * 100) : 0}%
            </span>
          </div>
          <div className="flex items-center gap-1" style={{ marginTop: "5px" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-full" style={{ width: "3px", height: "3px", background: PALETTE.cardEdge }} />
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="relative flex-1 min-h-0">
            <div
              ref={textPanelRef}
              onPointerDown={suspendAutoScroll}
              onWheel={suspendAutoScroll}
              className="absolute inset-0 overflow-y-auto pt-1 pb-2"
              style={{ paddingLeft: "26px", paddingRight: "14px", zIndex: 1 }}
            >
              <p
                className="whitespace-pre-wrap"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: PALETTE.ink,
                  fontSize: `${fontLevelToRem(fontLevel)}rem`,
                  lineHeight: 1.8,
                  textAlign: "justify",
                  textJustify: "inter-word",
                }}
              >
                {video.body}
              </p>
            </div>

            {/* A thin, very faint dashed line fixed at the vertical center
                of the text area — the text scrolls through it, it never
                moves — with a live percentage of how far the scroll has
                gotten at the LEFT edge and a small triangle pointer at the
                RIGHT edge. Both are small thin labels (not buttons) that
                live entirely inside the narrow side margins the text
                panel's own padding carves out above — never touching a
                line of (now full-width-justified) text and never needing
                those margins widened to fit. The whole overlay renders
                BEHIND the text panel (lower z-index) so glyphs paint over
                the line wherever they cross it instead of the line
                cutting across the glyphs — it reads as a background guide
                the text passes over, not as an underline-like decoration
                on top of it. It's a sibling of the scrollable panel,
                positioned against this shared "relative" parent so it
                stays put regardless of scroll position; pointer-events:
                none lets taps pass straight through to the
                text/selection above it. */}
            <div className="absolute left-0 right-0 pointer-events-none flex items-center gap-1 px-1" style={{ top: "50%", transform: "translateY(-50%)", zIndex: 0 }}>
              <span
                ref={percentLabelRef}
                className="text-[9px] font-medium shrink-0"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mustard, userSelect: "none" }}
              >
                0%
              </span>
              <div className="flex-1" style={{ borderTop: `1px dashed ${PALETTE.mustard}`, opacity: 0.2 }} />
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "3px solid transparent",
                  borderBottom: "3px solid transparent",
                  borderLeft: `5px solid ${PALETTE.mustard}`,
                  opacity: 0.7,
                  flexShrink: 0,
                }}
              />
            </div>
          </div>

          {/* Bottom control row: font size (-/+), text auto-scroll
              play/stop, scroll speed (-/+) — a single row, floating
              directly over the text with no shared backdrop; each button
              keeps its own individual raised circle. The current value for
              each pair sits inline between its own two buttons (not a
              separate row underneath, which only cost extra height) — the
              two buttons flanking play/stop butt right up against it with
              no gap, and the flex-1 label slots either side absorb
              whatever width that frees up, growing or shrinking with the
              screen instead of a fixed offset. */}
          <div className="w-full flex items-center gap-1 py-2 shrink-0">
            <button
              onClick={() => adjustFontLevel(-VIDEO_FONT_LEVEL_STEP)}
              aria-label={t("Уменьшить размер шрифта")}
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: "44px",
                height: "44px",
                background: PALETTE.card,
                color: PALETTE.ink,
                boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}`,
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: "0.7rem", fontWeight: 500 }}>A</span>
            </button>
            <span
              className="flex-1 text-center text-[10px] leading-none"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, userSelect: "none" }}
            >
              A{fontLevel}
            </span>
            <button
              onClick={() => adjustFontLevel(VIDEO_FONT_LEVEL_STEP)}
              aria-label={t("Увеличить размер шрифта")}
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: "44px",
                height: "44px",
                background: PALETTE.card,
                color: PALETTE.ink,
                boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}`,
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: "1.2rem", fontWeight: 500 }}>A</span>
            </button>
            <button
              onClick={toggleScrollPlaying}
              aria-label={scrollPlaying ? t("Остановить прокрутку текста") : t("Запустить прокрутку текста")}
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: "44px",
                height: "44px",
                background: PALETTE.mustard,
                color: PALETTE.bgDeep,
                boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}`,
                userSelect: "none",
              }}
            >
              {scrollPlaying ? <Pause size={17} strokeWidth={1.75} /> : <Play size={17} strokeWidth={1.75} style={{ marginLeft: "2px" }} />}
            </button>
            <button
              onClick={() => adjustSpeed(-VIDEO_SCROLL_SPEED_STEP)}
              aria-label={t("Уменьшить скорость прокрутки")}
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: "44px",
                height: "44px",
                background: PALETTE.card,
                color: PALETTE.ink,
                boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}`,
                userSelect: "none",
              }}
            >
              <Minus size={17} strokeWidth={1.5} />
            </button>
            <span
              className="flex-1 text-center text-[10px] leading-none"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, userSelect: "none" }}
            >
              ×{speed}
            </span>
            <button
              onClick={() => adjustSpeed(VIDEO_SCROLL_SPEED_STEP)}
              aria-label={t("Увеличить скорость прокрутки")}
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: "44px",
                height: "44px",
                background: PALETTE.card,
                color: PALETTE.ink,
                boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}`,
                userSelect: "none",
              }}
            >
              <Plus size={17} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ATOMS — a forest of independent orbital trees, one per atom the user has
// created. The dashboard (AtomsDashboard) lists every atom as a grid card,
// same layout as the Language/Focus dashboards; opening one enters its own
// tree (AtomTreeScreen), shown either as a compact orbit (a center with up
// to 9 small "electrons" circling it) or, one tap in, as a full-screen
// card with a title/description pair and a free-form stream of thoughts.
// Stored as an array under "atoms-v3" — one entry per root atom.
//
// Depth-based behavior: a node at depth 0 or 1 ("level 1"/"level 2") gets
// its 9 children auto-generated the moment it has content — a root gets
// them immediately on creation (see useAtomForest.createRoot), a deeper
// level-1/2 node gets them the moment it's later named (see
// AtomTreeScreen.handleCardSave). A node at depth 2 or deeper ("level 3+")
// never auto-populates; instead, an empty one shows the same creation
// tile a new atom shows on the dashboard, and a non-empty one shows its
// children plus a small "+" to add more, one at a time, without limit.
// ════════════════════════════════════════════════════════════════════════

// `shortTitle` is the compact 1-3 word label shown on the electron itself
// out on its parent's orbit; `title` is the full name, shown only once
// the node becomes the center of its own page. They're independent
// fields — the quick in-place naming flow (see AtomTreeScreen's
// namingElectronId) sets both to the same captured text at once, but
// either can end up set without the other (e.g. `title` alone, edited
// via the pencil in Card mode) — see ringLabel's shortTitle-then-title
// fallback wherever an electron's label is rendered.
function makeEmptyAtomNode() {
  return { id: uid(), title: "", shortTitle: "", description: "", thoughts: "", children: [] };
}

function updateAtomInForest(nodes, id, updater) {
  return nodes.map((n) => {
    if (n.id === id) return updater(n);
    if (n.children && n.children.length) return { ...n, children: updateAtomInForest(n.children, id, updater) };
    return n;
  });
}

function removeAtomNode(nodes, id) {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children && n.children.length ? { ...n, children: removeAtomNode(n.children, id) } : n));
}

// Walks a chain of ids from `root` down to the current center, returning
// [root, ..., center]. Stops early (falling back to whatever prefix still
// resolves) if a link no longer exists.
function resolveAtomChain(root, path) {
  const chain = [root];
  let node = root;
  for (const id of path) {
    const next = (node.children || []).find((c) => c.id === id);
    if (!next) break;
    chain.push(next);
    node = next;
  }
  return chain;
}

// A forest of independent atoms: `roots` is an array, one entry per atom
// the user has created (the Атомы dashboard shows one grid card per
// entry). Node ids are globally unique (uid()), so updateAtomInForest and
// removeAtomNode can search the whole forest without needing to know
// which specific root a node belongs to.
function useAtomForest() {
  const [roots, setRoots] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("atoms-v3", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setRoots(parsed);
      }
    } catch (e) {
      // nothing saved yet
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setRoots(next);
    try {
      await window.storage.set("atoms-v3", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  // Creates a new root atom, already carrying its 9 auto-generated
  // children — the captured thought is what commits it into existence, so
  // there's something orbital to land on right away, name still pending.
  // Appended to the end of the forest; the dashboard's create tile stays
  // last because it's rendered after this array, not from any ordering
  // logic here.
  const createRoot = useCallback(
    (thoughts) => {
      const node = {
        ...makeEmptyAtomNode(),
        thoughts,
        children: Array.from({ length: ATOM_CHILD_COUNT }, () => makeEmptyAtomNode()),
      };
      persist([...roots, node]);
      return node.id;
    },
    [roots, persist]
  );

  const updateNode = useCallback(
    (nodeId, updater) => {
      persist(updateAtomInForest(roots, nodeId, updater));
    },
    [roots, persist]
  );

  // Deleting a root atom removes it from the forest entirely; deleting any
  // deeper node just prunes it from whichever tree it's in.
  const deleteNode = useCallback(
    (nodeId) => {
      const isRoot = roots.some((r) => r.id === nodeId);
      persist(isRoot ? roots.filter((r) => r.id !== nodeId) : removeAtomNode(roots, nodeId));
    },
    [roots, persist]
  );

  return { roots, createRoot, updateNode, deleteNode, refresh };
}

// The round mic/keyboard input used to edit an already-created atom's
// title, description, or thoughts (opened from AtomCardScreen's pencil
// icons). Not part of the creation flow — see AtomCreateTile/
// AtomMicCapture/AtomKeyboardCapture below for that.
function VoiceOrKeyboardInput({ title, initialText = "", onSave, onCancel }) {
  const PALETTE = useTheme();
  const t = useT();
  const [phase, setPhase] = useState("choice"); // "choice" | "listening" | "edit"
  const [text, setText] = useState(initialText);
  const recognitionRef = useRef(null);
  const speechSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        // already stopped
      }
    };
  }, []);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setPhase("edit");
      return;
    }
    const rec = new SR();
    // Always Russian, regardless of the app's own UI language toggle — the
    // mic is for capturing thoughts in Russian, not for mirroring whatever
    // language the interface chrome happens to be showing.
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk + " ";
        else interim += chunk;
      }
      setText((finalText + interim).trim());
    };
    rec.onerror = () => setPhase("edit");
    rec.onend = () => setPhase((p) => (p === "listening" ? "edit" : p));
    recognitionRef.current = rec;
    setText("");
    setPhase("listening");
    try {
      rec.start();
    } catch (e) {
      setPhase("edit");
    }
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      // already stopped
    }
    setPhase("edit");
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}
      onClick={onCancel}
    >
      <div className="flex flex-col items-center gap-5" onClick={(e) => e.stopPropagation()}>
        {title && (
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#fff", fontSize: "0.9rem" }}>{title}</p>
        )}

        {phase === "choice" && (
          <div
            className="flex overflow-hidden"
            style={{
              width: "220px",
              height: "220px",
              borderRadius: "50%",
              boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}`,
              border: `1px solid ${PALETTE.cardEdge}`,
            }}
          >
            <button
              onClick={startListening}
              disabled={!speechSupported}
              className="flex-1 flex flex-col items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: PALETTE.chip, borderRight: `1px solid ${PALETTE.cardEdge}` }}
            >
              <Mic size={30} style={{ color: PALETTE.mustard }} />
              <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.75rem", color: PALETTE.fadeText }}>
                {t("Микрофон")}
              </span>
            </button>
            <button
              onClick={() => setPhase("edit")}
              className="flex-1 flex flex-col items-center justify-center gap-2"
              style={{ background: PALETTE.chip }}
            >
              <Keyboard size={30} style={{ color: PALETTE.mustard }} />
              <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.75rem", color: PALETTE.fadeText }}>
                {t("Клавиатура")}
              </span>
            </button>
          </div>
        )}

        {phase === "listening" && (
          <>
            <button
              onClick={stopListening}
              aria-label={t("Остановить запись")}
              className="flex flex-col items-center justify-center gap-2"
              style={{
                width: "220px",
                height: "220px",
                borderRadius: "50%",
                background: PALETTE.chip,
                boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}`,
                border: `1px solid ${PALETTE.danger}`,
                animation: "atomPulse 1.4s ease-in-out infinite",
              }}
            >
              <Mic size={34} style={{ color: PALETTE.danger }} />
              <span
                className="text-center px-6"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem", color: PALETTE.fadeText }}
              >
                {t("Говори — я слушаю…")}
              </span>
            </button>
            {text && (
              <p className="max-w-xs text-center" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#fff", fontSize: "0.85rem" }}>
                {text}
              </p>
            )}
          </>
        )}

        {phase === "edit" && (
          <div className="w-full max-w-xs flex flex-col gap-3">
            {!speechSupported && (
              <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.waiting, fontSize: "0.7rem", textAlign: "center" }}>
                {t("Голосовой ввод не поддерживается этим браузером")}
              </p>
            )}
            <textarea
              autoFocus
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-2xl p-4 outline-none"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                background: PALETTE.card,
                color: PALETTE.ink,
                border: `1px solid ${PALETTE.cardEdge}`,
                boxShadow: `inset 2px 2px 5px ${PALETTE.shadowDark}, inset -2px -2px 5px ${PALETTE.shadowLight}`,
              }}
            />
            <div className="flex items-center gap-3 justify-center">
              <button
                onClick={onCancel}
                className="px-5 py-2 rounded-full"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.chip, color: PALETTE.fadeText }}
              >
                {t("Отмена")}
              </button>
              <button
                onClick={() => text.trim() && onSave(text.trim())}
                disabled={!text.trim()}
                className="px-5 py-2 rounded-full disabled:opacity-40"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.mustard, color: PALETTE.bgDeep }}
              >
                {t("Сохранить")}
              </button>
            </div>
          </div>
        )}

        {phase === "choice" && (
          <button onClick={onCancel} style={{ color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.8rem" }}>
            {t("Отмена")}
          </button>
        )}
      </div>
    </div>
  );
}

// Step 1 of atom creation: a passive tile — tapping either half activates
// the corresponding capture screen. Deliberately built on the same circle
// VoiceOrKeyboardInput's own "choice" phase already uses (divider, shadow,
// and label treatment) rather than a new design. Just the circle itself —
// AtomCreateFlow wraps it to fit either a dashboard grid cell or the full
// inline area inside an atom's own tree, since those need different sizing.
function AtomCreateTile({ onMic, onKeyboard, size = 160 }) {
  const PALETTE = useTheme();
  const t = useT();
  const iconSize = Math.round(size * 0.14);
  return (
    <div
      className="flex overflow-hidden"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}`,
        border: `1px solid ${PALETTE.cardEdge}`,
      }}
    >
      <button
        onClick={onMic}
        className="flex-1 flex flex-col items-center justify-center gap-1.5"
        style={{ background: PALETTE.chip, borderRight: `1px solid ${PALETTE.cardEdge}`, color: PALETTE.mustard }}
      >
        <Mic size={iconSize} />
        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.65rem", color: PALETTE.fadeText }}>{t("Микрофон")}</span>
      </button>
      <button
        onClick={onKeyboard}
        className="flex-1 flex flex-col items-center justify-center gap-1.5"
        style={{ background: PALETTE.chip, color: PALETTE.mustard }}
      >
        <Keyboard size={iconSize} />
        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.65rem", color: PALETTE.fadeText }}>{t("Клавиатура")}</span>
      </button>
    </div>
  );
}

// Step 2: mic capture. A dedicated full screen — fixed, so it covers
// whatever it's embedded in (even the top-level dashboard chrome) — but
// with a plain matching background rather than a dimmed backdrop, so it
// never reads as a modal. Split into four equal horizontal quarters: the
// top three are one big editable field the live transcript streams into,
// the bottom one holds the compact pulsing mic, a muted keyboard toggle,
// and Save/Cancel. Recording starts the instant this mounts, no extra
// tap, and the field is never programmatically focused — the OS keyboard
// only appears if the keyboard toggle is tapped explicitly.
function AtomMicCapture({ text, setText, onSave, onCancel, onSwitchToKeyboard }) {
  const PALETTE = useTheme();
  const t = useT();
  const [recognizing, setRecognizing] = useState(false);
  const recognitionRef = useRef(null);
  const startedRef = useRef(false);
  const speechSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    // Always Russian, regardless of the app's own UI language toggle — the
    // mic is for capturing thoughts in Russian, not for mirroring whatever
    // language the interface chrome happens to be showing.
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk + " ";
        else interim += chunk;
      }
      setText((finalText + interim).trim());
    };
    rec.onerror = () => setRecognizing(false);
    rec.onend = () => setRecognizing(false);
    recognitionRef.current = rec;
    setRecognizing(true);
    try {
      rec.start();
    } catch (e) {
      setRecognizing(false);
    }
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      // already stopped
    }
    setRecognizing(false);
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startListening();
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        // already stopped
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    if (recognizing) stopListening();
    else startListening();
  };

  const handleSwitchToKeyboard = () => {
    stopListening();
    onSwitchToKeyboard();
  };

  const handleCancel = () => {
    stopListening();
    onCancel();
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: PALETTE.bg, zIndex: 50 }}>
      <div className="flex-[3] min-h-0 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Говори — я слушаю…")}
          className="w-full h-full rounded-2xl p-4 outline-none resize-none"
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            background: PALETTE.card,
            color: PALETTE.ink,
            border: `1px solid ${PALETTE.cardEdge}`,
            boxShadow: `inset 2px 2px 5px ${PALETTE.shadowDark}, inset -2px -2px 5px ${PALETTE.shadowLight}`,
          }}
        />
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-4 pb-6">
        {!speechSupported && (
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.waiting, fontSize: "0.7rem", textAlign: "center" }}>
            {t("Голосовой ввод не поддерживается этим браузером")}
          </p>
        )}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMic}
            aria-label={recognizing ? t("Остановить запись") : t("Микрофон")}
            className="rounded-full flex items-center justify-center shrink-0"
            style={{
              width: "64px",
              height: "64px",
              background: PALETTE.chip,
              color: recognizing ? PALETTE.danger : PALETTE.mustard,
              boxShadow: `4px 4px 10px ${PALETTE.shadowDark}, -4px -4px 10px ${PALETTE.shadowLight}`,
              border: `1px solid ${recognizing ? PALETTE.danger : PALETTE.cardEdge}`,
              animation: recognizing ? "atomPulse 1.4s ease-in-out infinite" : "none",
            }}
          >
            <Mic size={26} />
          </button>
          <button
            onClick={handleSwitchToKeyboard}
            aria-label={t("Клавиатура")}
            className="rounded-full flex items-center justify-center shrink-0"
            style={{
              width: "40px",
              height: "40px",
              background: PALETTE.chip,
              color: PALETTE.fadeText,
              boxShadow: `2px 2px 5px ${PALETTE.shadowDark}, -2px -2px 5px ${PALETTE.shadowLight}`,
              border: `1px solid ${PALETTE.cardEdge}`,
            }}
          >
            <Keyboard size={16} />
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-full shrink-0"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.chip, color: PALETTE.fadeText }}
          >
            {t("Отмена")}
          </button>
          <button
            onClick={() => text.trim() && onSave(text.trim())}
            disabled={!text.trim()}
            className="px-4 py-2 rounded-full disabled:opacity-40 shrink-0"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.mustard, color: PALETTE.bgDeep }}
          >
            {t("Сохранить")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Step 3: keyboard capture — its own dedicated full screen too, but no mic
// step at all: the field is focused immediately (cursor at the end, so a
// mid-recording switch from Step 2 picks up right where dictation left
// off) and the system keyboard follows naturally from that focus.
// Tracks window.visualViewport's height so a fixed-position panel can
// shrink to match it — the layout viewport (and therefore plain
// `fixed inset-0` / 100vh sizing) doesn't shrink when the on-screen
// keyboard opens on mobile, which is exactly what pushes bottom-anchored
// content like Save/Cancel behind the keyboard. Falls back to
// window.innerHeight when the API isn't available.
function useVisualViewportHeight() {
  const [height, setHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 0));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setHeight(vv.height);
    onResize();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return height;
}

function AtomKeyboardCapture({ text, setText, onSave, onCancel }) {
  const PALETTE = useTheme();
  const t = useT();
  const textareaRef = useRef(null);
  const viewportHeight = useVisualViewportHeight();

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 flex flex-col" style={{ background: PALETTE.bg, zIndex: 50, height: `${viewportHeight}px` }}>
      <div className="flex-1 min-h-0 p-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-full rounded-2xl p-4 outline-none resize-none"
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            background: PALETTE.card,
            color: PALETTE.ink,
            border: `1px solid ${PALETTE.cardEdge}`,
            boxShadow: `inset 2px 2px 5px ${PALETTE.shadowDark}, inset -2px -2px 5px ${PALETTE.shadowLight}`,
          }}
        />
      </div>
      <div className="shrink-0 flex items-center justify-center gap-3 px-4 pb-6">
        <button onClick={onCancel} className="px-5 py-2 rounded-full" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.chip, color: PALETTE.fadeText }}>
          {t("Отмена")}
        </button>
        <button
          onClick={() => text.trim() && onSave(text.trim())}
          disabled={!text.trim()}
          className="px-5 py-2 rounded-full disabled:opacity-40"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.mustard, color: PALETTE.bgDeep }}
        >
          {t("Сохранить")}
        </button>
      </div>
    </div>
  );
}

// Orchestrates Steps 1-4: starts on the passive tile, escalates to mic or
// keyboard capture on tap, and always hands the result to `onSave` —
// never title/description, always the new atom's thought stream. The
// caller decides what "the new atom" means: the tree's root, or a manual
// child under the current center.
// variant "inline" (default) centers the passive tile in a full flex
// column — used inside an atom's own tree (the level 2+ bootstrap tile,
// and the manual "+" flow). variant "grid" instead sizes it to sit as one
// cell of the Атомы dashboard's 2-column card grid, always in the last
// slot. Either way, once Mic or Keyboard is tapped the same full-screen
// capture takes over regardless of where it was triggered from.
function AtomCreateFlow({ onSave, variant = "inline" }) {
  const [phase, setPhase] = useState("tile"); // "tile" | "mic" | "keyboard"
  const [text, setText] = useState("");

  if (phase === "mic") {
    return (
      <AtomMicCapture
        text={text}
        setText={setText}
        onSave={onSave}
        onCancel={() => setPhase("tile")}
        onSwitchToKeyboard={() => setPhase("keyboard")}
      />
    );
  }
  if (phase === "keyboard") {
    return <AtomKeyboardCapture text={text} setText={setText} onSave={onSave} onCancel={() => setPhase("tile")} />;
  }
  const tile = <AtomCreateTile onMic={() => setPhase("mic")} onKeyboard={() => setPhase("keyboard")} size={variant === "grid" ? 132 : 160} />;
  if (variant === "grid") {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: "182px" }}>
        {tile}
      </div>
    );
  }
  return <div className="flex-1 flex flex-col items-center justify-center px-6">{tile}</div>;
}

// Full-screen "Card" mode for one atom: a title/description pair (compact
// zone) and a free-form stream of thoughts below — every field edited the
// same way, via its own pencil opening VoiceOrKeyboardInput pre-filled
// with whatever's already there.
function AtomCardScreen({ node, onBack, onSave, onDelete, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const t = useT();
  const [voiceField, setVoiceField] = useState(null); // "title" | "description" | "thoughts" | null
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleVoiceSave = (value) => {
    onSave({ [voiceField]: value });
    setVoiceField(null);
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8 pb-2 flex items-center justify-between shrink-0">
        <button onClick={onBack} aria-label={t("Назад")} className="flex items-center gap-1 text-sm shrink-0" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          <ArrowLeft size={16} />
        </button>
        <h2 className="truncate px-2 text-center flex-1" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.05rem" }}>
          {node.title || t("Дай мне имя")}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  onDelete();
                  setConfirmDelete(false);
                }}
                className="text-xs px-2 py-1 rounded-full"
                style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {t("Да")}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-1 rounded-full"
                style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {t("Отмена")}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} aria-label={t("Удалить атом")} className="p-1" style={{ color: PALETTE.fadeText }}>
              <Trash2 size={15} />
            </button>
          )}
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </div>

      {/* Compact zone — short title and longer description, each with its
          own pencil. */}
      <div className="max-w-md mx-auto w-full px-6 pb-3 shrink-0" style={{ borderBottom: `1px solid ${PALETTE.cardEdge}` }}>
        <div className="flex items-center justify-between gap-3 py-2">
          <p className="truncate flex-1" style={{ fontFamily: "'Fraunces', serif", color: PALETTE.ink, fontSize: "1.1rem" }}>
            {node.title || t("Дай мне имя")}
          </p>
          <button
            onClick={() => setVoiceField("title")}
            aria-label={t("Редактировать название")}
            className="rounded-full flex items-center justify-center shrink-0"
            style={{ width: "30px", height: "30px", background: PALETTE.chip, color: PALETTE.ink, boxShadow: `2px 2px 5px ${PALETTE.shadowDark}, -2px -2px 5px ${PALETTE.shadowLight}` }}
          >
            <Pencil size={13} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <p className="line-clamp-2 flex-1" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.85rem" }}>
            {node.description || t("Нет описания")}
          </p>
          <button
            onClick={() => setVoiceField("description")}
            aria-label={t("Редактировать описание")}
            className="rounded-full flex items-center justify-center shrink-0"
            style={{ width: "30px", height: "30px", background: PALETTE.chip, color: PALETTE.ink, boxShadow: `2px 2px 5px ${PALETTE.shadowDark}, -2px -2px 5px ${PALETTE.shadowLight}` }}
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>

      {/* Bottom zone — the raw stream of thoughts, same pencil-edit
          treatment as the fields above (no floating "+"). */}
      <div className="max-w-md mx-auto w-full px-6 pt-3 pb-1 flex items-center justify-between shrink-0">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {t("Поток мыслей")}
        </p>
        <button
          onClick={() => setVoiceField("thoughts")}
          aria-label={t("Редактировать поток мыслей")}
          className="rounded-full flex items-center justify-center shrink-0"
          style={{ width: "30px", height: "30px", background: PALETTE.chip, color: PALETTE.ink, boxShadow: `2px 2px 5px ${PALETTE.shadowDark}, -2px -2px 5px ${PALETTE.shadowLight}` }}
        >
          <Pencil size={13} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto max-w-md mx-auto w-full px-6 pb-8">
        <p className="whitespace-pre-wrap" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.ink, fontSize: "0.95rem", lineHeight: 1.8 }}>
          {node.thoughts || t("Поток мыслей пуст")}
        </p>
      </div>

      {voiceField && (
        <VoiceOrKeyboardInput
          title={voiceField === "title" ? t("Название") : voiceField === "description" ? t("Описание") : t("Поток мыслей")}
          initialText={node[voiceField]}
          onSave={handleVoiceSave}
          onCancel={() => setVoiceField(null)}
        />
      )}
    </div>
  );
}

const ATOM_CHILD_COUNT = 9;
// Depths 0 and 1 (a tree's root, and the root's own children) auto-populate
// their 9 electrons; depth 2 and beyond never auto-populates.
const ATOM_AUTO_MAX_DEPTH = 1;
const ATOM_CENTER_SIZE = 128;
const ATOM_ELECTRON_SIZE = 46;
const ATOM_RING_RADIUS = 118;
// An expanded (tap-1) electron moves out to this radius while at full
// center-sized diameter, so it doesn't overlap the real center.
const ATOM_EXPANDED_RADIUS = 168;
// The whole composition (center + ring) auto-fits to this fraction of the
// container width by default; the user can then pinch or use +/- to go
// anywhere within [MIN, MAX] freely from that starting point.
const ATOM_FILL_RATIO = 0.92;
const ATOM_MIN_SCALE = 0.6;
const ATOM_MAX_SCALE = 2.4;
const ATOM_SCALE_STEP = 0.15;

// One atom's own tree: the orbital (electron ring) navigation plus its
// Card mode, scoped to a single root out of the Атомы forest — reached
// only after opening a specific atom from the dashboard grid, so `root`
// is always a real node here (never null). Always shows the compact
// back-arrow header, matching how every other section's deep views
// behave; the tagline/toggles/ModeSwitch dashboard chrome lives one
// level up, in AtomsDashboard, not here. At depth 0 the back arrow reads
// "Home" and exits to the dashboard via onHome, mirroring the same
// "Home" convention every other section uses to leave a detail view for
// its list; at depth >= 1 it reads "Назад" and just pops one level up
// the tree. Manages its own `path` (ids from the root down to the
// current center); entering a child just pushes onto `path` and
// re-renders.
function AtomTreeScreen({ root, onUpdateNode, onDeleteNode, onHome, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const t = useT();
  const [path, setPath] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [cardMode, setCardMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [manualScale, setManualScale] = useState(null);
  const [fitScale, setFitScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const ringRef = useRef(null);
  const dragRef = useRef({ cx: 0, cy: 0, startAngle: 0, startRotation: 0 });
  const [dragging, setDragging] = useState(false);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 });
  // Quick in-place naming of a still-unnamed electron: tapping one opens
  // the same Mic/Keyboard choice tile right at its ring position
  // ("tile"), which can escalate to the same full-screen mic/keyboard
  // capture used everywhere else ("mic"/"keyboard"). Only "tile" needs
  // the outside-tap-dismiss behavior below — once escalated, the capture
  // screen covers everything and its own Cancel already returns to "tile".
  const [namingElectronId, setNamingElectronId] = useState(null);
  const [namingPhase, setNamingPhase] = useState("tile");
  const [namingText, setNamingText] = useState("");
  const namingTileRef = useRef(null);

  const chain = resolveAtomChain(root, path);
  const center = chain[chain.length - 1] || null;
  const depth = chain.length - 1;
  const scale = manualScale ?? fitScale;

  const showAutoRing = !!center && depth <= ATOM_AUTO_MAX_DEPTH && (center.children || []).length > 0;
  const showManualRing = !!center && depth > ATOM_AUTO_MAX_DEPTH && (center.children || []).length > 0;
  const needsBootstrapTile = !!center && depth > ATOM_AUTO_MAX_DEPTH && (center.children || []).length === 0;
  const showCreateFlow = creating || needsBootstrapTile;
  const ringItems = showAutoRing ? center.children : showManualRing ? [...(center.children || []), { id: "__add__", isAdd: true }] : [];

  // Auto-fit the whole composition to the container width by default, so
  // it reaches almost edge-to-edge; the user's own pinch/button zoom
  // overrides this. Re-runs on cardMode/showCreateFlow too, since the ring
  // container unmounts while either is showing — a separate lifecycle
  // from ringItems.length changing — so without it a re-fit on return
  // would never fire.
  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;
    const compute = () => {
      const width = el.clientWidth;
      if (!width) return;
      setContainerWidth(width);
      const targetDiameter = ringItems.length > 0 ? 2 * ATOM_RING_RADIUS + ATOM_ELECTRON_SIZE : ATOM_CENTER_SIZE;
      const next = Math.min(ATOM_MAX_SCALE, Math.max(1, (width * ATOM_FILL_RATIO) / targetDiameter));
      setFitScale(next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ringItems.length, cardMode, showCreateFlow]);

  const resetLocalNav = () => {
    setExpandedId(null);
    setCardMode(false);
    setRotation(0);
    setManualScale(null);
    setNamingElectronId(null);
    setNamingPhase("tile");
    setNamingText("");
  };

  const handleBack = () => {
    if (cardMode) {
      setCardMode(false);
      return;
    }
    if (creating) {
      setCreating(false);
      return;
    }
    if (path.length === 0) {
      onHome();
      return;
    }
    setPath((p) => p.slice(0, -1));
    resetLocalNav();
  };

  const enter = (id) => {
    setPath((p) => [...p, id]);
    resetLocalNav();
  };

  // A still-unnamed electron (no shortTitle and no title) skips the usual
  // tap-to-expand/tap-to-enter gesture entirely: one tap opens the naming
  // flow right at its ring position. A named electron keeps the existing
  // two-tap behavior (expand for a preview, tap again to enter).
  const handleElectronTap = (electron) => {
    if (!electron.shortTitle && !electron.title) {
      setExpandedId(electron.id);
      setNamingElectronId(electron.id);
      setNamingPhase("tile");
      setNamingText("");
      return;
    }
    if (expandedId === electron.id) {
      enter(electron.id);
    } else {
      setExpandedId(electron.id);
    }
  };

  const cancelNaming = () => {
    setNamingElectronId(null);
    setNamingPhase("tile");
    setNamingText("");
    setExpandedId(null);
  };

  // Dismisses the in-place naming tile on any interaction outside it —
  // tapping elsewhere, starting a ring rotation/pinch drag, or using the
  // header/zoom controls all count, matching Cancel: nothing gets saved.
  // Only active during the "tile" (choice-circle) phase; once escalated
  // to the full-screen mic/keyboard capture there's nothing "outside" to
  // tap, and its own Cancel button already returns here to "tile".
  useEffect(() => {
    if (!namingElectronId || namingPhase !== "tile") return;
    const onOutsidePointerDown = (e) => {
      if (namingTileRef.current && namingTileRef.current.contains(e.target)) return;
      cancelNaming();
    };
    window.addEventListener("pointerdown", onOutsidePointerDown, true);
    return () => window.removeEventListener("pointerdown", onOutsidePointerDown, true);
  }, [namingElectronId, namingPhase]);

  const handleCardSave = (patch) => {
    onUpdateNode(center.id, (n) => {
      const updated = { ...n, ...patch };
      if ("title" in patch && depth <= ATOM_AUTO_MAX_DEPTH && updated.title.trim() && (n.children || []).length === 0) {
        updated.children = Array.from({ length: ATOM_CHILD_COUNT }, () => makeEmptyAtomNode());
      }
      return updated;
    });
  };

  // Names a still-unnamed electron in place: the captured text becomes
  // both its short (orbit) and full (own-page) name at once. Auto-9
  // generation is keyed on the ELECTRON's own depth (one deeper than the
  // currently centered parent), matching the same depth <=
  // ATOM_AUTO_MAX_DEPTH rule handleCardSave already uses when a node is
  // named from inside its own Card mode.
  const handleNameElectronSave = (capturedText) => {
    onUpdateNode(namingElectronId, (n) => {
      const updated = { ...n, title: capturedText, shortTitle: capturedText };
      if (depth + 1 <= ATOM_AUTO_MAX_DEPTH && (n.children || []).length === 0) {
        updated.children = Array.from({ length: ATOM_CHILD_COUNT }, () => makeEmptyAtomNode());
      }
      return updated;
    });
    setNamingElectronId(null);
    setNamingPhase("tile");
    setNamingText("");
    setExpandedId(null);
  };

  // Captured text always lands in the thought stream, never title or
  // description — the node is only created now, once there's something
  // to put in it. Lands on its own orbital view (Atom mode), not Card
  // mode: at depth <= 1 it already has its 9 auto-generated electrons to
  // show; deeper, it's simply an empty level-3+ node like any other.
  const handleCreateSave = (thoughts) => {
    const newNode = { ...makeEmptyAtomNode(), thoughts };
    onUpdateNode(center.id, (n) => ({ ...n, children: [...(n.children || []), newNode] }));
    setPath((p) => [...p, newNode.id]);
    setExpandedId(null);
    setRotation(0);
    setCreating(false);
  };

  // Deletes/clears the currently centered atom — behavior depends on its
  // own depth:
  // - depth 0 (a whole atom's root) has no "slot" to return to — it's
  //   removed from the forest entirely, same as always, and we exit to
  //   the dashboard.
  // - depth 1 and depth 2 occupy a fixed 9-position auto-ring generated
  //   once their parent was named (see ATOM_AUTO_MAX_DEPTH) — deleting
  //   here must not shrink that grid, so instead of removing the node we
  //   reset it back to a blank, unnamed slot (wiping title, shortTitle,
  //   description, thoughts, and pruning every descendant), leaving its
  //   position on the parent's orbit in place and empty.
  // - depth 3+ live in a manually-grown list (the "+" tile adds one at a
  //   time, unlimited, no fixed grid) — deleting here is a real removal,
  //   same as it's always been.
  // Either way (depth >= 1) we step back up to the parent's orbit view
  // afterward, so the (now empty or now-shorter) result is visible.
  const handleDeleteNode = () => {
    if (depth === 0) {
      onDeleteNode(center.id);
      onHome();
      return;
    }
    if (depth <= ATOM_AUTO_MAX_DEPTH + 1) {
      onUpdateNode(center.id, (n) => ({ ...makeEmptyAtomNode(), id: n.id }));
    } else {
      onDeleteNode(center.id);
    }
    setPath((p) => p.slice(0, -1));
    resetLocalNav();
  };

  // Unified pointer handling: a single pointer rotates the ring; a second
  // pointer touching down switches to pinch-to-zoom. Tracking is done via
  // window-level listeners (not pointer capture) so a tap that lands on a
  // button inside the ring — center, an electron, the "+" tile — still
  // gets its normal click.
  const handlePointerDown = (e) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = { active: true, startDist: Math.hypot(p1.x - p2.x, p1.y - p2.y), startScale: scale };
    } else if (pointersRef.current.size === 1 && ringItems.length > 0) {
      const rect = ringRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
        dragRef.current = { cx, cy, startAngle, startRotation: rotation };
      }
    }
    setDragging(true);
  };

  const zoomBy = (delta) => {
    setManualScale(Math.min(ATOM_MAX_SCALE, Math.max(ATOM_MIN_SCALE, scale + delta)));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current.active && pointersRef.current.size === 2) {
        const [p1, p2] = [...pointersRef.current.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (pinchRef.current.startDist > 0) {
          const next = Math.min(ATOM_MAX_SCALE, Math.max(ATOM_MIN_SCALE, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
          setManualScale(next);
        }
      } else if (!pinchRef.current.active && pointersRef.current.size === 1) {
        const { cx, cy, startAngle, startRotation } = dragRef.current;
        const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
        setRotation(startRotation + (angle - startAngle));
      }
    };
    const onUp = (e) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current.active = false;
      if (pointersRef.current.size === 0) setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  if (cardMode && center) {
    return (
      <AtomCardScreen node={center} onBack={handleBack} onSave={handleCardSave} onDelete={handleDeleteNode} isDark={isDark} onToggleTheme={onToggleTheme} />
    );
  }

  // The naming flow's mic/keyboard phases reuse the same full-screen
  // capture components as everywhere else in Атомы — same component,
  // just wired to name this specific electron instead of creating a new
  // node or editing the centered one.
  if (namingElectronId && namingPhase === "mic") {
    return (
      <AtomMicCapture
        text={namingText}
        setText={setNamingText}
        onSave={handleNameElectronSave}
        onCancel={() => setNamingPhase("tile")}
        onSwitchToKeyboard={() => setNamingPhase("keyboard")}
      />
    );
  }
  if (namingElectronId && namingPhase === "keyboard") {
    return <AtomKeyboardCapture text={namingText} setText={setNamingText} onSave={handleNameElectronSave} onCancel={() => setNamingPhase("tile")} />;
  }

  const centerSize = ATOM_CENTER_SIZE * scale;
  const electronSize = ATOM_ELECTRON_SIZE * scale;
  const ringRadius = ATOM_RING_RADIUS * scale;
  // At the default auto-fit scale the resting ring already reaches near
  // the container's edges, so growing an expanded electron by the full
  // (unclamped) expanded radius could push it half off-screen. Clamp it
  // to whatever room the container actually has for the electron's full
  // (center-sized) width.
  const availableHalfWidth = containerWidth > 0 ? containerWidth / 2 - 8 : (ATOM_EXPANDED_RADIUS + ATOM_CENTER_SIZE / 2) * scale;
  const maxExpandedRadius = Math.max(0, availableHalfWidth - centerSize / 2);
  const expandedRadius = Math.min(ATOM_EXPANDED_RADIUS * scale, maxExpandedRadius);

  return (
    <div className="h-screen flex flex-col" style={{ background: PALETTE.bg }}>
      {depth === 0 && <HomeButton onClick={handleBack} />}
      <div className="max-w-md mx-auto w-full px-6 pt-8 pb-2 flex items-center justify-between shrink-0">
        {depth === 0 ? (
          <div className="shrink-0" style={{ width: "16px" }} />
        ) : (
          <button
            onClick={handleBack}
            aria-label={t("Назад")}
            className="flex items-center gap-1 text-sm shrink-0"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <button
          onClick={() => setCardMode(true)}
          className="truncate px-2 text-center flex-1"
          style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.05rem" }}
        >
          {center?.title || t("Дай мне имя")}
        </button>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>

      {showCreateFlow ? (
        <AtomCreateFlow key={center ? center.id : "root"} onSave={handleCreateSave} />
      ) : (
        <div ref={ringRef} className="flex-1 relative" onPointerDown={handlePointerDown} style={{ touchAction: "none" }}>
          <button
            onClick={() => setCardMode(true)}
            className="absolute rounded-full flex items-center justify-center px-3"
            style={{
              width: `${centerSize}px`,
              height: `${centerSize}px`,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: PALETTE.card,
              color: PALETTE.ink,
              border: `1px solid ${PALETTE.cardEdge}`,
              boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
            }}
          >
            <span className="line-clamp-3 text-center" style={{ fontFamily: "'Fraunces', serif", fontSize: "1rem" }}>
              {center?.title || t("Дай мне имя")}
            </span>
          </button>

          {ringItems.map((item, i) => {
            const angle = (360 / ringItems.length) * i + rotation;
            const rad = (angle * Math.PI) / 180;

            if (item.isAdd) {
              return (
                <button
                  key="__add__"
                  onClick={() => setCreating(true)}
                  aria-label={t("Добавить дочерний элемент")}
                  className="absolute rounded-full flex items-center justify-center"
                  style={{
                    width: `${electronSize}px`,
                    height: `${electronSize}px`,
                    top: "50%",
                    left: "50%",
                    transform: `translate(-50%, -50%) translate(${ringRadius * Math.cos(rad)}px, ${ringRadius * Math.sin(rad)}px)`,
                    background: PALETTE.chip,
                    color: PALETTE.mustard,
                    border: `1px solid ${PALETTE.cardEdge}`,
                    boxShadow: `2px 2px 6px ${PALETTE.shadowDark}, -2px -2px 6px ${PALETTE.shadowLight}`,
                  }}
                >
                  <Plus size={Math.max(14, Math.round(electronSize * 0.32))} />
                </button>
              );
            }

            const isExpanded = expandedId === item.id;
            const radius = isExpanded ? expandedRadius : ringRadius;
            const size = isExpanded ? centerSize : electronSize;
            const x = radius * Math.cos(rad);
            const y = radius * Math.sin(rad);

            // Naming this electron in place: the choice tile takes over
            // its ring slot (same position/size an expanded electron
            // would occupy) instead of an empty enlarged circle.
            if (namingElectronId === item.id && namingPhase === "tile") {
              return (
                <div
                  key={item.id}
                  ref={namingTileRef}
                  className="absolute rounded-full overflow-hidden"
                  style={{
                    top: "50%",
                    left: "50%",
                    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                    zIndex: 5,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <AtomCreateTile onMic={() => setNamingPhase("mic")} onKeyboard={() => setNamingPhase("keyboard")} size={size} />
                </div>
              );
            }

            // The short (orbit) name is shown here at every ring size —
            // resting or expanded-for-preview — falling back to the full
            // title if no separate short name was ever set (e.g. a node
            // named via the Card-mode pencil, which only sets `title`).
            // The full title only shows once you've actually entered the
            // node and it's the page's own center (see the center button
            // and AtomCardScreen below).
            const ringLabel = item.shortTitle || item.title;

            return (
              <button
                key={item.id}
                onClick={() => handleElectronTap(item)}
                className="absolute rounded-full flex items-center justify-center px-2"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  top: "50%",
                  left: "50%",
                  transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                  background: PALETTE.card,
                  color: PALETTE.ink,
                  border: `1px solid ${PALETTE.cardEdge}`,
                  boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}`,
                  transition: "width 0.2s, height 0.2s, transform 0.2s",
                  zIndex: isExpanded ? 5 : 1,
                }}
              >
                {ringLabel && (
                  <span className="line-clamp-3 text-center" style={{ fontFamily: "'Fraunces', serif", fontSize: isExpanded ? "0.85rem" : "0.6rem" }}>
                    {ringLabel}
                  </span>
                )}
              </button>
            );
          })}

          <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20" onPointerDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => zoomBy(ATOM_SCALE_STEP)}
              aria-label={t("Увеличить масштаб")}
              className="rounded-full flex items-center justify-center"
              style={{ width: "36px", height: "36px", background: PALETTE.chip, color: PALETTE.ink, boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}` }}
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => zoomBy(-ATOM_SCALE_STEP)}
              aria-label={t("Уменьшить масштаб")}
              className="rounded-full flex items-center justify-center"
              style={{ width: "36px", height: "36px", background: PALETTE.chip, color: PALETTE.ink, boxShadow: `3px 3px 7px ${PALETTE.shadowDark}, -3px -3px 7px ${PALETTE.shadowLight}` }}
            >
              <Minus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The Атомы dashboard: a 2-column card grid, laid out exactly like the
// Language/Focus dashboards (same card shape, shadows, and icon-badge
// treatment) — one card per atom the user has created. The creation tile
// (Steps 1-4's Mic/Keyboard circle) always sits in the grid's last slot:
// the only tile when there are no atoms yet, or trailing the most
// recently created one otherwise. Rendered through the same shared
// tagline/toggles/ModeSwitch wrapper every other section's dashboard
// uses (see App()'s dashboard-body dispatch), not a bespoke header.
function AtomsDashboard({ roots, onOpen, onCreateRoot }) {
  const PALETTE = useTheme();
  const t = useT();

  const handleCreateSave = (thoughts) => {
    onOpen(onCreateRoot(thoughts));
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 w-full max-w-lg pt-8">
        {roots.map((root) => (
          <button
            key={root.id}
            onClick={() => onOpen(root.id)}
            className="relative rounded-[28px] pt-10 pb-6 px-4 flex flex-col items-center transition-transform hover:-translate-y-1"
            style={{
              height: "182px",
              background: PALETTE.card,
              boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
              border: `1px solid ${PALETTE.cardEdge}`,
            }}
          >
            <span
              className="absolute -top-7 w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: PALETTE.card,
                boxShadow: `5px 5px 10px ${PALETTE.shadowDark}, -5px -5px 10px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
                border: `1px solid ${PALETTE.cardEdge}`,
              }}
            >
              <Atom size={22} strokeWidth={1.8} style={{ color: PALETTE.mustard }} />
            </span>
            <TileName>{root.title || t("Дай мне имя")}</TileName>
            <div className="flex-1" />
            <span className="line-clamp-2 text-center" style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem", color: PALETTE.fadeText }}>
              {root.thoughts || t("Поток мыслей пуст")}
            </span>
          </button>
        ))}
        <AtomCreateFlow key="dashboard-create" onSave={handleCreateSave} variant="grid" />
      </div>
      <p className="text-[10px] mt-6 opacity-60" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.waiting }}>
        build {__BUILD_SHA__}
      </p>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SPECS — a fast scratch notebook: no title screen, no confirmations, just
// tap "+" and start typing. The first line of the body becomes the title
// automatically; a numbered fallback covers a blank/titleless entry.
// ════════════════════════════════════════════════════════════════════════

function deriveSpecTitle(body, existingTitles) {
  const firstLine = (body || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine) {
    return firstLine.length > 60 ? `${firstLine.slice(0, 60).trimEnd()}…` : firstLine;
  }
  let maxN = 0;
  for (const t of existingTitles) {
    const m = /^Спецификация №(\d+)$/.exec(t);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `Спецификация №${maxN + 1}`;
}

// Opening an existing entry uses the app's standard edit pattern instead —
// explicit Save/Cancel, no FAB — since the two-tap speed path above is
// specifically about capturing something new as fast as possible.
// Read-only: opening a spec is for reading and text-selecting (for the
// global SelectionCapture → "Добавить в Vocabulary" flow), never editing —
// plain scrollable text, no input/textarea, so no cursor or keyboard ever
// appears.
function SpecViewScreen({ spec, onBack }) {
  const PALETTE = useTheme();
  const t = useT();

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: PALETTE.bg }}>
      <HomeButton onClick={onBack} />
      <div className="max-w-md mx-auto w-full px-6 pt-16 pb-10 flex-1 min-h-0 flex flex-col">
        <div
          className="flex-1 w-full rounded-xl p-4 overflow-y-auto whitespace-pre-wrap"
          style={{
            background: PALETTE.card,
            color: PALETTE.ink,
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: "0.95rem",
            lineHeight: 1.7,
            border: `1px solid ${PALETTE.cardEdge}`,
          }}
        >
          {spec.body}
        </div>
      </div>
    </div>
  );
}

// The Specs dashboard: a flat list with per-row checkboxes for multi-select,
// a "Выделить всё"/"Снять выделение" toggle, "Копировать"/"Удалить выбранное"
// once something's picked (joining the chosen entries' full text with a
// clear "---" separator for copy; a 1-step Да/Отмена confirm for delete),
// and a full-width "+" card — matching the Pages-style row cards — that
// flips in place to "Сохранить"/"Отмена" on tap, reading the new entry
// straight from the clipboard rather than showing a text field at all.
// Deletion is selection-only now — no per-row trash icon — since bulk
// delete through the checkbox/panel covers the single-record case too.
function SpecsList({ specs, onOpen, onDeleteSelected, onSaveNew }) {
  const PALETTE = useTheme();
  const t = useT();
  const [selected, setSelected] = useState(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pasteError, setPasteError] = useState(false);

  const toggleSelect = (id) => {
    setConfirmBulkDelete(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = specs.length > 0 && specs.every((s) => selected.has(s.id));
  const toggleSelectAll = () => {
    setConfirmBulkDelete(false);
    setSelected(allSelected ? new Set() : new Set(specs.map((s) => s.id)));
  };

  const handleCopySelected = async () => {
    const chosen = specs.filter((s) => selected.has(s.id));
    const text = chosen.map((s) => `${s.title}\n\n${s.body}`).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Clipboard error", e);
    }
  };

  const handleDeleteSelected = () => {
    onDeleteSelected([...selected]);
    setSelected(new Set());
    setConfirmBulkDelete(false);
  };

  const handleSaveFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setPasteError(true);
        return;
      }
      onSaveNew(text);
      setPasteError(false);
      setConfirming(false);
    } catch (e) {
      setPasteError(true);
    }
  };

  const handleCancelCreate = () => {
    setConfirming(false);
    setPasteError(false);
  };

  return (
    <div className="w-full max-w-md px-6 pt-8 pb-10">
      {specs.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          {confirmBulkDelete ? (
            <>
              <span
                className="flex-1 text-xs px-3 py-1.5"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}
              >
                {t("Удалить N записей?", selected.size)}
              </span>
              <button
                onClick={handleDeleteSelected}
                className="text-xs px-3 py-1.5 rounded-full shrink-0"
                style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {t("Да")}
              </button>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="text-xs px-3 py-1.5 rounded-full shrink-0"
                style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {t("Отмена")}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleSelectAll}
                className="text-xs px-3 py-1.5 rounded-full shrink-0"
                style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {allSelected ? t("Снять выделение") : t("Выделить всё")}
              </button>
              {selected.size > 0 && (
                <>
                  <button
                    onClick={handleCopySelected}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
                    style={{ background: copied ? PALETTE.mint : PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t("Скопировано") : t("Копировать (N)", selected.size)}
                  </button>
                  <button
                    onClick={() => setConfirmBulkDelete(true)}
                    title={t("Удалить выбранное")}
                    aria-label={t("Удалить выбранное")}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs shrink-0"
                    style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {specs.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          {t("Пока пусто — нажми «+», чтобы быстро набросать первую спецификацию.")}
        </p>
      ) : (
        specs.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-2"
            style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}` }}
          >
            <button
              onClick={() => toggleSelect(s.id)}
              className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
              style={{
                border: `2px solid ${selected.has(s.id) ? PALETTE.mustard : PALETTE.cardEdge}`,
                background: selected.has(s.id) ? PALETTE.mustard : "transparent",
              }}
              aria-label={t("Выбрать")}
            >
              {selected.has(s.id) && <Check size={13} style={{ color: PALETTE.bgDeep }} strokeWidth={3} />}
            </button>

            <button onClick={() => onOpen(s.id)} className="flex-1 min-w-0 text-left">
              <p className="truncate" style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.05rem" }}>
                {s.title}
              </p>
              <p className="truncate" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.8rem" }}>
                {s.body.slice(0, 60)}
              </p>
            </button>
          </div>
        ))
      )}

      {confirming ? (
        <div
          className="w-full rounded-2xl px-3 py-3"
          style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}` }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveFromClipboard}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium"
              style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              <Check size={16} /> {t("Сохранить")}
            </button>
            <button
              onClick={handleCancelCreate}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium"
              style={{ background: PALETTE.card, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              <X size={16} /> {t("Отмена")}
            </button>
          </div>
          {pasteError && (
            <p className="text-xs text-center mt-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
              {t("Скопируй текст перед вставкой")}
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center py-3 rounded-2xl"
          style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}` }}
          aria-label={t("Новая спецификация")}
        >
          <Plus size={22} style={{ color: PALETTE.mustard }} />
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PRAYERS — each prayer has a title, a transcription language chosen from a
// fixed registry, and two independently-filled pieces of content copied by
// hand from an external chatbot: `fullText` (one scrollable block — the
// prompt asks for the original text, a blank line, then a transcription of
// the whole thing) and `cards` (the same prayer split line-by-line, each
// line a {text, transcription} pair, for the card-based study view). A
// prayer with neither filled in yet shows its setup panel (the generated
// prompt + a Copy button, plus the two paste-back fields) by default;
// existing content switches to a Text/Cards toggle, with a pencil to get
// back to the setup panel to add or replace either part.
// ════════════════════════════════════════════════════════════════════════

const PRAYER_TRANSCRIPTION_LANGS = [
  { key: "ru", label: "Русский" },
  { key: "en", label: "Английский" },
  { key: "tm", label: "Туркменский" },
  { key: "tr", label: "Турецкий" },
];

// Static decorative element for the Молитвы design system — not user
// content, always shown regardless of whether any prayer exists yet.
function BasmalaWatermark() {
  const PALETTE = useTheme();
  return (
    <p
      dir="rtl"
      className="w-full text-center"
      style={{ fontFamily: "'Katibeh', serif", color: PALETTE.ink, fontSize: "1.8rem", lineHeight: 1.3 }}
    >
      بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
    </p>
  );
}

function usePrayers() {
  const [prayers, setPrayers] = useState([]);

  // Re-reads prayers-v1 from storage into state. Exposed as `refresh` for
  // the dashboard's manual "Обновить" button — the explicit, on-demand
  // replacement for the pull-to-refresh gesture, which this app no longer
  // treats as a page reload (see the app-nav-v1 navigation persistence)
  // and so has nothing left for a swipe to usefully trigger.
  const refresh = useCallback(async () => {
    try {
      const res = await window.storage.get("prayers-v1", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        if (Array.isArray(parsed)) setPrayers(parsed);
      }
    } catch (e) {
      // nothing saved yet
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persist = useCallback(async (next) => {
    setPrayers(next);
    try {
      await window.storage.set("prayers-v1", JSON.stringify(next), false);
    } catch (e) {
      console.error("Storage error", e);
    }
  }, []);

  const addPrayer = useCallback(
    (title, transcriptionLang) => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const prayer = { id: uid(), title: trimmed, transcriptionLang, fullText: "", cards: [] };
      persist([...prayers, prayer]);
      return prayer.id;
    },
    [prayers, persist]
  );

  const updatePrayer = useCallback(
    (id, patch) => {
      persist(prayers.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },
    [prayers, persist]
  );

  const deletePrayer = useCallback(
    (id) => {
      persist(prayers.filter((p) => p.id !== id));
    },
    [prayers, persist]
  );

  return { prayers, addPrayer, updatePrayer, deletePrayer, refresh };
}

// One short, unambiguous description of the transcription alphabet per
// target language, in both prompt-UI languages — used to spell out exactly
// which letters are allowed, since "transcription" alone is too vague a
// word for less instruction-disciplined models (some read it as "translate
// the meaning" instead of "spell out the sound").
const PRAYER_SCRIPT_DESC = {
  ru: { en: "the Cyrillic alphabet only (а, б, в, г, д, е, ё, ж, з, и, й, к, л, м, н, о, п, р, с, т, у, ф, х, ц, ч, ш, щ, ъ, ы, ь, э, ю, я)", ru: "только кириллицей (буквы а, б, в, г, д, е, ё, ж, з, и, й, к, л, м, н, о, п, р, с, т, у, ф, х, ц, ч, ш, щ, ъ, ы, ь, э, ю, я)" },
  en: { en: "the Latin alphabet only (a-z)", ru: "только латинским алфавитом (a-z)" },
  tm: { en: "the Latin Turkmen alphabet only (a-z plus ä, ç, ž, ň, ö, ş, ü, ý)", ru: "только латинским туркменским алфавитом (a-z, а также ä, ç, ž, ň, ö, ş, ü, ý)" },
  tr: { en: "the Latin Turkish alphabet only (a-z plus ç, ğ, ı, ö, ş, ü)", ru: "только латинским турецким алфавитом (a-z, а также ç, ğ, ı, ö, ş, ü)" },
};

// Builds the copy-paste prompt for an external chatbot: asks for the named
// prayer's original text and a transcription in the chosen language, in two
// clearly headed parts (a full scrollable text, then a numbered line-by-line
// breakdown for the card format) so the whole reply can be pasted back as
// one blob into PrayerSetupPanel's single field and auto-split by
// parsePrayerReply. Generated in whichever language the app's own UI is
// currently in.
//
// Written to survive chatbots other than the one it was first tested
// against: short, direct rules instead of one long sentence, the two
// "===" headers spelled out as machine markers rather than left implicit,
// a 3-line example instead of 2 (harder to mistake for something else),
// and an explicit "copy the original, don't translate/summarize it" rule —
// weaker models sometimes replace the Arabic with a translation, or drop
// it, rather than transcribing it.
function buildPrayerPrompt(title, langKey, lang) {
  const langLabel = translate(lang, PRAYER_TRANSCRIPTION_LANGS.find((l) => l.key === langKey).label);
  const scriptDesc = PRAYER_SCRIPT_DESC[langKey][lang];
  const cyrillicExample = langKey === "ru";
  const exampleLines = cyrillicExample
    ? [
        ["بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", "Бисмилляхи ррахмани ррахим"],
        ["الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", "Альхамду лилляхи рабби ль-алямин"],
        ["الرَّحْمَٰنِ الرَّحِيمِ", "Ррахмани ррахим"],
      ]
    : [
        ["بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", "Bismillahi rrahmani rrahim"],
        ["الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", "Alhamdu lillahi rabbi l-alamin"],
        ["الرَّحْمَٰنِ الرَّحِيمِ", "Rrahmani rrahim"],
      ];
  if (lang === "en") {
    return `Send me the text of the prayer "${title}" as plain text only. No Markdown, no JSON, no comments, no extra words.

RULES:
1. Copy the ORIGINAL Arabic text exactly as it is. Do not translate it. Do not summarize it. Do not skip any part of it.
2. Also write a TRANSCRIPTION: spell out how the Arabic SOUNDS, using ${scriptDesc}. This is NOT a translation of the meaning — only the sound, written phonetically.
3. "=== FULL TEXT ===" and "=== LINE BY LINE ===" below are section markers for a computer program. They are NOT part of the prayer. Write each one ONLY on its own separate line, exactly once. Never place a marker in the middle of the prayer text.
4. In the "LINE BY LINE" part, every line starts with a number and a period (1. 2. 3. ...), each number on its own separate line. Never combine two numbered lines into one. Never skip a number.

FORMAT TO FOLLOW EXACTLY:

=== FULL TEXT ===
(the whole original Arabic text, unchanged)

(the whole transcription in ${langLabel})

=== LINE BY LINE ===
1. (Arabic line 1) - (transcription of line 1)
2. (Arabic line 2) - (transcription of line 2)
3. (Arabic line 3) - (transcription of line 3)
(continue with one numbered line for every line of the prayer)

EXAMPLE of the LINE BY LINE part, first 3 lines of Al-Fatiha (written here in ${cyrillicExample ? "Cyrillic — this is exactly the format to use" : "Latin — replace with " + langLabel}):
1. ${exampleLines[0][0]} - ${exampleLines[0][1]}
2. ${exampleLines[1][0]} - ${exampleLines[1][1]}
3. ${exampleLines[2][0]} - ${exampleLines[2][1]}

Reply with ONLY the format above, filled in for "${title}". Nothing before it, nothing after it.`;
  }
  return `Пришли текст молитвы «${title}» строго обычным текстом. Без Markdown, без JSON, без комментариев и лишних слов.

ПРАВИЛА:
1. Скопируй ОРИГИНАЛЬНЫЙ арабский текст без изменений. Не переводи его. Не сокращай его. Не пропускай ни одной части.
2. Также напиши ТРАНСКРИПЦИЮ: запиши, как арабский текст ЗВУЧИТ, ${scriptDesc}. Это НЕ перевод смысла — только звучание, записанное буквами.
3. Заголовки «=== ТЕКСТ ЦЕЛИКОМ ===» и «=== ПОКАРТОЧНО ===» ниже — это метки для компьютерной программы. Они НЕ являются частью молитвы. Пиши каждую метку ТОЛЬКО на своей отдельной строке, ровно один раз. Никогда не вставляй метку в середину текста молитвы.
4. В части «ПОКАРТОЧНО» каждая строка начинается с номера и точки (1. 2. 3. ...), каждый номер — на своей отдельной строке. Никогда не объединяй две пронумерованные строки в одну. Никогда не пропускай номер.

ФОРМАТ, КОТОРОМУ НУЖНО СЛЕДОВАТЬ ТОЧНО:

=== ТЕКСТ ЦЕЛИКОМ ===
(весь оригинальный арабский текст, без изменений)

(вся транскрипция целиком на языке: ${langLabel})

=== ПОКАРТОЧНО ===
1. (арабская строка 1) - (транскрипция строки 1)
2. (арабская строка 2) - (транскрипция строки 2)
3. (арабская строка 3) - (транскрипция строки 3)
(дальше — по одной пронумерованной строке на каждую строку молитвы)

ПРИМЕР части ПОКАРТОЧНО, первые 3 аята суры Аль-Фатиха (здесь показано ${cyrillicExample ? "кириллицей — именно этот формат и нужен" : "латиницей — замени на " + langLabel}):
1. ${exampleLines[0][0]} - ${exampleLines[0][1]}
2. ${exampleLines[1][0]} - ${exampleLines[1][1]}
3. ${exampleLines[2][0]} - ${exampleLines[2][1]}

Верни ТОЛЬКО формат выше, заполненный для «${title}». Ничего до него, ничего после него.`;
}

// Strips the "=== ... ===" section-header lines the prompt above asks the
// chatbot to use (in whichever language/casing it echoes them back) — they
// exist only to mark where to split the reply, never to be shown to the
// user, so any pasted-back text runs through this before being saved.
// Removes "=== ... ===" section markers wherever they appear in a line —
// as the whole line (the documented case) or spliced into the middle of
// it (chatbots sometimes ignore the "own separate line" instruction and
// run a marker straight into the surrounding text). Either way the
// marker substring is dropped and the remaining text is glued back
// together with a single space so words don't get fused.
function stripMarkerLines(raw) {
  return raw
    .split("\n")
    .map((line) => line.replace(/=+[^=\n]*=+/g, " ").replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

// Prayer originals are always Arabic script (RTL); transcriptions are
// always Latin/Cyrillic (LTR). Used both to group raw pasted-back lines
// (parsePrayerCards) and to align rendered text correctly (PrayerTextView).
const isArabicScript = (s) => /[؀-ۿ]/.test(s);

// Best-effort Latin -> Cyrillic transliteration for prayer transcriptions,
// covering the common digraphs/letters used in existing Russian renderings
// of Arabic terms (e.g. "Rahman" -> "Рахман", "khutba" -> "хутба"). Not a
// linguistically exhaustive transliteration engine — just enough to
// recover when a chatbot defaults to Latin letters despite being asked
// for Cyrillic-only transcription, which happens often enough in
// practice to be worth handling automatically rather than leaving the
// user to redo the whole reply. Untouched (Cyrillic, Arabic, digits,
// punctuation) characters pass through unchanged, so it's safe to run
// even on text that's already correct.
const LATIN_TO_CYRILLIC_DIGRAPHS = [
  ["sh", "ш"], ["ch", "ч"], ["kh", "х"], ["gh", "г"], ["th", "с"], ["dh", "з"],
  ["zh", "ж"], ["ph", "ф"], ["ya", "я"], ["yu", "ю"], ["ye", "е"],
  ["aa", "а"], ["ii", "и"], ["ee", "и"], ["uu", "у"], ["oo", "у"],
];
const LATIN_TO_CYRILLIC_LETTERS = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и",
  j: "дж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р",
  s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з", "'": "ъ",
};
function transliterateLatinToCyrillic(text) {
  if (!/[A-Za-z]/.test(text)) return text;
  const lower = text.toLowerCase();
  let result = "";
  for (let i = 0; i < lower.length; ) {
    const digraph = LATIN_TO_CYRILLIC_DIGRAPHS.find(([latin]) => lower.startsWith(latin, i));
    if (digraph) {
      result += digraph[1];
      i += 2;
      continue;
    }
    result += LATIN_TO_CYRILLIC_LETTERS[lower[i]] ?? lower[i];
    i += 1;
  }
  return result.replace(/(^|\s)([а-яё])/g, (m, sep, letter) => sep + letter.toUpperCase());
}

// Parses the "N. original - transcription" lines the prompt above asks the
// chatbot to return, using the same "text - translation" delimiter
// convention as parseCardLine elsewhere in the app (" - ", "=", or "—").
// Real chatbot replies don't always keep original+transcription on one
// line despite the prompt asking for it — some put the original on the
// numbered line and the transcription on the next line instead. Both
// forms are grouped into a single card per numbered line here, so the
// card count always matches the number of verses, not the number of
// raw text lines.
function parsePrayerCards(raw, transcriptionLang) {
  const numberRe = /^\d+[.)]\s*/;
  const lines = stripMarkerLines(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const cards = [];
  let current = null;
  for (let line of lines) {
    if (numberRe.test(line)) {
      if (current) cards.push(current);
      current = { text: "", transcription: "" };
      line = line.replace(numberRe, "");
    }
    if (!current) continue;
    const parts = line.split(/\s-\s|=|—/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      current.text = current.text || parts[0];
      current.transcription = current.transcription
        ? `${current.transcription} ${parts.slice(1).join(" - ")}`
        : parts.slice(1).join(" - ");
      continue;
    }
    if (!current.text || (isArabicScript(line) && !current.transcription)) {
      current.text = current.text ? `${current.text} ${line}` : line;
    } else {
      current.transcription = current.transcription ? `${current.transcription} ${line}` : line;
    }
  }
  if (current) cards.push(current);

  let result = cards.filter((c) => c.text);
  // Fallback for a reply that dropped the numbering format entirely: the
  // loop above never opens a card without a numbered line, so every line
  // gets skipped and result stays empty even though the lines still look
  // like recognizable "original - transcription" pairs. Recover what we
  // can rather than leaving Карточки empty.
  if (result.length === 0) {
    result = lines
      .map((line) => {
        const parts = line.split(/\s-\s|=|—/).map((p) => p.trim()).filter(Boolean);
        return parts.length > 1 ? { text: parts[0], transcription: parts.slice(1).join(" - ") } : null;
      })
      .filter(Boolean);
  }

  return result.map((c) => ({
    id: uid(),
    text: c.text,
    transcription: transcriptionLang === "ru" ? transliterateLatinToCyrillic(c.transcription) : c.transcription,
  }));
}

// Splits the chatbot's single pasted-back reply into the two parts the
// prompt asked for. The marker headers themselves are the primary split
// signal (that's their whole purpose) — found here BEFORE stripMarkerLines
// runs, so the split still works even if the line-by-line section's
// numbering is broken or missing entirely. Only when no second marker can
// be found at all does this fall back to the numbered-line heuristic
// parsePrayerCards itself also relies on.
function parsePrayerReply(raw, transcriptionLang) {
  const numberRe = /^\d+[.)]\s*/;
  const rawLines = raw.split("\n");
  const markerIndices = rawLines.reduce((acc, line, i) => {
    if (/^\s*=+[^=\n]*=+\s*$/.test(line)) acc.push(i);
    return acc;
  }, []);
  let splitIndex;
  if (markerIndices.length >= 2) {
    splitIndex = markerIndices[1];
  } else {
    const firstNumbered = rawLines.findIndex((line) => numberRe.test(line.trim()));
    splitIndex = firstNumbered === -1 ? rawLines.length : firstNumbered;
  }
  const fullTextLines = stripMarkerLines(rawLines.slice(0, splitIndex).join("\n")).split("\n");
  const cardsRawLines = stripMarkerLines(rawLines.slice(splitIndex).join("\n")).split("\n");
  const fullText = fullTextLines
    .map((line) => (transcriptionLang === "ru" && !isArabicScript(line) ? transliterateLatinToCyrillic(line) : line))
    .join("\n")
    .trim();
  return {
    fullText,
    cards: parsePrayerCards(cardsRawLines.join("\n"), transcriptionLang),
  };
}

function PrayerCreateScreen({ onCancel, onSave }) {
  const PALETTE = useTheme();
  const t = useT();
  const [title, setTitle] = useState("");
  const [langKey, setLangKey] = useState("ru");

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-16" style={{ background: PALETTE.bg }}>
      <div className="w-full max-w-md">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-sm mb-6"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
        >
          <ArrowLeft size={16} /> {t("Назад")}
        </button>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.8rem" }} className="mb-6">
          {t("Добавить молитву")}
        </h1>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("Название молитвы")}
          className="w-full rounded-xl px-4 py-3 outline-none mb-6"
          style={{
            background: PALETTE.card,
            color: PALETTE.ink,
            fontFamily: "'IBM Plex Sans', sans-serif",
            border: `1px solid ${PALETTE.cardEdge}`,
            boxShadow: `inset 2px 2px 5px ${PALETTE.shadowDark}, inset -2px -2px 5px ${PALETTE.shadowLight}`,
          }}
        />
        <p className="text-sm mb-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          {t("Язык транскрипции")}
        </p>
        <div className="flex flex-wrap gap-2 mb-8">
          {PRAYER_TRANSCRIPTION_LANGS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setLangKey(key)}
              className="px-4 py-2 rounded-full text-sm"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                background: langKey === key ? PALETTE.mustard : PALETTE.chip,
                color: langKey === key ? PALETTE.bgDeep : PALETTE.fadeText,
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <button
          onClick={() => title.trim() && onSave(title.trim(), langKey)}
          disabled={!title.trim()}
          className="w-full py-3 rounded-full disabled:opacity-40"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.mustard, color: PALETTE.bgDeep }}
        >
          {t("Сохранить")}
        </button>
      </div>
    </div>
  );
}

// Setup: the generated prompt (readonly, with its own Copy button) plus a
// single paste-back field for the chatbot's whole two-part reply — parsed
// and split into fullText + cards by parsePrayerReply on the single Save.
function PrayerSetupPanel({ prayer, onSave }) {
  const PALETTE = useTheme();
  const t = useT();
  const [lang] = useLanguage();
  const [copied, setCopied] = useState(false);
  const [replyDraft, setReplyDraft] = useState(() => {
    if (prayer.fullText) return prayer.fullText;
    if (prayer.cards.length) return prayer.cards.map((c) => `${c.text} - ${c.transcription}`).join("\n");
    return "";
  });

  const prompt = useMemo(
    () => buildPrayerPrompt(prayer.title, prayer.transcriptionLang, lang),
    [prayer.title, prayer.transcriptionLang, lang]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Clipboard error", e);
    }
  };

  const textareaStyle = {
    fontFamily: "'IBM Plex Sans', sans-serif",
    background: PALETTE.card,
    color: PALETTE.ink,
    border: `1px solid ${PALETTE.cardEdge}`,
    boxShadow: `inset 2px 2px 5px ${PALETTE.shadowDark}, inset -2px -2px 5px ${PALETTE.shadowLight}`,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 max-w-md mx-auto w-full flex flex-col gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            {t("Промт для чат-бота")}
          </p>
          <textarea readOnly value={prompt} rows={10} className="w-full rounded-2xl p-4 outline-none resize-none text-sm" style={textareaStyle} />
          <button
            onClick={handleCopy}
            className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-full"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.mustard, color: PALETTE.bgDeep }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t("Скопировано") : t("Скопировать")}
          </button>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            {t("Ответ чат-бота")}
          </p>
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder={t("Вставьте сюда весь ответ чат-бота целиком")}
            rows={12}
            className="w-full rounded-2xl p-4 outline-none resize-none"
            style={textareaStyle}
          />
        </div>
      </div>

      <div className="shrink-0 px-6 pt-3 pb-6 max-w-md mx-auto w-full">
        <button
          onClick={() => onSave(parsePrayerReply(replyDraft, prayer.transcriptionLang))}
          className="w-full py-2.5 rounded-full"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.chip, color: PALETTE.mint }}
        >
          {t("Сохранить")}
        </button>
      </div>
    </div>
  );
}

// Five discrete text-size steps for the prayer's Arabic/transcription text
// (shared by the Text and Cards screens), centered on step 3 (index 2) —
// the size both screens always used before this control existed, kept as
// the anchor so the adjustment reads as "bigger"/"smaller than normal"
// rather than an arbitrary new default. The range is deliberately modest
// in both directions: step 1 stays comfortably legible (shrinking text to
// help no one), and step 5 stays inside what a card's fixed width can wrap
// without ugly breaks.
const PRAYER_FONT_STEPS = [
  { arabic: "1.2rem", translit: "0.9rem" },
  { arabic: "1.35rem", translit: "1rem" },
  { arabic: "1.5rem", translit: "1.1rem" },
  { arabic: "1.7rem", translit: "1.25rem" },
  { arabic: "1.9rem", translit: "1.4rem" },
];
const PRAYER_FONT_STEP_DEFAULT = 2;

// The "Размер текста" control itself — identical on both the Text and
// Cards screens, so it's one component rather than two copies that could
// drift apart.
function PrayerTextSizeControl({ fontStep, setFontStep }) {
  const PALETTE = useTheme();
  const t = useT();
  const fontStepButtonStyle = {
    width: "38px",
    height: "38px",
    background: PALETTE.chip,
    color: PALETTE.fadeText,
    boxShadow: `3px 3px 6px ${PALETTE.shadowDark}, -3px -3px 6px ${PALETTE.shadowLight}`,
  };
  return (
    <div
      className="shrink-0 w-full flex flex-col items-center gap-2"
      style={{ paddingTop: "10px", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}
    >
      <span
        className="uppercase"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.7rem", letterSpacing: "0.08em" }}
      >
        {t("Размер текста")}
      </span>
      <div className="flex items-center" style={{ gap: "12px" }}>
        <button
          onClick={() => setFontStep((s) => Math.max(0, s - 1))}
          className="rounded-full flex items-center justify-center"
          style={fontStepButtonStyle}
          aria-label={t("Уменьшить размер текста")}
        >
          <Minus size={16} />
        </button>
        <div className="flex items-center gap-1.5">
          {PRAYER_FONT_STEPS.map((_, i) => (
            <span
              key={i}
              className="rounded-full"
              style={{
                width: i === fontStep ? "18px" : "6px",
                height: "6px",
                background: i === fontStep ? PALETTE.mustard : PALETTE.cardEdge,
                transition: "width 0.2s ease, background 0.2s ease",
              }}
            />
          ))}
        </div>
        <button
          onClick={() => setFontStep((s) => Math.min(PRAYER_FONT_STEPS.length - 1, s + 1))}
          className="rounded-full flex items-center justify-center"
          style={fontStepButtonStyle}
          aria-label={t("Увеличить размер текста")}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function PrayerTextView({ fullText, cards, fontStep, setFontStep }) {
  const PALETTE = useTheme();
  const t = useT();
  if (!cards.length && !fullText.trim()) {
    return (
      <p className="text-center py-10" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        {t("Нет текста")}
      </p>
    );
  }
  const sizes = PRAYER_FONT_STEPS[fontStep];
  const lineStyle = (fontSize) => ({ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.ink, fontSize, lineHeight: 2 });
  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 max-w-md mx-auto w-full">
      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        {cards.length ? (
          <>
            <div>
              {cards.map((c) => (
                <p key={c.id} dir="rtl" className="w-full text-center" style={lineStyle(sizes.arabic)}>
                  {c.text}
                </p>
              ))}
            </div>
            <div className="mt-10">
              {cards.map((c) => (
                <p key={c.id} className="w-full text-center" style={lineStyle(sizes.translit)}>
                  {c.transcription}
                </p>
              ))}
            </div>
          </>
        ) : (
          fullText.split("\n").map((line, i) => (
            <p key={i} dir={isArabicScript(line) ? "rtl" : "ltr"} className="w-full text-center" style={lineStyle(isArabicScript(line) ? sizes.arabic : sizes.translit)}>
              {line || "\u00a0"}
            </p>
          ))
        )}
      </div>
      <PrayerTextSizeControl fontStep={fontStep} setFontStep={setFontStep} />
    </div>
  );
}

function PrayerCard({ card, number, fontStep }) {
  const PALETTE = useTheme();
  const t = useT();
  const sizes = PRAYER_FONT_STEPS[fontStep];
  return (
    <div className="relative w-full max-w-md">
      <div
        className="absolute inset-0 rounded-2xl"
        style={{ background: PALETTE.cardEdge, transform: "rotate(2deg) translateY(6px)", boxShadow: `4px 4px 10px ${PALETTE.shadowDark}` }}
      />
      <div
        className="relative rounded-2xl px-8 py-10 flex flex-col items-center justify-center text-center gap-4"
        style={{
          background: PALETTE.card,
          minHeight: "220px",
          boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
          border: `1px solid ${PALETTE.cardEdge}`,
        }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            width: "26px",
            height: "26px",
            background: PALETTE.mustard,
            color: PALETTE.bgDeep,
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: "0.8rem",
            fontWeight: 600,
          }}
        >
          {number}
        </span>
        <p dir="rtl" className="w-full" style={{ fontFamily: "'Fraunces', serif", color: PALETTE.ink, fontSize: sizes.arabic, lineHeight: 1.4, textAlign: "center" }}>
          {card.text}
        </p>
        <p className="w-full" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mintDeep, fontSize: sizes.translit, lineHeight: 1.4, textAlign: "center" }}>
          {card.transcription || t("нет транскрипции")}
        </p>
      </div>
    </div>
  );
}

function PrayerCardsView({ prayer, onUpdate, resumeCardPosition, fontStep, setFontStep }) {
  const PALETTE = useTheme();
  const t = useT();
  const cards = prayer.cards;
  // Seeded once per mount from the prayer's own saved position (only when
  // "resume" is on) — PrayerScreen remounts this component every time the
  // user re-opens the prayer or switches back from the Text tab, which is
  // exactly the moment this should re-read the latest saved index.
  const [index, setIndexRaw] = useState(() => {
    if (!cards.length) return 0;
    const saved = resumeCardPosition ? prayer.lastCardIndex ?? 0 : 0;
    return Math.min(Math.max(saved, 0), cards.length - 1);
  });

  if (cards.length === 0) {
    return (
      <p className="text-center py-10" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        {t("Нет карточек")}
      </p>
    );
  }
  const clampedIndex = Math.min(index, cards.length - 1);
  const card = cards[clampedIndex];

  const goTo = (next) => {
    setIndexRaw(next);
    if (resumeCardPosition) onUpdate(prayer.id, { lastCardIndex: next });
  };
  const goPrev = () => goTo((clampedIndex - 1 + cards.length) % cards.length);
  const goNext = () => goTo((clampedIndex + 1) % cards.length);

  // Height of the decorative header (chevron row + counter) pinned to the
  // top of the tap-zone area below — the tapered divider's top edge lines
  // up with the bottom of this so it never touches either.
  const NAV_HEADER_HEIGHT = 76;

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center px-6">
      {/* Card sits right under the Basmala (its gap comes from the
          watermark wrapper above), top-aligned rather than centered, so
          its height doesn't push the rest of the layout around. */}
      <div className="w-full shrink-0 flex justify-center">
        <PrayerCard card={card} number={clampedIndex + 1} fontStep={fontStep} />
      </div>

      {/* The entire region from here down to TEXT SIZE is tappable, split
          into a left half / right half — not just a slim button-sized
          band. That's the actual fix: previously only a ~56px strip right
          under the card responded to taps, so anywhere else in "the area
          under the card" (which visually reads as one continuous zone)
          did nothing. The chevrons, counter, and divider below are purely
          decorative (pointer-events: none) — they sit on top of this pair
          of full-height buttons and never intercept the tap themselves. */}
      <div className="flex-1 min-h-0 relative w-full max-w-md" style={{ marginTop: "20px" }}>
        <button onClick={goPrev} aria-label={t("Предыдущая")} className="absolute inset-y-0 left-0 w-1/2" />
        <button onClick={goNext} aria-label={t("Следующая")} className="absolute inset-y-0 right-0 w-1/2" />

        <div className="absolute inset-x-0 top-0 pointer-events-none">
          {/* Chevrons: centered in their own half's width, then nudged
              further toward that half's outer screen edge; centered
              vertically within this compact row. */}
          <div className="relative w-full" style={{ height: "48px" }}>
            <ChevronLeft
              size={24}
              strokeWidth={2}
              style={{ position: "absolute", top: "50%", left: "17%", transform: "translate(-50%, -50%)", color: PALETTE.fadeText }}
            />
            <ChevronRight
              size={24}
              strokeWidth={2}
              style={{ position: "absolute", top: "50%", right: "17%", transform: "translate(50%, -50%)", color: PALETTE.fadeText }}
            />
          </div>
          <div className="w-full text-center" style={{ marginTop: "4px" }}>
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.85rem" }}>
              {clampedIndex + 1} / {cards.length}
            </span>
          </div>
        </div>

        {/* Tapered divider: a thin vertical line, pointed at both ends and
            widest at its middle, filling the free space between the
            chevron/counter block above and TEXT SIZE below — built from
            two mirrored CSS triangles rather than a fixed-height SVG so it
            stretches correctly no matter how tall this flexible area ends
            up being. */}
        <div
          className="absolute pointer-events-none"
          style={{ left: "50%", transform: "translateX(-50%)", top: `${NAV_HEADER_HEIGHT}px`, bottom: 0, width: "4px" }}
        >
          <div style={{ height: "50%", width: "100%", background: PALETTE.fadeText, clipPath: "polygon(50% 0%, 0 100%, 100% 100%)" }} />
          <div style={{ height: "50%", width: "100%", background: PALETTE.fadeText, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
        </div>
      </div>

      <PrayerTextSizeControl fontStep={fontStep} setFontStep={setFontStep} />
    </div>
  );
}

function PrayerScreen({ prayer, onBack, onUpdate, onDelete, isDark, onToggleTheme, resumeCardPosition, onToggleResumeCardPosition }) {
  const PALETTE = useTheme();
  const t = useT();
  const viewportHeight = useVisualViewportHeight();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasContent = !!prayer.fullText.trim() || prayer.cards.length > 0;
  const [editing, setEditing] = useState(!hasContent);
  const [viewMode, setViewMode] = useState("text");
  // Shared between Text and Cards so adjusting it in one carries over to
  // the other — a "reading size" preference for this viewing session, not
  // two independent settings someone has to set twice.
  const [fontStep, setFontStep] = useState(PRAYER_FONT_STEP_DEFAULT);

  return (
    <div className="fixed inset-x-0 top-0 flex flex-col" style={{ background: PALETTE.bg, height: `${viewportHeight}px` }}>
      <HomeButton onClick={onBack} />
      <div className="max-w-md mx-auto w-full px-6 pt-8 pb-2 flex items-center justify-between shrink-0">
        <h2 className="truncate px-2 text-center flex-1" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.05rem" }}>
          {prayer.title}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onDelete(prayer.id)}
                className="text-xs px-2 py-1 rounded-full"
                style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {t("Да")}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-1 rounded-full"
                style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {t("Отмена")}
              </button>
            </div>
          ) : (
            <>
              {hasContent && prayer.cards.length > 0 && (
                <button
                  onClick={onToggleResumeCardPosition}
                  aria-label={resumeCardPosition ? t("Продолжать с последней карточки") : t("Всегда начинать с первой карточки")}
                  title={resumeCardPosition ? t("Продолжать с последней карточки") : t("Всегда начинать с первой карточки")}
                  className="p-1"
                  style={{ color: resumeCardPosition ? PALETTE.mustard : PALETTE.fadeText }}
                >
                  <History size={15} />
                </button>
              )}
              {hasContent && (
                <button onClick={() => setEditing((e) => !e)} aria-label={t("Редактировать")} className="p-1" style={{ color: editing ? PALETTE.mustard : PALETTE.fadeText }}>
                  <Pencil size={15} />
                </button>
              )}
              <button onClick={() => setConfirmDelete(true)} aria-label={t("Удалить молитву")} className="p-1" style={{ color: PALETTE.fadeText }}>
                <Trash2 size={15} />
              </button>
            </>
          )}
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </div>

      {editing || !hasContent ? (
        <PrayerSetupPanel
          prayer={prayer}
          onSave={({ fullText, cards }) => {
            onUpdate(prayer.id, { fullText, cards });
            if (fullText.trim() || cards.length) setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="flex justify-center gap-2 pb-10 shrink-0">
            {[
              { key: "text", label: t("Текст") },
              { key: "cards", label: t("Карточки") },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className="px-4 py-1.5 rounded-full text-sm"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  background: viewMode === key ? PALETTE.mustard : PALETTE.chip,
                  color: viewMode === key ? PALETTE.bgDeep : PALETTE.fadeText,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="px-6 max-w-md mx-auto w-full shrink-0" style={{ paddingBottom: viewMode === "cards" ? "34px" : "40px" }}>
            <BasmalaWatermark />
          </div>
          {viewMode === "text" ? (
            <PrayerTextView fullText={prayer.fullText} cards={prayer.cards} fontStep={fontStep} setFontStep={setFontStep} />
          ) : (
            <PrayerCardsView prayer={prayer} onUpdate={onUpdate} resumeCardPosition={resumeCardPosition} fontStep={fontStep} setFontStep={setFontStep} />
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// QUOTES — "Мои цитаты": a flat collection of two-sided cards captured by
// selecting text anywhere in the app. Front side is the quote itself, back
// starts empty (no auto-translation). Reuses the flip/swipe-up/edit
// mechanics of the language flashcards, but pages between cards with the
// same tap-zone + tapered-divider mechanic as the Молитвы Cards screen
// (kept as its own copy rather than a shared component, since the two
// features are independent and shouldn't risk regressing one another).
// ════════════════════════════════════════════════════════════════════════

// Five discrete text-size steps for a quote's own text — same idea as the
// prayer text-size scale, just a single value per step since a quote has
// no separate transliteration line to size independently.
const QUOTE_FONT_STEPS = ["0.95rem", "1.05rem", "1.2rem", "1.4rem", "1.6rem"];
const QUOTE_FONT_STEP_DEFAULT = 2;

// A small icon-only, no-label button — the shared building block for the
// six equally-weighted actions in the Cards toolbar (edit, shuffle, font
// -/+, add to deck, delete). aria-label/title carry the accessible name
// since there's no visible text.
function QuoteIconButton({ onClick, label, active, danger, children }) {
  const PALETTE = useTheme();
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: "32px",
        height: "32px",
        background: active ? PALETTE.mustard : PALETTE.chip,
        color: danger ? PALETTE.danger : active ? PALETTE.bgDeep : PALETTE.fadeText,
      }}
    >
      {children}
    </button>
  );
}

// The quote card itself: tap flips it, dragging up sends it to the long
// box — exactly the language flashcard's gesture contract — except a quote
// can run to a full paragraph, so the card has a fixed footprint and the
// overflowing face scrolls internally instead of growing the card. That
// internal scroll has to coexist with the swipe-up gesture: an upward drag
// only becomes "swipe to the long box" once the visible face is already
// scrolled to its end, so a long quote can be read in full before a swipe
// is ever interpreted as a card-dismissal. Everything else (sideways,
// downward once already at the top) is claimed but produces no motion, so
// the card can never end up stuck mid-gesture.
function QuoteCard({ item, flipped, onFlip, rotation, fontStep, onSwipeUp }) {
  const PALETTE = useTheme();
  const t = useT();
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef(null);
  const scrollRef = useRef(null);
  const drag = useRef({ startY: 0, startX: 0, active: false, suppressClick: false, committedUp: false });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [flipped]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      drag.current = { startY: touch.clientY, startX: touch.clientX, active: true, suppressClick: false, committedUp: false };
      setDragging(true);
    };

    const onTouchMove = (e) => {
      if (!drag.current.active || !e.touches[0]) return;
      const touch = e.touches[0];
      const dyNow = touch.clientY - drag.current.startY;
      const dxNow = touch.clientX - drag.current.startX;
      const isVerticalIntent = Math.abs(dyNow) > Math.abs(dxNow) * 1.5;

      if (drag.current.committedUp) {
        // Already recognized as the swipe-to-long-box gesture this touch —
        // keep tracking it regardless of scroll position, so a mid-drag
        // scroll bounce can't cancel it partway through.
        e.preventDefault();
        setDy(Math.min(dyNow, 0));
        return;
      }

      const scroller = scrollRef.current;
      const maxScrollTop = scroller ? Math.max(scroller.scrollHeight - scroller.clientHeight, 0) : 0;
      const scrollTop = scroller ? scroller.scrollTop : 0;

      if (dyNow < 0 && isVerticalIntent && scrollTop >= maxScrollTop - 1) {
        // Dragging up with nothing left to reveal below — this is the
        // swipe-to-long-box gesture.
        e.preventDefault();
        setDy(dyNow);
        drag.current.committedUp = true;
        return;
      }

      const stillHasRoomToScroll =
        isVerticalIntent && maxScrollTop > 0 && !(dyNow > 0 && scrollTop <= 0) && !(dyNow < 0 && scrollTop >= maxScrollTop - 1);
      if (stillHasRoomToScroll) {
        // Let the browser scroll the long quote natively — don't claim the
        // touch or move the card itself.
        setDy(0);
        return;
      }

      // Nothing left to scroll and not a swipe-up: claim the gesture past a
      // small threshold so the browser doesn't hijack it mid-drag (pull-to-
      // refresh, edge-swipe-back), same as the plain flashcard — but the
      // card itself stays put, since down/sideways has no action bound.
      if (Math.abs(dyNow) > 8 || Math.abs(dxNow) > 8) e.preventDefault();
      setDy(0);
    };

    const endDrag = () => {
      drag.current.active = false;
      setDragging(false);
      const wasUp = drag.current.committedUp;
      drag.current.committedUp = false;
      setDy((currentDy) => {
        if (wasUp && currentDy < -90) {
          drag.current.suppressClick = true;
          onSwipeUp && onSwipeUp();
        }
        return 0;
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endDrag, { passive: true });
    el.addEventListener("touchcancel", endDrag, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endDrag);
      el.removeEventListener("touchcancel", endDrag);
    };
  }, [onSwipeUp]);

  const handleClick = () => {
    if (drag.current.suppressClick) {
      drag.current.suppressClick = false;
      return;
    }
    onFlip && onFlip();
  };

  const swipeProgress = Math.min(Math.max(-dy / 90, 0), 1);
  const backText = (item.back || "").trim();
  const showEmptyBack = flipped && !backText;

  return (
    <div ref={cardRef} onClick={handleClick} className="relative w-full max-w-md cursor-pointer" style={{ perspective: "1200px" }}>
      {swipeProgress > 0 && (
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-sm whitespace-nowrap"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.waiting, color: "#fff", opacity: swipeProgress }}
        >
          {t("↑ в долгий ящик")}
        </div>
      )}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{ background: PALETTE.cardEdge, transform: `rotate(${rotation + 3}deg) translateY(6px)`, boxShadow: `4px 4px 10px ${PALETTE.shadowDark}` }}
      />
      <div
        className="relative rounded-2xl px-6 flex flex-col"
        style={{
          background: PALETTE.card,
          transform: `translateY(${dy}px) rotate(${rotation}deg)`,
          transition: dragging ? "none" : "transform 0.35s cubic-bezier(.2,.8,.3,1)",
          opacity: 1 - swipeProgress * 0.5,
          height: "46vh",
          maxHeight: "380px",
          minHeight: "220px",
          boxShadow: `8px 8px 16px ${PALETTE.shadowDark}, -8px -8px 16px ${PALETTE.shadowLight}, 0 2px 0 ${PALETTE.cardHighlight} inset`,
          border: `1px solid ${PALETTE.cardEdge}`,
        }}
      >
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-10 h-3 rounded-full" style={{ background: "rgba(140,155,165,0.18)" }} />
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto w-full flex items-center justify-center py-10" style={{ overscrollBehavior: "contain" }}>
          {showEmptyBack ? (
            <p
              className="text-center px-2"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.9rem", fontStyle: "italic", lineHeight: 1.4 }}
            >
              {t("Нет перевода/пояснения. Нажми карандаш, чтобы добавить.")}
            </p>
          ) : (
            <p
              className="w-full text-center whitespace-pre-wrap"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                color: flipped ? PALETTE.mintDeep : PALETTE.ink,
                fontSize: QUOTE_FONT_STEPS[fontStep],
                fontWeight: 400,
                lineHeight: 1.5,
              }}
            >
              {flipped ? backText : item.front}
            </p>
          )}
        </div>
        <p className="pb-3 text-center text-xs tracking-wide shrink-0" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#AEB8BE" }}>
          {flipped ? t("тап — вернуть · смахни вверх — в долгий ящик") : t("тап — перевернуть · смахни вверх — в долгий ящик")}
        </p>
      </div>
    </div>
  );
}

// Front (required) / back (optional) edit form — both sides at once, since
// a quote's "translation" is really "whatever note belongs on the back",
// not a single required field like the language deck's en/ru pair.
function QuoteForm({ initial, onSave, onCancel }) {
  const PALETTE = useTheme();
  const t = useT();
  const [front, setFront] = useState(initial?.front || "");
  const [back, setBack] = useState(initial?.back || "");

  const fieldStyle = {
    background: PALETTE.card,
    color: PALETTE.ink,
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: "0.95rem",
    border: `1px solid ${PALETTE.cardEdge}`,
  };
  const labelStyle = { fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.75rem", letterSpacing: "0.03em" };

  const handleSave = () => {
    if (!front.trim()) return;
    onSave({ front: front.trim(), back: back.trim() });
  };

  return (
    <div className="w-full max-w-md flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t("Лицевая сторона (цитата) *")}</label>
        <textarea autoFocus value={front} onChange={(e) => setFront(e.target.value)} rows={6} className="rounded-xl px-3 py-2 outline-none resize-none" style={fieldStyle} />
      </div>
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t("Оборотная сторона (перевод/пояснение)")}</label>
        <textarea value={back} onChange={(e) => setBack(e.target.value)} rows={6} className="rounded-xl px-3 py-2 outline-none resize-none" style={fieldStyle} />
      </div>
      <div className="flex gap-2 mt-1">
        <button
          onClick={handleSave}
          disabled={!front.trim()}
          className="flex-1 rounded-full py-2.5 text-sm font-medium disabled:opacity-40"
          style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Сохранить")}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-full py-2.5 text-sm"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Отмена")}
        </button>
      </div>
    </div>
  );
}

// Modal for assigning the currently-viewed quote card to one of its own
// decks — pick an existing one, type a new name to create-and-assign, or
// clear the assignment. Same dimmed-backdrop modal pattern used elsewhere
// in the app (VoiceOrKeyboardInput's capture screen).
// Modal for filing the given quote into one or more of its own named
// decks — each deck row toggles membership (tap adds it if the quote
// isn't already there, removes it if it is), or type a new name to
// create a deck and add the quote to it in one step. There's no separate
// "remove" affordance because toggling an already-checked deck row does
// exactly that.
function QuoteDeckPicker({ decks, memberDeckIds, onToggleDeck, onCreateAndAdd, onClose }) {
  const PALETTE = useTheme();
  const t = useT();
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateAndAdd(newName.trim());
    setNewName("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs flex flex-col gap-4 rounded-3xl p-5"
        style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.cardEdge}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.cream, fontSize: "1rem", fontWeight: 500, textAlign: "center" }}>
          {t("Добавить в колоду")}
        </p>

        {decks.length > 0 && (
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {decks.map((deck) => {
              const active = memberDeckIds.includes(deck.id);
              return (
                <button
                  key={deck.id}
                  onClick={() => onToggleDeck(deck.id)}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl text-sm"
                  style={{
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    background: active ? PALETTE.mustard : PALETTE.chip,
                    color: active ? PALETTE.bgDeep : PALETTE.ink,
                    border: `1px solid ${PALETTE.cardEdge}`,
                  }}
                >
                  <span className="truncate">{deck.name}</span>
                  {active && <Check size={15} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.75rem" }}>
            {t("Новая колода")}
          </label>
          <div className="flex items-center gap-2">
            <input
              autoFocus={decks.length === 0}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={t("Название колоды")}
              className="flex-1 min-w-0 rounded-xl px-3 py-2 outline-none text-sm"
              style={{ background: PALETTE.card, color: PALETTE.ink, fontFamily: "'IBM Plex Sans', sans-serif", border: `1px solid ${PALETTE.cardEdge}` }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="p-2.5 rounded-xl disabled:opacity-40 shrink-0"
              style={{ background: PALETTE.mustard, color: PALETTE.bgDeep }}
              aria-label={t("Создать колоду")}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-sm py-2 rounded-full"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {t("Отмена")}
        </button>
      </div>
    </div>
  );
}

// The Cards page for one open deck ("Все цитаты" or a named one) — a
// completely different browsing layout from the language flashcards:
// a single icon-only toolbar up top (position counter, then edit/shuffle/
// font-size/add-to-deck/delete, all equally weighted), the card itself
// (tap to flip, swipe up for the long box — unchanged from Изучение
// языка), and beneath it nothing but the two tap zones for prev/next —
// no visible buttons, no counter duplicated down there, no font control.
function QuoteCardsPage({ items, initialFocusId, onSwipeUpStatus, onEditQuote, onDeleteQuote, onOpenDeckPicker }) {
  const PALETTE = useTheme();
  const t = useT();
  const [orderIds, setOrderIds] = useState(() => items.map((q) => q.id));
  const [pos, setPos] = useState(() => {
    if (!initialFocusId) return 0;
    const idx = items.findIndex((q) => q.id === initialFocusId);
    return idx >= 0 ? idx : 0;
  });
  const [flipped, setFlipped] = useState(false);
  const [rotation, setRotation] = useState(-1.5);
  const [editing, setEditing] = useState(false);
  const [fontStep, setFontStep] = useState(QUOTE_FONT_STEP_DEFAULT);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!items.length) {
    return (
      <p className="text-center px-6 py-16 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        {t("Цитат пока нет в этой колоде.")}
      </p>
    );
  }

  const currentId = orderIds[pos] ?? orderIds[0];
  const item = items.find((q) => q.id === currentId) || items[0];

  const goTo = (newPos) => {
    setRotation((Math.random() - 0.5) * 4);
    setFlipped(false);
    setPos((newPos + orderIds.length) % orderIds.length);
  };
  const goPrev = () => goTo(pos - 1);
  const goNext = () => goTo(pos + 1);

  // Shared by swipe-up and delete: drops the current card out of THIS
  // browsing session's remaining order and lands on whatever's next,
  // exactly like the language deck's moveCurrentToWaiting.
  const removeCurrentFromSession = () => {
    const removedId = item.id;
    const nextOrder = orderIds.filter((id) => id !== removedId);
    setOrderIds(nextOrder);
    setPos((p) => Math.min(p, Math.max(nextOrder.length - 1, 0)));
    setFlipped(false);
  };

  const handleSwipeUp = () => {
    onSwipeUpStatus(item.id);
    removeCurrentFromSession();
  };

  const handleShuffle = () => {
    setOrderIds((ids) => shuffleArr(ids));
    setPos(0);
    setFlipped(false);
    setRotation((Math.random() - 0.5) * 4);
  };

  const saveEdit = (fields) => {
    onEditQuote(item.id, fields);
    setEditing(false);
    setFlipped(false);
  };

  const confirmAndDelete = () => {
    onDeleteQuote(item.id);
    setConfirmDelete(false);
    removeCurrentFromSession();
  };

  return (
    <div className="flex flex-col items-center px-6">
      <div className="w-full max-w-md flex items-center gap-2 mb-4">
        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.85rem", whiteSpace: "nowrap" }}>
          {pos + 1} / {orderIds.length}
        </span>
        <span className="shrink-0" style={{ width: "1px", height: "20px", background: PALETTE.cardEdge }} />
        <div className="flex-1 flex items-center justify-end gap-1.5">
          <QuoteIconButton onClick={() => setEditing((e) => !e)} active={editing} label={t("Редактировать карточку")}>
            <Pencil size={15} />
          </QuoteIconButton>
          <QuoteIconButton onClick={handleShuffle} label={t("перемешать колоду")}>
            <Shuffle size={15} />
          </QuoteIconButton>
          <QuoteIconButton onClick={() => setFontStep((s) => Math.max(0, s - 1))} label={t("Уменьшить размер текста")}>
            <Minus size={15} />
          </QuoteIconButton>
          <QuoteIconButton onClick={() => setFontStep((s) => Math.min(QUOTE_FONT_STEPS.length - 1, s + 1))} label={t("Увеличить размер текста")}>
            <Plus size={15} />
          </QuoteIconButton>
          <QuoteIconButton onClick={() => onOpenDeckPicker(item.id)} label={t("Добавить в колоду")}>
            <Folder size={15} />
          </QuoteIconButton>
          <QuoteIconButton onClick={() => setConfirmDelete(true)} label={t("Удалить карточку")} danger>
            <Trash2 size={15} />
          </QuoteIconButton>
        </div>
      </div>

      {confirmDelete && (
        <div
          className="w-full max-w-md flex items-center justify-between gap-2 mb-4 px-4 py-2.5 rounded-2xl"
          style={{ background: "rgba(217,60,60,0.1)", border: `1px solid ${PALETTE.danger}` }}
        >
          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger, fontSize: "0.85rem" }}>
            {t("Удалить эту карточку навсегда?")}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={confirmAndDelete} className="text-xs px-3 py-1.5 rounded-full" style={{ background: PALETTE.danger, color: "#fff" }}>
              {t("Да")}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: PALETTE.chip, color: PALETTE.fadeText }}
            >
              {t("Отмена")}
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <QuoteForm initial={item} onSave={saveEdit} onCancel={() => setEditing(false)} />
      ) : (
        <div
          className="w-full max-w-md rounded-3xl px-4 pt-6 pb-4 flex flex-col items-center"
          style={{
            background: PALETTE.card,
            boxShadow: `inset 4px 4px 10px ${PALETTE.shadowDark}, inset -4px -4px 10px ${PALETTE.shadowLight}`,
            border: `1px solid ${PALETTE.cardEdge}`,
          }}
        >
          <QuoteCard key={item.id} item={item} flipped={flipped} onFlip={() => setFlipped((f) => !f)} rotation={rotation} fontStep={fontStep} onSwipeUp={handleSwipeUp} />

          {/* Bottom zone is tap zones only — no counter, no buttons: the
              whole area splits into a left/right half, each fully
              tappable (not just the small chevron hint inside it). */}
          <div className="relative w-full" style={{ marginTop: "20px", height: "170px" }}>
            <button onClick={goPrev} aria-label={t("Предыдущая")} className="absolute inset-y-0 left-0 w-1/2" />
            <button onClick={goNext} aria-label={t("Следующая")} className="absolute inset-y-0 right-0 w-1/2" />
            <ChevronLeft
              size={24}
              strokeWidth={2}
              className="pointer-events-none"
              style={{ position: "absolute", top: "50%", left: "17%", transform: "translate(-50%, -50%)", color: PALETTE.fadeText }}
            />
            <ChevronRight
              size={24}
              strokeWidth={2}
              className="pointer-events-none"
              style={{ position: "absolute", top: "50%", right: "17%", transform: "translate(50%, -50%)", color: PALETTE.fadeText }}
            />
            <div className="absolute pointer-events-none" style={{ left: "50%", transform: "translateX(-50%)", top: 0, bottom: 0, width: "4px" }}>
              <div style={{ height: "50%", width: "100%", background: PALETTE.fadeText, clipPath: "polygon(50% 0%, 0 100%, 100% 100%)" }} />
              <div style={{ height: "50%", width: "100%", background: PALETTE.fadeText, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The "Список" page for one open deck — Gmail-style: every quote is its
// own full-width row sized to its own content (not clamped/truncated, not
// a fixed tile height), newest concerns first. Tapping a row jumps into
// Cards already focused on that quote; the small Folder icon on each row
// reaches the same "add to deck" picker Cards has, without needing to
// open the card first.
function QuoteListPage({ items, onOpenCard, onOpenDeckPicker }) {
  const PALETTE = useTheme();
  const t = useT();

  if (!items.length) {
    return (
      <p className="text-center px-6 py-16 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        {t("Цитат пока нет в этой колоде.")}
      </p>
    );
  }

  return (
    <div className="w-full flex flex-col">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onOpenCard(item.id)}
          className="w-full px-6 py-5 flex items-start justify-between gap-3 cursor-pointer"
          style={{ borderBottom: `1px solid ${PALETTE.cardEdge}` }}
        >
          <div className="min-w-0 flex-1">
            <p
              className="whitespace-pre-wrap"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 400, color: PALETTE.ink, fontSize: "1.05rem", lineHeight: 1.4 }}
            >
              {item.front}
            </p>
            {item.back && (
              <p
                className="whitespace-pre-wrap mt-1.5"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.85rem", lineHeight: 1.4 }}
              >
                {item.back}
              </p>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDeckPicker(item.id);
            }}
            aria-label={t("Добавить в колоду")}
            title={t("Добавить в колоду")}
            className="shrink-0 p-1.5 rounded-full"
            style={{ color: PALETTE.fadeText }}
          >
            <Folder size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// One open deck's screen: two pages — Список (Part 5) and Cards (Part 3)
// — switchable both by tapping the tab buttons and by a horizontal swipe
// anywhere in the content area, looped in both directions (with only two
// pages, "further the same way" and "the other way" both just mean "the
// other page", so a plain toggle already satisfies the loop). The pages
// are never mounted at the same time — switching to Cards always remounts
// it fresh, which is also how it re-seeds its position from focusQuoteId
// whenever Список hands it a specific card to jump to.
function QuoteDeckScreen({ deckName, items, quoteDecks, onEditQuote, onSwipeUpStatus, onDeleteQuote, onBack }) {
  const PALETTE = useTheme();
  const t = useT();
  const [page, setPage] = useState("list");
  const [focusQuoteId, setFocusQuoteId] = useState(null);
  const [pickerQuoteId, setPickerQuoteId] = useState(null);

  const swipeRef = useRef({ startX: 0, startY: 0, active: false });
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      swipeRef.current = { startX: touch.clientX, startY: touch.clientY, active: true };
    };
    const onTouchMove = (e) => {
      if (!swipeRef.current.active || !e.touches[0]) return;
      const dx = e.touches[0].clientX - swipeRef.current.startX;
      const dy = e.touches[0].clientY - swipeRef.current.startY;
      // Only claims the gesture once it's unambiguously horizontal, so a
      // vertical drag (scrolling Список, or a card's own flip/swipe-up)
      // is left completely alone.
      if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10) e.preventDefault();
    };
    const onTouchEnd = (e) => {
      if (!swipeRef.current.active) return;
      swipeRef.current.active = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeRef.current.startX;
      const dy = touch.clientY - swipeRef.current.startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        setPage((p) => (p === "list" ? "cards" : "list"));
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const memberDeckIds = pickerQuoteId ? quoteDecks.decks.filter((d) => d.quoteIds.includes(pickerQuoteId)).map((d) => d.id) : [];

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <HomeButton onClick={onBack} />
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <h2
          className="text-center mb-5 truncate px-10"
          style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.4rem" }}
        >
          {deckName}
        </h2>
        <div className="flex gap-2 mb-2">
          {[
            { key: "list", label: t("Список") },
            { key: "cards", label: t("Карточки") },
          ].map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setPage(tabItem.key)}
              className="flex-1 text-xs py-2 rounded-full"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                background: page === tabItem.key ? PALETTE.mustard : PALETTE.chip,
                color: page === tabItem.key ? PALETTE.bgDeep : PALETTE.fadeText,
              }}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="pt-6">
        {page === "list" ? (
          <QuoteListPage
            items={items}
            onOpenCard={(id) => {
              setFocusQuoteId(id);
              setPage("cards");
            }}
            onOpenDeckPicker={setPickerQuoteId}
          />
        ) : (
          <QuoteCardsPage
            key={focusQuoteId || "start"}
            items={items}
            initialFocusId={focusQuoteId}
            onSwipeUpStatus={onSwipeUpStatus}
            onEditQuote={onEditQuote}
            onDeleteQuote={onDeleteQuote}
            onOpenDeckPicker={setPickerQuoteId}
          />
        )}
      </div>

      {pickerQuoteId && (
        <QuoteDeckPicker
          decks={quoteDecks.decks}
          memberDeckIds={memberDeckIds}
          onToggleDeck={(deckId) => {
            if (memberDeckIds.includes(deckId)) quoteDecks.removeQuoteFromDeck(deckId, pickerQuoteId);
            else quoteDecks.addQuoteToDeck(deckId, pickerQuoteId);
          }}
          onCreateAndAdd={(name) => quoteDecks.addDeck(name, [pickerQuoteId])}
          onClose={() => setPickerQuoteId(null)}
        />
      )}
    </div>
  );
}

// Дашборд раздела "Мои цитаты" — Gmail-style: full-width rows stacked
// vertically, not the 2-column tile grid Изучение языка uses. "+ New
// deck" is first (a slim row, just tall enough for the control), then the
// permanent "Все цитаты" deck (every quote, always — nothing to create or
// delete), then whatever named decks exist. Every deck row (Все цитаты
// included) is the same fixed height regardless of name length.
function QuotesDashboard({ quotes, quoteDecks, onOpen }) {
  const PALETTE = useTheme();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const submitCreate = () => {
    if (!nameDraft.trim()) return;
    const id = quoteDecks.addDeck(nameDraft);
    setNameDraft("");
    setCreating(false);
    if (id) onOpen(id);
  };

  const countActive = (ids) => quotes.filter((q) => ids.includes(q.id) && q.status === "active").length;
  const countWaiting = (ids) => quotes.filter((q) => ids.includes(q.id) && q.status === "waiting").length;
  const allIds = quotes.map((q) => q.id);

  // Flat, edge-to-edge rows with a hairline divider between them — no
  // per-row card, shadow, border, or gap. That's the actual Gmail inbox
  // look: rows read as one continuous list, not a stack of separate cards.
  const rowDividerStyle = { borderBottom: `1px solid ${PALETTE.cardEdge}` };

  const DeckRow = ({ id, name, Icon, iconColor, ids }) => (
    <button onClick={() => onOpen(id)} className="w-full px-2 py-4 flex items-center gap-3 text-left" style={rowDividerStyle}>
      <span className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: PALETTE.chip }}>
        <Icon size={17} style={{ color: iconColor }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate" style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.05rem" }}>
          {name}
        </p>
        <p className="truncate" style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.75rem" }}>
          <span style={{ color: PALETTE.mintDeep }}>{t("N активных", countActive(ids))}</span>
          {" · "}
          <span style={{ color: PALETTE.waiting }}>{t("N в долгом ящике", countWaiting(ids))}</span>
        </p>
      </div>
    </button>
  );

  return (
    <div className="w-full max-w-md mx-auto px-4 flex flex-col">
      {creating ? (
        <div className="px-2 py-3 flex items-center gap-2" style={rowDividerStyle}>
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCreate()}
            placeholder={t("Название колоды")}
            className="flex-1 min-w-0 rounded-xl px-3 py-2 outline-none text-sm"
            style={{ background: PALETTE.chip, color: PALETTE.ink, fontFamily: "'IBM Plex Sans', sans-serif", border: `1px solid ${PALETTE.cardEdge}` }}
          />
          <button
            onClick={submitCreate}
            disabled={!nameDraft.trim()}
            aria-label={t("Создать колоду")}
            className="p-2.5 rounded-xl disabled:opacity-40 shrink-0"
            style={{ background: PALETTE.mustard, color: PALETTE.bgDeep }}
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setNameDraft("");
            }}
            aria-label={t("Отмена")}
            className="p-2.5 rounded-xl shrink-0"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText }}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="w-full px-2 py-4 flex items-center gap-3" style={rowDividerStyle}>
          <span className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: PALETTE.chip }}>
            <Plus size={18} style={{ color: PALETTE.mustard }} />
          </span>
          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.95rem" }}>{t("Новая колода")}</span>
        </button>
      )}

      <DeckRow id={ALL_QUOTES_DECK_ID} name={t("Все цитаты")} Icon={Quote} iconColor={PALETTE.mustard} ids={allIds} />

      {quoteDecks.decks.map((deck) => (
        <DeckRow key={deck.id} id={deck.id} name={deck.name} Icon={Folder} iconColor={PALETTE.ink} ids={deck.quoteIds} />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// App shell — theme, mode switch, routing between the six modes
// ════════════════════════════════════════════════════════════════════════

function ModeSwitch({ mode, onChange }) {
  const PALETTE = useTheme();
  const t = useT();
  const allOptions = [
    { key: "language", label: t("Изучение языка"), Icon: Languages },
    { key: "focus", label: t("Мои цели"), Icon: Target },
    { key: "pages", label: "Pages", Icon: BookOpen },
    { key: "words", label: t("Слово"), Icon: BookMarked },
    { key: "vocabulary", label: "Vocabulary", Icon: Highlighter },
    { key: "quotes", label: t("Мои цитаты"), Icon: Quote },
    { key: "specs", label: t("Спецификации"), Icon: NotebookPen },
    { key: "videos", label: t("Видео"), Icon: Video },
    { key: "atoms", label: t("Атомы"), Icon: Atom },
    { key: "prayers", label: t("Молитвы"), Icon: BookHeart },
  ];
  const options = ONLY_PRAYERS ? allOptions.filter((o) => o.key === "prayers") : allOptions;
  return (
    <div className="flex gap-2 p-1 rounded-full mb-8 flex-wrap justify-center" style={{ background: PALETTE.chip }}>
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm"
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            background: mode === key ? PALETTE.mustard : "transparent",
            color: mode === key ? PALETTE.bgDeep : PALETTE.fadeText,
          }}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}

// Catches any render-time crash anywhere below it and shows a recovery
// screen instead of an unhandled error taking the whole page to a blank
// white screen (the default outcome for an uncaught render error in
// React, with nothing else here to catch it). This has real teeth: a
// crash caused by stale/malformed data in localStorage — the kind that
// doesn't go away on its own — would otherwise repeat on every single
// reload, including a PWA relaunch, since nothing else clears it. Must be
// a class component; React has no hook equivalent for error boundaries.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Render error caught by ErrorBoundary:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const wipeAndReload = () => {
      try {
        localStorage.clear();
      } catch (e) {}
      window.location.reload();
    };
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: "#E8ECF1", fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        <p style={{ color: "#2E3742", fontSize: "1.1rem" }}>Что-то пошло не так</p>
        <p style={{ color: "#7B8794", fontSize: "0.85rem", maxWidth: "320px" }}>
          Приложение столкнулось с ошибкой и не может продолжить. Попробуй обновить страницу — если это не помогает
          (ошибка повторяется сразу же), можно сбросить данные приложения, но это удалит все колоды, карточки и молитвы,
          сохранённые только на этом устройстве.
        </p>
        <p style={{ color: "#AEB8BE", fontSize: "0.7rem", maxWidth: "320px", wordBreak: "break-word" }}>
          {String(this.state.error?.message || this.state.error)}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-full text-sm"
            style={{ background: "#3D4652", color: "#F7F9FB" }}
          >
            Обновить страницу
          </button>
          <button onClick={wipeAndReload} className="px-5 py-2.5 rounded-full text-sm" style={{ background: "#D93C3C", color: "#fff" }}>
            Сбросить данные
          </button>
        </div>
      </div>
    );
  }
}

function AppInner() {
  const { decks, setDeckItems, addDeck, renameDeck, deleteDeck, refresh: refreshDecks } = useDecks();
  const { goals, addGoal, renameGoal, deleteGoal, setGoalChildren, refresh: refreshGoals } = useGoals();
  const { texts, addText, updateText, deleteText, refresh: refreshPages } = useTextDocs("pages-texts-v1");
  const { texts: words, addText: addWord, updateText: updateWord, deleteText: deleteWord, refresh: refreshWords } = useTextDocs("words-docs-v1");
  const vocab = useVocabulary();
  const quotes = useQuotes();
  const quoteDecks = useQuoteDecks();
  const { texts: specs, addText: addSpec, deleteTexts: deleteSpecs, refresh: refreshSpecs } = useTextDocs("specs-v1");
  const { videos, addVideo, updateVideo, deleteVideo, refresh: refreshVideos } = useVideos();
  const { roots: atomRoots, createRoot: createAtomRoot, updateNode: updateAtomNode, deleteNode: deleteAtomNode, refresh: refreshAtoms } = useAtomForest();
  const { prayers, addPrayer, updatePrayer, deletePrayer, refresh: refreshPrayers } = usePrayers();
  const [mode, setMode] = useState(ONLY_PRAYERS ? "prayers" : "language");

  // Dispatches the shared header's "Обновить" button to whichever
  // section's own data-loading function matches the mode currently on
  // screen — the button itself lives once in the shared dashboard header,
  // but what it re-fetches is always contextual to where the user is.
  const refreshCurrent = useCallback(() => {
    const byMode = {
      language: refreshDecks,
      focus: refreshGoals,
      pages: refreshPages,
      words: refreshWords,
      vocabulary: vocab.refresh,
      quotes: () => {
        quotes.refresh();
        quoteDecks.refresh();
      },
      specs: refreshSpecs,
      videos: refreshVideos,
      atoms: refreshAtoms,
      prayers: refreshPrayers,
    };
    (byMode[mode] || (() => {}))();
  }, [
    mode,
    refreshDecks,
    refreshGoals,
    refreshPages,
    refreshWords,
    vocab.refresh,
    quotes.refresh,
    quoteDecks.refresh,
    refreshSpecs,
    refreshVideos,
    refreshAtoms,
    refreshPrayers,
  ]);
  const [openDeckId, setOpenDeckId] = useState(null);
  const [openGoalId, setOpenGoalId] = useState(null);
  const [openAtomRootId, setOpenAtomRootId] = useState(null);
  const [openQuoteDeckId, setOpenQuoteDeckId] = useState(null);
  const [openPrayerId, setOpenPrayerId] = useState(null);
  const [prayerCreating, setPrayerCreating] = useState(false);
  const [openTextId, setOpenTextId] = useState(null);
  const [pagesCreating, setPagesCreating] = useState(false);
  const [pagesEditingId, setPagesEditingId] = useState(null);
  const [openWordId, setOpenWordId] = useState(null);
  const [wordCreating, setWordCreating] = useState(false);
  const [wordEditingId, setWordEditingId] = useState(null);
  const [openSpecId, setOpenSpecId] = useState(null);
  const [openVideoId, setOpenVideoId] = useState(null);
  const [videoCreating, setVideoCreating] = useState(false);
  const [videoEditingId, setVideoEditingId] = useState(null);
  const [isDark, setIsDark] = useState(false);
  const [showTranscription, setShowTranscriptionRaw] = useState(false);
  const [reversed, setReversedRaw] = useState(false);
  const [lang, setLangRaw] = useState("ru");
  const [resumeCardPosition, setResumeCardPositionRaw] = useState(true);
  const navRestored = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("app-mode-v1", false);
        const allowedModes = ONLY_PRAYERS ? ["prayers"] : ["language", "focus", "pages", "words", "vocabulary", "quotes", "specs", "videos", "atoms", "prayers"];
        if (!cancelled && res && allowedModes.includes(res.value)) setMode(res.value);
      } catch (e) {}
      try {
        const res = await window.storage.get("theme-v1", false);
        if (!cancelled && res && (res.value === "dark" || res.value === "light")) setIsDark(res.value === "dark");
      } catch (e) {}
      try {
        const res = await window.storage.get("transcription-v1", false);
        if (!cancelled && res && (res.value === "on" || res.value === "off")) setShowTranscriptionRaw(res.value === "on");
      } catch (e) {}
      try {
        const res = await window.storage.get("reverse-v1", false);
        if (!cancelled && res && (res.value === "on" || res.value === "off")) setReversedRaw(res.value === "on");
      } catch (e) {}
      try {
        const res = await window.storage.get("prayer-resume-position-v1", false);
        if (!cancelled && res && (res.value === "on" || res.value === "off")) setResumeCardPositionRaw(res.value === "on");
      } catch (e) {}
      try {
        const res = await window.storage.get("language-v1", false);
        if (!cancelled && res && (res.value === "ru" || res.value === "en")) setLangRaw(res.value);
      } catch (e) {}
      // Restores exactly which item was open (deck/goal/prayer/text/etc.)
      // so a reload — pull-to-refresh, a manual browser refresh, or the PWA
      // simply relaunching — lands back on the same screen instead of that
      // section's dashboard. overscroll-behavior in index.css is a
      // best-effort attempt to stop the reload gesture itself, but it isn't
      // honored identically by every browser/WebView, so this restoration
      // is the layer that actually guarantees the requirement regardless of
      // whether the gesture was suppressed.
      try {
        const res = await window.storage.get("app-nav-v1", false);
        if (!cancelled && res && res.value) {
          const nav = JSON.parse(res.value);
          if (nav.openDeckId) setOpenDeckId(nav.openDeckId);
          if (nav.openGoalId) setOpenGoalId(nav.openGoalId);
          if (nav.openAtomRootId) setOpenAtomRootId(nav.openAtomRootId);
          if (nav.openQuoteDeckId) setOpenQuoteDeckId(nav.openQuoteDeckId);
          if (nav.openPrayerId) setOpenPrayerId(nav.openPrayerId);
          if (nav.openTextId) setOpenTextId(nav.openTextId);
          if (nav.openWordId) setOpenWordId(nav.openWordId);
          if (nav.openSpecId) setOpenSpecId(nav.openSpecId);
          if (nav.openVideoId) setOpenVideoId(nav.openVideoId);
        }
      } catch (e) {}
      // Only after this restoration attempt has actually finished (whether
      // it found something or not) is it safe to let the persist effect
      // below start writing — otherwise its very first run, still holding
      // every id at its useState(null) default, fires before this async
      // restore resolves and overwrites the just-read value with nulls,
      // permanently losing it before it's ever applied.
      if (!cancelled) navRestored.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persists the navigation blob restored above on every change, so the
  // very next reload (from any cause) always has an up-to-date screen to
  // come back to.
  useEffect(() => {
    if (!navRestored.current) return;
    window.storage
      .set(
        "app-nav-v1",
        JSON.stringify({
          openDeckId,
          openGoalId,
          openAtomRootId,
          openQuoteDeckId,
          openPrayerId,
          openTextId,
          openWordId,
          openSpecId,
          openVideoId,
        }),
        false
      )
      .catch(() => {});
  }, [openDeckId, openGoalId, openAtomRootId, openQuoteDeckId, openPrayerId, openTextId, openWordId, openSpecId, openVideoId]);

  const setShowTranscription = useCallback((next) => {
    setShowTranscriptionRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      window.storage.set("transcription-v1", value ? "on" : "off", false).catch(() => {});
      return value;
    });
  }, []);

  const setReversed = useCallback((next) => {
    setReversedRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      window.storage.set("reverse-v1", value ? "on" : "off", false).catch(() => {});
      return value;
    });
  }, []);

  const toggleResumeCardPosition = useCallback(() => {
    setResumeCardPositionRaw((prev) => {
      const value = !prev;
      window.storage.set("prayer-resume-position-v1", value ? "on" : "off", false).catch(() => {});
      return value;
    });
  }, []);

  const toggleLanguage = useCallback(() => {
    setLangRaw((prev) => {
      const next = prev === "ru" ? "en" : "ru";
      window.storage.set("language-v1", next, false).catch(() => {});
      return next;
    });
  }, []);

  // App() provides LanguageContext but can't consume its own Provider, so
  // it builds `t` straight from local `lang` state instead of useT().
  const t = useCallback((key, ...args) => translate(lang, key, ...args), [lang]);

  const theme = isDark ? DARK_PALETTE : LIGHT_PALETTE;

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.bg);
    // body itself has no background of its own (see index.css) — any
    // screen whose fixed-height container comes up even a pixel short of
    // the real device viewport (a keyboard-open/close transition frame,
    // a visualViewport resize event that fires late, etc.) exposes the
    // browser's default white page background through the gap. Keeping
    // body's background locked to the current theme means that gap reads
    // as "our own background", not a stray white/blank area.
    document.body.style.background = theme.bg;
  }, [theme.bg]);

  const changeMode = (next) => {
    setMode(next);
    window.storage.set("app-mode-v1", next, false).catch(() => {});
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    window.storage.set("theme-v1", next ? "dark" : "light", false).catch(() => {});
  };

  const openDeck = decks.find((d) => d.id === openDeckId) || null;
  const deckAdapter = openDeck
    ? { items: openDeck.items, setItems: (items) => setDeckItems(openDeck.id, items) }
    : null;
  const openGoal = goals.find((g) => g.id === openGoalId) || null;
  const openAtomRoot = atomRoots.find((r) => r.id === openAtomRootId) || null;
  const openPrayer = prayers.find((p) => p.id === openPrayerId) || null;
  const openText = texts.find((t) => t.id === openTextId) || null;
  const editingText = texts.find((t) => t.id === pagesEditingId) || null;
  const openWord = words.find((w) => w.id === openWordId) || null;
  const editingWord = words.find((w) => w.id === wordEditingId) || null;
  const openSpec = specs.find((s) => s.id === openSpecId) || null;
  const openVideo = videos.find((v) => v.id === openVideoId) || null;
  const editingVideo = videos.find((v) => v.id === videoEditingId) || null;

  return (
    <ThemeContext.Provider value={theme}>
    <TranscriptionContext.Provider value={[showTranscription, setShowTranscription]}>
    <ReversedContext.Provider value={[reversed, setReversed]}>
    <LanguageContext.Provider value={[lang, toggleLanguage]}>
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <style>{FONT_IMPORT}</style>
        {/* dlya-babosha has no Vocabulary/Quotes sections to add into, so
            this never renders there — main Focus is unaffected. */}
        {!ONLY_PRAYERS && <SelectionCapture onAddVocab={vocab.addEntry} onAddQuote={quotes.addFromSelection} />}

        {mode === "atoms" && openAtomRoot ? (
          <AtomTreeScreen
            root={openAtomRoot}
            onUpdateNode={updateAtomNode}
            onDeleteNode={deleteAtomNode}
            onHome={() => setOpenAtomRootId(null)}
            isDark={isDark}
            onToggleTheme={toggleTheme}
          />
        ) : mode === "prayers" && openPrayer ? (
          <PrayerScreen
            prayer={openPrayer}
            onBack={() => setOpenPrayerId(null)}
            onUpdate={updatePrayer}
            onDelete={(id) => {
              deletePrayer(id);
              setOpenPrayerId(null);
            }}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            resumeCardPosition={resumeCardPosition}
            onToggleResumeCardPosition={toggleResumeCardPosition}
          />
        ) : mode === "quotes" && openQuoteDeckId ? (
          <QuoteDeckScreen
            deckName={openQuoteDeckId === ALL_QUOTES_DECK_ID ? t("Все цитаты") : quoteDecks.decks.find((d) => d.id === openQuoteDeckId)?.name || ""}
            items={
              openQuoteDeckId === ALL_QUOTES_DECK_ID
                ? quotes.quotes
                : quotes.quotes.filter((q) => (quoteDecks.decks.find((d) => d.id === openQuoteDeckId)?.quoteIds || []).includes(q.id))
            }
            quoteDecks={quoteDecks}
            onEditQuote={(id, fields) => quotes.setItems(quotes.quotes.map((q) => (q.id === id ? { ...q, ...fields } : q)))}
            onSwipeUpStatus={(id) => quotes.setItems(quotes.quotes.map((q) => (q.id === id ? { ...q, status: "waiting" } : q)))}
            onDeleteQuote={(id) => {
              quotes.setItems(quotes.quotes.filter((q) => q.id !== id));
              quoteDecks.removeQuoteEverywhere(id);
            }}
            onBack={() => setOpenQuoteDeckId(null)}
          />
        ) : mode === "prayers" && prayerCreating ? (
          <PrayerCreateScreen
            onCancel={() => setPrayerCreating(false)}
            onSave={(title, langKey) => {
              const id = addPrayer(title, langKey);
              setPrayerCreating(false);
              if (id) setOpenPrayerId(id);
            }}
          />
        ) : mode === "pages" && openText ? (
          <PagesReader text={openText} onBack={() => setOpenTextId(null)} isDark={isDark} onToggleTheme={toggleTheme} />
        ) : mode === "pages" && (pagesCreating || editingText) ? (
          <PagesFormScreen
            initial={editingText}
            onCancel={() => {
              setPagesCreating(false);
              setPagesEditingId(null);
            }}
            onSave={(title, body) => {
              if (editingText) updateText(editingText.id, title, body);
              else addText(title, body);
              setPagesCreating(false);
              setPagesEditingId(null);
            }}
          />
        ) : mode === "words" && openWord ? (
          <WordView text={openWord} onBack={() => setOpenWordId(null)} isDark={isDark} onToggleTheme={toggleTheme} />
        ) : mode === "words" && (wordCreating || editingWord) ? (
          <PagesFormScreen
            initial={editingWord}
            titlePlaceholder={t("Название слова")}
            bodyPlaceholder={t(
              "Разметка: «## Заголовок» — новая вкладка; обычная строка — карточка (english - перевод - транскрипция - контекст); строка с «>» — пример-потомок предыдущей карточки"
            )}
            onCancel={() => {
              setWordCreating(false);
              setWordEditingId(null);
            }}
            onSave={(title, body) => {
              if (editingWord) updateWord(editingWord.id, title, body);
              else addWord(title, body);
              setWordCreating(false);
              setWordEditingId(null);
            }}
          />
        ) : mode === "language" && openDeck ? (
          <DeckHome
            deckId={openDeck.id}
            title={openDeck.name}
            deck={deckAdapter}
            onBack={() => setOpenDeckId(null)}
            onRename={renameDeck}
            onDelete={(id) => {
              deleteDeck(id);
              setOpenDeckId(null);
            }}
            isDark={isDark}
            onToggleTheme={toggleTheme}
          />
        ) : mode === "focus" && openGoal ? (
          <GoalHome
            goal={openGoal}
            onBack={() => setOpenGoalId(null)}
            onRename={renameGoal}
            onDelete={(id) => {
              deleteGoal(id);
              setOpenGoalId(null);
            }}
            onSetChildren={setGoalChildren}
            isDark={isDark}
            onToggleTheme={toggleTheme}
          />
        ) : mode === "specs" && openSpec ? (
          <SpecViewScreen spec={openSpec} onBack={() => setOpenSpecId(null)} />
        ) : mode === "videos" && openVideo ? (
          <VideoPlayerScreen video={openVideo} onBack={() => setOpenVideoId(null)} isDark={isDark} onToggleTheme={toggleTheme} />
        ) : mode === "videos" && (videoCreating || editingVideo) ? (
          <VideoFormScreen
            initial={editingVideo}
            onCancel={() => {
              setVideoCreating(false);
              setVideoEditingId(null);
            }}
            onSave={(url, body) => {
              const ok = editingVideo ? updateVideo(editingVideo.id, url, body) : addVideo(url, body);
              if (ok) {
                setVideoCreating(false);
                setVideoEditingId(null);
              }
              return ok;
            }}
          />
        ) : (
          <div className="min-h-screen flex flex-col items-center px-6 py-16" style={{ background: `radial-gradient(circle at 50% 0%, ${theme.bgGlow}, ${theme.bg})` }}>
            <div className="text-center mb-2">
              <p className="text-sm mb-2 tracking-widest uppercase" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: theme.mint }}>
                {t("Small pieces. Big change.")}
              </p>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: theme.cream, fontSize: "2.4rem" }}>
                {mode === "language"
                  ? t("Твои колоды")
                  : mode === "focus"
                  ? t("Твои цели")
                  : mode === "words"
                  ? t("Твои слова")
                  : mode === "vocabulary"
                  ? "Vocabulary"
                  : mode === "quotes"
                  ? t("Мои цитаты")
                  : mode === "specs"
                  ? t("Спецификации")
                  : mode === "videos"
                  ? t("Твои видео")
                  : mode === "atoms"
                  ? t("Твои атомы")
                  : mode === "prayers"
                  ? t("Твои молитвы")
                  : t("Твои тексты")}
              </h1>
            </div>

            <div className="w-full flex justify-end max-w-lg gap-2">
              <LanguageToggle lang={lang} onToggle={toggleLanguage} />
              <RefreshButton onRefresh={refreshCurrent} />
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
            </div>

            <ModeSwitch mode={mode} onChange={changeMode} />

            {mode === "prayers" && (
              <div className="w-full max-w-lg px-4 pt-6 pb-2">
                <BasmalaWatermark />
              </div>
            )}

            {mode === "language" ? (
              <LanguageDashboard decks={decks} onOpen={setOpenDeckId} onAddDeck={addDeck} />
            ) : mode === "focus" ? (
              <FocusDashboard goals={goals} onOpen={setOpenGoalId} onAddGoal={addGoal} />
            ) : mode === "words" ? (
              <PagesList
                texts={words}
                onOpen={setOpenWordId}
                onCreate={() => setWordCreating(true)}
                onEdit={setWordEditingId}
                onDelete={deleteWord}
                emptyText={t("Слов пока нет. Добавь первое — с разметкой «## / > ».")}
                createLabel={t("Новое слово")}
                rowIcon={BookMarked}
              />
            ) : mode === "vocabulary" ? (
              <VocabularyList entries={vocab.entries} onDelete={vocab.deleteEntry} onClearAll={vocab.clearAll} />
            ) : mode === "quotes" ? (
              <QuotesDashboard quotes={quotes.quotes} quoteDecks={quoteDecks} onOpen={setOpenQuoteDeckId} />
            ) : mode === "specs" ? (
              <SpecsList
                specs={specs}
                onOpen={setOpenSpecId}
                onDeleteSelected={deleteSpecs}
                onSaveNew={(body) => addSpec(deriveSpecTitle(body, specs.map((s) => s.title)), body)}
              />
            ) : mode === "videos" ? (
              <PagesList
                texts={videos}
                onOpen={setOpenVideoId}
                onCreate={() => setVideoCreating(true)}
                onEdit={setVideoEditingId}
                onDelete={deleteVideo}
                emptyText={t("Видео пока нет. Добавь первое по ссылке.")}
                createLabel={t("Добавить видео")}
                rowIcon={Video}
              />
            ) : mode === "atoms" ? (
              <AtomsDashboard roots={atomRoots} onOpen={setOpenAtomRootId} onCreateRoot={createAtomRoot} />
            ) : mode === "prayers" ? (
              <PagesList
                texts={prayers.map((p) => ({ ...p, body: t(PRAYER_TRANSCRIPTION_LANGS.find((l) => l.key === p.transcriptionLang)?.label || "") }))}
                onOpen={setOpenPrayerId}
                onCreate={() => setPrayerCreating(true)}
                onEdit={setOpenPrayerId}
                onDelete={deletePrayer}
                emptyText={t("Молитв пока нет. Добавь первую.")}
                createLabel={t("Добавить молитву")}
                rowIcon={BookHeart}
              />
            ) : (
              <PagesList
                texts={texts}
                onOpen={setOpenTextId}
                onCreate={() => setPagesCreating(true)}
                onEdit={setPagesEditingId}
                onDelete={deleteText}
              />
            )}
          </div>
        )}
      </div>
    </LanguageContext.Provider>
    </ReversedContext.Provider>
    </TranscriptionContext.Provider>
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
