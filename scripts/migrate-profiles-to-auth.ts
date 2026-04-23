import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const COLLECTION = "profiles";
const DEFAULT_PASSWORD = "9999";
const DOMAIN = "profiles.local"; // 疑似メール用
const DRY_RUN = process.argv.includes("--dry-run");

if (!getApps().length) {
  initializeApp({
	credential: applicationDefault(),
  });
}

const adminAuth = getAuth();
const db = getFirestore();

function clean(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toLoginId(xId: string) {
  return clean(xId).replace(/^@/, "").trim().toLowerCase();
}

function toEmail(loginId: string) {
  return `${loginId}@${DOMAIN}`;
}

async function findOrCreateUser(
  email: string,
  password: string,
  displayName: string
) {
  try {
	return await adminAuth.getUserByEmail(email);
  } catch {
	if (DRY_RUN) {
  	return { uid: `dryrun-${email}` } as { uid: string };
	}

	return await adminAuth.createUser({
  	email,
  	password,
  	displayName,
  	emailVerified: true,
  	disabled: false,
	});
  }
}

async function main() {
  const snap = await db.collection(COLLECTION).get();
  console.log(`profiles: ${snap.size}`);

  // loginId 重複チェック
  const seen = new Map<string, string>();

  for (const doc of snap.docs) {
	const data = doc.data();
	const loginId = toLoginId(clean(data.xId));

	if (!loginId) continue;

	if (seen.has(loginId)) {
  	throw new Error(
    	`loginId が重複しています: ${loginId} / ${seen.get(loginId)} / ${doc.id}`
  	);
	}

	seen.set(loginId, doc.id);
  }

  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
	const data = doc.data();

	const xId = clean(data.xId);
	const loginId = toLoginId(xId);

	if (!loginId) {
  	console.log(`SKIP ${doc.id}: xId が空です`);
  	skipped += 1;
  	continue;
	}

	const email = toEmail(loginId);
	const user = await findOrCreateUser(
  	email,
  	DEFAULT_PASSWORD,
  	clean(data.name)
	);

	const patch = {
  	loginId,
  	authUid: user.uid,
  	authEmail: email,
  	needsPasswordChange:
    	data.needsPasswordChange === false ? false : true,
  	updatedAt: new Date(),
	};

	if (DRY_RUN) {
  	console.log(`DRY ${doc.id}`, patch);
  	updated += 1;
  	continue;
	}

	await doc.ref.set(patch, { merge: true });
	console.log(`OK ${doc.id} -> ${loginId} / ${user.uid}`);
	updated += 1;
  }

  console.log({
	updated,
	skipped,
	dryRun: DRY_RUN,
  });
}

main().catch((error) => {
  console.error("エラー:", error);
  process.exit(1);
});