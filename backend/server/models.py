from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(100), unique=True, index=True)
    full_name = Column(String(100))
    hashed_password = Column(String(255))
    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    settings = Column(JSON, nullable=True)  # JSON поле для хранения настроек пользователя
    
    # Relationships
    messages = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id")
    calls = relationship("Call", back_populates="initiator")
    chat_participations = relationship("ChatParticipant", back_populates="user")
    deleted_messages = relationship("MessageDelete", back_populates="user")
    reactions = relationship("MessageReaction", back_populates="user")
    saved_messages = relationship("SavedMessage", back_populates="user")
    notifications = relationship("Notification", back_populates="user")

class Chat(Base):
    __tablename__ = "chats"
    
    id = Column(Integer, primary_key=True, index=True)
    chat_type = Column(String(20))  # 'private', 'group', 'channel', 'saved' (сохраненные сообщения)
    name = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    invite_link = Column(String(500), nullable=True)
    is_encrypted = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    is_public = Column(Boolean, default=False)
    slow_mode_delay = Column(Integer, default=0)  # Задержка в секундах для медленного режима
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    last_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    last_message_time = Column(DateTime, nullable=True)
    settings = Column(JSON, nullable=True)  # JSON поле для настроек чата
    
    # Relationships - ИСПРАВЛЕНО: добавлен overlaps для pinned_messages
    participants = relationship("ChatParticipant", back_populates="chat", cascade="all, delete-orphan")
    topics = relationship("ChatTopic", back_populates="chat", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="chat", foreign_keys="Message.chat_id", cascade="all, delete-orphan")
    pinned_messages = relationship(
        "Message", 
        primaryjoin="and_(Message.chat_id==Chat.id, Message.is_pinned==True)",
        viewonly=True,
        overlaps="messages"  # ВАЖНО: предотвращает конфликт с messages
    )
    calls = relationship("Call", back_populates="chat")
    creator = relationship("User", foreign_keys=[created_by])
    last_message = relationship("Message", foreign_keys=[last_message_id])

class ChatTopic(Base):
    __tablename__ = "chat_topics"
    
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"))
    name = Column(String(100))
    description = Column(String(255), nullable=True)
    icon = Column(String(50), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    chat = relationship("Chat", back_populates="topics")
    messages = relationship("Message", back_populates="topic")
    creator = relationship("User", foreign_keys=[created_by])

class ChatParticipant(Base):
    __tablename__ = "chat_participants"
    
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    role = Column(String(20), default="member")  # 'creator', 'admin', 'moderator', 'member'
    permissions = Column(JSON, nullable=True)  # Индивидуальные права
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_read_message_id = Column(Integer, nullable=True)
    last_read_at = Column(DateTime, nullable=True)
    muted_until = Column(DateTime, nullable=True)
    is_hidden = Column(Boolean, default=False)  # Скрыт ли участник (для больших групп)
    custom_title = Column(String(100), nullable=True)  # Пользовательский титул
    
    # Relationships
    chat = relationship("Chat", back_populates="participants")
    user = relationship("User", back_populates="chat_participations")
    
    __table_args__ = (
        Index('ix_chat_participants_chat_user', 'chat_id', 'user_id', unique=True),
    )

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"))
    topic_id = Column(Integer, ForeignKey("chat_topics.id", ondelete="SET NULL"), nullable=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    reply_to_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    forwarded_from_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    
    message_type = Column(String(20))  # 'text', 'image', 'video', 'audio', 'file', 'voice', 'gif', 'sticker', 'location', 'contact', 'poll', 'deleted'
    content = Column(Text, nullable=True)
    
    # Медиа поля
    file_url = Column(String(500), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    file_mime_type = Column(String(100), nullable=True)
    duration = Column(Integer, nullable=True)  # Для аудио/видео
    thumbnail_url = Column(String(500), nullable=True)
    width = Column(Integer, nullable=True)  # Для изображений/видео
    height = Column(Integer, nullable=True)  # Для изображений/видео
    
    # Метаданные - ИСПРАВЛЕНО: metadata переименовано в message_metadata
    message_metadata = Column(JSON, nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
    edited_at = Column(DateTime, nullable=True)
    
    # Статусы
    is_read = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    is_pinned = Column(Boolean, default=False)
    is_important = Column(Boolean, default=False)  # Помечено как важное
    
    # Relationships - ИСПРАВЛЕНО: добавлен overlaps для chat
    sender = relationship("User", foreign_keys=[sender_id], back_populates="messages")
    chat = relationship(
        "Chat", 
        back_populates="messages", 
        foreign_keys=[chat_id],
        overlaps="pinned_messages"  # ВАЖНО: предотвращает конфликт с pinned_messages
    )
    topic = relationship("ChatTopic", back_populates="messages")
    reply_to = relationship("Message", remote_side=[id], foreign_keys=[reply_to_id])
    forwarded_from = relationship("Message", remote_side=[id], foreign_keys=[forwarded_from_id])
    deleted_by = relationship("MessageDelete", back_populates="message", cascade="all, delete-orphan")
    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_messages_chat_id_sent_at', 'chat_id', 'sent_at'),
        Index('ix_messages_sender_id', 'sender_id'),
        Index('ix_messages_reply_to_id', 'reply_to_id'),
        Index('ix_messages_forwarded_from_id', 'forwarded_from_id'),
    )

class MessageDelete(Base):
    __tablename__ = "message_deletes"
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    deleted_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    message = relationship("Message", back_populates="deleted_by")
    user = relationship("User", back_populates="deleted_messages")
    
    __table_args__ = (
        Index('ix_message_deletes_message_user', 'message_id', 'user_id', unique=True),
    )

class MessageReaction(Base):
    __tablename__ = "message_reactions"
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    reaction = Column(String(20))  # 👍, ❤️, 😂, 😮, 😢, 😡, 👎
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    message = relationship("Message", back_populates="reactions")
    user = relationship("User", back_populates="reactions")
    
    __table_args__ = (
        Index('ix_message_reactions_message_user', 'message_id', 'user_id', unique=True),
    )

class SavedMessage(Base):
    __tablename__ = "saved_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"))
    saved_at = Column(DateTime, default=datetime.utcnow)
    note = Column(Text, nullable=True)  # Заметка к сохраненному сообщению
    
    # Relationships
    user = relationship("User", back_populates="saved_messages")
    message = relationship("Message")
    
    __table_args__ = (
        Index('ix_saved_messages_user_message', 'user_id', 'message_id', unique=True),
    )

class Call(Base):
    __tablename__ = "calls"
    
    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(String(36), unique=True, index=True)  # UUID для WebRTC
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"))
    initiator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    call_type = Column(String(10))  # 'audio', 'video'
    status = Column(String(20))  # 'ringing', 'ongoing', 'ended', 'missed', 'rejected'
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=True)  # в секундах
    participants = Column(JSON, nullable=True)  # Список участников с временем входа/выхода
    
    # Relationships
    initiator = relationship("User", foreign_keys=[initiator_id], back_populates="calls")
    chat = relationship("Chat", back_populates="calls")

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    type = Column(String(50))  # 'message', 'call', 'mention', 'reply', 'reaction', 'system'
    title = Column(String(255), nullable=True)
    content = Column(Text, nullable=True)
    data = Column(JSON, nullable=True)  # Дополнительные данные
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="notifications")
    
    __table_args__ = (
        Index('ix_notifications_user_read', 'user_id', 'is_read'),
    )

class Bot(Base):
    __tablename__ = "bots"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True)
    username = Column(String(50), unique=True, index=True)
    token = Column(String(100), unique=True)
    description = Column(Text, nullable=True)
    about = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    webhook_url = Column(String(500), nullable=True)
    commands = Column(JSON, nullable=True)  # Список команд бота
    is_active = Column(Boolean, default=True)
    can_join_groups = Column(Boolean, default=True)
    can_read_all_group_messages = Column(Boolean, default=False)
    privacy_mode = Column(Boolean, default=True)  # Получает только команды, а не все сообщения
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    owner = relationship("User", foreign_keys=[owner_id])