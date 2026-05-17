# Health Bot AI Frontend

Next.js frontend for the Health Bot AI POC with MUI and React Query.

## Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

## Features

- **Chat Interface**: Send messages and get AI-powered responses
- **Intent-Aware Cards**: Different displays for symptom vs food queries
- **Safety Badges**: Visual indicators for symptom safety levels
- **Citations**: Source references for all responses
- **Persistent Conversations**: Maintains convId across messages

## Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Main chat page
│   ├── providers.tsx       # React Query provider
│   ├── theme.ts            # MUI theme
│   └── api.ts              # API client
└── components/
    └── Chat/
        ├── ChatWindow.tsx      # Main chat container
        ├── MessageBubble.tsx   # User/assistant messages
        ├── AnswerCard.tsx      # Structured response display
        └── Citations.tsx       # Source citations
```

## Scripts

- `npm run dev` - Start development server (port 3000)
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking

