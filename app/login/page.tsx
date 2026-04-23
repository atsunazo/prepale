"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

const DOMAIN = "profiles.local";

function toEmail(loginId: string) {
  return `${loginId.replace(/^@/, "").trim().toLowerCase()}@${DOMAIN}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailPreview = useMemo(() => {
	if (!loginId.trim()) return "";
	return toEmail(loginId);
  }, [loginId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
	e.preventDefault();
	setError("");
	setLoading(true);

	try {
  	const email = toEmail(loginId);
  	await signInWithEmailAndPassword(auth, email, password);
  	router.push("/me/edit");
	} catch (err) {
  	console.error(err);
  	setError("ログインできませんでした。ID またはパスワードを確認してください。");
	} finally {
  	setLoading(false);
	}
  }

  return (
	<main className="page">
  	<div className="card">
    	<h1 className="title">プロフィール編集ログイン</h1>
    	<p className="lead">ID は X の @ より後ろを入力してください。</p>

    	<form onSubmit={onSubmit} className="form">
      	<label className="field">
        	<span className="label">ログインID</span>
        	<input
          	value={loginId}
          	onChange={(e) => setLoginId(e.target.value)}
          	placeholder="例: prepale"
          	autoComplete="username"
          	className="input"
        	/>
      	</label>

      	<label className="field">
        	<span className="label">パスワード</span>
        	<input
          	type="password"
          	value={password}
          	onChange={(e) => setPassword(e.target.value)}
          	placeholder="パスワード"
          	autoComplete="current-password"
          	className="input"
        	/>
      	</label>

      	{emailPreview ? (
        	<div className="hint">内部認証メール: {emailPreview}</div>
      	) : null}

      	{error ? <div className="error">{error}</div> : null}

      	<button type="submit" disabled={loading} className="primaryButton">
        	{loading ? "ログイン中..." : "ログイン"}
      	</button>
    	</form>
  	</div>

  	<style jsx>{`
    	.page {
      	min-height: 100dvh;
      	display: flex;
      	align-items: center;
      	justify-content: center;
      	padding: 20px 16px;
      	background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
    	}

    	.card {
      	width: 100%;
      	max-width: 440px;
      	background: #ffffff;
      	border: 1px solid #e5e7eb;
      	border-radius: 20px;
      	box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      	padding: 24px 18px;
    	}

    	.title {
      	margin: 0;
      	font-size: 28px;
      	line-height: 1.25;
      	font-weight: 800;
      	color: #111827;
    	}

    	.lead {
      	margin: 10px 0 0;
      	color: #4b5563;
      	font-size: 14px;
      	line-height: 1.7;
    	}

    	.form {
      	display: grid;
      	gap: 14px;
      	margin-top: 22px;
    	}

    	.field {
      	display: grid;
      	gap: 8px;
    	}

    	.label {
      	font-size: 14px;
      	font-weight: 700;
      	color: #374151;
    	}

    	.input {
      	width: 100%;
      	min-height: 48px;
      	padding: 12px 14px;
      	border: 1px solid #d1d5db;
      	border-radius: 12px;
      	font-size: 16px;
      	outline: none;
      	background: #fff;
    	}

    	.input:focus {
      	border-color: #2563eb;
      	box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
    	}

    	.hint {
      	font-size: 12px;
      	color: #6b7280;
      	background: #f9fafb;
      	border: 1px solid #e5e7eb;
      	border-radius: 10px;
      	padding: 10px 12px;
      	word-break: break-all;
    	}

    	.error {
      	color: #b91c1c;
      	background: #fef2f2;
      	border: 1px solid #fecaca;
      	border-radius: 10px;
      	padding: 12px;
      	font-size: 14px;
      	line-height: 1.6;
    	}

    	.primaryButton {
      	min-height: 52px;
      	border: 0;
      	border-radius: 14px;
      	background: #111827;
      	color: #fff;
      	font-size: 16px;
      	font-weight: 800;
      	cursor: pointer;
      	margin-top: 4px;
    	}

    	.primaryButton:disabled {
      	opacity: 0.7;
      	cursor: not-allowed;
    	}

    	@media (max-width: 480px) {
      	.card {
        	padding: 20px 14px;
        	border-radius: 16px;
      	}

      	.title {
        	font-size: 24px;
      	}
    	}
  	`}</style>
	</main>
  );
}
