// Stand-in for a real email provider. Swap the body for Nodemailer/SES/Resend
// and the rest of the app does not change.
export async function sendMail({ to, subject, text }) {
  if (process.env.NODE_ENV !== "test") {
    console.log(`[mail] to=${to} subject="${subject}"\n${text}`);
  }
}
