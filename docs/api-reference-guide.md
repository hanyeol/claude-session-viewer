# API Reference Guide

This document provides a comprehensive reference for all API endpoints exposed by the Claude Session Viewer backend server.

**Base URL:** `http://localhost:3000`

> The server automatically finds an available port if 3000 is in use.

---

## Sessions

### Get All Sessions

Retrieves all Claude Code sessions grouped by project.

**Endpoint:** `GET /api/sessions`

**Query Parameters:** None

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/sessions"
```

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `projects` | array | Array of ProjectGroup objects |

**ProjectGroup Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Project directory name |
| `name` | string | Formatted display name (strips `-Users-hanyeol-Projects-` prefix) |
| `sessionCount` | number | Total number of sessions in project |
| `lastActivity` | string | ISO timestamp of most recent session activity |
| `sessions` | array | Array of Session objects |

**Session Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Session filename without .jsonl extension |
| `projectId` | string | Project directory name |
| `projectName` | string | Formatted display name |
| `timestamp` | string | ISO timestamp (file modification time) |
| `messages` | array | Array of JSONL messages |
| `messageCount` | number | Total messages in session |
| `title` | string | Extracted session title |
| `isAgent` | boolean | true if session is an agent session |
| `agentSessions` | array | Child agent sessions (main sessions only) |

```json
{
  "projects": [
    {
      "id": "my-project-Users-hanyeol-Projects-myapp",
      "name": "myapp",
      "sessionCount": 5,
      "lastActivity": "2025-01-11T10:30:00.000Z",
      "sessions": [
        {
          "id": "1736587800123",
          "projectId": "my-project-Users-hanyeol-Projects-myapp",
          "projectName": "myapp",
          "timestamp": "2025-01-11T10:30:00.000Z",
          "messages": [],
          "messageCount": 42,
          "title": "Implement user authentication",
          "isAgent": false,
          "agentSessions": []
        }
      ]
    }
  ]
}
```

**Notes:**
- Projects are sorted by last activity (most recent first)
- Sessions within projects are sorted by timestamp (most recent first)
- Sessions with only 1 assistant-only message are filtered out
- Empty files are skipped
- Agent sessions (files prefixed with `agent-`) are nested under their parent sessions


### Get Session by ID

Retrieves detailed information about a specific session, including all messages.

**Endpoint:** `GET /api/sessions/:id`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Session ID (filename without .jsonl extension) |

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/sessions/1736587800123"
```

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `session` | object | Session object (same structure as Session object above) |

```json
{
  "session": {
    "id": "1736587800123",
    "projectId": "my-project-Users-hanyeol-Projects-myapp",
    "projectName": "myapp",
    "timestamp": "2025-01-11T10:30:00.000Z",
    "messages": [
      {
        "type": "user",
        "timestamp": "2025-01-11T10:30:00.000Z",
        "message": {
          "content": "Help me add authentication"
        }
      },
      {
        "type": "assistant",
        "timestamp": "2025-01-11T10:30:05.000Z",
        "message": {
          "content": [
            {
              "type": "text",
              "text": "I'll help you implement authentication..."
            },
            {
              "type": "tool_use",
              "id": "toolu_123",
              "name": "Read",
              "input": {
                "file_path": "/path/to/file"
              }
            }
          ],
          "usage": {
            "input_tokens": 1000,
            "output_tokens": 500,
            "cache_creation_input_tokens": 200,
            "cache_read_input_tokens": 300
          }
        }
      }
    ],
    "messageCount": 42,
    "title": "Implement user authentication",
    "isAgent": false,
    "agentSessions": [
      {
        "id": "agent-abc123",
        "title": "Search for authentication patterns",
        "timestamp": "2025-01-11T10:30:10.000Z",
        "messageCount": 5,
        "isAgent": true
      }
    ]
  }
}
```

**Error Codes:**

| Code | Message | Description |
|------|---------|-------------|
| 404 | Session not found | Requested session does not exist |
| 500 | Internal server error | Server error while reading session |

**Notes:**
- For agent sessions, the title is extracted from the parent session's Task tool use description
- Main sessions include an `agentSessions` array with nested agent/task sessions
- Messages include `agentId` injected for Task tool uses and results
- IDE-specific tags (`<ide_selection>`, `<ide_opened_file>`, `<system-reminder>`) are preserved in raw messages


---

## Statistics

### Get Overall Statistics

Retrieves comprehensive usage analytics across all projects, including:
- **Token usage**: Input, output, and cache token consumption
- **Activity patterns**: Sessions and messages by time, project, and model
- **Tool usage**: Tool call frequency and success rates
- **Cache performance**: Hit rates and cost savings
- **Cost analysis**: Detailed cost breakdown in USD

**Endpoint:** `GET /api/statistics/overall`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | string | No | "7" | Number of days to include ("7", "30", "all") |

**Example Request:**
```bash
# Last 7 days (default)
curl -X GET "http://localhost:3000/api/statistics/overall"

# Last 30 days
curl -X GET "http://localhost:3000/api/statistics/overall?days=30"

# All time
curl -X GET "http://localhost:3000/api/statistics/overall?days=all"
```

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `overview` | object | Session and message counts, token usage summary, date range |
| `daily` | array | Daily activity breakdown (sessions, messages, tokens) - DailyUsageStats objects |
| `byProject` | array | Per-project usage statistics - ProjectUsageStats objects |
| `byModel` | array | Per-model usage statistics - ModelUsageStats objects |
| `cache` | object | Cache performance metrics (hit rate, savings) - CacheStats object |
| `cost` | object | Cost breakdown in USD - CostBreakdown object |
| `productivity` | object | Tool usage and agent adoption metrics - ProductivityStats object |
| `trends` | object | Hourly and weekday activity patterns - TrendAnalysis object |

**Overview Object:**

| Field | Type | Description |
|-------|------|-------------|
| `tokenUsage` | object | Aggregate token usage across all sessions (TokenUsage object) |
| `sessionCount` | number | Total number of main sessions (excludes agent sessions) |
| `messageCount` | number | Total number of messages across all sessions |
| `dateRange` | object | Time period covered by this statistics report (DateRange object) |

**DateRange Object:**

| Field | Type | Description |
|-------|------|-------------|
| `start` | string | ISO timestamp of start date |
| `end` | string | ISO timestamp of end date |

**TokenUsage Object:**

| Field | Type | Description |
|-------|------|-------------|
| `inputTokens` | number | Total input tokens |
| `cacheCreationTokens` | number | Total cache creation tokens |
| `cacheReadTokens` | number | Total cache read tokens |
| `outputTokens` | number | Total output tokens |
| `totalTokens` | number | Total of all tokens |

**DailyUsageStats Object:**

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Date in YYYY-MM-DD format |
| `tokenUsage` | object | Token usage for this day (TokenUsage object) |
| `sessionCount` | number | Number of unique sessions active on this day |

**ProjectUsageStats Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Project directory name |
| `name` | string | Human-readable project name |
| `tokenUsage` | object | Aggregate token usage for this project (TokenUsage object) |
| `sessionCount` | number | Number of sessions in this project |

**ModelUsageStats Object:**

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | Model ID (e.g., "claude-sonnet-4-5-20250929") |
| `tokenUsage` | object | Aggregate token usage for this model (TokenUsage object) |
| `messageCount` | number | Number of messages using this model |

**CacheStats Object:**

Cache performance metrics.

| Field | Type | Description |
|-------|------|-------------|
| `totalCacheCreation` | number | Total tokens used to create cache entries |
| `totalCacheRead` | number | Total tokens read from cache (saved computation) |
| `ephemeral5mTokens` | number | Tokens cached with 5-minute TTL |
| `ephemeral1hTokens` | number | Tokens cached with 1-hour TTL |
| `cacheHitRate` | number | **Cache effectiveness**: Percentage of potential input tokens served from cache (0-100) |
| `estimatedSavings` | number | **Cost savings**: Estimated USD saved by using cache instead of full input processing |

**CostBreakdown Object:**

| Field | Type | Description |
|-------|------|-------------|
| `inputCost` | number | Input token cost in USD |
| `outputCost` | number | Output token cost in USD |
| `cacheCreationCost` | number | Cache creation cost in USD |
| `cacheReadCost` | number | Cache read cost in USD |
| `totalCost` | number | Total cost in USD |

**ProductivityStats Object:**

Activity and efficiency metrics.

| Field | Type | Description |
|-------|------|-------------|
| `toolUsage` | array | Usage statistics for each tool (Read, Edit, Bash, etc.) - ToolUsageStats objects |
| `totalToolCalls` | number | Total number of tool invocations across all sessions |
| `agentSessions` | number | Number of sessions that spawned agent/task sessions |
| `totalSessions` | number | Total number of main sessions |
| `agentUsageRate` | number | **Agent adoption rate**: Percentage of sessions using agents (0-100) |

**ToolUsageStats Object:**

| Field | Type | Description |
|-------|------|-------------|
| `toolName` | string | Tool name (e.g., "Read", "Edit", "Bash") |
| `totalUses` | number | Total times tool was called |
| `successfulUses` | number | Times tool succeeded |
| `successRate` | number | Success rate percentage (0-100) |

**TrendAnalysis Object:**

| Field | Type | Description |
|-------|------|-------------|
| `byHour` | array | Array of hourly activity statistics (HourlyActivityStats objects) |
| `byWeekday` | array | Array of weekday activity statistics (WeekdayActivityStats objects) |

**HourlyActivityStats Object:**

Activity metrics grouped by hour of day (0-23).

| Field | Type | Description |
|-------|------|-------------|
| `hour` | number | Hour of day (0 = midnight, 23 = 11 PM) |
| `sessionCount` | number | Unique sessions with activity during this hour |
| `messageCount` | number | Total messages sent during this hour |
| `tokenUsage` | object | Token usage during this hour (TokenUsage object) |

**WeekdayActivityStats Object:**

Activity metrics grouped by day of week.

| Field | Type | Description |
|-------|------|-------------|
| `weekday` | number | Day of week (0 = Sunday, 6 = Saturday) |
| `weekdayName` | string | Weekday name ("Sunday", "Monday", etc.) |
| `sessionCount` | number | Unique sessions with activity on this weekday |
| `messageCount` | number | Total messages sent on this weekday |
| `tokenUsage` | object | Token usage on this weekday (TokenUsage object) |

```json
{
  "overview": {
    "tokenUsage": {
      "inputTokens": 150000,
      "cacheCreationTokens": 20000,
      "cacheReadTokens": 30000,
      "outputTokens": 50000,
      "totalTokens": 250000
    },
    "sessionCount": 42,
    "messageCount": 1337,
    "dateRange": {
      "start": "2024-12-12T00:00:00.000Z",
      "end": "2025-01-11T00:00:00.000Z"
    }
  },
  "daily": [
    {
      "date": "2025-01-11",
      "tokenUsage": {
        "inputTokens": 5000,
        "cacheCreationTokens": 500,
        "cacheReadTokens": 1000,
        "outputTokens": 2000,
        "totalTokens": 8500
      },
      "sessionCount": 3
    }
  ],
  "byProject": [
    {
      "id": "my-project-Users-hanyeol-Projects-myapp",
      "name": "myapp",
      "tokenUsage": {
        "inputTokens": 75000,
        "cacheCreationTokens": 10000,
        "cacheReadTokens": 15000,
        "outputTokens": 25000,
        "totalTokens": 125000
      },
      "sessionCount": 20
    }
  ],
  "byModel": [
    {
      "model": "claude-sonnet-4-5-20250929",
      "tokenUsage": {
        "inputTokens": 150000,
        "cacheCreationTokens": 20000,
        "cacheReadTokens": 30000,
        "outputTokens": 50000,
        "totalTokens": 250000
      },
      "messageCount": 1337
    }
  ],
  "cache": {
    "totalCacheCreation": 20000,
    "totalCacheRead": 30000,
    "ephemeral5mTokens": 5000,
    "ephemeral1hTokens": 15000,
    "cacheHitRate": 15.0,
    "estimatedSavings": 0.045
  },
  "cost": {
    "inputCost": 0.45,
    "outputCost": 0.75,
    "cacheCreationCost": 0.075,
    "cacheReadCost": 0.009,
    "totalCost": 1.284
  },
  "productivity": {
    "toolUsage": [
      {
        "toolName": "Read",
        "totalUses": 150,
        "successfulUses": 145,
        "successRate": 96.67
      },
      {
        "toolName": "Edit",
        "totalUses": 80,
        "successfulUses": 75,
        "successRate": 93.75
      }
    ],
    "totalToolCalls": 350,
    "agentSessions": 12,
    "totalSessions": 42,
    "agentUsageRate": 28.57
  },
  "trends": {
    "byHour": [
      {
        "hour": 0,
        "sessionCount": 2,
        "messageCount": 15,
        "tokenUsage": {
          "inputTokens": 1000,
          "cacheCreationTokens": 100,
          "cacheReadTokens": 200,
          "outputTokens": 500,
          "totalTokens": 1800
        }
      }
    ],
    "byWeekday": [
      {
        "weekday": 0,
        "weekdayName": "Sunday",
        "sessionCount": 5,
        "messageCount": 150,
        "tokenUsage": {
          "inputTokens": 10000,
          "cacheCreationTokens": 1000,
          "cacheReadTokens": 2000,
          "outputTokens": 5000,
          "totalTokens": 18000
        }
      }
    ]
  }
}
```

**Error Codes:**

| Code | Message | Description |
|------|---------|-------------|
| 500 | Internal server error | Server error while processing statistics |

**Data Categories:**
- **Usage metrics**: Token consumption (input, output, cache)
- **Activity metrics**: Session counts, message counts, tool calls
- **Performance metrics**: Cache hit rate, tool success rate
- **Cost metrics**: USD costs broken down by token type
- **Adoption metrics**: Agent usage rate
- **Pattern metrics**: Hourly and weekday activity distribution

**Notes:**
- Agent sessions are excluded from statistics (only main sessions counted)
- Sessions with only 1 assistant-only message are filtered out
- Daily stats include missing dates with zero values
- Projects sorted by total tokens (descending)
- Models sorted by total tokens (descending)
- Tool usage sorted by total uses (descending)
- Cache hit rate calculated as: `(cacheRead / (input + cacheCreation + cacheRead)) * 100`
- Cost calculations use model-specific pricing, with fallback to default model pricing


### Get Project Statistics

Retrieves comprehensive usage analytics for a specific project, including:
- **Token usage**: Input, output, and cache token consumption
- **Activity patterns**: Sessions and messages by time and model
- **Tool usage**: Tool call frequency and success rates
- **Cache performance**: Hit rates and cost savings
- **Cost analysis**: Detailed cost breakdown in USD

**Endpoint:** `GET /api/statistics/projects/:projectId`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Project directory name |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | string | No | "7" | Number of days to include ("7", "30", "all") |

**Example Request:**
```bash
# Last 7 days (default)
curl -X GET "http://localhost:3000/api/statistics/projects/my-project-Users-hanyeol-Projects-myapp"

# Last 30 days
curl -X GET "http://localhost:3000/api/statistics/projects/my-project-Users-hanyeol-Projects-myapp?days=30"

# All time
curl -X GET "http://localhost:3000/api/statistics/projects/my-project-Users-hanyeol-Projects-myapp?days=all"
```

**Response:**

Returns the same `UsageStatistics` structure as the overall endpoint, but filtered to the specified project.

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `overview` | object | Session and message counts, token usage summary, date range |
| `daily` | array | Daily activity breakdown (sessions, messages, tokens) - DailyUsageStats objects |
| `byProject` | array | Per-project usage statistics (contains only the requested project) - ProjectUsageStats objects |
| `byModel` | array | Per-model usage statistics - ModelUsageStats objects |
| `cache` | object | Cache performance metrics (hit rate, savings) - CacheStats object |
| `cost` | object | Cost breakdown in USD - CostBreakdown object |
| `productivity` | object | Tool usage and agent adoption metrics - ProductivityStats object |
| `trends` | object | Hourly and weekday activity patterns - TrendAnalysis object |

**Example Response:**

```json
{
  "overview": {
    "tokenUsage": {
      "inputTokens": 150000,
      "cacheCreationTokens": 50000,
      "cacheReadTokens": 80000,
      "outputTokens": 25000,
      "totalTokens": 305000
    },
    "sessionCount": 45,
    "messageCount": 180,
    "dateRange": {
      "start": "2024-01-04T00:00:00.000Z",
      "end": "2024-01-11T08:30:00.000Z"
    }
  },
  "daily": [
    {
      "date": "2024-01-04",
      "tokenUsage": {
        "inputTokens": 21000,
        "cacheCreationTokens": 7000,
        "cacheReadTokens": 11000,
        "outputTokens": 3500,
        "totalTokens": 42500
      },
      "sessionCount": 6
    }
    // ... more daily entries
  ],
  "byProject": [
    {
      "id": "my-project-Users-hanyeol-Projects-myapp",
      "name": "Projects-myapp",
      "tokenUsage": {
        "inputTokens": 150000,
        "cacheCreationTokens": 50000,
        "cacheReadTokens": 80000,
        "outputTokens": 25000,
        "totalTokens": 305000
      },
      "sessionCount": 45
    }
  ],
  "byModel": [
    {
      "model": "claude-sonnet-4-20250514",
      "tokenUsage": {
        "inputTokens": 120000,
        "cacheCreationTokens": 40000,
        "cacheReadTokens": 64000,
        "outputTokens": 20000,
        "totalTokens": 244000
      },
      "messageCount": 144
    },
    {
      "model": "claude-3-5-sonnet-20241022",
      "tokenUsage": {
        "inputTokens": 30000,
        "cacheCreationTokens": 10000,
        "cacheReadTokens": 16000,
        "outputTokens": 5000,
        "totalTokens": 61000
      },
      "messageCount": 36
    }
  ],
  "cache": {
    "totalCacheCreation": 50000,
    "totalCacheRead": 80000,
    "ephemeral5mTokens": 45000,
    "ephemeral1hTokens": 5000,
    "cacheHitRate": 61.54,
    "estimatedSavings": 0.72
  },
  "cost": {
    "inputCost": 0.45,
    "outputCost": 0.375,
    "cacheCreationCost": 0.1875,
    "cacheReadCost": 0.024,
    "totalCost": 1.0365
  },
  "productivity": {
    "toolUsage": [
      {
        "toolName": "Edit",
        "totalUses": 85,
        "successfulUses": 82,
        "successRate": 96.47
      },
      {
        "toolName": "Read",
        "totalUses": 120,
        "successfulUses": 120,
        "successRate": 100
      }
      // ... more tools
    ],
    "totalToolCalls": 350,
    "agentSessions": 12,
    "totalSessions": 45,
    "agentUsageRate": 26.67
  },
  "trends": {
    "byHour": [
      {
        "hour": 0,
        "sessionCount": 2,
        "messageCount": 8,
        "tokenUsage": {
          "inputTokens": 6000,
          "cacheCreationTokens": 2000,
          "cacheReadTokens": 3200,
          "outputTokens": 1000,
          "totalTokens": 12200
        }
      }
      // ... hours 1-23
    ],
    "byWeekday": [
      {
        "weekday": 0,
        "weekdayName": "Sunday",
        "sessionCount": 5,
        "messageCount": 20,
        "tokenUsage": {
          "inputTokens": 15000,
          "cacheCreationTokens": 5000,
          "cacheReadTokens": 8000,
          "outputTokens": 2500,
          "totalTokens": 30500
        }
      }
      // ... Monday-Saturday
    ]
  }
}
```

**Key Difference from Overall Endpoint:**
- The `byProject` array contains only one entry (the requested project)
- All statistics are scoped to the specified project only

**Error Codes:**

| Code | Message | Description |
|------|---------|-------------|
| 404 | Project not found | Requested project does not exist |
| 500 | Internal server error | Server error while processing statistics |

**Notes:**
- Same filtering and calculation rules apply as the global statistics endpoint
- Project name is derived from the directory name using the same transformation rules


---

## WebSocket

### Session File Watcher

Real-time file change notifications for Claude Code session files.

**Endpoint:** `WS /ws`

**Protocol:** WebSocket

**Message Format (Server → Client):**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type ("file-added", "file-changed", "file-deleted") |
| `path` | string | Absolute file path |

**Example Events:**

```json
{
  "type": "file-added",
  "path": "/Users/hanyeol/.claude/projects/my-project/1736587800123.jsonl"
}
```

```json
{
  "type": "file-changed",
  "path": "/Users/hanyeol/.claude/projects/my-project/1736587800123.jsonl"
}
```

```json
{
  "type": "file-deleted",
  "path": "/Users/hanyeol/.claude/projects/my-project/1736587800123.jsonl"
}
```

**Connection Example (JavaScript):**

```javascript
const ws = new WebSocket('ws://localhost:3000/ws')

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log('File change:', data.type, data.path)

  // Refresh sessions list or reload specific session
  if (data.type === 'file-changed' || data.type === 'file-added') {
    // Refetch data
  }
}

ws.onerror = (error) => {
  console.error('WebSocket error:', error)
}

ws.onclose = () => {
  console.log('WebSocket connection closed')
}
```

**Notes:**
- WebSocket connection automatically watches `~/.claude/projects/` directory
- Uses chokidar for file system watching
- Watcher is automatically closed when WebSocket connection closes
- `ignoreInitial: true` - Initial files are not reported as "added"
- Real-time updates enable live session monitoring


---

## Data Models

### Session Title Extraction

Session titles are extracted in the following priority:

1. From `queue-operation` or `enqueue` message type
2. From first user message content
3. Empty if neither is available

### Agent Session Mapping

Agent sessions are associated with parent sessions through:

1. Task tool use in assistant message with `item.input.description`
2. Matching tool_result with `tool_use_id` containing `agentId` or `toolUseResult.agentId`
3. Agent session file named `agent-{agentId}.jsonl`
4. The description from Task tool use becomes the agent session's title

### Message Structure

Messages in sessions can have various formats:

**User Message:**
```json
{
  "type": "user",
  "timestamp": "2025-01-11T10:30:00.000Z",
  "message": {
    "content": "string or array of content blocks"
  }
}
```

**Assistant Message:**
```json
{
  "type": "assistant",
  "timestamp": "2025-01-11T10:30:05.000Z",
  "message": {
    "content": [
      {
        "type": "text",
        "text": "Response text"
      },
      {
        "type": "tool_use",
        "id": "toolu_123",
        "name": "Read",
        "input": {
          "file_path": "/path/to/file"
        }
      }
    ],
    "usage": {
      "input_tokens": 1000,
      "output_tokens": 500,
      "cache_creation_input_tokens": 200,
      "cache_read_input_tokens": 300,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 50,
        "ephemeral_1h_input_tokens": 150
      }
    }
  }
}
```

**Content Block Types:**

| Type | Description |
|------|-------------|
| `text` | Text content with `text` field |
| `tool_use` | Tool invocation with `id`, `name`, and `input` fields |
| `tool_result` | Tool result with `tool_use_id`, `content`, and optional `is_error` fields |


---

## Pricing Information

The server uses the following pricing model for cost calculations (per million tokens):

| Model | Input | Output | Cache Creation | Cache Read |
|-------|-------|--------|----------------|------------|
| claude-sonnet-4-5-20250929 | $3.00 | $15.00 | $3.75 | $0.30 |

**Default model for unknown models:** `claude-sonnet-4-5-20250929`


---

## File Paths

The server reads session files from:

```
~/.claude/projects/
```

Each project directory contains:
- Main session files: `{timestamp}.jsonl`
- Agent session files: `agent-{agentId}.jsonl`


---

## Development

### Running the Server

```bash
# Start server (default port 3000)
npm run dev:server

# Server automatically finds available port if 3000 is in use
```

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | 3000 | Server port (with auto-fallback) |


### Frontend Integration

The Vite development server (port 5173) proxies API requests:

```javascript
// vite.config.ts
{
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
}
```

This allows the frontend to make requests to `/api/*` and `/ws` without CORS issues.
