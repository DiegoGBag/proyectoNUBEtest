from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    tenant_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    # str y no EmailStr: el administrador maestro entra con un usuario ("admin-d").
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class MeResponse(BaseModel):
    full_name: str
    email: EmailStr
    tenant_id: UUID
    tenant_name: str
    role: str  # owner | admin | member (member = solo lectura)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "user"  # user | master
