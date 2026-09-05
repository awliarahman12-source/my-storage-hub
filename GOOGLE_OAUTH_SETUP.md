# Google OAuth Setup Guide

This guide walks you through configuring Google Cloud to enable Google Drive OAuth for My Storage Hub.

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**.
3. Enter a name (e.g. "My Storage Hub") and click **Create**.
4. Switch to the new project.

## 2. Enable Google Drive API

1. In the sidebar, go to **APIs & Services > Library**.
2. Search for **Google Drive API**.
3. Click it and press **Enable**.

## 3. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**.
2. Choose **External** and click **Create**.
3. Fill in:
   - **App name**: My Storage Hub
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue**.
5. On the **Scopes** page, add:
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
6. Click **Save and Continue**.
7. Add any test users if in testing mode, then finish.

## 4. Create OAuth Client Credentials

1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Application type: **Web application**.
4. Name: "My Storage Hub Backend".
5. Under **Authorized redirect URIs**, add:
   - For local development: `https://iahedaeqytmfmscgagcu.supabase.co/functions/v1/google-drive-auth/callback`
   - For production: `https://<your-project>.supabase.co/functions/v1/google-drive-auth/callback`
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

## 5. Set Environment Variables

Add the following to your Supabase Edge Function secrets (via Supabase Dashboard > Edge Functions > Secrets) or your local `.env`:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://iahedaeqytmfmscgagcu.supabase.co/functions/v1/google-drive-auth/callback
APP_ORIGIN=http://localhost:5173
```

For production, set `APP_ORIGIN` to your deployed app URL (e.g. `https://your-app.vercel.app`).

**Important**: Never commit real credentials to source code or Git. The `.env` file is already in `.gitignore`.

## 6. Run the Application

```bash
npm install
npm run dev
```

Open the app in your browser. The dashboard should show "0 drives connected" with an "Add Google Drive" button.

## 7. Test Connect Google Drive

1. Click **Add Google Drive** on the dashboard.
2. You will be redirected to Google's OAuth consent screen.
3. Select a Google account and approve the permissions.
4. You will be redirected back to the dashboard.
5. The connected Google Drive account should appear as a Storage Node card.
6. Connect a second Google account — both should appear simultaneously.

## 8. Test Disconnect

1. Click **Disconnect** on any Storage Node card.
2. The node is removed from the pool.
3. The real Google Drive and its files are not affected.

## Security Notes

- OAuth tokens (access + refresh) are stored server-side in the Supabase database only.
- The frontend never receives or stores tokens.
- No tokens are placed in localStorage, sessionStorage, or URLs.
- The `access_token` and `refresh_token` columns are never returned to the frontend — only safe columns (id, email, name, avatar, status, etc.) are exposed via the edge function API.
- OAuth state validation prevents CSRF attacks.
- `prompt=select_account` ensures users can connect multiple Google accounts.
