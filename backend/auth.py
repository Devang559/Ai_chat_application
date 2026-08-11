import os
from dotenv import load_dotenv
from supabase import create_client, Client
from pydantic import BaseModel, EmailStr
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Load environment variables from .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Initialize Supabase client
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY and "your-supabase" not in SUPABASE_URL:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Error initializing Supabase client: {e}")

# Security scheme for Bearer Token
security = HTTPBearer()


# Pydantic Request Models
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


def get_supabase_client() -> Client:
    """Returns the initialized Supabase client or raises 500 error if missing credentials."""
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_KEY in your .env file."
        )
    return supabase


async def register_user(user_data: UserRegister):
    """Registers a new user with Supabase Auth storing user name in metadata."""
    client = get_supabase_client()
    try:
        response = client.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password,
            "options": {
                "data": {
                    "name": user_data.name
                }
            }
        })
        
        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration failed."
            )

        session = response.session
        user_metadata = response.user.user_metadata or {}

        return {
            "message": "User registered successfully",
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "name": user_metadata.get("name", user_data.name),
                "email_confirmed": response.user.email_confirmed_at is not None
            },
            "access_token": session.access_token if session else None,
            "refresh_token": session.refresh_token if session else None,
            "note": "If email confirmation is enabled in your Supabase project settings, please verify your email before logging in."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


async def login_user(credentials: UserLogin):
    """Authenticates a user with Supabase Auth and returns JWT tokens."""
    client = get_supabase_client()
    try:
        response = client.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })

        if not response.session or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials or email not confirmed."
            )

        user_metadata = response.user.user_metadata or {}

        return {
            "message": "Login successful",
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "token_type": "bearer",
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "name": user_metadata.get("name")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validates the Bearer access token using Supabase Auth and returns the current user profile."""
    client = get_supabase_client()
    token = credentials.credentials
    try:
        user_response = client.auth.get_user(jwt=token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token."
            )

        user = user_response.user
        user_metadata = user.user_metadata or {}

        return {
            "id": user.id,
            "email": user.email,
            "name": user_metadata.get("name"),
            "role": getattr(user, "role", None),
            "created_at": str(user.created_at) if hasattr(user, "created_at") else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
