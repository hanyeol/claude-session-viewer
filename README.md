# Claude Session Viewer

A web-based tool to visualize Claude session history from your local `.claude` directory in a timeline format.

## Getting Started

### Installation

```bash
npm install
```

### Run with npx

```bash
npx .
```

Or run with the package name:

```bash
npx claude-session-viewer
```

### Run Development Server

```bash
npm run dev
```

This command runs both:
- Backend server (http://localhost:3000)
- Frontend development server (http://localhost:5173)

Open http://localhost:5173 in your browser.

### Build

```bash
npm run build
```

## Features

- ✅ Auto-detect `.claude` directory
- ✅ Session list by project
- ✅ Session detail timeline view
- ✅ Real-time file change detection (WebSocket)
- 🚧 Search and filtering
- 🚧 Code highlighting
- 🚧 Markdown rendering

## Project Structure

```
.
├── src/
│   ├── server/           # Fastify backend
│   │   └── index.ts
│   ├── components/       # React components
│   │   ├── SessionList.tsx
│   │   └── SessionDetail.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── vite.config.ts        # Vite config (includes proxy)
└── package.json
```

## API

### GET /api/sessions
Returns a list of all sessions.

### GET /api/sessions/:id
Returns detailed information for a specific session.

### WebSocket /ws
Receives real-time file change events.
