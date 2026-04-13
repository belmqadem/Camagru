# Camagru

## What is this project?

Camagru is a 42 School web project where you build an Instagram-like photo editing app. Users can take webcam photos, overlay predefined sticker images on top, share them publicly, and interact via likes and comments.

## Tech Constraints

These are strict and will get you failed if ignored:

- **Server-side:** Any language, BUT every function you use must have a PHP standard library equivalent. This means no fancy ORMs, no magic libraries — keep it close to vanilla PHP logic even if you write in another language.

- **Client-side:** Pure HTML + CSS + JavaScript. No JS frameworks at all — no React, no Vue, no jQuery. CSS frameworks (like Bootstrap/Tailwind) are OK only if they don't pull in JS.

- **Containerization:** Docker / docker-compose is mandatory. One command must launch the whole app.

- **Security is mandatory**, not optional — SQL injection, XSS, CSRF, plain-text passwords and unvalidated uploads will all fail your evaluation.

- **Browser compatibility:** Firefox ≥ 41 and Chrome ≥ 46.

## Full stack

| Layer            | Choice                  |
| ---------------- | ----------------------- |
| Server           | Node.js + Express.js    |
| Database         | PostgreSQL              |
| Image Processing | Sharp                   |
| Email (dev)      | Nodemailer + Mailhog    |
| Containerization | Docker + docker-compose |
| Frontend         | Vanilla HTML + CSS + JS |

## Feature Breakdown

### 👤 User System

- Register with email + username + password (with complexity rules)
- Email confirmation via unique link before login is allowed
- Login / Logout (one-click logout on every page)
- Password reset by email
- Edit profile (username, email, password)

### 🖼️ Gallery (Public)

- All images from all users, sorted newest first
- Paginated — minimum 5 per page
- Logged-in users can like and comment
- Image author gets an email notification on new comment (on by default, togglable in settings)

### ✏️ Editing Page (Auth Required)

- Live webcam preview in the main section
- List of selectable overlay images (PNG with alpha channel — transparency matters!)
- Capture button is disabled until an overlay is selected
- Image compositing (merging webcam + overlay) happens server-side
- Upload fallback for users without a webcam
- Side panel showing the user's previous creations
- Users can delete only their own images
