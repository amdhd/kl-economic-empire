# Firebase cloud saves

Local saves remain available without Firebase or login. Cloud uses Firebase Email/Password Authentication and Realtime Database (save snapshots can exceed Firestore's document size limit).

1. Create a Firebase project and register a Web app. Copy its public web configuration into `.env.local`, using `.env.example` as the template. Never put service account keys in the client.
2. Enable Authentication → Email/Password. Create your single account in the Firebase console (no public registration UI). Add your hosted domain to authorized domains.
3. Create Realtime Database and publish `database.rules.json` in its Rules editor. These rules deny access outside the signed-in user's own slots. For a strictly single-user deployment, disable new end-user sign-up in Authentication settings where supported; user isolation still applies regardless.
4. Set VITE_FIREBASE_DATABASE_URL to that database URL. Restart Vite, or rebuild before publishing to Firebase Hosting.
5. Open Save / Load and sign in. On the original browser, save locally and upload a slot. On another browser, sign in and load that cloud slot. Localhost and hosted local saves are separate.

Upload volume: a save is about 2 MB at the start and about 5 MB after two in-game years. Routine daily autosaves are
therefore coalesced and throttled to at most one upload per slot every 5 minutes, always sending only the newest
snapshot. Pausing, hiding the tab, saving to a manual slot and the campaign end upload immediately. A queued upload is
shown in the status line. Snapshots the game just wrote are not re-parsed before upload.

Only explicitly uploaded/loaded slots sync during a signed-in session. To sync autosaves, upload or load the autosave slot. Reconnect this slot after reopening the page; there is no automatic remote load or unseen overwrite. Concurrent changes are rejected using transactional revision comparison. Load cloud progress to resolve a conflict; first preserve local progress in a different slot. Local writes succeed even when cloud writes fail. Failed network writes show an error; subsequent local saves retry for connected slots. Closing a page may interrupt an upload: check the saved-to-cloud status before switching browsers. Signing out stops syncing but keeps local copies on this device.

Firebase setup and real cross-browser authentication need a configured project; automated local tests do not prove deployed service connectivity. Firebase service quotas/billing apply. The simulation itself remains entirely local, deterministic and paused on load.

## Public hosting

Run `npm run build`, then `npx firebase-tools deploy --only hosting,database --project YOUR_PROJECT_ID` after configuring your Firebase project and `.env.local`. Hosting serves `dist` as a single-page app over HTTPS. Keep using the same deployed domain for local save continuity. Configure Authentication email/password and your account before testing cloud saves on two devices. Deployment of database rules requires an existing Realtime Database instance in the selected project.

Deployment created: project `cities-skylines-3-hadi`, hosted at https://cities-skylines-3-hadi.web.app with a Singapore Realtime Database. Deployed rules additionally restrict cloud save access to the owner's configured email. Email/password Authentication is enabled and the owner account has been verified as present, enabled and password-configured. Authorized domains include the deployed web.app and firebaseapp.com sites and localhost. Anonymous database reads were verified denied. No billing upgrade was performed.

## Rules and redeploy after merge

`database.rules.json` additionally requires the email/password sign-in provider, so another provider later enabled for the
same address cannot reach the saves. Once the owner's address shows as verified in the Firebase console, you can also add
`auth.token.email_verified === true` to both read and write rules; console-created accounts start unverified, so adding it
earlier would lock the owner out. Rules and hosting are not deployed automatically: after merging, rebuild and run
`npx firebase-tools deploy --only hosting,database --project cities-skylines-3-hadi` so the live site and rules match `master`.
A save uploaded from a newer build is refused, not corrupted, by an older deployed build ("newer version").
