# Claude Code Session Viewer

웹 타임라인 형태로 로컬 PC의 `.claude` 디렉토리 세션 기록을 시각화하는 도구입니다.

## 기술 스택

### 백엔드
- **Fastify**: 빠른 웹 서버
- **chokidar**: 파일 시스템 감시
- **TypeScript**: 타입 안전성

### 프론트엔드
- **React + TypeScript**: UI 프레임워크
- **Vite**: 빌드 도구
- **TailwindCSS**: 스타일링
- **TanStack Query**: 서버 상태 관리
- **date-fns**: 날짜 처리

## 시작하기

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

이 명령어는 다음을 동시에 실행합니다:
- 백엔드 서버 (http://localhost:3000)
- 프론트엔드 개발 서버 (http://localhost:5173)

브라우저에서 http://localhost:5173 을 열어주세요.

### 빌드

```bash
npm run build
```

## 기능

- ✅ `.claude` 디렉토리 자동 감지
- ✅ 프로젝트별 세션 목록
- ✅ 세션 상세 타임라인 뷰
- ✅ 실시간 파일 변경 감지 (WebSocket)
- 🚧 검색 및 필터링
- 🚧 코드 하이라이팅
- 🚧 마크다운 렌더링

## 프로젝트 구조

```
.
├── src/
│   ├── server/           # Fastify 백엔드
│   │   └── index.ts
│   ├── components/       # React 컴포넌트
│   │   ├── SessionList.tsx
│   │   └── SessionDetail.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── vite.config.ts        # Vite 설정 (프록시 포함)
└── package.json
```

## API

### GET /api/sessions
모든 세션 목록을 반환합니다.

### GET /api/sessions/:id
특정 세션의 상세 정보를 반환합니다.

### WebSocket /ws
파일 변경 이벤트를 실시간으로 수신합니다.
