# v17 email verification fix

Fixed `CSRF_FAILED` on the verification screen.

Changes:
- CSRF header is now sent for `/api/auth/verify-code` and `/api/auth/resend-code` while login/register remain CSRF-exempt.
- Logging into an existing unverified account automatically sends a fresh verification code.
- Added verification/resend rate limiting.
- Improved SMTP error messages in the verification UI.
- Verification checks blocked accounts correctly.
