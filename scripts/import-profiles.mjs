import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse/sync";

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ------------------------------
// 設定
// ------------------------------
const csvPath = process.argv[2] || "./data.csv";
const outputJsonPath = "./seed/profiles.generated.json";
const collectionName = "profiles";

// ------------------------------
// Firebase Admin 初期化
// GOOGLE_APPLICATION_CREDENTIALS を使う前提
// ------------------------------
if (!getApps().length) {
  initializeApp({
	credential: applicationDefault(),
  });
}

const db = getFirestore();

// ------------------------------
// 共通関数
// ------------------------------
function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function splitMulti(value) {
  return clean(value)
	.split(",")
	.map((item) => item.trim())
	.filter(Boolean);
}

function buildFavorites(row) {
  return [
	clean(row["好きなこと・もの①"]),
	clean(row["好きなこと・もの②(任意)"]),
	clean(row["好きなこと・もの③(任意)"]),
  ].filter(Boolean);
}

function buildSearchText(profile) {
  return [
	profile.name,
	profile.xId,
	...profile.interests,
	...profile.favorites,
	profile.food,
	profile.place,
	profile.club,
	profile.recent,
	profile.recommendation,
	profile.topics,
	profile.message,
  ]
	.filter(Boolean)
	.join(" ");
}

function normalizeRow(row, index) {
  const order = index + 1;
  const slug = `member-${String(order).padStart(3, "0")}`;

  const profile = {
	order,
	slug,
	name: clean(row["名前"]),
	xId: clean(row["XのID (@含む) をご入力ください。"]),
	interests: splitMulti(row["興味のあるものを選んでください。(複数回答可)"]),
	favorites: buildFavorites(row),
	food: clean(row["好きな食べ物・飲み物"]),
	place: clean(row["よく出没する場所(任意)"]),
	club: clean(row["学生時代の部活動(任意)"]),
	recent: clean(row["最近ハマっていること(任意)"]),
	recommendation: clean(row["オススメしたいコンテンツ(任意)"]),
	topics: clean(row["興味のある話題(任意)"]),
	message: clean(row["何か一言！"]),
  };

  return {
	...profile,
	searchText: buildSearchText(profile),
  };
}

async function commitInChunks(items, chunkSize = 400) {
  for (let i = 0; i < items.length; i += chunkSize) {
	const chunk = items.slice(i, i + chunkSize);
	const batch = db.batch();

	for (const item of chunk) {
  	const ref = db.collection(collectionName).doc(item.slug);
  	batch.set(ref, item, { merge: true });
	}

	await batch.commit();
	console.log(`Committed ${Math.min(i + chunk.length, items.length)} / ${items.length}`);
  }
}

// ------------------------------
// 実行
// ------------------------------
async function main() {
  const absoluteCsvPath = path.resolve(csvPath);

  if (!fs.existsSync(absoluteCsvPath)) {
	throw new Error(`CSVが見つかりません: ${absoluteCsvPath}`);
  }

  const csvText = fs.readFileSync(absoluteCsvPath, "utf-8");

  const rows = parse(csvText, {
	columns: true,
	skip_empty_lines: true,
	bom: true,
  });

  const profiles = rows.map((row, index) => normalizeRow(row, index));

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, JSON.stringify(profiles, null, 2), "utf-8");

  console.log(`整形JSONを保存しました: ${outputJsonPath}`);
  console.log(`投入対象: ${profiles.length}件`);

  await commitInChunks(profiles);

  console.log("Firestore への投入が完了しました。");
}

main().catch((error) => {
  console.error("エラー:", error);
  process.exit(1);
});

