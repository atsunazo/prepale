// scripts/reset-password.ts
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_PASSWORD = "260516";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const adminAuth = getAuth();
const db = getFirestore();

async function main() {
  const loginId = process.argv[2];

  if (!loginId) {
    throw new Error("loginId を指定してください。例: tsx scripts/reset-password.ts nagashatsu");
  }

  const snap = await db
    .collection("profiles")
    .where("loginId", "==", loginId)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error(`profile not found: ${loginId}`);
  }

  const profileDoc = snap.docs[0];
  const data = profileDoc.data();

  if (!data.authUid) {
    throw new Error(`authUid not found for: ${loginId}`);
  }

  await adminAuth.updateUser(data.authUid, {
    password: DEFAULT_PASSWORD,
  });

  await profileDoc.ref.update({
    needsPasswordChange: true,
  });

  console.log(`OK: ${loginId} のパスワードを初期化しました`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});