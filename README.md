# Camagru

Camagru is a full-stack photo editing web application where users can capture webcam photos or upload local images, apply predefined overlay stickers, and publish the final result to a public gallery where other users can like, comment, and interact in real time.

## Features

- Authentication system (registration, login, logout, email verification, password reset)
- Webcam capture with upload fallback for unsupported devices
- Overlay compositing with predefined stickers
- Public gallery feed for published photos
- Like system with instant updates
- Comment system with live append
- Email notifications for new comments
- Profile settings management
- Dedicated image detail page (`/gallery/:id`)
- Social sharing (X/Twitter, Facebook, WhatsApp)
- Infinite scroll on the gallery feed
- Live overlay preview with drag/resize controls

## Tech Stack

| Layer               | Technology                    |
| ------------------- | ----------------------------- |
| Backend             | Node.js, Express.js           |
| Database            | PostgreSQL                    |
| Image Processing    | Sharp                         |
| Authentication      | bcrypt, express-session       |
| Email (Development) | Nodemailer, Mailhog           |
| Containerization    | Docker, docker-compose        |
| Frontend            | Vanilla HTML, CSS, JavaScript |

## Prerequisites

- Docker
- docker-compose

## Getting Started

```bash
git clone <repo>
cd camagru
cp .env.example .env
# fill in .env values
docker-compose up --build
```

## Environment Variables

| Variable         | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `DB_USER`        | PostgreSQL username                                    |
| `DB_PASSWORD`    | PostgreSQL password                                    |
| `DB_NAME`        | PostgreSQL database name                               |
| `DB_HOST`        | PostgreSQL host (Docker service name)                  |
| `DB_PORT`        | PostgreSQL port                                        |
| `SESSION_SECRET` | Session signing secret used by `express-session`       |
| `SMTP_HOST`      | SMTP host for outgoing emails (Mailhog in development) |
| `SMTP_PORT`      | SMTP port for outgoing emails                          |
| `APP_URL`        | Public base URL used for links and sharing             |

## Usage

Start the stack, then open `http://localhost:8080` to use the application; development emails (verification and notifications) are available in Mailhog at `http://localhost:8025`.

## Project Structure

```text
camagru/
├── server/
│   └── public/
├── db/
└── nginx/
```

## Security

- CSRF protection on state-changing requests
- Password hashing with bcrypt
- Parameterized SQL queries
- XSS escaping for rendered user content
- File upload validation (type and size)
- Ownership checks for protected resource actions

## Bonus Features

- Infinite scroll gallery feed
- Social sharing to X/Twitter, Facebook, and WhatsApp
- Image detail page with full comment thread and Open Graph tags
- Live overlay preview with drag and resize
- AJAX likes and comments without page reload

## License

MIT
