<div align="center">

![Screenshot](docs/images/screenshot.png)

</div>

# Claude Session Viewer

A web-based tool to visualize Claude session history from your local `.claude` directory in a timeline format.

## Getting Started

### Run with npx

```bash
npx claude-session-viewer
```

The server will start and automatically open in your default web browser. By default, it uses port 9090, but if that port is unavailable, it will automatically find an available port.

You'll see output like this in your terminal:

```
Server running on http://localhost:9090
Watching Claude directory: /Users/username/.claude

Opening browser at http://localhost:9090...
```

#### Options

You can specify a custom port using the `--port` or `-p` option:

```bash
npx claude-session-viewer --port 3000
```

When you specify a port, the server will fail if that port is already in use. If you don't specify a port and the default (9090) is unavailable, it will automatically find an available port.

### Development

If you want to modify the source code or run in development mode, first install dependencies:

```bash
npm install
```

Then run the development server:

```bash
npm run dev
```

This command runs both:
- Backend server (default: http://localhost:9090)
- Frontend development server (default: http://localhost:5173)

The application will automatically open in your default web browser. By default, it uses ports 9090 (backend) and 5173 (frontend), but if those ports are unavailable, it will automatically find available ports.

You'll see output like this in your terminal:

```
VITE v5.4.21  ready in 149 ms
  ➜  Local:   http://localhost:5173/

Server running on http://localhost:9090
Watching Claude directory: /Users/username/.claude

Opening browser at http://localhost:5173...
```

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
