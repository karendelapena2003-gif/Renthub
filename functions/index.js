const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "YOUR_EMAIL@gmail.com",
    pass: "YOUR_APP_PASSWORD"
  }
});

exports.sendEmailOTP = functions.https.onCall(async (data) => {
  const { email } = data;
  const user = await admin.auth().getUserByEmail(email);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await db.collection("passwordOtps").doc(email).set({
    otp,
    uid: user.uid,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  await transporter.sendMail({
    from: "RentHub <YOUR_EMAIL@gmail.com>",
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP is: ${otp}`
  });

  return { success: true };
});

exports.verifyOtpAndChangePassword = functions.https.onCall(async (data) => {
  const { email, otp, newPassword } = data;
  const doc = await db.collection("passwordOtps").doc(email).get();

  if (!doc.exists()) throw new Error("OTP not found");

  const record = doc.data();
  if (record.expiresAt < Date.now()) throw new Error("OTP expired");
  if (record.otp !== otp) throw new Error("Invalid OTP");

  await admin.auth().updateUser(record.uid, { password: newPassword });
  await db.collection("passwordOtps").doc(email).delete();

  return { success: true };
});
