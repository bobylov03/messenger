import os
from dotenv import load_dotenv
from typing import List, Optional

load_dotenv()

class Settings:
    # Основные настройки приложения
    PROJECT_NAME: str = "Company Messenger"
    PROJECT_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # База данных
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./messenger.db")
    DATABASE_POOL_SIZE: int = int(os.getenv("DATABASE_POOL_SIZE", "20"))
    DATABASE_MAX_OVERFLOW: int = int(os.getenv("DATABASE_MAX_OVERFLOW", "10"))
    DATABASE_POOL_TIMEOUT: int = int(os.getenv("DATABASE_POOL_TIMEOUT", "30"))
    DATABASE_ECHO: bool = os.getenv("DATABASE_ECHO", "False").lower() == "true"
    
    # JWT аутентификация
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 дней по умолчанию
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
    
    # Redis (опционально)
    REDIS_URL: Optional[str] = os.getenv("REDIS_URL", None)
    REDIS_ENABLED: bool = REDIS_URL is not None
    
    # Загрузка файлов
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_FILE_SIZE: int = int(os.getenv("MAX_FILE_SIZE", str(100 * 1024 * 1024)))  # 100MB по умолчанию
    ALLOWED_EXTENSIONS: List[str] = [
        # Изображения
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
        # Видео
        '.mp4', '.mov', '.avi', '.mkv', '.webm',
        # Аудио
        '.mp3', '.wav', '.m4a', '.ogg', '.flac',
        # Документы
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.txt', '.rtf', '.odt', '.ods', '.odp',
        # Архивы
        '.zip', '.rar', '.7z', '.tar', '.gz',
        # Код
        '.py', '.js', '.html', '.css', '.json', '.xml', '.yaml', '.yml'
    ]
    
    # WebRTC настройки для звонков
    STUN_SERVERS: List[str] = [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302"
    ]
    
    TURN_SERVERS: List[dict] = [
        # Можно добавить TURN серверы для обхода NAT
        # {
        #     "urls": "turn:turn.example.com:3478",
        #     "username": "user",
        #     "credential": "password"
        # }
    ]
    
    # Настройки WebSocket
    WS_HEARTBEAT_INTERVAL: int = int(os.getenv("WS_HEARTBEAT_INTERVAL", "30"))  # секунды
    WS_MAX_CONNECTIONS: int = int(os.getenv("WS_MAX_CONNECTIONS", "1000"))
    WS_RECONNECT_DELAY: int = int(os.getenv("WS_RECONNECT_DELAY", "3"))  # секунды
    
    # Настройки CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite default
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    
    if ENVIRONMENT == "production":
        CORS_ORIGINS.extend(os.getenv("CORS_ORIGINS", "").split(","))
    
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]
    
    # Настройки rate limiting (ограничение запросов)
    RATE_LIMIT_ENABLED: bool = ENVIRONMENT == "production"
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))  # запросов
    RATE_LIMIT_PERIOD: int = int(os.getenv("RATE_LIMIT_PERIOD", "60"))  # секунд
    
    # Настройки безопасности
    PASSWORD_MIN_LENGTH: int = int(os.getenv("PASSWORD_MIN_LENGTH", "6"))
    BCRYPT_ROUNDS: int = int(os.getenv("BCRYPT_ROUNDS", "12"))
    
    # Настройки логирования
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Настройки пагинации
    DEFAULT_PAGE_SIZE: int = int(os.getenv("DEFAULT_PAGE_SIZE", "50"))
    MAX_PAGE_SIZE: int = int(os.getenv("MAX_PAGE_SIZE", "200"))
    
    # Настройки сообщений
    MAX_MESSAGE_LENGTH: int = int(os.getenv("MAX_MESSAGE_LENGTH", "4096"))
    MESSAGE_HISTORY_DAYS: int = int(os.getenv("MESSAGE_HISTORY_DAYS", "30"))  # сколько дней хранить историю
    
    # Настройки поиска
    SEARCH_MIN_QUERY_LENGTH: int = int(os.getenv("SEARCH_MIN_QUERY_LENGTH", "2"))
    SEARCH_MAX_RESULTS: int = int(os.getenv("SEARCH_MAX_RESULTS", "100"))
    
    # Настройки уведомлений
    NOTIFICATIONS_ENABLED: bool = True
    NOTIFICATIONS_BATCH_SIZE: int = int(os.getenv("NOTIFICATIONS_BATCH_SIZE", "50"))
    
    # Пути для загрузки файлов
    AVATAR_UPLOAD_DIR: str = os.path.join(UPLOAD_DIR, "avatars")
    FILE_UPLOAD_DIR: str = os.path.join(UPLOAD_DIR, "files")
    CHAT_AVATAR_UPLOAD_DIR: str = os.path.join(UPLOAD_DIR, "chat_avatars")
    TEMP_UPLOAD_DIR: str = os.path.join(UPLOAD_DIR, "temp")
    
    # Максимальные размеры для разных типов файлов
    MAX_AVATAR_SIZE: int = int(os.getenv("MAX_AVATAR_SIZE", str(5 * 1024 * 1024)))  # 5MB
    MAX_IMAGE_SIZE: int = int(os.getenv("MAX_IMAGE_SIZE", str(20 * 1024 * 1024)))  # 20MB
    MAX_VIDEO_SIZE: int = int(os.getenv("MAX_VIDEO_SIZE", str(100 * 1024 * 1024)))  # 100MB
    MAX_AUDIO_SIZE: int = int(os.getenv("MAX_AUDIO_SIZE", str(50 * 1024 * 1024)))  # 50MB
    MAX_DOCUMENT_SIZE: int = int(os.getenv("MAX_DOCUMENT_SIZE", str(50 * 1024 * 1024)))  # 50MB
    
    # Доступные типы файлов по категориям
    IMAGE_EXTENSIONS: List[str] = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
    VIDEO_EXTENSIONS: List[str] = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv']
    AUDIO_EXTENSIONS: List[str] = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']
    DOCUMENT_EXTENSIONS: List[str] = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf']
    ARCHIVE_EXTENSIONS: List[str] = ['.zip', '.rar', '.7z', '.tar', '.gz']
    
    # Настройки звонков
    MAX_CALL_DURATION: int = int(os.getenv("MAX_CALL_DURATION", "7200"))  # 2 часа в секундах
    CALL_RECORDING_ENABLED: bool = os.getenv("CALL_RECORDING_ENABLED", "False").lower() == "true"
    
    # Настройки для администраторов
    ADMIN_EMAILS: List[str] = os.getenv("ADMIN_EMAILS", "").split(",") if os.getenv("ADMIN_EMAILS") else []
    
    # Настройки для разработки
    if ENVIRONMENT == "development":
        RELOAD: bool = True
        LOG_LEVEL = "DEBUG"
        DATABASE_ECHO = True
    else:
        RELOAD: bool = False
    
    def __init__(self):
        # Создаем директории для загрузок при инициализации
        self._create_upload_dirs()
    
    def _create_upload_dirs(self):
        """Создает все необходимые директории для загрузок"""
        directories = [
            self.UPLOAD_DIR,
            self.AVATAR_UPLOAD_DIR,
            self.FILE_UPLOAD_DIR,
            self.CHAT_AVATAR_UPLOAD_DIR,
            self.TEMP_UPLOAD_DIR
        ]
        
        for directory in directories:
            os.makedirs(directory, exist_ok=True)
    
    def get_file_size_limit(self, file_extension: str) -> int:
        """Возвращает лимит размера для типа файла"""
        ext = file_extension.lower()
        
        if ext in self.IMAGE_EXTENSIONS:
            return self.MAX_IMAGE_SIZE
        elif ext in self.VIDEO_EXTENSIONS:
            return self.MAX_VIDEO_SIZE
        elif ext in self.AUDIO_EXTENSIONS:
            return self.MAX_AUDIO_SIZE
        elif ext in self.DOCUMENT_EXTENSIONS or ext in self.ARCHIVE_EXTENSIONS:
            return self.MAX_DOCUMENT_SIZE
        else:
            return self.MAX_FILE_SIZE
    
    def is_extension_allowed(self, file_extension: str) -> bool:
        """Проверяет, разрешено ли расширение файла"""
        return file_extension.lower() in self.ALLOWED_EXTENSIONS
    
    def get_file_type(self, file_extension: str) -> str:
        """Определяет тип файла по расширению"""
        ext = file_extension.lower()
        
        if ext in self.IMAGE_EXTENSIONS:
            return "image"
        elif ext in self.VIDEO_EXTENSIONS:
            return "video"
        elif ext in self.AUDIO_EXTENSIONS:
            return "audio"
        elif ext in self.DOCUMENT_EXTENSIONS:
            return "document"
        elif ext in self.ARCHIVE_EXTENSIONS:
            return "archive"
        else:
            return "file"

# Создаем экземпляр настроек
settings = Settings()

# Для удобства, экспортируем все как словарь
settings_dict = {
    "PROJECT_NAME": settings.PROJECT_NAME,
    "PROJECT_VERSION": settings.PROJECT_VERSION,
    "DEBUG": settings.DEBUG,
    "ENVIRONMENT": settings.ENVIRONMENT,
    "DATABASE_URL": settings.DATABASE_URL,
    "SECRET_KEY": settings.SECRET_KEY,
    "ALGORITHM": settings.ALGORITHM,
    "ACCESS_TOKEN_EXPIRE_MINUTES": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    "UPLOAD_DIR": settings.UPLOAD_DIR,
    "MAX_FILE_SIZE": settings.MAX_FILE_SIZE,
    "STUN_SERVERS": settings.STUN_SERVERS,
}