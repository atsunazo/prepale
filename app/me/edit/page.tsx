"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, updatePassword } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Profile } from "@/types/profile";
import { buildSearchText, normalizeList } from "@/lib/profile-utils";
import styles from "./page.module.css";

type ProfileDoc = Profile & {
  id: string;
};

type ListEditorProps = {
  label: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  addLabel?: string;
};

function ListEditor({
  label,
  description,
  items,
  onChange,
  disabled,
  placeholder = "項目を入力",
  addLabel = "項目を追加",
}: ListEditorProps) {
  function updateItem(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function removeItem(index: number) {
    const next = items.filter((_, i) => i !== index);
    onChange(next);
  }

  function addItem() {
    onChange([...items, ""]);
  }

  return (
    <section className={styles.cardSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>{label}</h3>
          {description ? (
            <p className={styles.sectionDescription}>{description}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={addItem}
          disabled={disabled}
          className={styles.addButton}
        >
          ＋ {addLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyBox}>
          まだ項目がありません。右上の「追加」ボタンから登録できます。
        </div>
      ) : null}

      <div className={styles.listWrap}>
        {items.map((item, index) => (
          <div key={`${label}-${index}`} className={styles.listRow}>
            <input
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className={styles.textInput}
            />

            <div className={styles.rowButtons}>
              <button
                type="button"
                onClick={() => updateItem(index, "")}
                disabled={disabled}
                className={styles.subButton}
              >
                クリア
              </button>

              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={disabled}
                className={styles.dangerButton}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function EditMyProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [docId, setDocId] = useState("");
  const [profile, setProfile] = useState<ProfileDoc | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = window.navigator.userAgent || "";
    const android = /Android/i.test(ua);
    setIsAndroid(android);

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    if (android) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const q = query(
          collection(db, "profiles"),
          where("authUid", "==", user.uid),
          limit(1)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          setError("本人のプロフィールが見つかりませんでした。");
          setLoading(false);
          return;
        }

        const found = snap.docs[0];
        const data = found.data() as Profile;

        setDocId(found.id);
        setProfile({
          ...data,
          id: found.id,
          interests: data.interests ?? [],
          favorites: data.favorites ?? [],
          foodTokens: data.foodTokens ?? [],
          placeTokens: data.placeTokens ?? [],
          clubTokens: data.clubTokens ?? [],
          recentTokens: data.recentTokens ?? [],
        });
      } catch (err) {
        console.error(err);
        setError("プロフィールの読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function onChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage("");

    if (!auth.currentUser || !profile || !docId) return;

    if (!newPassword || newPassword.length < 8) {
      setPasswordMessage("新しいパスワードは8文字以上で入力してください。");
      return;
    }

    if (newPassword !== newPassword2) {
      setPasswordMessage("確認用パスワードが一致しません。");
      return;
    }

    try {
      await updatePassword(auth.currentUser, newPassword);
      await updateDoc(doc(db, "profiles", docId), {
        needsPasswordChange: false,
      });

      setProfile({ ...profile, needsPasswordChange: false });
      setNewPassword("");
      setNewPassword2("");
      setPasswordMessage(
        "パスワードを更新しました。続けてプロフィールを編集できます。"
      );
    } catch (err) {
      console.error(err);
      setPasswordMessage(
        "パスワード変更に失敗しました。再ログイン直後にもう一度お試しください。"
      );
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile || !docId) return;

    setSaving(true);
    setError("");

    try {
      const interests = normalizeList(profile.interests);
      const favorites = normalizeList(profile.favorites);
      const foodTokens = normalizeList(profile.foodTokens ?? []);
      const placeTokens = normalizeList(profile.placeTokens ?? []);
      const clubTokens = normalizeList(profile.clubTokens ?? []);
      const recentTokens = normalizeList(profile.recentTokens ?? []);

      const payload: Partial<Profile> = {
        interests,
        favorites,
        foodTokens,
        placeTokens,
        clubTokens,
        recentTokens,
        recommendation: (profile.recommendation || "").trim(),
        topics: (profile.topics || "").trim(),
        message: profile.message.trim(),
        searchText: buildSearchText({
          name: profile.name,
          xId: profile.xId,
          team: profile.team,
          interests,
          favorites,
          foodTokens,
          placeTokens,
          clubTokens,
          recentTokens,
          recommendation: (profile.recommendation || "").trim(),
          topics: (profile.topics || "").trim(),
          message: profile.message.trim(),
        }),
      };

      await updateDoc(doc(db, "profiles", docId), payload);

      setProfile({
        ...profile,
        interests,
        favorites,
        foodTokens,
        placeTokens,
        clubTokens,
        recentTokens,
        recommendation: (profile.recommendation || "").trim(),
        topics: (profile.topics || "").trim(),
        message: profile.message.trim(),
        searchText: payload.searchText || "",
      });

      alert("保存しました。");
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className={styles.loading}>読み込み中...</main>;
  }

  if (error && !profile) {
    return <main className={styles.errorOnly}>{error}</main>;
  }

  if (!profile) return null;

  const editLocked = !!profile.needsPasswordChange || saving;

  return (
    <main
      className={`${styles.page} ${isAndroid ? styles.pageAndroidScroll : ""}`}
    >
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.pageTitle}>自分のプロフィール編集</h1>
            <p className={styles.subTitle}>
              {profile.name} / {profile.xId}
            </p>
            <p className={styles.note}>
              スマホ向けに、追加・編集・削除しやすい形にしています。
            </p>
          </div>

          <button
            type="button"
            onClick={() => signOut(auth).then(() => router.replace("/login"))}
            className={styles.logoutButton}
          >
            ログアウト
          </button>
        </div>
      </div>

      {profile.needsPasswordChange ? (
        <section className={styles.warningCard}>
          <h2 className={styles.warningTitle}>
            最初にパスワードを変更してください
          </h2>
          <p className={styles.warningText}>
            初期パスワードのままではプロフィールを編集できません。
          </p>

          <form onSubmit={onChangePassword} className={styles.passwordForm}>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新しいパスワード（8文字以上）"
              className={styles.textInput}
            />
            <input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              placeholder="確認用パスワード"
              className={styles.textInput}
            />
            {passwordMessage ? (
              <div className={styles.passwordMessage}>{passwordMessage}</div>
            ) : null}
            <button type="submit" className={styles.primaryButton}>
              パスワードを変更する
            </button>
          </form>
        </section>
      ) : null}

      <form onSubmit={onSave} className={styles.formArea}>
        <div className={styles.fieldSetLike}>
          <ListEditor
            label="興味のあるもの"
            description="1件ずつ入力・追加・削除できます。"
            items={profile.interests}
            onChange={(items) => setProfile({ ...profile, interests: items })}
            disabled={editLocked}
            placeholder="例：映画、旅行、読書"
            addLabel="興味を追加"
          />

          <ListEditor
            label="好きなこと・もの"
            description="好きなものを1件ずつ管理できます。"
            items={profile.favorites}
            onChange={(items) => setProfile({ ...profile, favorites: items })}
            disabled={editLocked}
            placeholder="例：猫、音楽、カフェ"
            addLabel="好きなものを追加"
          />

          <ListEditor
            label="好きな食べ物・飲み物"
            items={profile.foodTokens ?? []}
            onChange={(items) => setProfile({ ...profile, foodTokens: items })}
            disabled={editLocked}
            placeholder="例：コーヒー、ラーメン"
            addLabel="食べ物・飲み物を追加"
          />

          <ListEditor
            label="よく出没する場所"
            items={profile.placeTokens ?? []}
            onChange={(items) => setProfile({ ...profile, placeTokens: items })}
            disabled={editLocked}
            placeholder="例：図書館、カフェ、体育館"
            addLabel="場所を追加"
          />

          <ListEditor
            label="学生時代の部活動"
            items={profile.clubTokens ?? []}
            onChange={(items) => setProfile({ ...profile, clubTokens: items })}
            disabled={editLocked}
            placeholder="例：吹奏楽、サッカー"
            addLabel="部活動を追加"
          />

          <ListEditor
            label="最近ハマっていること"
            items={profile.recentTokens ?? []}
            onChange={(items) => setProfile({ ...profile, recentTokens: items })}
            disabled={editLocked}
            placeholder="例：散歩、写真、ランニング"
            addLabel="最近のことを追加"
          />

          <section className={styles.cardSection}>
            <h3 className={styles.sectionTitle}>文章項目</h3>

            <div className={styles.textGroup}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>興味のある話題</span>
                <input
                  value={profile.topics || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, topics: e.target.value })
                  }
                  className={styles.textInput}
                  disabled={editLocked}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  おすすめしたいコンテンツ
                </span>
                <input
                  value={profile.recommendation || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, recommendation: e.target.value })
                  }
                  className={styles.textInput}
                  disabled={editLocked}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>ひとこと</span>
                <textarea
                  value={profile.message}
                  onChange={(e) =>
                    setProfile({ ...profile, message: e.target.value })
                  }
                  rows={5}
                  className={styles.textArea}
                  disabled={editLocked}
                />
              </label>
            </div>
          </section>

          {error ? <div className={styles.errorBox}>{error}</div> : null}
        </div>

        <div className={styles.stickySaveBar}>
          <button type="submit" className={styles.saveButton} disabled={saving}>
            {saving ? "保存中..." : "変更を保存する"}
          </button>
        </div>
      </form>
    </main>
  );
}