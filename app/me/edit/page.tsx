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
	<section className="cardSection">
  	<div className="sectionHeader">
    	<div>
      	<h3 className="sectionTitle">{label}</h3>
      	{description ? <p className="sectionDescription">{description}</p> : null}
    	</div>

    	<button
      	type="button"
      	onClick={addItem}
      	disabled={disabled}
      	className="addButton"
    	>
      	＋ {addLabel}
    	</button>
  	</div>

  	{items.length === 0 ? (
    	<div className="emptyBox">
      	まだ項目がありません。右上の「追加」ボタンから登録できます。
    	</div>
  	) : null}

  	<div className="listWrap">
    	{items.map((item, index) => (
      	<div key={`${label}-${index}`} className="listRow">
        	<input
          	value={item}
          	onChange={(e) => updateItem(index, e.target.value)}
          	placeholder={placeholder}
          	disabled={disabled}
          	className="textInput"
        	/>

        	<div className="rowButtons">
          	<button
            	type="button"
            	onClick={() => updateItem(index, "")}
            	disabled={disabled}
            	className="subButton"
          	>
            	クリア
          	</button>

          	<button
            	type="button"
            	onClick={() => removeItem(index)}
            	disabled={disabled}
            	className="dangerButton"
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



  useEffect(() => {
	document.body.style.overflow = "auto";
	document.documentElement.style.overflow = "auto";

	return () => {
		document.body.style.overflow = "auto";
		document.documentElement.style.overflow = "auto";
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

	if (!auth.currentUser || !profile) return;

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
  	setPasswordMessage("パスワードを更新しました。続けてプロフィールを編集できます。");
	} catch (err) {
  	console.error(err);
  	setPasswordMessage("パスワード変更に失敗しました。再ログイン直後にもう一度お試しください。");
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
	return <main className="loading">読み込み中...</main>;
  }

  if (error && !profile) {
	return <main className="errorOnly">{error}</main>;
  }

  if (!profile) return null;

  const editLocked = !!profile.needsPasswordChange || saving;

  return (
	<main className="page">
  	<div className="headerCard">
    	<div className="headerTop">
      	<div>
        	<h1 className="pageTitle">自分のプロフィール編集</h1>
        	<p className="subTitle">
          	{profile.name} / {profile.xId}
        	</p>
        	<p className="note">
          	スマホ向けに、追加・編集・削除しやすい形にしています。
        	</p>
      	</div>

      	<button
        	onClick={() => signOut(auth).then(() => router.replace("/login"))}
        	className="logoutButton"
      	>
        	ログアウト
      	</button>
    	</div>
  	</div>

  	{profile.needsPasswordChange ? (
    	<section className="warningCard">
      	<h2 className="warningTitle">最初にパスワードを変更してください</h2>
      	<p className="warningText">
        	初期パスワードのままではプロフィールを編集できません。
      	</p>

      	<form onSubmit={onChangePassword} className="passwordForm">
        	<input
          	type="password"
          	value={newPassword}
          	onChange={(e) => setNewPassword(e.target.value)}
          	placeholder="新しいパスワード（8文字以上）"
          	className="textInput"
        	/>
        	<input
          	type="password"
          	value={newPassword2}
          	onChange={(e) => setNewPassword2(e.target.value)}
          	placeholder="確認用パスワード"
          	className="textInput"
        	/>
        	{passwordMessage ? (
          	<div className="passwordMessage">{passwordMessage}</div>
        	) : null}
        	<button type="submit" className="primaryButton">
          	パスワードを変更する
        	</button>
      	</form>
    	</section>
  	) : null}

  	<form onSubmit={onSave} className="formArea">
    	<fieldset disabled={editLocked} className="fieldSet">
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

      	<section className="cardSection">
        	<h3 className="sectionTitle">文章項目</h3>

        	<div className="textGroup">
          	<label className="field">
            	<span className="fieldLabel">興味のある話題</span>
            	<input
              	value={profile.topics || ""}
              	onChange={(e) => setProfile({ ...profile, topics: e.target.value })}
              	className="textInput"
            	/>
          	</label>

          	<label className="field">
            	<span className="fieldLabel">おすすめしたいコンテンツ</span>
            	<input
              	value={profile.recommendation || ""}
              	onChange={(e) =>
                	setProfile({ ...profile, recommendation: e.target.value })
              	}
              	className="textInput"
            	/>
          	</label>

          	<label className="field">
            	<span className="fieldLabel">ひとこと</span>
            	<textarea
              	value={profile.message}
              	onChange={(e) => setProfile({ ...profile, message: e.target.value })}
              	rows={5}
              	className="textArea"
            	/>
          	</label>
        	</div>
      	</section>

      	{error ? <div className="errorBox">{error}</div> : null}
    	</fieldset>

    	<div className="stickySaveBar">
      	<button type="submit" className="saveButton">
        	{saving ? "保存中..." : "変更を保存する"}
      	</button>
    	</div>
  	</form>

  	<style jsx>{`
    	.page {
      	min-height: 100dvh;
      	background: #f8fafc;
      	padding: 16px 12px 96px;
    	}

    	.loading,
    	.errorOnly {
      	padding: 24px;
    	}

    	.errorOnly {
      	color: #b91c1c;
    	}

    	.headerCard,
    	.warningCard,
    	.cardSection {
      	background: #ffffff;
      	border: 1px solid #e5e7eb;
      	border-radius: 16px;
      	padding: 16px;
      	box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    	}

    	.headerTop {
      	display: flex;
      	justify-content: space-between;
      	gap: 12px;
      	align-items: flex-start;
      	flex-wrap: wrap;
    	}

    	.pageTitle {
      	margin: 0;
      	font-size: 26px;
      	line-height: 1.25;
      	font-weight: 800;
      	color: #111827;
    	}

    	.subTitle {
      	margin: 8px 0 0;
      	color: #374151;
      	font-size: 15px;
    	}

    	.note {
      	margin: 8px 0 0;
      	color: #6b7280;
      	font-size: 13px;
      	line-height: 1.6;
    	}

    	.logoutButton {
      	min-height: 44px;
      	padding: 10px 14px;
      	border-radius: 12px;
      	border: 1px solid #d1d5db;
      	background: #fff;
      	font-weight: 700;
    	}

    	.warningCard {
      	margin-top: 16px;
      	border-color: #f59e0b;
      	background: #fffbeb;
    	}

    	.warningTitle {
      	margin: 0;
      	font-size: 20px;
      	font-weight: 800;
    	}

    	.warningText {
      	margin: 8px 0 0;
      	color: #444;
      	line-height: 1.7;
    	}

    	.passwordForm,
    	.formArea,
    	.fieldSet,
    	.textGroup {
      	display: grid;
      	gap: 14px;
    	}

    	.passwordForm {
      	margin-top: 14px;
    	}

    	.passwordMessage {
      	font-size: 14px;
      	color: #444;
      	background: rgba(255, 255, 255, 0.7);
      	border-radius: 10px;
      	padding: 10px 12px;
    	}

    	.field {
      	display: grid;
      	gap: 6px;
    	}

    	.fieldLabel {
      	font-size: 14px;
      	font-weight: 700;
      	color: #374151;
    	}

    	.sectionHeader {
      	display: flex;
      	justify-content: space-between;
      	gap: 12px;
      	align-items: flex-start;
      	flex-wrap: wrap;
      	margin-bottom: 12px;
    	}

    	.sectionTitle {
      	margin: 0;
      	font-size: 18px;
      	font-weight: 800;
      	color: #111827;
    	}

    	.sectionDescription {
      	margin: 6px 0 0;
      	color: #6b7280;
      	font-size: 13px;
      	line-height: 1.6;
    	}

    	.emptyBox {
      	padding: 12px;
      	border-radius: 12px;
      	background: #f9fafb;
      	color: #6b7280;
      	font-size: 14px;
      	line-height: 1.6;
      	margin-bottom: 10px;
    	}

    	.listWrap {
      	display: grid;
      	gap: 10px;
    	}

    	.listRow {
      	display: grid;
      	gap: 8px;
      	align-items: stretch;
    	}

    	.rowButtons {
      	display: grid;
      	grid-template-columns: 1fr 1fr;
      	gap: 8px;
    	}

    	.textInput,
    	.textArea {
      	width: 100%;
      	min-height: 48px;
      	padding: 12px 14px;
      	border: 1px solid #d1d5db;
      	border-radius: 12px;
      	font-size: 16px;
      	background: #fff;
      	outline: none;
    	}

    	.textArea {
      	min-height: 120px;
      	resize: vertical;
    	}

    	.textInput:focus,
    	.textArea:focus {
      	border-color: #2563eb;
      	box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
    	}

    	.addButton,
    	.primaryButton,
    	.saveButton,
    	.subButton,
    	.dangerButton {
      	min-height: 44px;
      	border-radius: 12px;
      	font-size: 14px;
      	font-weight: 800;
    	}

    	.addButton {
      	padding: 10px 14px;
      	border: 1px solid #2563eb;
      	background: #eff6ff;
      	color: #1d4ed8;
    	}

    	.primaryButton {
      	border: 0;
      	background: #111827;
      	color: #fff;
      	padding: 12px 16px;
    	}

    	.saveButton {
      	width: 100%;
      	border: 0;
      	background: #2563eb;
      	color: #fff;
      	padding: 14px 18px;
      	font-size: 16px;
    	}

    	.subButton {
      	border: 1px solid #d1d5db;
      	background: #fff;
      	color: #374151;
    	}

    	.dangerButton {
      	border: 1px solid #ef4444;
      	background: #fef2f2;
      	color: #b91c1c;
    	}

    	.errorBox {
      	color: #b91c1c;
      	background: #fef2f2;
      	border: 1px solid #fecaca;
      	border-radius: 12px;
      	padding: 12px;
      	line-height: 1.6;
    	}

    	.stickySaveBar {
      	position: sticky;
      	bottom: 12px;
      	margin-top: 18px;
      	padding-top: 4px;
    	}

    	@media (min-width: 768px) {
      	.page {
        	max-width: 980px;
        	margin: 0 auto;
        	padding: 24px 20px 110px;
      	}

      	.listRow {
        	grid-template-columns: 1fr auto;
        	align-items: center;
      	}

      	.rowButtons {
        	grid-template-columns: auto auto;
      	}

      	.saveButton {
        	max-width: 220px;
        	margin-left: auto;
        	display: block;
      	}

      	.stickySaveBar {
        	display: flex;
        	justify-content: flex-end;
      	}
    	}
  	`}</style>
	</main>
  );
}
