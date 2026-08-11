from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client
from dotenv import load_dotenv
import os
import httpx
import json

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

security = HTTPBearer()

auth_client = create_client(SUPABASE_URL, SUPABASE_KEY)
db_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY)


class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/auth/register")
def register(data: RegisterRequest):
    try:
        response = auth_client.auth.sign_up({
            "email": data.email,
            "password": data.password,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "user": {"id": response.user.id, "email": response.user.email},
        "session": response.session,
    }

@app.post("/auth/login")
def login(data: LoginRequest):
    try:
        response = auth_client.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
    return {
        "user": {"id": response.user.id, "email": response.user.email},
        "session": response.session,
    }


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        user = auth_client.auth.get_user(token)
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

class ConversationCreate(BaseModel):
    title: str | None = "New Chat"

class MessageRequest(BaseModel):
    content: str


@app.get("/chat/conversations")
def list_conversations(user_id: str = Depends(get_current_user_id)):
    result = db_client.table("conversations").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
    return result.data

@app.post("/chat/conversations")
def create_conversation(data: ConversationCreate, user_id: str = Depends(get_current_user_id)):
    result = db_client.table("conversations").insert({
        "user_id": user_id,
        "title": data.title,
    }).execute()
    return result.data[0]

@app.get("/chat/conversations/{conversation_id}/messages")
def get_messages(conversation_id: str, user_id: str = Depends(get_current_user_id)):
    if not conversation_id or conversation_id == "null":
        raise HTTPException(status_code=400, detail="conversation_id is required")
    conv = db_client.table("conversations").select("id").eq("id", conversation_id).eq("user_id", user_id).single().execute()
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = db_client.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=False).execute()
    return result.data

@app.post("/chat/conversations/{conversation_id}/messages")
def send_message(conversation_id: str, data: MessageRequest, user_id: str = Depends(get_current_user_id)):
    if not conversation_id or conversation_id == "null":
        raise HTTPException(status_code=400, detail="conversation_id is required")
    conv = db_client.table("conversations").select("id").eq("id", conversation_id).eq("user_id", user_id).single().execute()
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db_client.table("messages").insert({
        "conversation_id": conversation_id,
        "role": "user",
        "content": data.content,
    }).execute()

    ai_response = get_ollama_response(data.content)

    db_client.table("messages").insert({
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": ai_response,
    }).execute()

    return {"role": "assistant", "content": ai_response}


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, conversation_id: str):
        await websocket.accept()
        self.active_connections[conversation_id] = websocket

    def disconnect(self, conversation_id: str):
        if conversation_id in self.active_connections:
            del self.active_connections[conversation_id]

manager = ConnectionManager()

@app.websocket("/ws/chat/{conversation_id}")
async def websocket_chat(websocket: WebSocket, conversation_id: str):
    if not conversation_id or conversation_id == "null":
        await websocket.accept()
        await websocket.send_json({"type": "error", "content": "conversation_id is required"})
        await websocket.close()
        return
    await manager.connect(websocket, conversation_id)

    try:
        auth_msg = await websocket.receive_text()
        auth_data = json.loads(auth_msg)
        token = auth_data.get("token")

        if not token:
            await websocket.send_json({"type": "error", "content": "Missing token"})
            await websocket.close()
            return

        user = auth_client.auth.get_user(token)
        user_id = user.user.id

        conv = db_client.table("conversations").select("id").eq("id", conversation_id).eq("user_id", user_id).single().execute()
        if not conv.data:
            await websocket.send_json({"type": "error", "content": "Conversation not found"})
            await websocket.close()
            return

        messages = db_client.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=False).execute()
        await websocket.send_json({"type": "history", "messages": messages.data})

        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)

            if message_data.get("type") == "message":
                user_content = message_data.get("content", "")

                db_client.table("messages").insert({
                    "conversation_id": conversation_id,
                    "role": "user",
                    "content": user_content,
                }).execute()

                full_response = ""
                try:
                    async with httpx.AsyncClient(timeout=120.0) as http_client:
                        async with http_client.stream(
                            "POST",
                            f"{OLLAMA_URL}/api/chat",
                            json={
                                "model": OLLAMA_MODEL,
                                "messages": [{"role": "user", "content": user_content}],
                                "stream": True,
                            },
                        ) as response:
                            async for line in response.aiter_lines():
                                if line:
                                    try:
                                        chunk = json.loads(line)
                                        content_piece = chunk.get("message", {}).get("content", "")
                                        full_response += content_piece
                                        await websocket.send_json({"type": "chunk", "content": content_piece})
                                    except json.JSONDecodeError:
                                        continue
                except Exception as e:
                    await websocket.send_json({"type": "error", "content": f"AI error: {str(e)}"})
                    full_response = f"AI error: {str(e)}"

                db_client.table("messages").insert({
                    "conversation_id": conversation_id,
                    "role": "assistant",
                    "content": full_response,
                }).execute()

                await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        manager.disconnect(conversation_id)
    except Exception as e:
        await websocket.send_json({"type": "error", "content": str(e)})
        manager.disconnect(conversation_id)


def get_ollama_response(prompt: str) -> str:
    try:
        resp = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "No response from AI")
    except Exception as e:
        return f"AI error: {str(e)}"


@app.get("/")
def home():
    return {"message": "Backend is running"}
