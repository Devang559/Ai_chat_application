# AI Chat Application

A full-stack, real-time AI chat application that lets users sign up, log in, and stream responses from local LLMs powered by Ollama. Built with React and FastAPI, it uses WebSockets for low-latency response streaming and Supabase for secure authentication, database storage, and Row Level Security (RLS).

---

## Features

- **Authentication:** User registration and login powered by Supabase Auth.
- **Real-Time Streaming:** WebSocket integration for real-time, token-by-token AI response streaming.
- **Local AI Inference:** Powered by Ollama running locally (e.g., `llama3.2`).
- **Data Persistence:** Complete chat history and conversation records stored in Supabase (PostgreSQL).
- **Responsive Interface:** Modern UI featuring a dynamic sidebar for managing multi-conversation history.

---

## Tech Stack

### Backend
- **Framework:** FastAPI
- **Database & Auth:** Supabase (PostgreSQL + Supabase Auth)
- **Local LLM Engine:** Ollama
- **Communication:** WebSockets

### Frontend
- **Framework:** React 18
- **Build Tool:** Vite
- **Routing:** React Router
- **Client Libraries:** Supabase JS Client, Fetch API

---

## Prerequisites

Before setting up the project, ensure you have the following installed:

- **Python:** 3.9 or higher
- **Node.js:** 16 or higher
- **Ollama:** Downloaded and running locally (`ollama serve`)
- **Supabase:** An active Supabase project with table schemas configured

---

## Supabase Setup

Navigate to your **Supabase Dashboard** -> **SQL Editor** and execute the following SQL script to create the required tables, Row Level Security (RLS) policies, and service role grants:

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
