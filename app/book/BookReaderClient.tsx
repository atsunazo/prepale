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

function normalizeText(value?: string) {
  return (value ?? "").trim();
}

function getFieldValues(profile: Profile, fieldKey: FieldKey): string[] {
  switch (fieldKey) {
    case "interests":
      return (profile.interests ?? []).filter(Boolean).map((v) => v.trim());
    case "favorites":
      return (profile.favorites ?? []).filter(Boolean).map((v) => v.trim());
    case "food":
      return normalizeText(profile.food) ? [profile.food!.trim()] : [];
    case "place":
      return normalizeText(profile.place) ? [profile.place!.trim()] : [];
    case "club":
      return normalizeText(profile.club) ? [profile.club!.trim()] : [];
    case "recent":
      return normalizeText(profile.recent) ? [profile.recent!.trim()] : [];
    case "recommendation":
      return normalizeText(profile.recommendation)
        ? [profile.recommendation!.trim()]
        : [];
    case "topics":
      return normalizeText(profile.topics) ? [profile.topics!.trim()] : [];
    case "message":
      return normalizeText(profile.message) ? [profile.message!.trim()] : [];
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

function ProfileAvatar({ name, xId }: { name: string; xId: string }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidates = useMemo(() => buildAvatarCandidates(xId), [xId]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [xId]);

  const showFallback = candidates.length === 0 || candidateIndex >= candidates.length;
  const fallbackText = (name || "？").slice(0, 2);

  if (showFallback) {
    return (
      <div className="profile-avatar-fallback" aria-label={`${name}のアイコン`}>
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={candidates[candidateIndex]}
      alt={`${name}のアイコン`}
      className="profile-avatar-image"
      onError={() => setCandidateIndex((prev) => prev + 1)}
    />
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="book-empty-state" role="status" aria-live="polite">
      <div className="book-empty-icon">📖</div>
      <p>{label}</p>
    </div>
  );
}

export default function BookReaderClient() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState("");
  const [panel, setPanel] = useState<FloatingPanelState>(null);
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
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

  const filteredProfiles = useMemo(() => {
    const keyword = queryText.trim().toLowerCase();
    if (!keyword) return profiles;

    return profiles.filter((profile) =>
      (profile.searchText ?? "").toLowerCase().includes(keyword)
    );
  }, [profiles, queryText]);

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
    const profileIndex = filteredProfiles.findIndex(
      (profile) => profile.id === pendingProfileId
    );
    if (profileIndex < 0) return;
    scrollToIndex(profileIndex + 1, "smooth");
    setPendingProfileId(null);
  }, [filteredProfiles, pendingProfileId]);

  const fieldEntries = useMemo(() => {
    if (!panel || panel.mode !== "field") return [];

    return profiles
      .map((profile) => ({
        id: profile.id,
        name: profile.name,
        summary: getFieldSummary(profile, panel.fieldKey),
      }))
      .filter((item) => item.summary);
  }, [profiles, panel]);

  const sameValueProfiles = useMemo(() => {
    if (!panel || panel.mode !== "value") return [];

    return profiles
      .map((profile) => ({
        id: profile.id,
        name: profile.name,
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

  function jumpToFilteredIndex(index: number) {
    scrollToIndex(index + 1);
    setPanel(null);
  }

  function jumpToProfileById(profileId: string) {
    setQueryText("");
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

  if (loading) {
    return (
      <main className="book-app-shell">
        <section className="book-loading-sheet">
          <div className="book-loading-card">
            <p className="loading-copy">プロフィールを読み込んでいます…</p>
          </div>
        </section>
      </main>
    );
  }

  if (bookPages.length === 1) {
    return (
      <main className="book-app-shell">
        <header className="book-topbar">
          <button type="button" className="topbar-button" onClick={openToc}>
            検索・目次
          </button>
          <div className="page-indicator">COVER</div>
        </header>
        <section className="book-empty-wrap">
          <EmptyState label="プロフィールがまだありません。先にデータを追加してください。" />
        </section>
      </main>
    );
  }

  return (
    <main className="book-app-shell book-app-shell-fixed">
      <header className="book-topbar">
        <button type="button" className="topbar-button" onClick={openToc}>
          検索・目次
        </button>
        <div className="page-indicator">
          {currentIndex === 0 ? "COVER" : `${currentIndex} / ${filteredProfiles.length}`}
        </div>
      </header>

      <section className="book-stage book-stage-fixed" aria-label="プロフィールブック">
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
            <div className="book-page-scroll cover-page-scroll">
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
            const xUrl = buildXUrl(profile.xId);
            const pageIndex = index + 1;
            const isActive = pageIndex === currentIndex;

            return (
              <article
                key={profile.id}
                ref={(element) => {
                  pageRefs.current[pageIndex] = element;
                }}
                className={`paper-sheet profile-paper ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className="paper-spine" aria-hidden="true" />
                <div className="paper-corner paper-corner-a" aria-hidden="true" />
                <div className="paper-corner paper-corner-b" aria-hidden="true" />
                <div className="paper-sparkle paper-sparkle-a" aria-hidden="true" />
                <div className="paper-sparkle paper-sparkle-b" aria-hidden="true" />

                <div className="book-page-scroll profile-page-scroll">
                  <div className="profile-page-number">p. {String(pageIndex).padStart(2, "0")}</div>

                  <header className="profile-paper-header">
                    <div className="profile-top-row">
                      <div className="profile-avatar-box">
                        <ProfileAvatar name={profile.name} xId={profile.xId} />
                      </div>

                      <div className="profile-heading-copy">
                        <div className="profile-kicker">PROFILE</div>
                        <h2 className="profile-name">{profile.name}</h2>
                      </div>

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
                        {(profile.interests ?? []).map((item) => (
                          <button
                            key={item}
                            type="button"
                            className="paper-tag-button"
                            onClick={(e) => openValueInspector(e, "interests", "興味のあるもの", item)}
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
                        {(profile.favorites ?? []).filter(Boolean).map((item) => (
                          <button
                            key={item}
                            type="button"
                            className="paper-tag-button paper-tag-soft-button"
                            onClick={(e) => openValueInspector(e, "favorites", "好きなこと・もの", item)}
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
                      <div className="paper-item">
                        <button
                          type="button"
                          className="paper-label-button"
                          onClick={(e) => openFieldInspector(e, "food", "好きな食べ物・飲み物")}
                        >
                          好きな食べ物・飲み物
                        </button>
                        <button
                          type="button"
                          className="paper-value-button"
                          onClick={(e) => openValueInspector(e, "food", "好きな食べ物・飲み物", profile.food || "")}
                          disabled={!profile.food}
                        >
                          {profile.food || "―"}
                        </button>
                      </div>

                      <div className="paper-item">
                        <button
                          type="button"
                          className="paper-label-button"
                          onClick={(e) => openFieldInspector(e, "place", "よく出没する場所")}
                        >
                          よく出没する場所
                        </button>
                        <button
                          type="button"
                          className="paper-value-button"
                          onClick={(e) => openValueInspector(e, "place", "よく出没する場所", profile.place || "")}
                          disabled={!profile.place}
                        >
                          {profile.place || "―"}
                        </button>
                      </div>

                      <div className="paper-item">
                        <button
                          type="button"
                          className="paper-label-button"
                          onClick={(e) => openFieldInspector(e, "club", "学生時代の部活動")}
                        >
                          学生時代の部活動
                        </button>
                        <button
                          type="button"
                          className="paper-value-button"
                          onClick={(e) => openValueInspector(e, "club", "学生時代の部活動", profile.club || "")}
                          disabled={!profile.club}
                        >
                          {profile.club || "―"}
                        </button>
                      </div>

                      <div className="paper-item">
                        <button
                          type="button"
                          className="paper-label-button"
                          onClick={(e) => openFieldInspector(e, "recent", "最近ハマっていること")}
                        >
                          最近ハマっていること
                        </button>
                        <button
                          type="button"
                          className="paper-value-button"
                          onClick={(e) => openValueInspector(e, "recent", "最近ハマっていること", profile.recent || "")}
                          disabled={!profile.recent}
                        >
                          {profile.recent || "―"}
                        </button>
                      </div>
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
                          onClick={(e) => openValueInspector(e, "topics", "興味のある話題", profile.topics || "")}
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
                      onClick={(e) => openValueInspector(e, "message", "ひとこと", profile.message || "")}
                      disabled={!profile.message}
                    >
                      {profile.message || "―"}
                    </button>
                  </section>
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

        <button type="button" className="nav-button nav-button-center" onClick={openToc}>
          <span>{currentIndex === 0 ? "目次" : "一覧"}</span>
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
                  ? "検索・目次"
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
                <input
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="名前・好きなこと・話題で検索"
                  className="search-input"
                />

                <div className="floating-list">
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
                  {filteredProfiles.map((profile, index) => (
                    <button
                      key={profile.id}
                      type="button"
                      className="toc-item"
                      onClick={() => jumpToFilteredIndex(index)}
                    >
                      <span className="toc-name">{profile.name}</span>
                      <span className="toc-meta">
                        {(profile.favorites ?? []).slice(0, 2).join(" / ") || "プロフィールを見る"}
                      </span>
                    </button>
                  ))}
                  {filteredProfiles.length === 0 ? (
                    <p className="inspector-empty">一致するプロフィールがありません。</p>
                  ) : null}
                </div>
              </>
            ) : panel.mode === "field" ? (
              <>
                <div className="inspector-picked-value">みんなの「{panel.fieldLabel}」</div>
                <div className="floating-list">
                  {fieldEntries.map((entry) => (
                    <button
                      key={`field-${entry.id}`}
                      type="button"
                      className="toc-item"
                      onClick={() => jumpToProfileById(entry.id)}
                    >
                      <span className="toc-name">{entry.name}</span>
                      <span className="toc-meta">{entry.summary}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="inspector-picked-value">「{panel.selectedValue}」を書いている人</div>
                <div className="floating-list">
                  {sameValueProfiles.length > 0 ? (
                    sameValueProfiles.map((entry) => (
                      <button
                        key={`value-${entry.id}`}
                        type="button"
                        className="toc-item"
                        onClick={() => jumpToProfileById(entry.id)}
                      >
                        <span className="toc-name">{entry.name}</span>
                        <span className="toc-meta">{entry.matchedFields.map((f) => f.label).join(" / ")}</span>
                      </button>
                    ))
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