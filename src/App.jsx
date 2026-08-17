import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Shuffle,
  ChevronLeft,
  ChevronRight,
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

const PALETTE = {
  bg: "#E6EDEE",
  bgGlow: "#F5F9F9",
  chip: "#F0F5F5",
  bgDeep: "#2E3236",
  card: "#FBFAF7",
  cardEdge: "#E6EAEA",
  ink: "#2E3236",
  mint: "#D98A28",
  mintDeep: "#A85F1D",
  mustard: "#E2932E",
  fadeText: "#75808A",
  cream: "#2E3236",
  waiting: "#7C8C99",
  danger: "#C1502E",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DEFAULT_PHRASES = [
  {
    id: uid(),
    en: "How's it going?",
    ru: "Как дела? (неформально)",
    tr: "хаузит гоуин",
    note: "Неформальное приветствие среди друзей, не для деловой переписки",
    status: "active",
  },
  {
    id: uid(),
    en: "I couldn't agree more.",
    ru: "Полностью согласен.",
    tr: "ай куднт эгри мор",
    note: "",
    status: "active",
  },
  { id: uid(), en: "It's up to you.", ru: "Решать тебе.", tr: "итс ап ту ю", note: "", status: "active" },
  {
    id: uid(),
    en: "Let me get back to you on that.",
    ru: "Я вернусь к этому вопросу позже.",
    tr: "лет ми гет бэк ту ю он зэт",
    note: "Используется в деловом контексте, когда не готов дать ответ сразу",
    status: "waiting",
  },
  {
    id: uid(),
    en: "That rings a bell.",
    ru: "Это что-то напоминает / знакомо.",
    tr: "зэт рингз э бэл",
    note: "",
    status: "waiting",
  },
];

const DEFAULT_WORDS = [
  {
    id: uid(),
    en: "resilient",
    ru: "стойкий, устойчивый",
    tr: "ризИльент",
    note: "Часто про людей и системы — способность быстро восстанавливаться после трудностей",
    status: "active",
  },
  { id: uid(), en: "overwhelmed", ru: "перегруженный, ошеломлённый", tr: "оувеУэлмд", note: "", status: "active" },
  { id: uid(), en: "assumption", ru: "предположение", tr: "асАмпшн", note: "", status: "active" },
  { id: uid(), en: "commute", ru: "ездить на работу", tr: "кэмЬют", note: "", status: "waiting" },
  {
    id: uid(),
    en: "worthwhile",
    ru: "стоящий, оправдывающий усилия",
    tr: "уорсвАйл",
    note: "",
    status: "waiting",
  },
];

function parseImport(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/\s-\s|=|—/)
        .map((p) => p.trim())
        .filter(Boolean);
      return {
        id: uid(),
        en: parts[0] || line,
        ru: parts[1] || "",
        tr: parts[2] || "",
        note: parts[3] || "",
        status: "waiting",
      };
    })
    .filter((item) => item.en);
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function useDeck(key, defaults) {
  const [items, setItems] = useState(defaults);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(key, false);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed) && parsed.length) setItems(parsed);
        }
      } catch (e) {
        // no saved data yet, keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const persist = useCallback(
    async (next) => {
      setItems(next);
      try {
        await window.storage.set(key, JSON.stringify(next), false);
      } catch (e) {
        console.error("Storage error", e);
      }
    },
    [key]
  );

  return { items, setItems: persist };
}

// ---- Card: tap (native onClick) flips it, touch-drag upward sends it to the long box ----
function IndexCard({ item, flipped, onFlip, rotation, showTranscription, onSwipeUp }) {
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
      className="relative w-full max-w-md cursor-pointer select-none"
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
          boxShadow: "0 16px 32px rgba(140,155,165,0.28), 0 2px 0 rgba(255,255,255,0.8) inset",
          border: `1px solid ${PALETTE.cardEdge}`,
        }}
      >
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 w-10 h-3 rounded-full"
          style={{ background: "rgba(140,155,165,0.18)" }}
        />
        {!flipped ? (
          <>
            <p
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

function PracticeView({ title, deck }) {
  const activeItems = deck.items.filter((i) => i.status === "active");
  const [order, setOrder] = useState(activeItems.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rotation, setRotation] = useState(-1.5);
  const [showTranscription, setShowTranscription] = useState(false);

  useEffect(() => {
    setOrder(deck.items.filter((i) => i.status === "active").map((_, i) => i));
    setPos(0);
    setFlipped(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.items]);

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

  const currentIndex = order[pos] ?? 0;
  const item = activeItems[currentIndex] || activeItems[0];

  const goTo = (newPos) => {
    setRotation((Math.random() - 0.5) * 4);
    setFlipped(false);
    setPos((newPos + order.length) % order.length);
  };

  const handleShuffle = () => {
    setOrder(shuffleArr(order));
    setPos(0);
    setFlipped(false);
    setRotation((Math.random() - 0.5) * 4);
  };

  const moveCurrentToWaiting = () => {
    deck.setItems(deck.items.map((i) => (i.id === item.id ? { ...i, status: "waiting" } : i)));
  };

  return (
    <div className="flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-md flex items-center justify-between mb-6">
        <span
          className="text-sm"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mustard, letterSpacing: "0.05em" }}
        >
          {pos + 1} / {order.length}
        </span>
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

      <IndexCard
        key={item.id}
        item={item}
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        rotation={rotation}
        showTranscription={showTranscription}
        onSwipeUp={moveCurrentToWaiting}
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
            boxShadow: "0 8px 18px rgba(226,147,46,0.35)",
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
            boxShadow: "0 8px 18px rgba(226,147,46,0.35)",
          }}
          aria-label="Следующая"
        >
          <ChevronRight size={28} strokeWidth={2.5} />
        </button>
      </div>

      <button
        onClick={handleShuffle}
        className="flex items-center gap-2 mt-6 text-sm"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
      >
        <Shuffle size={15} /> перемешать колоду
      </button>
    </div>
  );
}

function ListView({ deck }) {
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

      <h3
        className="flex items-center gap-2 mb-3"
        style={{ fontFamily: "'Fraunces', serif", color: PALETTE.cream, fontSize: "1.2rem" }}
      >
        <BookOpen size={18} style={{ color: PALETTE.mint }} /> В активной колоде ({active.length})
      </h3>
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

function ImportView({ title, deck, onDone }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const lineCount = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;

  const handleSave = async () => {
    const parsed = parseImport(text);
    if (!parsed.length) return;
    await deck.setItems([...deck.items, ...parsed]);
    setSaved(true);
    setText("");
    setTimeout(() => setSaved(false), 1500);
    setTimeout(() => onDone(), 900);
  };

  return (
    <div className="px-6 py-8 max-w-md mx-auto w-full">
      <p
        className="text-sm mb-1 px-3 py-2 rounded-lg"
        style={{
          fontFamily: "'IBM Plex Sans', sans-serif",
          color: PALETTE.mustard,
          background: "rgba(227,167,46,0.1)",
        }}
      >
        Можно вставить сразу целый список — каждая строка станет отдельной карточкой.
      </p>
      <p className="text-sm mb-5 mt-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}>
        Формат одной строки:{" "}
        <span style={{ color: PALETTE.mustard }}>english - перевод - транскрипция - когда используется</span>.
        Обязательно только английское слово или фраза, остальное — по желанию. Новые карточки сразу попадают в
        долгий ящик — перенеси их в актив, когда будешь готов.
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
        {saved
          ? "Добавлено в долгий ящик"
          : lineCount > 1
          ? `Добавить ${lineCount} карточек в долгий ящик`
          : "Добавить в долгий ящик"}
      </button>
    </div>
  );
}

function DeckHome({ title, deck, onBack }) {
  const [tab, setTab] = useState("practice");
  const waitingCount = deck.items.filter((i) => i.status === "waiting").length;

  const tabs = [
    { key: "practice", label: "Повторение" },
    { key: "list", label: `Долгий ящик${waitingCount ? ` (${waitingCount})` : ""}` },
    { key: "add", label: "Добавить" },
  ];

  return (
    <div className="min-h-screen" style={{ background: PALETTE.bg }}>
      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.fadeText }}
          >
            <ArrowLeft size={16} /> Дашборд
          </button>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: PALETTE.cream, fontSize: "1.4rem" }}>
            {title}
          </h2>
        </div>

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

      {tab === "practice" && <PracticeView title={title} deck={deck} />}
      {tab === "list" && <ListView deck={deck} />}
      {tab === "add" && <ImportView title={title} deck={deck} onDone={() => setTab("list")} />}
    </div>
  );
}

function Dashboard({ phrasesDeck, wordsDeck, onOpen }) {
  const countActive = (d) => d.items.filter((i) => i.status === "active").length;
  const countWaiting = (d) => d.items.filter((i) => i.status === "waiting").length;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 gap-10"
      style={{ background: `radial-gradient(circle at 50% 0%, ${PALETTE.bgGlow}, ${PALETTE.bg})` }}
    >
      <div className="text-center">
        <p
          className="text-sm mb-2 tracking-widest uppercase"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: PALETTE.mint }}
        >
          Карточки для практики
        </p>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontStyle: "italic",
            color: PALETTE.cream,
            fontSize: "2.4rem",
          }}
        >
          Твой English deck
        </h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-10 w-full max-w-lg pt-8">
        {[
          { key: "phrases", label: "Фразы", deck: phrasesDeck, Icon: MessageCircle, iconColor: PALETTE.mustard },
          { key: "words", label: "Слова", deck: wordsDeck, Icon: Library, iconColor: PALETTE.ink },
        ].map(({ key, label, deck, Icon, iconColor }) => (
          <button
            key={key}
            onClick={() => onOpen(key)}
            className="relative flex-1 rounded-[28px] pt-12 pb-8 px-6 flex flex-col items-center gap-1 transition-transform hover:-translate-y-1"
            style={{
              background: PALETTE.card,
              boxShadow: "0 16px 34px rgba(140,155,165,0.28), 0 2px 0 rgba(255,255,255,0.8) inset",
              border: `1px solid ${PALETTE.cardEdge}`,
            }}
          >
            <span
              className="absolute -top-8 w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: PALETTE.card,
                boxShadow: "0 10px 20px rgba(140,155,165,0.32), 0 2px 0 rgba(255,255,255,0.8) inset",
                border: `1px solid ${PALETTE.cardEdge}`,
              }}
            >
              <Icon size={26} strokeWidth={1.8} style={{ color: iconColor }} />
            </span>

            <span
              className="mt-3"
              style={{ fontFamily: "'Fraunces', serif", fontSize: "1.6rem", color: PALETTE.ink }}
            >
              {label}
            </span>
            <span
              className="mt-1"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.85rem", color: PALETTE.mintDeep }}
            >
              {countActive(deck)} активных
            </span>
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.75rem", color: PALETTE.waiting }}>
              {countWaiting(deck)} в долгом ящике
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const phrasesDeck = useDeck("phrases-deck-v3", DEFAULT_PHRASES);
  const wordsDeck = useDeck("words-deck-v3", DEFAULT_WORDS);
  const [openDeck, setOpenDeck] = useState(null);

  const deckFor = (key) => (key === "phrases" ? phrasesDeck : wordsDeck);
  const titleFor = (key) => (key === "phrases" ? "Фразы" : "Слова");

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      {!openDeck && <Dashboard phrasesDeck={phrasesDeck} wordsDeck={wordsDeck} onOpen={setOpenDeck} />}
      {openDeck && (
        <DeckHome title={titleFor(openDeck)} deck={deckFor(openDeck)} onBack={() => setOpenDeck(null)} />
      )}
    </div>
  );
}
