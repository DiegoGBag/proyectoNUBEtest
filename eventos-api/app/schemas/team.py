from pydantic import BaseModel, EmailStr, Field


class SubUserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class SubUserUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    is_active: bool = True
    password: str | None = Field(default=None, min_length=8, max_length=72)
