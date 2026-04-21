"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Profile } from "../../types/profile";

type FieldKey =
  | "interests"
  | "favorites"
  | "food"
  | "place"
  | "club"
  | "recent"
  | "recommendation"
  | "topics"
  | "message";

type FloatingAnchor = {
  x: number;
  y: number;
};

type FloatingPanelState =
  | {
      mode: "toc";
      anchor: FloatingAnchor;
    }
  | {
      mode: "field";
      anchor: FloatingAnchor;
      fieldKey: FieldKey;
      fieldLabel: string;
    }
  | {
      mode: "value";
      anchor: FloatingAnchor;
      fieldKey: FieldKey;
      fieldLabel: string;
      selectedValue: string;
    }
  | null;

type PanelLayout = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const ALL_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "interests", label: "興味のあるもの" },
  { key: "favorites", label: "好きなこと・もの" },
  { key: "food", label: "好きな食べ物・飲み物" },
  { key: "place", label: "よく出没する場所" },
  { key: "club", label: "学生時代の部活動" },
  { key: "recent", label: "最近ハマっていること" },
  { key: "recommendation", label: "おすすめしたいコンテンツ" },
  { key: "topics", label: "興味のある話題" },
  { key: "message", label: "ひとこと" },
];

const FAVORITES_STORAGE_KEY = "prepale:favorites";
const BOOKMARKS_STORAGE_KEY = "prepale:bookmarks";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getAnchorFromElement(element: HTMLElement): FloatingAnchor {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom,
  };
}

function getPanelLayout(_anchor: FloatingAnchor | null): PanelLayout | null {
  if (typeof window === "undefined") return null;

  const margin = 14;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(392, viewportWidth - margin * 2);
  const left = Math.max(margin, (viewportWidth - width) / 2);
  const preferredTop = Math.round(viewportHeight * 0.25);
  const top = clamp(preferredTop, 72, Math.max(72, viewportHeight - 300));
  const maxHeight = Math.max(
    240,
    Math.min(540, Math.round(viewportHeight * 0.62), viewportHeight - top - margin)
  );

  return { top, left, width, maxHeight };
}

function buildHandle(xId: string) {
  return xId.trim().replace(/^@/, "");
}

function buildXUrl(xId: string) {
  const handle = buildHandle(xId);
  if (!handle) return "";
  return `https://x.com/${encodeURIComponent(handle)}`;
}

function buildAvatarCandidates(xId: string) {
  const raw = xId.trim();
  const noAt = buildHandle(xId);

  const candidates = [raw, noAt]
    .filter(Boolean)
    .map((name) => `/avatars/${encodeURIComponent(name)}.jpg`);

  return Array.from(new Set(candidates));
}

function buildAvatarFallback(name: string, xId: string) {
  const handle = buildHandle(xId);
  if (handle) return handle.charAt(0).toUpperCase();

  const latin = (name || "").match(/[A-Za-z]/);
  if (latin) return latin[0].toUpperCase();

  return (name || "？").charAt(0);
}

function normalizeText(value?: string) {
  return (value ?? "").trim();
}

function cleanArray(values?: string[]) {
  return (values ?? []).filter(Boolean).map((v) => v.trim()).filter(Boolean);
}

function getFieldValues(profile: Profile, fieldKey: FieldKey): string[] {
  switch (fieldKey) {
    case "interests":
      return cleanArray(profile.interests);
    case "favorites":
      return cleanArray(profile.favorites);
    case "food":
      return cleanArray(profile.foodTokens);
    case "place":
      return cleanArray(profile.placeTokens);
    case "club":
      return cleanArray(profile.clubTokens);
    case "recent":
      return cleanArray(profile.recentTokens);
    case "recommendation": {
      const value = normalizeText(profile.recommendation);
      return value ? [value] : [];
    }
    case "topics": {
      const value = normalizeText(profile.topics);
      return value ? [value] : [];
    }
    case "message": {
      const value = normalizeText(profile.message);
      return value ? [value] : [];
    }
    default:
      return [];
  }
}

function getFieldSummary(profile: Profile, fieldKey: FieldKey) {
  return getFieldValues(profile, fieldKey).join(" / ");
}

function getMatchedFieldsForValue(profile: Profile, selectedValue: string) {
  const target = selectedValue.trim();
  if (!target) return [];
  return ALL_FIELDS.filter(({ key }) => getFieldValues(profile, key).includes(target));
}

function readStoredIds(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.901 1.154h3.68l-8.04 9.188L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.472l8.6-9.829L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.49h2.04L6.486 3.24H4.298l13.313 17.404Z" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-6.716-4.35-9.192-8.247C.481 9.091 1.542 4.5 6.05 4.5c2.36 0 4.04 1.365 4.95 2.79.91-1.425 2.59-2.79 4.95-2.79 4.508 0 5.569 4.591 3.242 8.253C18.716 16.65 12 21 12 21Z" />
    </svg>
  );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.75h12a1 1 0 0 1 1 1v15.5l-7-4.2-7 4.2V4.75a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function ProfileAvatar({ name, xId }: { name: string; xId: string }) {
  const candidates = useMemo(() => buildAvatarCandidates(xId), [xId]);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const fallbackText = buildAvatarFallback(name, xId);

  useEffect(() => {
    let cancelled = false;
    setResolvedSrc(null);
    setChecked(false);

    if (candidates.length === 0) {
      setChecked(true);
      return;
    }

    async function resolveAvatar() {
      for (const candidate of candidates) {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = candidate;
        });

        if (cancelled) return;
        if (ok) {
          setResolvedSrc(candidate);
          setChecked(true);
          return;
        }
      }

      if (!cancelled) {
        setResolvedSrc(null);
        setChecked(true);
      }
    }

    resolveAvatar();

    return () => {
      cancelled = true;
    };
  }, [candidates]);

  if (!checked || !resolvedSrc) {
    return (
      <div className="profile-avatar-fallback" aria-label={`${name}のアイコン`}>
        {fallbackText}
      </div>
    );
  }

  return <img src={resolvedSrc} alt={`${name}のアイコン`} className="profile-avatar-image" />;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="book-empty-state" role="status" aria-live="polite">
      <div className="book-empty-icon">📖</div>
      <p>{label}</p>
    </div>
  );
}

function InlineIndicators({
  hasX,
  isFavorite,
  isBookmarked,
}: {
  hasX: boolean;
  isFavorite: boolean;
  isBookmarked: boolean;
}) {
  return (
    <span className="toc-icons" aria-hidden="true">
      {hasX ? (
        <span className="toc-inline-icon is-x">
          <XIcon />
        </span>
      ) : null}
      {isFavorite ? (
        <span className="toc-inline-icon is-favorite">
          <HeartIcon filled />
        </span>
      ) : null}
      {isBookmarked ? (
        <span className="toc-inline-icon is-bookmark">
          <BookmarkIcon filled />
        </span>
      ) : null}
    </span>
  );
}

function TokenFieldBlock({
  label,
  fieldKey,
  items,
  onOpenField,
  onOpenValue,
}: {
  label: string;
  fieldKey: Extract<FieldKey, "food" | "place" | "club" | "recent">;
  items: string[];
  onOpenField: (event: MouseEvent<HTMLElement>, fieldKey: FieldKey, fieldLabel: string) => void;
  onOpenValue: (
    event: MouseEvent<HTMLElement>,
    fieldKey: FieldKey,
    fieldLabel: string,
    selectedValue: string
  ) => void;
}) {
  return (
    <div className="paper-item-block">
      <button
        type="button"
        className="paper-label-button"
        onClick={(e) => onOpenField(e, fieldKey, label)}
      >
        {label}
      </button>

      <div className="paper-tags paper-tags-inline">
        {items.length > 0 ? (
          items.map((item, index) => (
            <button
              key={`${fieldKey}-${item}-${index}`}
              type="button"
              className="paper-tag-button paper-tag-soft-button"
              onClick={(e) => onOpenValue(e, fieldKey, label, item)}
            >
              {item}
            </button>
          ))
        ) : (
          <span className="paper-value-empty">―</span>
        )}
      </div>
    </div>
  );
}

export default function BookReaderClient() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<FloatingPanelState>(null);
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);
  const [tocFilter, setTocFilter] = useState<"all" | "favorites" | "bookmarks">("all");

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  const pageScrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollFrame = useRef<number | null>(null);
  const suppressScrollSync = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    async function loadProfiles() {
      try {
        const q = query(collection(db, "profiles"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);
        const items: Profile[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Profile, "id">),
        }));
        setProfiles(items);
      } catch (error) {
        console.error("failed to load profiles", error);
      } finally {
        setLoading(false);
      }
    }

    loadProfiles();
  }, []);

  useEffect(() => {
    setFavoriteIds(readStoredIds(FAVORITES_STORAGE_KEY));
    setBookmarkIds(readStoredIds(BOOKMARKS_STORAGE_KEY));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarkIds));
  }, [bookmarkIds]);

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const bookmarkIdSet = useMemo(() => new Set(bookmarkIds), [bookmarkIds]);

  const filteredProfiles = useMemo(() => profiles, [profiles]);

  const tocProfiles = useMemo(() => {
    if (tocFilter === "favorites") {
      return filteredProfiles.filter((profile) => favoriteIdSet.has(profile.id));
    }
    if (tocFilter === "bookmarks") {
      return filteredProfiles.filter((profile) => bookmarkIdSet.has(profile.id));
    }
    return filteredProfiles;
  }, [filteredProfiles, tocFilter, favoriteIdSet, bookmarkIdSet]);

  const bookPages = useMemo(
    () => [
      { kind: "cover" as const },
      ...filteredProfiles.map((profile) => ({ kind: "profile" as const, profile })),
    ],
    [filteredProfiles]
  );

  useEffect(() => {
    if (bookPages.length === 0) {
      setCurrentIndex(0);
      return;
    }
    if (currentIndex > bookPages.length - 1) {
      setCurrentIndex(bookPages.length - 1);
    }
  }, [bookPages.length, currentIndex]);

  useEffect(() => {
    if (!panel) return;
    const update = () => setPanelLayout(getPanelLayout(panel.anchor));
    update();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };

    window.addEventListener("resize", update);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [panel]);

  useEffect(() => {
    if (!pendingProfileId || filteredProfiles.length === 0) return;
    const profileIndex = filteredProfiles.findIndex((profile) => profile.id === pendingProfileId);
    if (profileIndex < 0) return;
    scrollToIndex(profileIndex + 1, "smooth");
    setPendingProfileId(null);
  }, [filteredProfiles, pendingProfileId]);

  useEffect(() => {
    pageScrollRefs.current.forEach((element, index) => {
      if (!element) return;
      if (index === currentIndex) return;
      element.scrollTop = 0;
    });
  }, [currentIndex]);

  const fieldEntries = useMemo(() => {
    if (!panel || panel.mode !== "field") return [];
    return profiles
      .map((profile) => ({
        profile,
        summary: getFieldSummary(profile, panel.fieldKey),
      }))
      .filter((item) => item.summary);
  }, [profiles, panel]);

  const sameValueProfiles = useMemo(() => {
    if (!panel || panel.mode !== "value") return [];
    return profiles
      .map((profile) => ({
        profile,
        matchedFields: getMatchedFieldsForValue(profile, panel.selectedValue),
      }))
      .filter((item) => item.matchedFields.length > 0);
  }, [profiles, panel]);

  function syncIndexFromScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || suppressScrollSync.current) return;
    const center = scroller.scrollLeft + scroller.clientWidth / 2;

    let closestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((element, index) => {
      if (!element) return;
      const elementCenter = element.offsetLeft + element.offsetWidth / 2;
      const distance = Math.abs(elementCenter - center);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });

    setCurrentIndex(closestIndex);
  }

  function scrollToIndex(index: number, behavior: ScrollBehavior = "smooth") {
    const scroller = scrollerRef.current;
    const page = pageRefs.current[index];
    if (!scroller || !page) return;

    suppressScrollSync.current = true;
    scroller.scrollTo({
      left: page.offsetLeft - (scroller.clientWidth - page.offsetWidth) / 2,
      behavior,
    });
    setCurrentIndex(index);

    window.setTimeout(() => {
      suppressScrollSync.current = false;
      syncIndexFromScroll();
    }, behavior === "smooth" ? 380 : 40);
  }

  function goPrev() {
    if (currentIndex <= 0) return;
    scrollToIndex(currentIndex - 1);
  }

  function goNext() {
    if (currentIndex >= bookPages.length - 1) return;
    scrollToIndex(currentIndex + 1);
  }

  function jumpToProfileById(profileId: string) {
    setPendingProfileId(profileId);
    setPanel(null);
  }

  function handleScrollerScroll() {
    if (scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = window.requestAnimationFrame(syncIndexFromScroll);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(deltaX) < 28) return;
    if (Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;

    if (deltaX < 0 && currentIndex < bookPages.length - 1) {
      scrollToIndex(currentIndex + 1);
      return;
    }

    if (deltaX > 0 && currentIndex > 0) {
      scrollToIndex(currentIndex - 1);
    }
  }

  function openToc(event: MouseEvent<HTMLElement>) {
    setTocFilter("all");
    setPanel({ mode: "toc", anchor: getAnchorFromElement(event.currentTarget) });
  }

  function openFieldInspector(
    event: MouseEvent<HTMLElement>,
    fieldKey: FieldKey,
    fieldLabel: string
  ) {
    setPanel({
      mode: "field",
      anchor: getAnchorFromElement(event.currentTarget),
      fieldKey,
      fieldLabel,
    });
  }

  function openValueInspector(
    event: MouseEvent<HTMLElement>,
    fieldKey: FieldKey,
    fieldLabel: string,
    selectedValue: string
  ) {
    const value = selectedValue.trim();
    if (!value) return;

    setPanel({
      mode: "value",
      anchor: getAnchorFromElement(event.currentTarget),
      fieldKey,
      fieldLabel,
      selectedValue: value,
    });
  }

  function toggleFavorite(profileId: string) {
    setFavoriteIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  }

  function toggleBookmark(profileId: string) {
    setBookmarkIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  }

  function renderProfileListItem(profile: Profile, meta: string, keyPrefix: string) {
    const isFavorite = favoriteIdSet.has(profile.id);
    const isBookmarked = bookmarkIdSet.has(profile.id);
    const hasX = Boolean(buildXUrl(profile.xId ?? ""));

    return (
      <button
        key={`${keyPrefix}-${profile.id}`}
        type="button"
        className="toc-item"
        onClick={() => jumpToProfileById(profile.id)}
      >
        <span className="toc-main">
          <span className="toc-avatar">
            <ProfileAvatar name={profile.name} xId={profile.xId ?? ""} />
          </span>

          <span className="toc-copy">
            <span className="toc-row">
              <span className="toc-name">{profile.name}</span>
              <InlineIndicators
                hasX={hasX}
                isFavorite={isFavorite}
                isBookmarked={isBookmarked}
              />
            </span>
            <span className="toc-meta">{meta}</span>
          </span>
        </span>
      </button>
    );
  }

  if (loading) {
    return (
      <main className="book-app-shell book-app-shell-fixed book-app-shell-balanced">
        <section className="book-loading-sheet book-loading-sheet-balanced">
          <div className="book-loading-card">
            <p className="loading-copy">プロフィールを読み込んでいます…</p>
          </div>
        </section>
      </main>
    );
  }

  if (bookPages.length === 1) {
    return (
      <main className="book-app-shell book-app-shell-fixed book-app-shell-balanced">
        <section className="book-empty-wrap book-empty-wrap-balanced">
          <EmptyState label="プロフィールがまだありません。先にデータを追加してください。" />
        </section>
      </main>
    );
  }

  return (
    <main className="book-app-shell book-app-shell-fixed book-app-shell-balanced">
      <section
        className="book-stage book-stage-fixed book-stage-balanced"
        aria-label="プロフィールブック"
      >
        <div className="book-shelf-glow book-shelf-glow-a" />
        <div className="book-shelf-glow book-shelf-glow-b" />

        <div
          ref={scrollerRef}
          className="book-carousel"
          onScroll={handleScrollerScroll}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <article
            ref={(element) => {
              pageRefs.current[0] = element;
            }}
            className={`paper-sheet book-page book-cover-page ${
              currentIndex === 0 ? "is-active" : ""
            }`}
            aria-current={currentIndex === 0 ? "page" : undefined}
          >
            <div
              ref={(element) => {
                pageScrollRefs.current[0] = element;
              }}
              className="book-page-scroll cover-page-scroll"
            >
              <div className="cover-ornament cover-ornament-a" />
              <div className="cover-ornament cover-ornament-b" />
              <div className="cover-ornament cover-ornament-c" />

              <section className="cover-sheet-inner">
                <div className="cover-kicker">PROFILE BOOK</div>
                <h1 className="cover-title">プレパレ！</h1>
                <p className="cover-subtitle">みんなのプロフィール帳</p>
                <p className="cover-copy">
                  ページをめくりながら、参加メンバーのことをゆっくり知れるプロフィール帳です。
                </p>
                <button
                  type="button"
                  className="cover-button"
                  onClick={() => scrollToIndex(1)}
                >
                  1ページ目へ
                </button>
                <p className="cover-hint">
                  左へフリックすると、そのままプロフィール帳へ進めます。
                </p>
              </section>
            </div>
          </article>

          {filteredProfiles.map((profile, index) => {
            const xUrl = buildXUrl(profile.xId ?? "");
            const pageIndex = index + 1;
            const isActive = pageIndex === currentIndex;
            const isFavorite = favoriteIdSet.has(profile.id);
            const isBookmarked = bookmarkIdSet.has(profile.id);

            return (
              <article
                key={profile.id}
                ref={(element) => {
                  pageRefs.current[pageIndex] = element;
                }}
                className={`paper-sheet profile-paper ${
                  isActive ? "is-active" : ""
                } ${isBookmarked ? "is-bookmarked" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {isBookmarked ? (
                  <div className="paper-bookmark-ribbon" aria-hidden="true">
                    <BookmarkIcon filled />
                  </div>
                ) : null}

                <div className="profile-paper-frame">
                  <div className="paper-spine" aria-hidden="true" />
                  <div className="paper-corner paper-corner-a" aria-hidden="true" />
                  <div className="paper-corner paper-corner-b" aria-hidden="true" />
                  <div className="paper-sparkle paper-sparkle-a" aria-hidden="true" />
                  <div className="paper-sparkle paper-sparkle-b" aria-hidden="true" />

                  <div
                    ref={(element) => {
                      pageScrollRefs.current[pageIndex] = element;
                    }}
                    className="book-page-scroll profile-page-scroll"
                  >
                    <header className="profile-paper-header profile-paper-header-balanced">
                      <div className="profile-top-row">
                        <div className="profile-avatar-box">
                          <ProfileAvatar name={profile.name} xId={profile.xId ?? ""} />
                        </div>

                        <div className="profile-heading-copy">
                          <div className="profile-kicker">PROFILE</div>
                          <h2 className="profile-name">{profile.name}</h2>
                        </div>

                        <div className="profile-head-actions">
                          <button
                            type="button"
                            className={`icon-toggle-button ${isFavorite ? "is-active" : ""}`}
                            aria-label={isFavorite ? "お気に入りを解除" : "お気に入りに追加"}
                            onClick={() => toggleFavorite(profile.id)}
                          >
                            <HeartIcon filled={isFavorite} />
                          </button>

                          <button
                            type="button"
                            className={`icon-toggle-button ${isBookmarked ? "is-active" : ""}`}
                            aria-label={isBookmarked ? "ブックマークを解除" : "ブックマークに追加"}
                            onClick={() => toggleBookmark(profile.id)}
                          >
                            <BookmarkIcon filled={isBookmarked} />
                          </button>

                          {xUrl ? (
                            <a
                              href={xUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="profile-x-link"
                              aria-label={`${profile.name}のXアカウント`}
                            >
                              <XIcon />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </header>

                    <section className="paper-section">
                      <h3 className="paper-section-title">この人らしさ</h3>

                      <div className="paper-item-block">
                        <button
                          type="button"
                          className="paper-label-button"
                          onClick={(e) => openFieldInspector(e, "interests", "興味のあるもの")}
                        >
                          興味のあるもの
                        </button>

                        <div className="paper-tags">
                          {(profile.interests ?? []).map((item, itemIndex) => (
                            <button
                              key={`interests-${profile.id}-${item}-${itemIndex}`}
                              type="button"
                              className="paper-tag-button"
                              onClick={(e) =>
                                openValueInspector(e, "interests", "興味のあるもの", item)
                              }
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="paper-item-block">
                        <button
                          type="button"
                          className="paper-label-button"
                          onClick={(e) => openFieldInspector(e, "favorites", "好きなこと・もの")}
                        >
                          好きなこと・もの
                        </button>

                        <div className="paper-tags paper-tags-inline">
                          {(profile.favorites ?? [])
                            .filter(Boolean)
                            .map((item, itemIndex) => (
                              <button
                                key={`favorites-${profile.id}-${item}-${itemIndex}`}
                                type="button"
                                className="paper-tag-button paper-tag-soft-button"
                                onClick={(e) =>
                                  openValueInspector(e, "favorites", "好きなこと・もの", item)
                                }
                              >
                                {item}
                              </button>
                            ))}
                        </div>
                      </div>
                    </section>

                    <section className="paper-section">
                      <h3 className="paper-section-title">話しかけるヒント</h3>

                      <div className="paper-list-block">
                        <TokenFieldBlock
                          label="好きな食べ物・飲み物"
                          fieldKey="food"
                          items={profile.foodTokens ?? []}
                          onOpenField={openFieldInspector}
                          onOpenValue={openValueInspector}
                        />

                        <TokenFieldBlock
                          label="よく出没する場所"
                          fieldKey="place"
                          items={profile.placeTokens ?? []}
                          onOpenField={openFieldInspector}
                          onOpenValue={openValueInspector}
                        />

                        <TokenFieldBlock
                          label="学生時代の部活動"
                          fieldKey="club"
                          items={profile.clubTokens ?? []}
                          onOpenField={openFieldInspector}
                          onOpenValue={openValueInspector}
                        />

                        <TokenFieldBlock
                          label="最近ハマっていること"
                          fieldKey="recent"
                          items={profile.recentTokens ?? []}
                          onOpenField={openFieldInspector}
                          onOpenValue={openValueInspector}
                        />
                      </div>
                    </section>

                    <section className="paper-section">
                      <h3 className="paper-section-title">もっと知りたい</h3>

                      <div className="paper-list-block">
                        <div className="paper-item">
                          <button
                            type="button"
                            className="paper-label-button"
                            onClick={(e) =>
                              openFieldInspector(e, "recommendation", "おすすめしたいコンテンツ")
                            }
                          >
                            おすすめしたいコンテンツ
                          </button>
                          <button
                            type="button"
                            className="paper-value-button"
                            onClick={(e) =>
                              openValueInspector(
                                e,
                                "recommendation",
                                "おすすめしたいコンテンツ",
                                profile.recommendation || ""
                              )
                            }
                            disabled={!profile.recommendation}
                          >
                            {profile.recommendation || "―"}
                          </button>
                        </div>

                        <div className="paper-item">
                          <button
                            type="button"
                            className="paper-label-button"
                            onClick={(e) => openFieldInspector(e, "topics", "興味のある話題")}
                          >
                            興味のある話題
                          </button>
                          <button
                            type="button"
                            className="paper-value-button"
                            onClick={(e) =>
                              openValueInspector(
                                e,
                                "topics",
                                "興味のある話題",
                                profile.topics || ""
                              )
                            }
                            disabled={!profile.topics}
                          >
                            {profile.topics || "―"}
                          </button>
                        </div>
                      </div>
                    </section>

                    <section className="paper-message">
                      <button
                        type="button"
                        className="paper-label-button paper-label-button-message"
                        onClick={(e) => openFieldInspector(e, "message", "ひとこと")}
                      >
                        ひとこと
                      </button>

                      <button
                        type="button"
                        className="paper-message-button"
                        onClick={(e) =>
                          openValueInspector(e, "message", "ひとこと", profile.message || "")
                        }
                        disabled={!profile.message}
                      >
                        {profile.message || "―"}
                      </button>
                    </section>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <nav className="bottom-dock" aria-label="ページ移動">
        <button
          type="button"
          className="nav-button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="前のページへ"
        >
          <ChevronIcon dir="left" />
          <span>前へ</span>
        </button>

        <button
          type="button"
          className="nav-button nav-button-center"
          onClick={openToc}
          aria-label="一覧を開く"
        >
          <span>一覧</span>
        </button>

        <button
          type="button"
          className="nav-button"
          onClick={goNext}
          disabled={currentIndex === bookPages.length - 1}
          aria-label="次のページへ"
        >
          <span>次へ</span>
          <ChevronIcon dir="right" />
        </button>
      </nav>

      {panel && panelLayout ? (
        <div className="floating-layer" onClick={() => setPanel(null)}>
          <section
            className="floating-sheet"
            onClick={(e) => e.stopPropagation()}
            style={
              {
                top: `${panelLayout.top}px`,
                left: `${panelLayout.left}px`,
                width: `${panelLayout.width}px`,
                maxHeight: `${panelLayout.maxHeight}px`,
              } as CSSProperties
            }
          >
            <div className="floating-sheet-head">
              <h2>
                {panel.mode === "toc"
                  ? "一覧"
                  : panel.mode === "field"
                    ? panel.fieldLabel
                    : `「${panel.selectedValue}」`}
              </h2>
              <button type="button" className="search-close" onClick={() => setPanel(null)}>
                閉じる
              </button>
            </div>

            {panel.mode === "toc" ? (
              <>
                <div className="toc-filter-row">
                  <button
                    type="button"
                    className={`toc-filter-chip ${tocFilter === "all" ? "is-active" : ""}`}
                    onClick={() => setTocFilter("all")}
                  >
                    全員
                  </button>
                  <button
                    type="button"
                    className={`toc-filter-chip ${tocFilter === "favorites" ? "is-active" : ""}`}
                    onClick={() => setTocFilter("favorites")}
                  >
                    お気に入り
                  </button>
                  <button
                    type="button"
                    className={`toc-filter-chip ${tocFilter === "bookmarks" ? "is-active" : ""}`}
                    onClick={() => setTocFilter("bookmarks")}
                  >
                    ブックマーク
                  </button>
                </div>

                <div className="floating-list floating-list-topless">
                  <button
                    type="button"
                    className="toc-item toc-item-cover"
                    onClick={() => {
                      scrollToIndex(0);
                      setPanel(null);
                    }}
                  >
                    <span className="toc-name">表紙</span>
                    <span className="toc-meta">プロフィール帳の入口に戻る</span>
                  </button>

                  {tocProfiles.map((profile) =>
                    renderProfileListItem(
                      profile,
                      (profile.favorites ?? []).slice(0, 2).join(" / ") || "プロフィールを見る",
                      "toc"
                    )
                  )}

                  {tocProfiles.length === 0 ? (
                    <p className="inspector-empty">該当するプロフィールがありません。</p>
                  ) : null}
                </div>
              </>
            ) : panel.mode === "field" ? (
              <>
                <div className="inspector-picked-value">みんなの「{panel.fieldLabel}」</div>
                <div className="floating-list">
                  {fieldEntries.length > 0 ? (
                    fieldEntries.map((entry) =>
                      renderProfileListItem(
                        entry.profile,
                        entry.summary || "プロフィールを見る",
                        "field"
                      )
                    )
                  ) : (
                    <p className="inspector-empty">該当するプロフィールがありません。</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="inspector-picked-value">
                  「{panel.selectedValue}」を書いている人
                </div>
                <div className="floating-list">
                  {sameValueProfiles.length > 0 ? (
                    sameValueProfiles.map((entry) =>
                      renderProfileListItem(
                        entry.profile,
                        entry.matchedFields.map((f) => f.label).join(" / "),
                        "value"
                      )
                    )
                  ) : (
                    <p className="inspector-empty">同じ内容を書いている人はいません。</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}