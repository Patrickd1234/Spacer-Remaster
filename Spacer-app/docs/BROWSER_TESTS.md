# Browser tests: CAPTCHA and two-factor

Manual checks to run in a real browser before launch. Write Pass or Fail and a note for each.

## Before you start

- Run the app locally with `npm run dev` and open http://localhost:5173. It uses the live Supabase project, so these are real accounts and real emails.
- Use a test account on an address you can read, for example a `+test` alias of your own email. Don't use a redtech.inc account (those are exempt from two-factor) or anyone else's.
- Have an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
- If the CAPTCHA box shows an error instead of a tick, the Turnstile widget doesn't allow `localhost`. Add it in Cloudflare → Turnstile → the widget → Hostnames.
- Delete the test account afterwards (Supabase → Authentication → Users), or tell Claude which one it was.

## CAPTCHA

| # | Steps | Expected | Result |
|---|---|---|---|
| C1 | Open the sign-in page. Fill in the email and password, but don't tick the CAPTCHA. Click **Sign in**. | A CAPTCHA box is shown. **Sign in** stays greyed out, and clicking it asks you to complete the security check. Nothing is sent. | |
| C2 | Sign in with a wrong password. | An error. The CAPTCHA resets by itself. | |
| C3 | Right after C2, solve the CAPTCHA again and sign in with the right password. No page reload. | You're signed in. | |
| C4 | Sign up with a new test address. | A CAPTCHA box is shown. After submitting, the confirmation email arrives from `noreply@spacer.ink`. | |
| C5 | Before confirming, try to sign in with that address. Then click **Resend confirmation email**. | "Please confirm your email before signing in." The resend needs a solved CAPTCHA, and the email arrives. | |
| C6 | Click the confirmation link. | You land on the sign-in page and can sign in. | |
| C7 | Forgot password: enter the test address. | **Send Reset Link** stays disabled until the CAPTCHA is solved. The reset email arrives. Its link opens the reset-password page, and the new password works. | |
| C8 | Sign in with Google. | No CAPTCHA (expected: Google does its own checks). You're signed in. | |

## Two-factor

| # | Steps | Expected | Result |
|---|---|---|---|
| M1 | Sign in with the new test account. | If two-factor is required: the "Set up two-factor sign-in" screen, with no way past it except setting it up or **Sign out**. If it's optional: straight into the app. | |
| M2 | Set up two-factor (on that screen, or in Settings → Two-factor). Enter a wrong code first. | Wrong code: "That code didn't work…". Right code: "Two-factor authentication is on." | |
| M3 | Sign out. Sign in again. | A code screen after the password. "Remember this device for 7 days" is ticked by default. Nothing from the app loads behind it. | |
| M4 | Untick "Remember this device" and enter the code. Sign out, then sign in again. | You're in after the code, and the next sign-in asks for the code again. | |
| M5 | This time leave "Remember this device" ticked. Sign out, then sign in again. | The second sign-in skips the code. | |
| M6 | Settings → Two-factor → **Forget remembered devices**. Sign out, then sign in again. | The code is asked for again. | |
| M7 | On the code screen, click **Sign out**. | Back to the sign-in page. | |
| M8 | Sign in with Google on the test account (if it's a Google address). | The code screen still appears. | |
| M9 | Settings → Two-factor. | If two-factor is required: no way to turn it off. If it's optional: turning it off asks for a code first. | |
| M10 | Open the app in a private window and sign in with the test account. | The code is asked for: a remembered device is per browser. | |

## Two-factor recovery

Needs migration `20261124110000_mfa_recovery` and the `mfa-recovery` edge function deployed. Use a second test account as the admin for R6 to R8. That admin needs two-factor on and must sign in with their code (not a remembered device).

| # | Steps | Expected | Result |
|---|---|---|---|
| R1 | Turn on two-factor in Settings. | After the code, "Save your recovery codes" shows 10 codes. **Done** stays disabled until "I've saved these codes" is ticked. **Download** saves a .txt file and **Copy** copies the same text. | |
| R2 | Close it with **Done**. | "Recovery codes: 10 left" with **Create new codes**. | |
| R3 | **Create new codes**, enter an authenticator code. | 10 new codes. The old ones no longer work (try one in R5). | |
| R4 | Sign out, sign in, and on the code screen choose "Lost your phone? Use a recovery code". Enter a wrong code. | "That recovery code didn't work…". | |
| R5 | Enter a right code (any case, with or without the dash). | "You're back in". **Continue** opens the app. An email "Your Spacer two-factor sign-in was reset" arrives. Settings shows two-factor off. Another browser that was signed in is signed out. | |
| R6 | Turn two-factor on again for the test account. As an Organization Admin or Owner, open the test account in the Directory → **Reset two-factor** → confirm. | "Two-factor reset for …". The test account gets the email, and its next sign-in needs no code. | |
| R7 | As an Organization Admin, try **Reset two-factor** on another Organization Admin or the Owner. | Refused: "Only the Owner can reset an organization admin's two-factor." | |
| R8 | As a Member or Department Admin, open someone in the Directory. | No **Reset two-factor** button. | |
