# Mini Game Hub (GitHub Pages)

This repo hosts a mobile-first mini game hub with multiple endless puzzle games.

## Quick start

1. Install
   - npm install

2. Run dev server
   - npm run dev

3. Build
   - npm run build

## GitHub Pages deploy

This project is intended to deploy from the minigames repo to GitHub Pages.

Important settings:
- Use hash routing
- Set Vite base path to /minigames/

If you are using a user or org pages repo instead (username.github.io) and your site root is /, set base to /.

## Firebase setup (internal playtest)

1. Create a Firebase project
2. Enable Authentication
   - Sign-in method: Anonymous
3. Enable Firestore Database
4. Add authorized domains
   - localhost
   - <your-username>.github.io

5. Create Firestore rules
   - Use the firestore.rules file in this repo

## Environment variables

Create a .env file with:

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=

Optional:
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=

## Leaderboards

Firestore path model:
- leaderboards/{gameId}/bestByUser/{uid}

Top list:
- ordered by score desc, limit 50

Menu rank:
- rank within top 50 only
- not found => 50+

## Scripts

- npm run dev
- npm run build
- npm run preview

