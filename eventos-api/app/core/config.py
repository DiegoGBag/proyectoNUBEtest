from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: str = "http://localhost:5173"
    AWS_S3_BUCKET: str = ""
    AWS_REGION: str = "us-east-1"
    APP_ENV: str = "development"

    # Administrador maestro: sus credenciales viven en codigo (no hay fila en Users).
    # Se pueden sobreescribir con las variables de entorno ADMIN_EMAIL / ADMIN_PASSWORD.
    ADMIN_EMAIL: str = "admin-d"
    ADMIN_PASSWORD: str = "admind123456789"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
