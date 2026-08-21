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

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');`;

// "Лавандовый рассвет" — the light theme. bgDeep doubles as textOnAccent
// (the accent, mustard, is now a saturated purple, so text on top of it
// needs to be light rather than the dark charcoal earlier themes used).
const LIGHT_PALETTE = {
  bg: "#F1EEFB",
  bgGlow: "#FAF8FF",
  chip: "#EDE9FB",
  bgDeep: "#FFFFFF",
  card: "#FFFFFF",
  cardEdge: "#DCD2F0",
  cardHighlight: "rgba(255,255,255,0.8)",
  ink: "#2A0E4E",
  mint: "#9C5FC7",
  mintDeep: "#5B2578",
  mustard: "#7B3FA0",
  fadeText: "#6A2C70",
  cream: "#2A0E4E",
  waiting: "#8A6FA0",
  danger: "#C1502E",
};

// "Густой бархат" — the dark theme. Every card-style surface (elevated
// tiles, flashcards, the Pages reading surface, form fields) inverts along
// with everything else: dark fill, light text — same rule the list-row
// "chip" surfaces already followed, now applied without exception.
const DARK_PALETTE = {
  bg: "#0F0518",
  bgGlow: "#1B0C2E",
  chip: "#241040",
  bgDeep: "#150826",
  card: "#2E1652",
  cardEdge: "#D0BAE8",
  cardHighlight: "rgba(255,255,255,0.08)",
  ink: "#EDE4FA",
  mint: "#C3A6FF",
  mintDeep: "#C3A6FF",
  mustard: "#9D7BFF",
  fadeText: "#B794F4",
  cream: "#EDE4FA",
  waiting: "#AC9BC7",
  danger: "#C1502E",
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("decks-v1", false);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed)) setDecks(parsed);
        }
      } catch (e) {
        // nothing saved yet — keep the empty start
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return { decks, setDeckItems, addDeck, renameDeck, deleteDeck };
}

// ---- Card: tap (native onClick) flips it, touch-drag upward sends it to the long box ----
function IndexCard({ item, flipped, onFlip, rotation, showTranscription, onSwipeUp, reversed }) {
  const PALETTE = useTheme();
  const showEnglishSide = reversed ? flipped : !flipped;
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startY: 0, startX: 0, suppressClick: false });

  const onTouchStart = (e) => {
    const t = e.touches[0];
    drag.current.startY = t.clientY;
    drag.current.startX = t.clientX;
    drag.current.suppressClick = false;
    setDragging(true);
  };
  const onTouchMove = (e) => {
    if (!e.touches[0]) return;
    const t = e.touches[0];
    const dyNow = t.clientY - drag.current.startY;
    const dxNow = t.clientX - drag.current.startX;
    // Only react to a clearly vertical gesture — ignore diagonal/sideways drift entirely
    if (Math.abs(dyNow) > Math.abs(dxNow) * 1.5) {
      setDy(dyNow);
    } else {
      setDy(0);
    }
  };
  const onTouchEnd = () => {
    setDragging(false);
    setDy((currentDy) => {
      if (currentDy < -90) {
        drag.current.suppressClick = true;
        onSwipeUp && onSwipeUp();
      }
      return 0;
    });
  };
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
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
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
          ↑ в долгий ящик
        </div>
      )}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: PALETTE.cardEdge,
          transform: `rotate(${rotation + 3}deg) translateY(6px)`,
          boxShadow: "0 4px 14px rgba(140,155,165,0.25)",
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
          boxShadow: `0 16px 32px rgba(140,155,165,0.28), 0 2px 0 ${PALETTE.cardHighlight} inset`,
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
                [{item.tr || "нет транскрипции"}]
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
              {item.ru || "Перевод не указан"}
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
          {flipped ? "тап — вернуть · смахни вверх — в долгий ящик" : "тап — перевернуть · смахни вверх — в долгий ящик"}
        </p>
      </div>
    </div>
  );
}

// ---- Reusable structured edit/create form: en (required), ru, tr, note ----
function CardForm({ initial, onSave, onCancel, saveLabel = "Сохранить" }) {
  const PALETTE = useTheme();
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
        <label style={labelStyle}>Английский текст *</label>
        <input
          autoFocus
          value={en}
          onChange={(e) => setEn(e.target.value)}
          className="rounded-xl px-3 py-2 outline-none"
          style={fieldStyle}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Перевод</label>
        <input value={ru} onChange={(e) => setRu(e.target.value)} className="rounded-xl px-3 py-2 outline-none" style={fieldStyle} />
      </div>
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Транскрипция</label>
        <input value={tr} onChange={(e) => setTr(e.target.value)} className="rounded-xl px-3 py-2 outline-none" style={fieldStyle} />
      </div>
      <div className="flex flex-col gap-1">
        <label style={labelStyle}>Заметка (когда используется)</label>
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
          {saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-full py-2.5 text-sm"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

// `resetScopeLabel`, when provided (Focus mode only), shows a "reset all
// active back to waiting" button scoped to the whole current goal tree.
function PracticeView({ deck, resetScopeLabel, deckKey }) {
  const PALETTE = useTheme();
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
  const [reversed, setReversed] = useState(false);

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
          Обнулить актив {resetScopeLabel}? Все активные карточки вернутся в долгий ящик.
        </p>
        <div className="flex gap-2">
          <button
            onClick={resetAllActive}
            className="text-sm px-4 py-2 rounded-full"
            style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Да, обнулить
          </button>
          <button
            onClick={() => setConfirmReset(false)}
            className="text-sm px-4 py-2 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  if (!activeItems.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          В активной колоде пока пусто.
        </p>
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.9rem" }}>
          Загляни во вкладку «Долгий ящик» и перенеси туда карточки, которые готов повторять.
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
          {resetScopeLabel && (
            <button
              onClick={() => setConfirmReset(true)}
              title="Обнулить активные"
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PALETTE.chip, color: PALETTE.fadeText }}
            >
              <RotateCcw size={14} /> обнулить активные
            </button>
          )}
          <button
            onClick={() => setEditing((e) => !e)}
            title="Редактировать карточку"
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              background: editing ? PALETTE.mustard : PALETTE.chip,
              color: editing ? PALETTE.bgDeep : PALETTE.fadeText,
            }}
          >
            <Pencil size={14} /> редактировать
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
            <Type size={14} /> транскрипция
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
                boxShadow: "0 8px 18px rgba(123,63,160,0.35)",
              }}
              aria-label="Предыдущая"
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
                boxShadow: "0 8px 18px rgba(123,63,160,0.35)",
              }}
              aria-label="Следующая"
            >
              <ChevronRight size={28} strokeWidth={2.5} />
            </button>
          </div>

          <button
            onClick={() => {
              setReversed((r) => !r);
              setFlipped(false);
            }}
            title="Поменять местами лицевую и обратную стороны карточки"
            className="flex items-center gap-2 mt-4 text-sm px-3 py-1.5 rounded-full"
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              background: reversed ? PALETTE.mustard : PALETTE.chip,
              color: reversed ? PALETTE.bgDeep : PALETTE.fadeText,
            }}
          >
            <RotateCcw size={14} /> Реверс{reversed ? ": вкл" : ""}
          </button>

          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 mt-4 text-sm"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
          >
            <Shuffle size={15} /> перемешать колоду
          </button>
        </>
      )}
    </div>
  );
}

function ListView({ deck }) {
  const PALETTE = useTheme();
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
        boxShadow: "0 2px 8px rgba(140,155,165,0.12)",
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
            Удалить навсегда?
          </span>
          <button
            onClick={() => removeItem(item.id)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Да
          </button>
          <button
            onClick={() => setConfirmId(null)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="flex items-center shrink-0">
          {item.status === "waiting" ? (
            <button
              onClick={() => moveTo(item.id, "active")}
              title="Перенести в активную колоду"
              className="p-1.5 rounded-full"
              style={{ color: PALETTE.mint, background: "rgba(217,138,40,0.12)" }}
            >
              <ArrowRightCircle size={22} />
            </button>
          ) : (
            <button
              onClick={() => moveTo(item.id, "waiting")}
              title="Отложить в долгий ящик"
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
            title="Удалить"
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
          <Layers size={18} style={{ color: PALETTE.waiting }} /> Долгий ящик ({waiting.length})
        </h3>
        {waiting.length > 0 && (
          <button
            onClick={moveAllToActive}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{ background: PALETTE.mint, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            всё в актив
          </button>
        )}
      </div>
      {waiting.length === 0 ? (
        <p
          className="mb-6 text-sm"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
        >
          Пусто. Новые карточки, которые ты добавляешь, сначала попадают сюда — и карточки, которые ты уже
          знаешь и отложил из актива.
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
          <BookOpen size={18} style={{ color: PALETTE.mint }} /> В активной колоде ({active.length})
        </h3>
        {active.length > 0 && (
          <button
            onClick={moveAllToWaiting}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            всё в долгий ящик
          </button>
        )}
      </div>
      {active.length === 0 ? (
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.9rem" }}>
          Пока ничего не выбрано для повторения.
        </p>
      ) : (
        active.map((item) => <Row key={item.id} item={item} />)
      )}
    </div>
  );
}

// ---- Bulk-add form: one line per card, reused by language decks and by the
// "add children" / "split" flows in Focus mode ----
function BulkAddForm({ onAdd, onDone, doneLabel = "Добавить в долгий ящик" }) {
  const PALETTE = useTheme();
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
          background: "rgba(123,63,160,0.1)",
        }}
      >
        Можно вставить сразу целый список — каждая строка станет отдельной карточкой.
      </p>
      <p className="text-sm mb-5 mt-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        Формат одной строки:{" "}
        <span style={{ color: PALETTE.mustard }}>текст - перевод - транскрипция - заметка</span>.
        Обязательно только первое поле, остальное — по желанию.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          "How's it going? - Как дела? - хаузит гоуин - неформальное приветствие среди друзей\nresilient - стойкий - ризИльент\nworthwhile\nIt's up to you. - Решать тебе."
        }
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
        <span>{lineCount > 0 ? `строк: ${lineCount}` : "вставь одну или несколько строк"}</span>
      </div>

      <button
        onClick={handleSave}
        disabled={!text.trim()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium disabled:opacity-40"
        style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {saved ? <Check size={18} /> : <Plus size={18} />}
        {saved ? "Добавлено" : lineCount > 1 ? `Добавить ${lineCount} карточек` : doneLabel}
      </button>
    </div>
  );
}

function DeckHome({ deckId, title, deck, onBack, onRename, onDelete, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
  const [tab, setTab] = useState("practice");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const waitingCount = deck.items.filter((i) => i.status === "waiting").length;

  const tabs = [
    { key: "practice", label: "Повторение" },
    { key: "list", label: `Долгий ящик${waitingCount ? ` (${waitingCount})` : ""}` },
    { key: "add", label: "Добавить" },
  ];

  const saveRename = () => {
    if (nameDraft.trim()) onRename(deckId, nameDraft);
    setRenaming(false);
  };

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
          >
            <ArrowLeft size={16} /> Home
          </button>

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
                  title="Переименовать колоду"
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
              Сохранить
            </button>
            <button
              onClick={() => setRenaming(false)}
              className="px-3 py-2 rounded-xl text-sm"
              style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              Отмена
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-xs py-2 rounded-full"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                background: tab === t.key ? PALETTE.mustard : PALETTE.chip,
                color: tab === t.key ? PALETTE.bgDeep : PALETTE.fadeText,
              }}
            >
              {t.label}
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
            Удалить колоду «{title}»
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="text-xs"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}
            >
              Удалить колоду «{title}» навсегда, вместе со всеми карточками?
            </span>
            <button
              onClick={() => onDelete(deckId)}
              className="text-xs px-3 py-1.5 rounded-full shrink-0"
              style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              Да
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-3 py-1.5 rounded-full shrink-0"
              style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTile({ label, placeholder, onCreate, big }) {
  const PALETTE = useTheme();
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
          Создать
        </button>
        <button
          onClick={() => {
            setCreating(false);
            setNameDraft("");
          }}
          className="flex-1 rounded-xl py-2 text-sm"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          Отмена
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
  const countActive = (d) => d.items.filter((i) => i.status === "active").length;
  const countWaiting = (d) => d.items.filter((i) => i.status === "waiting").length;

  if (decks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-16">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, textAlign: "center" }}>
          Колод пока нет. Создай первую, чтобы начать добавлять карточки.
        </p>
        <CreateTile label="Создать колоду" placeholder="Название колоды" onCreate={onAddDeck} big />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 w-full max-w-lg pt-8">
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
              boxShadow: `0 16px 34px rgba(140,155,165,0.28), 0 2px 0 ${PALETTE.cardHighlight} inset`,
              border: `1px solid ${PALETTE.cardEdge}`,
            }}
          >
            <span
              className="absolute -top-7 w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: PALETTE.card,
                boxShadow: `0 10px 20px rgba(140,155,165,0.32), 0 2px 0 ${PALETTE.cardHighlight} inset`,
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
              {countActive(deck)} активных
            </span>
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.7rem", color: PALETTE.waiting }}>
              {countWaiting(deck)} в долгом ящике
            </span>
          </button>
        );
      })}
      <CreateTile label="Новая колода" placeholder="Название колоды" onCreate={onAddDeck} />
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("goals-v1", false);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed)) setGoals(parsed);
        }
      } catch (e) {
        // nothing saved yet — keep the empty start
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return { goals, addGoal, renameGoal, deleteGoal, setGoalChildren };
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCategory = node.type === "category";
  const activeCount = isCategory ? countAtomsByStatus(node, "active") : 0;
  const totalCount = isCategory ? collectAtoms(node).length : 0;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2"
      style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 2px 8px rgba(140,155,165,0.12)" }}
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
              {activeCount} активных · {totalCount} всего
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
            Удалить?
          </span>
          <button
            onClick={() => onDelete(node.id)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Да
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs px-2 py-1 rounded-full"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="flex items-center shrink-0 gap-1">
          {!isCategory && (
            <button
              onClick={() => onToggleStatus(node)}
              title={node.status === "waiting" ? "Перенести в активную колоду" : "Отложить в долгий ящик"}
              className="p-1.5 rounded-full"
              style={{
                color: node.status === "waiting" ? PALETTE.mint : PALETTE.waiting,
                background: node.status === "waiting" ? "rgba(217,138,40,0.12)" : "rgba(124,140,153,0.14)",
              }}
            >
              {node.status === "waiting" ? <ArrowRightCircle size={20} /> : <ArrowLeftCircle size={20} />}
            </button>
          )}
          <button onClick={() => onSplit(node.id)} title="Разбить на карточки" className="p-1.5 rounded-full" style={{ color: PALETTE.mint }}>
            <FolderPlus size={18} />
          </button>
          <button onClick={() => setConfirmDelete(true)} title="Удалить" className="p-1.5" style={{ color: "#5B6275" }}>
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
          <ArrowLeft size={16} /> Назад
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((e) => !e)}
            title="Редактировать карточку"
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: editing ? PALETTE.mustard : PALETTE.chip, color: editing ? PALETTE.bgDeep : PALETTE.fadeText }}
          >
            <Pencil size={14} /> редактировать
          </button>
          <button
            onClick={() => setShowTranscription((s) => !s)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: showTranscription ? PALETTE.mustard : PALETTE.chip, color: showTranscription ? PALETTE.bgDeep : PALETTE.fadeText }}
          >
            <Type size={14} /> транскрипция
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
            <FolderPlus size={16} /> разбить на подкарточки
          </button>
        </>
      )}
    </div>
  );
}

function GoalHome({ goal, onBack, onRename, onDelete, onSetChildren, isDark, onToggleTheme }) {
  const PALETTE = useTheme();
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
        <PracticeView deck={practiceDeck} resetScopeLabel={`цели «${goal.name}»`} deckKey={goal.id} />
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
            <ArrowLeft size={16} /> Отмена
          </button>
        </div>
        <BulkAddForm onAdd={handleAdd} onDone={() => setAddTarget(undefined)} doneLabel="Добавить" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            <ArrowLeft size={16} /> Home
          </button>
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
                  title="Переименовать цель"
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
              Сохранить
            </button>
            <button onClick={() => setRenaming(false)} className="px-3 py-2 rounded-xl text-sm" style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Отмена
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 mb-3 overflow-x-auto">
          {path.length > 0 && (
            <button onClick={() => setPath((p) => p.slice(0, -1))} title="Наверх" className="p-1.5 rounded-full mr-1 shrink-0" style={{ background: PALETTE.chip, color: PALETTE.fadeText }}>
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
          Повторение ({allAtoms.filter((a) => a.status === "active").length} активных во всей цели)
        </button>
      </div>

      <div className="px-6 max-w-md mx-auto w-full pb-4">
        {currentChildren.length === 0 ? (
          <p className="text-sm mb-4" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
            Здесь пока пусто. Добавь карточки — каждую потом можно «разбить» на подкатегории.
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
          <Plus size={18} /> Добавить карточки сюда
        </button>
      </div>

      <div className="max-w-md mx-auto w-full px-6 pb-10 pt-4">
        {!confirmDeleteGoal ? (
          <button onClick={() => setConfirmDeleteGoal(true)} className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#B7BFC5" }}>
            Удалить цель «{goal.name}»
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
              Удалить цель «{goal.name}» навсегда, вместе со всем деревом?
            </span>
            <button onClick={() => onDelete(goal.id)} className="text-xs px-3 py-1.5 rounded-full shrink-0" style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Да
            </button>
            <button onClick={() => setConfirmDeleteGoal(false)} className="text-xs px-3 py-1.5 rounded-full shrink-0" style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FocusDashboard({ goals, onOpen, onAddGoal }) {
  const PALETTE = useTheme();
  const countActive = (g) => g.children.flatMap(collectAtoms).filter((a) => a.status === "active").length;
  const countTotal = (g) => g.children.flatMap(collectAtoms).length;

  if (goals.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-16">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, textAlign: "center" }}>
          Целей пока нет. Создай первую — язык, молитвы, личный бренд, любой проект.
        </p>
        <CreateTile label="Создать цель" placeholder="Название цели" onCreate={onAddGoal} big />
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
          style={{ height: "182px", background: PALETTE.card, boxShadow: `0 16px 34px rgba(140,155,165,0.28), 0 2px 0 ${PALETTE.cardHighlight} inset`, border: `1px solid ${PALETTE.cardEdge}` }}
        >
          <span
            className="absolute -top-7 w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: PALETTE.card, boxShadow: `0 10px 20px rgba(140,155,165,0.32), 0 2px 0 ${PALETTE.cardHighlight} inset`, border: `1px solid ${PALETTE.cardEdge}` }}
          >
            <Target size={22} strokeWidth={1.8} style={{ color: PALETTE.mustard }} />
          </span>
          <TileName>{goal.name}</TileName>
          <div className="flex-1" />
          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem", color: PALETTE.mintDeep }}>
            {countActive(goal)} активных
          </span>
          <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.7rem", color: PALETTE.waiting }}>
            {countTotal(goal)} карточек всего
          </span>
        </button>
      ))}
      <CreateTile label="Новая цель" placeholder="Название цели" onCreate={onAddGoal} />
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(storageKey, false);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed)) setTexts(parsed);
        }
      } catch (e) {
        // nothing saved yet
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

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

  return { texts, addText, updateText, deleteText };
}

function TextForm({ initial, onSave, onCancel, titlePlaceholder = "Название текста", bodyPlaceholder = "Вставь текст целиком — разбивка на страницы произойдёт автоматически" }) {
  const PALETTE = useTheme();
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
        placeholder={titlePlaceholder}
        className="rounded-xl px-3 py-2 outline-none"
        style={fieldStyle}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={bodyPlaceholder}
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
          Сохранить
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-full py-2.5 text-sm"
          style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          Отмена
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
      <div className="max-w-md mx-auto w-full px-6 pt-8 flex items-center justify-between shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          <ArrowLeft size={16} /> Home
        </button>
        <h2 className="truncate px-2" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.1rem", maxWidth: "180px" }}>
          {text.title}
        </h2>
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>

      <div className="max-w-md mx-auto w-full px-6 flex-1 flex flex-col min-h-0 py-4">
        <div
          ref={wrapRef}
          className="flex-1 min-h-0 rounded-2xl p-6 overflow-hidden"
          style={{ background: PALETTE.card, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 16px 32px rgba(140,155,165,0.22)" }}
        >
          {pages ? (
            <div style={readingStyle} dangerouslySetInnerHTML={{ __html: pages[idx] }} />
          ) : (
            <p style={{ ...readingStyle, color: PALETTE.fadeText }}>Разбиваю на страницы…</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 py-6 shrink-0">
          <button
            onClick={() => setIdx((p) => Math.max(0, p - 1))}
            disabled={idx === 0}
            className="rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ width: "48px", height: "48px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: "0 8px 18px rgba(123,63,160,0.35)" }}
            aria-label="Предыдущая страница"
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
            style={{ width: "48px", height: "48px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: "0 8px 18px rgba(123,63,160,0.35)" }}
            aria-label="Следующая страница"
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
      style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 2px 8px rgba(140,155,165,0.12)" }}
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
          <ArrowLeft size={16} /> Назад
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
          <Type size={14} /> транскрипция
        </button>
      </div>
      <IndexCard item={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} rotation={-1.5} showTranscription={showTranscription} onSwipeUp={undefined} />

      {canStep && (
        <div className="flex items-center gap-6 mt-10">
          <button
            onClick={onPrev}
            className="rounded-full flex items-center justify-center"
            style={{ width: "56px", height: "56px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: "0 8px 18px rgba(123,63,160,0.35)" }}
            aria-label="Предыдущая"
          >
            <ChevronLeft size={28} strokeWidth={2.5} />
          </button>
          <button
            onClick={onNext}
            className="rounded-full flex items-center justify-center"
            style={{ width: "56px", height: "56px", background: PALETTE.mustard, color: PALETTE.bgDeep, boxShadow: "0 8px 18px rgba(123,63,160,0.35)" }}
            aria-label="Следующая"
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
    <div className="max-w-md mx-auto w-full px-6 pt-8 flex items-center justify-between">
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        <ArrowLeft size={16} /> Home
      </button>
      <h2 className="truncate px-2" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.1rem", maxWidth: "180px" }}>
        {text.title}
      </h2>
      <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
    </div>
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
          В этом тексте не найдено ни одного заголовка «##».
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
            В этом разделе пока нет карточек.
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
  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-sm"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
        >
          <ArrowLeft size={16} /> Отмена
        </button>
      </div>
      <TextForm initial={initial} onCancel={onCancel} onSave={onSave} titlePlaceholder={titlePlaceholder} bodyPlaceholder={bodyPlaceholder} />
    </div>
  );
}

// A flat list of {id, title, body} documents with create/edit/delete — backs
// both the Pages dashboard and the Слово dashboard, which only differ in
// copy and icon.
function PagesList({ texts, onOpen, onCreate, onEdit, onDelete, emptyText = "Текстов пока нет. Вставь первый — абзацы, отрывки, что угодно длинное.", createLabel = "Добавить текст", rowIcon: RowIcon = BookOpen }) {
  const PALETTE = useTheme();
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  return (
    <div className="w-full max-w-md px-6 pt-8">
      {texts.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-10">
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, textAlign: "center" }}>
            {emptyText}
          </p>
          <button
            onClick={onCreate}
            className="flex flex-col items-center justify-center gap-3 w-full max-w-xs py-14 rounded-[28px]"
            style={{ background: "transparent", border: `2px dashed ${PALETTE.cardEdge}` }}
          >
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: PALETTE.chip }}>
              <Plus size={24} style={{ color: PALETTE.mustard }} />
            </span>
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.9rem", color: PALETTE.fadeText }}>{createLabel}</span>
          </button>
        </div>
      ) : (
        <>
          {texts.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2"
              style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 2px 8px rgba(140,155,165,0.12)" }}
            >
              <button onClick={() => onOpen(t.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <RowIcon size={18} style={{ color: PALETTE.mustard, flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="truncate" style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.05rem" }}>
                    {t.title}
                  </p>
                  <p className="truncate" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText, fontSize: "0.8rem" }}>
                    {t.body.slice(0, 60)}
                  </p>
                </div>
              </button>

              {confirmDeleteId === t.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onDelete(t.id);
                      setConfirmDeleteId(null);
                    }}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    Да
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <div className="flex items-center shrink-0 gap-1">
                  <button onClick={() => onEdit(t.id)} title="Редактировать" className="p-1.5" style={{ color: PALETTE.fadeText }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(t.id)} title="Удалить" className="p-1.5" style={{ color: "#5B6275" }}>
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
            <Plus size={18} /> {createLabel}
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("vocabulary-v1", false);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed)) setEntries(parsed);
        }
      } catch (e) {
        // nothing saved yet
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return { entries, addEntry, deleteEntry, clearAll };
}

// Mounted once at the app root regardless of mode/screen: watches the
// document's text selection and floats a small "Добавить в Vocabulary"
// button next to whatever the user just highlighted. onMouseDown/onTouchStart
// call preventDefault so pressing the button doesn't first collapse the
// selection it's meant to capture.
function SelectionCapture({ onAdd }) {
  const PALETTE = useTheme();
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
      if (rect.top >= SYSTEM_MENU_CLEARANCE) {
        const top = Math.min(rect.bottom + HANDLE_CLEARANCE, window.innerHeight - 44);
        const left = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90);
        setSel({ text, placement: "below", top, left });
      } else {
        const spaceRight = window.innerWidth - rect.right;
        const spaceLeft = rect.left;
        const placement = spaceRight >= spaceLeft ? "right" : "left";
        const top = Math.min(Math.max(rect.top + rect.height / 2, 30), window.innerHeight - 30);
        const left =
          placement === "right"
            ? Math.min(rect.right + HANDLE_CLEARANCE, window.innerWidth - 8)
            : Math.max(rect.left - HANDLE_CLEARANCE, 8);
        setSel({ text, placement, top, left });
      }
    };
    const hide = () => setSel(null);

    document.addEventListener("selectionchange", updateFromSelection);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("selectionchange", updateFromSelection);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!sel) return null;

  const handleAdd = () => {
    onAdd(sel.text);
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  const transform =
    sel.placement === "right" ? "translate(0, -50%)" : sel.placement === "left" ? "translate(-100%, -50%)" : "translate(-50%, 0)";

  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
      onClick={handleAdd}
      className="fixed flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap"
      style={{
        top: `${sel.top}px`,
        left: `${sel.left}px`,
        transform,
        zIndex: 9999,
        background: PALETTE.mustard,
        color: PALETTE.bgDeep,
        fontFamily: "'IBM Plex Sans', sans-serif",
        boxShadow: "0 8px 18px rgba(123,63,160,0.4)",
      }}
    >
      <Highlighter size={14} /> Добавить в Vocabulary
    </button>
  );
}

// The Vocabulary dashboard: no drill-down, no create form — entries only
// ever arrive via SelectionCapture. Just a flat list with per-row delete,
// a copy-everything action (the primary use case), and a guarded clear-all.
function VocabularyList({ entries, onDelete, onClearAll }) {
  const PALETTE = useTheme();
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
          Пока пусто — выдели любой текст в приложении и нажми «Добавить в Vocabulary».
        </p>
      ) : (
        <>
          <button
            onClick={handleCopyAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium mb-4"
            style={{ background: copied ? PALETTE.mint : PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Скопировано" : `Скопировать всё (${entries.length})`}
          </button>

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2"
              style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 2px 8px rgba(140,155,165,0.12)" }}
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
                    Да
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: PALETTE.card, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(entry.id)} title="Удалить" className="p-1.5 shrink-0" style={{ color: "#5B6275" }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}

          <div className="mt-4">
            {confirmClear ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
                  Удалить весь список ({entries.length}) безвозвратно?
                </span>
                <button
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full shrink-0"
                  style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  Да
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-xs px-3 py-1.5 rounded-full shrink-0"
                  style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="text-xs" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#B7BFC5" }}>
                Очистить весь список
              </button>
            )}
          </div>
        </>
      )}
    </div>
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

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8 flex items-center shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          <ArrowLeft size={16} /> Назад
        </button>
      </div>
      <div className="max-w-md mx-auto w-full px-6 pt-4 pb-10 flex-1 min-h-0 flex flex-col">
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
// a "Выделить всё"/"Снять выделение" toggle, "Скопировать выбранное" once
// something's picked (joining the chosen entries' full text with a clear
// "---" separator), per-row delete, and a full-width "+" card — matching
// the Pages-style row cards — that flips in place to "Сохранить"/"Отмена"
// on tap, reading the new entry straight from the clipboard rather than
// showing a text field at all.
function SpecsList({ specs, onOpen, onDelete, onSaveNew }) {
  const PALETTE = useTheme();
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pasteError, setPasteError] = useState(false);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = specs.length > 0 && specs.every((s) => selected.has(s.id));
  const toggleSelectAll = () => {
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
          <button
            onClick={toggleSelectAll}
            className="text-xs px-3 py-1.5 rounded-full shrink-0"
            style={{ background: PALETTE.chip, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {allSelected ? "Снять выделение" : "Выделить всё"}
          </button>
          {selected.size > 0 && (
            <button
              onClick={handleCopySelected}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
              style={{ background: copied ? PALETTE.mint : PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Скопировано" : `Копировать (${selected.size})`}
            </button>
          )}
        </div>
      )}

      {specs.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
          Пока пусто — нажми «+», чтобы быстро набросать первую спецификацию.
        </p>
      ) : (
        specs.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-2"
            style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 2px 8px rgba(140,155,165,0.12)" }}
          >
            <button
              onClick={() => toggleSelect(s.id)}
              className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
              style={{
                border: `2px solid ${selected.has(s.id) ? PALETTE.mustard : PALETTE.cardEdge}`,
                background: selected.has(s.id) ? PALETTE.mustard : "transparent",
              }}
              aria-label="Выбрать"
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

            {confirmDeleteId === s.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    onDelete(s.id);
                    setConfirmDeleteId(null);
                  }}
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ background: PALETTE.danger, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  Да
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ background: PALETTE.card, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDeleteId(s.id)} title="Удалить" className="p-1.5 shrink-0" style={{ color: "#5B6275" }}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))
      )}

      {confirming ? (
        <div
          className="w-full rounded-2xl px-3 py-3"
          style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 2px 8px rgba(140,155,165,0.12)" }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveFromClipboard}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium"
              style={{ background: PALETTE.mustard, color: PALETTE.bgDeep, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              <Check size={16} /> Сохранить
            </button>
            <button
              onClick={handleCancelCreate}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium"
              style={{ background: PALETTE.card, color: PALETTE.fadeText, fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              <X size={16} /> Отмена
            </button>
          </div>
          {pasteError && (
            <p className="text-xs text-center mt-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.danger }}>
              Скопируй текст перед вставкой
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center py-3 rounded-2xl"
          style={{ background: PALETTE.chip, border: `1px solid ${PALETTE.cardEdge}`, boxShadow: "0 2px 8px rgba(140,155,165,0.12)" }}
          aria-label="Новая спецификация"
        >
          <Plus size={22} style={{ color: PALETTE.mustard }} />
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// App shell — theme, mode switch, routing between the six modes
// ════════════════════════════════════════════════════════════════════════

function ModeSwitch({ mode, onChange }) {
  const PALETTE = useTheme();
  const options = [
    { key: "language", label: "Изучение языка", Icon: Languages },
    { key: "focus", label: "Мои цели", Icon: Target },
    { key: "pages", label: "Pages", Icon: BookOpen },
    { key: "words", label: "Слово", Icon: BookMarked },
    { key: "vocabulary", label: "Vocabulary", Icon: Highlighter },
    { key: "specs", label: "Спецификации", Icon: NotebookPen },
  ];
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

export default function App() {
  const { decks, setDeckItems, addDeck, renameDeck, deleteDeck } = useDecks();
  const { goals, addGoal, renameGoal, deleteGoal, setGoalChildren } = useGoals();
  const { texts, addText, updateText, deleteText } = useTextDocs("pages-texts-v1");
  const { texts: words, addText: addWord, updateText: updateWord, deleteText: deleteWord } = useTextDocs("words-docs-v1");
  const vocab = useVocabulary();
  const { texts: specs, addText: addSpec, deleteText: deleteSpec } = useTextDocs("specs-v1");
  const [mode, setMode] = useState("language");
  const [openDeckId, setOpenDeckId] = useState(null);
  const [openGoalId, setOpenGoalId] = useState(null);
  const [openTextId, setOpenTextId] = useState(null);
  const [pagesCreating, setPagesCreating] = useState(false);
  const [pagesEditingId, setPagesEditingId] = useState(null);
  const [openWordId, setOpenWordId] = useState(null);
  const [wordCreating, setWordCreating] = useState(false);
  const [wordEditingId, setWordEditingId] = useState(null);
  const [openSpecId, setOpenSpecId] = useState(null);
  const [isDark, setIsDark] = useState(false);
  const [showTranscription, setShowTranscriptionRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("app-mode-v1", false);
        if (!cancelled && res && ["language", "focus", "pages", "words", "vocabulary", "specs"].includes(res.value)) setMode(res.value);
      } catch (e) {}
      try {
        const res = await window.storage.get("theme-v1", false);
        if (!cancelled && res && (res.value === "dark" || res.value === "light")) setIsDark(res.value === "dark");
      } catch (e) {}
      try {
        const res = await window.storage.get("transcription-v1", false);
        if (!cancelled && res && (res.value === "on" || res.value === "off")) setShowTranscriptionRaw(res.value === "on");
      } catch (e) {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setShowTranscription = useCallback((next) => {
    setShowTranscriptionRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      window.storage.set("transcription-v1", value ? "on" : "off", false).catch(() => {});
      return value;
    });
  }, []);

  const theme = isDark ? DARK_PALETTE : LIGHT_PALETTE;

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.bg);
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
  const openText = texts.find((t) => t.id === openTextId) || null;
  const editingText = texts.find((t) => t.id === pagesEditingId) || null;
  const openWord = words.find((w) => w.id === openWordId) || null;
  const editingWord = words.find((w) => w.id === wordEditingId) || null;
  const openSpec = specs.find((s) => s.id === openSpecId) || null;

  return (
    <ThemeContext.Provider value={theme}>
    <TranscriptionContext.Provider value={[showTranscription, setShowTranscription]}>
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <style>{FONT_IMPORT}</style>
        <SelectionCapture onAdd={vocab.addEntry} />

        {mode === "pages" && openText ? (
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
            titlePlaceholder="Название слова"
            bodyPlaceholder={"Разметка: «## Заголовок» — новая вкладка; обычная строка — карточка (english - перевод - транскрипция - контекст); строка с «>» — пример-потомок предыдущей карточки"}
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
        ) : (
          <div className="min-h-screen flex flex-col items-center px-6 py-16" style={{ background: `radial-gradient(circle at 50% 0%, ${theme.bgGlow}, ${theme.bg})` }}>
            <div className="text-center mb-2">
              <p className="text-sm mb-2 tracking-widest uppercase" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: theme.mint }}>
                Small pieces. Big change.
              </p>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: theme.cream, fontSize: "2.4rem" }}>
                {mode === "language"
                  ? "Твои колоды"
                  : mode === "focus"
                  ? "Твои цели"
                  : mode === "words"
                  ? "Твои слова"
                  : mode === "vocabulary"
                  ? "Vocabulary"
                  : mode === "specs"
                  ? "Спецификации"
                  : "Твои тексты"}
              </h1>
            </div>

            <div className="w-full flex justify-end max-w-lg">
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
            </div>

            <ModeSwitch mode={mode} onChange={changeMode} />

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
                emptyText="Слов пока нет. Добавь первое — с разметкой «## / > »."
                createLabel="Новое слово"
                rowIcon={BookMarked}
              />
            ) : mode === "vocabulary" ? (
              <VocabularyList entries={vocab.entries} onDelete={vocab.deleteEntry} onClearAll={vocab.clearAll} />
            ) : mode === "specs" ? (
              <SpecsList
                specs={specs}
                onOpen={setOpenSpecId}
                onDelete={deleteSpec}
                onSaveNew={(body) => addSpec(deriveSpecTitle(body, specs.map((s) => s.title)), body)}
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
    </TranscriptionContext.Provider>
    </ThemeContext.Provider>
  );
}
