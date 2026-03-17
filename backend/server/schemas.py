from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

# ==================== Базовые схемы ====================

class TokenData(BaseModel):
    username: Optional[str] = None

class UserBase(BaseModel):
    username: str
    email: str
    full_name: str

class UserCreate(UserBase):
    password: str
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Пароль должен содержать минимум 6 символов')
        return v

class UserLogin(BaseModel):
    username: str
    password: str
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 1:
            raise ValueError('Пароль не может быть пустым')
        return v

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    is_online: bool = False
    last_seen: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# ==================== Схемы сообщений ====================

class MessageBase(BaseModel):
    content: Optional[str] = None
    message_type: str = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None

class MessageCreate(MessageBase):
    chat_id: int
    topic_id: Optional[int] = None
    reply_to_id: Optional[int] = None
    temp_id: Optional[str] = None  # Для оптимистичных обновлений

class MessageUpdate(BaseModel):
    content: Optional[str] = None
    is_pinned: Optional[bool] = None

class MessageDelete(BaseModel):
    message_id: int
    delete_for: str  # "me" или "everyone"

class MessageReply(BaseModel):
    reply_to_id: int
    content: str
    message_type: str = "text"
    file_url: Optional[str] = None

class MessageForward(BaseModel):
    message_ids: List[int]
    target_chat_id: int

class MessageAction(BaseModel):
    message_id: int
    action_type: str  # "delete_for_me", "delete_for_everyone", "reply", "forward", "copy", "pin", "unpin"

class MessageResponse(BaseModel):
    id: int
    chat_id: int
    sender_id: int
    content: Optional[str]
    message_type: str
    file_url: Optional[str]
    file_name: Optional[str]
    file_size: Optional[int]
    sent_at: datetime
    updated_at: Optional[datetime] = None
    is_read: bool = False
    is_edited: bool = False
    is_deleted: bool = False
    is_pinned: bool = False
    reply_to_id: Optional[int] = None
    forwarded_from_id: Optional[int] = None
    reply_to_message: Optional['MessagePreview'] = None
    forwarded_from_message: Optional['MessagePreview'] = None
    sender: Optional[UserResponse] = None
    metadata: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

class MessagePreview(BaseModel):
    id: int
    sender_id: int
    content: Optional[str]
    message_type: str
    sender_name: Optional[str] = None
    
    class Config:
        from_attributes = True

# ==================== Схемы чатов ====================

class ChatBase(BaseModel):
    name: Optional[str] = None
    chat_type: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None

class ChatCreate(ChatBase):
    participant_ids: List[int]
    topic_names: Optional[List[str]] = None

class ChatParticipantResponse(BaseModel):
    user_id: int
    chat_id: int
    joined_at: datetime
    role: str = "member"
    user: Optional[UserResponse] = None
    
    class Config:
        from_attributes = True

class ChatResponse(BaseModel):
    id: int
    name: Optional[str] = None
    chat_type: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    participants: Optional[List[ChatParticipantResponse]] = None
    last_message: Optional[MessagePreview] = None
    unread_count: int = 0
    pinned_messages: Optional[List[int]] = None
    
    class Config:
        from_attributes = True

class SimpleChatResponse(BaseModel):
    id: int
    name: Optional[str] = None
    chat_type: str
    created_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None
    last_message_time: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# ==================== WebRTC схемы ====================

class WebRTCOffer(BaseModel):
    call_id: str
    offer: Dict[str, Any]
    call_type: str

class WebRTCAnswer(BaseModel):
    call_id: str
    answer: Dict[str, Any]

class WebRTCCandidate(BaseModel):
    call_id: str
    candidate: Dict[str, Any]

class CallResponse(BaseModel):
    call_id: str
    chat_id: int
    initiator_id: int
    call_type: str
    start_time: datetime
    status: str  # "ringing", "ongoing", "ended", "rejected"

# ==================== Схемы для уведомлений ====================

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    type: str  # "message", "call", "mention", "reply"
    content: str
    is_read: bool = False
    created_at: datetime
    data: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

# ==================== Схемы для поиска ====================

class SearchMessages(BaseModel):
    chat_id: Optional[int] = None
    query: str
    from_user_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    message_type: Optional[str] = None
    limit: int = 50
    offset: int = 0

# ==================== Схемы для реакций ====================

class MessageReaction(BaseModel):
    message_id: int
    reaction: str  # 👍 ❤️ 😂 😮 😢 😡

class MessageReactionResponse(BaseModel):
    message_id: int
    user_id: int
    reaction: str
    created_at: datetime
    user: Optional[UserResponse] = None
    
    class Config:
        from_attributes = True

# Обновляем forward references
MessageResponse.update_forward_refs()
ChatResponse.update_forward_refs()