# AI Chat Application

A full-stack chat application where users can sign up, log in, and chat with local LLM models in real-time. The frontend is built with React and the backend with FastAPI, connected via WebSocket for streaming AI responses. Supabase handles authentication and data persistence.

## Features

- User registration and login with Supabase Auth
- Real-time chat interface with streaming AI responses
- Conversation history stored in Supabase
- WebSocket-based message streaming
- Responsive UI with sidebar conversation list

## Tech Stack

**Backend**
- FastAPI
- Supabase (Auth + PostgreSQL)
- Ollama (local LLM inference)
- WebSocket streaming

**Frontend**
- React 18
- Vite
- React Router
- Supabase JS Client
- Fetch API

## Prerequisites

- Python 3.9+
- Node.js 16+
- Ollama installed and running locally (`ollama serve`)
- A Supabase project with the required tables created

## Supabase Setup

Run the following SQL in your Supabase Dashboard -> SQL Editor to create the required tables:

```sql
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON conversations
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create conversations" ON conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON conversations
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON conversations
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view messages in own conversations" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can insert messages in own conversations" ON messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO service_role;
```

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Devang559/Ai_chat_application.git
cd Ai_chat_application
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file from example
cp .env.example .env
# Edit .env and add your Supabase credentials and Ollama settings
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env
# Edit .env and add your Supabase credentials
```

## Running the Application

### Start Ollama

Make sure Ollama is running locally with your desired model:

```bash
ollama serve
# In another terminal:
ollama pull llama3.2
ollama run llama3.2
```

### Start Backend

```bash
cd backend
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux
uvicorn main:app --reload
```

Backend will run at `http://localhost:8000`

### Start Frontend

```bash
cd frontend
npm run dev
```

Frontend will run at `http://localhost:5173`

## Project Structure

Electron/
├── backend/
│   ├── main.py              # FastAPI app, API routing, and WebSocket server
│   ├── auth.py              # Supabase Auth verification helpers
│   ├── requirements.txt     # Python backend dependencies
│   ├── supabase_schema.sql  # SQL setup script for Supabase
│   ├── .env.example         # Backend environment variables template
│   └── .env                 # Backend active secrets (git-ignored)
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Login.jsx    # Login page component
    │   │   ├── Register.jsx # Registration page component
    │   │   └── Chat.jsx     # Main chat layout & streaming interface
    │   ├── contexts/
    │   │   └── AuthContext.jsx # Global user auth state
    │   ├── lib/
    │   │   └── supabase.js  # Supabase client instantiation
    │   ├── App.jsx          # Route management
    │   └── main.jsx         # Application root entry point
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── .env.example         # Frontend environment variables template
    └── .env                 # Frontend active secrets (git-ignored)
