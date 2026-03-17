from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import inspect, text
from config import settings
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Для SQLite нужен специальный параметр
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    future=True,
    connect_args={"check_same_thread": False}
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def update_database_schema():
    """Обновляет схему базы данных, добавляя недостающие колонки и таблицы"""
    logger.info("🔄 Checking database schema...")
    
    # Используем прямое соединение для выполнения SQL
    async with engine.connect() as conn:
        try:
            # Включаем поддержку внешних ключей для SQLite
            await conn.execute(text("PRAGMA foreign_keys=ON"))
            
            # ========== ПРОВЕРКА СУЩЕСТВОВАНИЯ ТАБЛИЦ ==========
            # Получаем список таблиц через прямой SQL запрос
            result = await conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            )
            tables = [row[0] for row in result.fetchall()]
            logger.info(f"Existing tables: {tables}")
            
            # ========== ПОЛУЧЕНИЕ КОЛОНОК ДЛЯ ТАБЛИЦЫ ==========
            async def get_columns(table_name):
                if table_name not in tables:
                    return []
                result = await conn.execute(
                    text(f"PRAGMA table_info({table_name})")
                )
                return [row[1] for row in result.fetchall()]
            
            # ========== ОБНОВЛЕНИЕ ТАБЛИЦЫ USERS ==========
            if 'users' in tables:
                columns = await get_columns('users')
                logger.info(f"Users columns: {columns}")
                
                # Добавляем колонку bio
                if 'bio' not in columns:
                    await conn.execute(text('ALTER TABLE users ADD COLUMN bio TEXT'))
                    logger.info("✅ Added column 'bio' to users table")
                
                # Добавляем колонку phone
                if 'phone' not in columns:
                    await conn.execute(text('ALTER TABLE users ADD COLUMN phone VARCHAR(20)'))
                    logger.info("✅ Added column 'phone' to users table")
                
                # Добавляем колонку settings
                if 'settings' not in columns:
                    await conn.execute(text('ALTER TABLE users ADD COLUMN settings JSON'))
                    logger.info("✅ Added column 'settings' to users table")
            
            # ========== ОБНОВЛЕНИЕ ТАБЛИЦЫ MESSAGES ==========
            if 'messages' in tables:
                columns = await get_columns('messages')
                
                # Добавляем колонку forwarded_from_id
                if 'forwarded_from_id' not in columns:
                    await conn.execute(text('ALTER TABLE messages ADD COLUMN forwarded_from_id INTEGER REFERENCES messages(id) ON DELETE SET NULL'))
                    logger.info("✅ Added column 'forwarded_from_id' to messages table")
                
                # Добавляем колонку is_edited
                if 'is_edited' not in columns:
                    await conn.execute(text('ALTER TABLE messages ADD COLUMN is_edited BOOLEAN DEFAULT 0'))
                    logger.info("✅ Added column 'is_edited' to messages table")
                
                # Добавляем колонку is_pinned
                if 'is_pinned' not in columns:
                    await conn.execute(text('ALTER TABLE messages ADD COLUMN is_pinned BOOLEAN DEFAULT 0'))
                    logger.info("✅ Added column 'is_pinned' to messages table")
                
                # Добавляем колонку is_important
                if 'is_important' not in columns:
                    await conn.execute(text('ALTER TABLE messages ADD COLUMN is_important BOOLEAN DEFAULT 0'))
                    logger.info("✅ Added column 'is_important' to messages table")
                
                # Добавляем колонку message_metadata
                if 'message_metadata' not in columns:
                    # Проверяем, есть ли старая колонка metadata
                    if 'metadata' in columns:
                        # SQLite не поддерживает прямой RENAME COLUMN, создаем новую таблицу
                        logger.info("⚠️ Need to handle metadata column migration...")
                        # Для простоты создаем новую колонку
                        await conn.execute(text('ALTER TABLE messages ADD COLUMN message_metadata JSON'))
                        logger.info("✅ Added column 'message_metadata' to messages table")
                    else:
                        await conn.execute(text('ALTER TABLE messages ADD COLUMN message_metadata JSON'))
                        logger.info("✅ Added column 'message_metadata' to messages table")
                
                # Добавляем колонку duration
                if 'duration' not in columns:
                    await conn.execute(text('ALTER TABLE messages ADD COLUMN duration INTEGER'))
                    logger.info("✅ Added column 'duration' to messages table")
                
                # Добавляем колонку width
                if 'width' not in columns:
                    await conn.execute(text('ALTER TABLE messages ADD COLUMN width INTEGER'))
                    logger.info("✅ Added column 'width' to messages table")
                
                # Добавляем колонку height
                if 'height' not in columns:
                    await conn.execute(text('ALTER TABLE messages ADD COLUMN height INTEGER'))
                    logger.info("✅ Added column 'height' to messages table")
            
            # ========== ОБНОВЛЕНИЕ ТАБЛИЦЫ CHATS ==========
            if 'chats' in tables:
                columns = await get_columns('chats')
                
                # Добавляем колонку invite_link
                if 'invite_link' not in columns:
                    await conn.execute(text('ALTER TABLE chats ADD COLUMN invite_link VARCHAR(500)'))
                    logger.info("✅ Added column 'invite_link' to chats table")
                
                # Добавляем колонку is_verified
                if 'is_verified' not in columns:
                    await conn.execute(text('ALTER TABLE chats ADD COLUMN is_verified BOOLEAN DEFAULT 0'))
                    logger.info("✅ Added column 'is_verified' to chats table")
                
                # Добавляем колонку is_public
                if 'is_public' not in columns:
                    await conn.execute(text('ALTER TABLE chats ADD COLUMN is_public BOOLEAN DEFAULT 0'))
                    logger.info("✅ Added column 'is_public' to chats table")
                
                # Добавляем колонку slow_mode_delay
                if 'slow_mode_delay' not in columns:
                    await conn.execute(text('ALTER TABLE chats ADD COLUMN slow_mode_delay INTEGER DEFAULT 0'))
                    logger.info("✅ Added column 'slow_mode_delay' to chats table")
                
                # Добавляем колонку last_message_id
                if 'last_message_id' not in columns:
                    await conn.execute(text('ALTER TABLE chats ADD COLUMN last_message_id INTEGER REFERENCES messages(id)'))
                    logger.info("✅ Added column 'last_message_id' to chats table")
                
                # Добавляем колонку last_message_time
                if 'last_message_time' not in columns:
                    await conn.execute(text('ALTER TABLE chats ADD COLUMN last_message_time TIMESTAMP'))
                    logger.info("✅ Added column 'last_message_time' to chats table")
                
                # Добавляем колонку settings
                if 'settings' not in columns:
                    await conn.execute(text('ALTER TABLE chats ADD COLUMN settings JSON'))
                    logger.info("✅ Added column 'settings' to chats table")
            
            # ========== ОБНОВЛЕНИЕ ТАБЛИЦЫ CHAT_PARTICIPANTS ==========
            if 'chat_participants' in tables:
                columns = await get_columns('chat_participants')
                
                # Добавляем колонку permissions
                if 'permissions' not in columns:
                    await conn.execute(text('ALTER TABLE chat_participants ADD COLUMN permissions JSON'))
                    logger.info("✅ Added column 'permissions' to chat_participants table")
                
                # Добавляем колонку last_read_message_id
                if 'last_read_message_id' not in columns:
                    await conn.execute(text('ALTER TABLE chat_participants ADD COLUMN last_read_message_id INTEGER'))
                    logger.info("✅ Added column 'last_read_message_id' to chat_participants table")
                
                # Добавляем колонку last_read_at
                if 'last_read_at' not in columns:
                    await conn.execute(text('ALTER TABLE chat_participants ADD COLUMN last_read_at TIMESTAMP'))
                    logger.info("✅ Added column 'last_read_at' to chat_participants table")
                
                # Добавляем колонку muted_until
                if 'muted_until' not in columns:
                    await conn.execute(text('ALTER TABLE chat_participants ADD COLUMN muted_until TIMESTAMP'))
                    logger.info("✅ Added column 'muted_until' to chat_participants table")
                
                # Добавляем колонку is_hidden
                if 'is_hidden' not in columns:
                    await conn.execute(text('ALTER TABLE chat_participants ADD COLUMN is_hidden BOOLEAN DEFAULT 0'))
                    logger.info("✅ Added column 'is_hidden' to chat_participants table")
                
                # Добавляем колонку custom_title
                if 'custom_title' not in columns:
                    await conn.execute(text('ALTER TABLE chat_participants ADD COLUMN custom_title VARCHAR(100)'))
                    logger.info("✅ Added column 'custom_title' to chat_participants table")
            
            # ========== СОЗДАНИЕ НОВЫХ ТАБЛИЦ ==========
            
            # Таблица message_deletes
            if 'message_deletes' not in tables:
                await conn.execute(text("""
                    CREATE TABLE message_deletes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                await conn.execute(text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS ix_message_deletes_message_user 
                    ON message_deletes(message_id, user_id)
                """))
                logger.info("✅ Created table 'message_deletes'")
            
            # Таблица message_reactions
            if 'message_reactions' not in tables:
                await conn.execute(text("""
                    CREATE TABLE message_reactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        reaction VARCHAR(20),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                await conn.execute(text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS ix_message_reactions_message_user 
                    ON message_reactions(message_id, user_id, reaction)
                """))
                logger.info("✅ Created table 'message_reactions'")
            
            # Таблица saved_messages
            if 'saved_messages' not in tables:
                await conn.execute(text("""
                    CREATE TABLE saved_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
                        note TEXT,
                        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                await conn.execute(text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS ix_saved_messages_user_message 
                    ON saved_messages(user_id, message_id)
                """))
                logger.info("✅ Created table 'saved_messages'")
            
            # Таблица notifications
            if 'notifications' not in tables:
                await conn.execute(text("""
                    CREATE TABLE notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        type VARCHAR(50),
                        title VARCHAR(255),
                        content TEXT,
                        data JSON,
                        is_read BOOLEAN DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                await conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_notifications_user_read 
                    ON notifications(user_id, is_read)
                """))
                logger.info("✅ Created table 'notifications'")
            
            # Таблица calls
            if 'calls' not in tables:
                await conn.execute(text("""
                    CREATE TABLE calls (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        call_id VARCHAR(36) UNIQUE,
                        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
                        initiator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        call_type VARCHAR(10),
                        status VARCHAR(20),
                        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        end_time TIMESTAMP,
                        duration INTEGER,
                        participants JSON
                    )
                """))
                await conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_calls_call_id ON calls(call_id)
                """))
                logger.info("✅ Created table 'calls'")
            
            # Таблица bots
            if 'bots' not in tables:
                await conn.execute(text("""
                    CREATE TABLE bots (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name VARCHAR(50) UNIQUE,
                        username VARCHAR(50) UNIQUE,
                        token VARCHAR(100) UNIQUE,
                        description TEXT,
                        about TEXT,
                        avatar_url VARCHAR(500),
                        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        webhook_url VARCHAR(500),
                        commands JSON,
                        is_active BOOLEAN DEFAULT 1,
                        can_join_groups BOOLEAN DEFAULT 1,
                        can_read_all_group_messages BOOLEAN DEFAULT 0,
                        privacy_mode BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                logger.info("✅ Created table 'bots'")
            
            # ========== СОЗДАНИЕ ИНДЕКСОВ ==========
            
            # Индексы для messages
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_messages_chat_id_sent_at 
                ON messages(chat_id, sent_at)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_messages_sender_id 
                ON messages(sender_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_messages_reply_to_id 
                ON messages(reply_to_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_messages_forwarded_from_id 
                ON messages(forwarded_from_id)
            """))
            
            logger.info("✅ All indexes created/verified")
            
            await conn.commit()
            logger.info("✅ Database schema update completed successfully")
            
        except Exception as e:
            await conn.rollback()
            logger.error(f"❌ Error updating database schema: {e}")
            raise

async def init_db():
    """Инициализация базы данных"""
    logger.info("🔄 Initializing database...")
    
    # Создаем все таблицы, если их нет
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        logger.info("✅ Base tables created/verified")
    
    # Обновляем схему (добавляем недостающие колонки)
    await update_database_schema()
    
    logger.info("✅ Database initialization completed")

async def drop_all_tables():
    """Удаление всех таблиц (для разработки)"""
    logger.warning("⚠️ Dropping all tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.warning("✅ All tables dropped")

async def reset_database():
    """Сброс базы данных (для разработки)"""
    await drop_all_tables()
    await init_db()