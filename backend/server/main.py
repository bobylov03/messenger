from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, UploadFile, File, Form, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, delete, update
from sqlalchemy.orm import selectinload
from typing import List, Dict, Optional, Any
import json
import asyncio
import uuid
import os
import aiofiles
from datetime import datetime, timedelta
import logging
import logging.config
import mimetypes

from config import settings
from database import get_db, init_db, AsyncSessionLocal
from models import User, Chat, Message, ChatParticipant, MessageDelete, MessageReaction, SavedMessage, Notification, Call
from schemas import (
    UserCreate, UserLogin, Token, UserResponse,
    MessageCreate, MessageResponse, ChatCreate, ChatResponse,
    MessageUpdate, MessageDelete as MessageDeleteSchema,
    MessageReply, MessageForward, MessageAction,
    MessageReaction as MessageReactionSchema,
    MessageReactionResponse,
    NotificationResponse,
    SearchMessages,
    WebRTCOffer, WebRTCAnswer, WebRTCCandidate, CallResponse
)
from auth import authenticate_user, create_access_token, get_current_user, get_password_hash
from crud import (
    create_user, create_chat, create_message, get_chat_messages, get_user_chats,
    get_message_by_id, update_message, delete_message_for_me, delete_message_for_everyone,
    reply_to_message, forward_messages, pin_message, unpin_message,
    add_reaction, remove_reaction, get_message_reactions,
    search_messages, get_user_by_id, get_chat_by_id,
    add_participant_to_chat, remove_participant_from_chat, update_user_status
)

# ==================== НАСТРОЙКА ЛОГИРОВАНИЯ ====================

# Отключаем все шумные логгеры
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy.dialects').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy.orm').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy.engine.base.Engine').setLevel(logging.WARNING)

# Отключаем urllib3
logging.getLogger('urllib3').setLevel(logging.WARNING)
logging.getLogger('urllib3.connectionpool').setLevel(logging.WARNING)

# Отключаем uvicorn access логи (самые шумные)
logging.getLogger('uvicorn.access').setLevel(logging.WARNING)
logging.getLogger('uvicorn.error').setLevel(logging.ERROR)
logging.getLogger('uvicorn').setLevel(logging.WARNING)

# Отключаем websockets логи
logging.getLogger('websockets').setLevel(logging.WARNING)
logging.getLogger('websockets.server').setLevel(logging.WARNING)
logging.getLogger('websockets.protocol').setLevel(logging.WARNING)

# Настраиваем формат для наших логов
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler()
    ]
)

# Создаем логгер для нашего приложения
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Добавляем фильтр для отсеивания повторяющихся сообщений
class DuplicateFilter(logging.Filter):
    def __init__(self):
        super().__init__()
        self.last_message = ""
        self.last_count = 0
        
    def filter(self, record):
        current_message = record.getMessage()
        if current_message == self.last_message:
            self.last_count += 1
            if self.last_count > 3:
                return False
        else:
            if self.last_count > 3:
                print(f"⚠️ Previous message repeated {self.last_count} times")
            self.last_message = current_message
            self.last_count = 0
        return True

# Применяем фильтр к нашему логгеру
logger.addFilter(DuplicateFilter())

# ==================== КОНЕЦ НАСТРОЙКИ ЛОГИРОВАНИЯ ====================

app = FastAPI(title=settings.PROJECT_NAME, version=settings.PROJECT_VERSION)

# ==================== УЛУЧШЕННАЯ НАСТРОЙКА CORS ====================

# Разрешаем все источники для разработки
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:3005",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:3004",
    "http://127.0.0.1:3005",
    "http://localhost:5173",  # Vite default
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "*"  # Временно разрешаем все для отладки
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

logger.info(f"CORS configured with origins: {origins}")

# ==================== КОНЕЦ НАСТРОЙКИ CORS ====================

# Создаем директории для загрузок
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.AVATAR_UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.FILE_UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.CHAT_AVATAR_UPLOAD_DIR, exist_ok=True)

# Монтируем статику для загрузок
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Менеджер WebSocket соединений
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
        self.user_chats: Dict[int, List[int]] = {}
        self.user_last_seen: Dict[int, datetime] = {}
        self._lock = asyncio.Lock()
        self.logger = logging.getLogger(f"{__name__}.ConnectionManager")
        self.logger.setLevel(logging.INFO)
    
    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()

        old_ws = None
        async with self._lock:
            # Запоминаем старое соединение для закрытия вне лока
            if user_id in self.active_connections:
                old_ws = self.active_connections[user_id]

            self.active_connections[user_id] = websocket
            self.user_chats[user_id] = []
            self.user_last_seen[user_id] = datetime.utcnow()

            self.logger.info(f"User {user_id} connected (total: {len(self.active_connections)})")

        # Закрываем старое соединение ВНЕ лока, чтобы избежать deadlock
        if old_ws is not None:
            try:
                await old_ws.close(code=4000, reason="New connection established")
            except Exception:
                pass

        # Отправляем приветственное сообщение
        try:
            await websocket.send_json({
                "type": "connected",
                "user_id": user_id,
                "timestamp": datetime.utcnow().isoformat()
            })
        except Exception as e:
            self.logger.error(f"Error sending welcome message to user {user_id}: {e}")
    
    async def disconnect(self, websocket: WebSocket, user_id: int):
        async with self._lock:
            # Удаляем ТОЛЬКО если это тот же самый websocket (не новый)
            if user_id in self.active_connections and self.active_connections[user_id] is websocket:
                del self.active_connections[user_id]

                if user_id in self.user_chats:
                    del self.user_chats[user_id]
                if user_id in self.user_last_seen:
                    del self.user_last_seen[user_id]

                self.logger.info(f"User {user_id} disconnected (remaining: {len(self.active_connections)})")
                return True
            return False
    
    async def send_personal_message(self, message: dict, user_id: int) -> bool:
        """Отправляет сообщение конкретному пользователю"""
        if user_id not in self.active_connections:
            return False

        try:
            await self.active_connections[user_id].send_json(message)
            return True
        except Exception:
            # Удаляем мёртвое соединение
            self.active_connections.pop(user_id, None)
            self.user_chats.pop(user_id, None)
            self.user_last_seen.pop(user_id, None)
            return False
    
    async def broadcast_to_chat(self, message: dict, chat_id: int, db: AsyncSession, exclude_user_id: Optional[int] = None):
        """Отправляет сообщение всем участникам чата"""
        try:
            # Получаем всех участников чата
            result = await db.execute(
                select(ChatParticipant.user_id).filter(ChatParticipant.chat_id == chat_id)
            )
            user_ids = result.scalars().all()
            
            sent_count = 0
            
            dead_connections = []

            for user_id in user_ids:
                if exclude_user_id and user_id == exclude_user_id:
                    continue

                if user_id in self.active_connections:
                    try:
                        await self.active_connections[user_id].send_json(message)
                        sent_count += 1
                    except Exception as e:
                        self.logger.warning(f"Dead connection for user {user_id}, removing")
                        dead_connections.append(user_id)

            # Удаляем мёртвые соединения
            for user_id in dead_connections:
                self.active_connections.pop(user_id, None)
                self.user_chats.pop(user_id, None)
                self.user_last_seen.pop(user_id, None)
            
            if sent_count > 0:
                self.logger.info(f"📢 Broadcast to chat {chat_id}: sent to {sent_count}/{len(user_ids)} users")
        except Exception as e:
            self.logger.error(f"Error broadcasting to chat: {e}")
    
    async def subscribe_to_chat(self, user_id: int, chat_id: int):
        async with self._lock:
            if user_id in self.user_chats:
                if chat_id not in self.user_chats[user_id]:
                    self.user_chats[user_id].append(chat_id)
                    self.logger.info(f"User {user_id} subscribed to chat {chat_id}")
    
    async def unsubscribe_from_chat(self, user_id: int, chat_id: int):
        async with self._lock:
            if user_id in self.user_chats and chat_id in self.user_chats[user_id]:
                self.user_chats[user_id].remove(chat_id)
                self.logger.info(f"User {user_id} unsubscribed from chat {chat_id}")
    
    def should_update_status(self, user_id: int) -> bool:
        """Проверяет, нужно ли обновлять статус (ограничение частоты)"""
        if user_id not in self.user_last_seen:
            return True
        
        last = self.user_last_seen[user_id]
        now = datetime.utcnow()
        # Обновляем не чаще чем раз в 30 секунд
        if (now - last).total_seconds() > 30:
            self.user_last_seen[user_id] = now
            return True
        return False

manager = ConnectionManager()

# Хранилище для WebRTC звонков
class CallManager:
    def __init__(self):
        self.active_calls: Dict[str, Dict] = {}
        self.user_calls: Dict[int, str] = {}
        self._lock = asyncio.Lock()
        self.logger = logging.getLogger(f"{__name__}.CallManager")
        self.logger.setLevel(logging.INFO)
    
    def create_call(self, chat_id: int, initiator_id: int, call_type: str) -> str:
        call_id = str(uuid.uuid4())
        
        self.active_calls[call_id] = {
            "chat_id": chat_id,
            "initiator_id": initiator_id,
            "call_type": call_type,
            "start_time": datetime.utcnow(),
            "status": "ringing",
            "participants": [initiator_id]
        }
        
        self.user_calls[initiator_id] = call_id
        
        self.logger.info(f"📞 Call {call_id} created for chat {chat_id}")
        return call_id
    
    def get_call(self, call_id: str) -> Optional[Dict]:
        return self.active_calls.get(call_id)
    
    def update_call_status(self, call_id: str, status: str):
        if call_id in self.active_calls:
            self.active_calls[call_id]["status"] = status
            if status in ["ended", "rejected", "missed"]:
                self.active_calls[call_id]["end_time"] = datetime.utcnow()
                # Очищаем user_calls
                for user_id, cid in list(self.user_calls.items()):
                    if cid == call_id:
                        del self.user_calls[user_id]
    
    def add_participant(self, call_id: str, user_id: int):
        if call_id in self.active_calls:
            if user_id not in self.active_calls[call_id]["participants"]:
                self.active_calls[call_id]["participants"].append(user_id)
                self.user_calls[user_id] = call_id
    
    def remove_participant(self, call_id: str, user_id: int):
        if call_id in self.active_calls and user_id in self.active_calls[call_id]["participants"]:
            self.active_calls[call_id]["participants"].remove(user_id)
            if user_id in self.user_calls:
                del self.user_calls[user_id]

call_manager = CallManager()

# ==================== WebSocket Endpoint ====================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    ws_logger = logging.getLogger(f"{__name__}.ws.{user_id}")
    ws_logger.setLevel(logging.INFO)
    
    # Сначала подключаем
    await manager.connect(websocket, user_id)
    
    # Создаем отдельную сессию для WebSocket
    db = AsyncSessionLocal()
    try:
        # Обновляем статус пользователя
        try:
            await update_user_status(db, user_id, True)
            await db.commit()
        except Exception as e:
            ws_logger.error(f"Error updating user status on connect: {e}")
            await db.rollback()
        
        # Устанавливаем таймаут для receive
        while True:
            try:
                # Ждем сообщение с таймаутом 30 секунд
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
                ws_logger.info(f"📨 Received: {data.get('type')}")
                
                message_type = data.get("type")
                
                # ========== ОБРАБОТКА СООБЩЕНИЙ ==========
                if message_type == "message":
                    await handle_message(data, user_id, db)
                
                elif message_type == "edit_message":
                    await handle_edit_message(data, user_id, db)
                
                elif message_type == "delete_message":
                    await handle_delete_message(data, user_id, db)
                
                elif message_type == "add_reaction":
                    await handle_add_reaction(data, user_id, db)
                
                elif message_type == "remove_reaction":
                    await handle_remove_reaction(data, user_id, db)
                
                elif message_type == "status":
                    await handle_status(data, user_id, db)
                
                elif message_type == "typing":
                    await handle_typing(data, user_id, db)
                
                elif message_type == "read_messages":
                    await handle_read_messages(data, user_id, db)
                
                elif message_type == "subscribe":
                    chat_id = data.get("chat_id")
                    if chat_id:
                        await manager.subscribe_to_chat(user_id, chat_id)
                        await manager.send_personal_message({
                            "type": "subscribed",
                            "chat_id": chat_id
                        }, user_id)
                
                elif message_type == "unsubscribe":
                    chat_id = data.get("chat_id")
                    if chat_id:
                        await manager.unsubscribe_from_chat(user_id, chat_id)
                        await manager.send_personal_message({
                            "type": "unsubscribed",
                            "chat_id": chat_id
                        }, user_id)
                
                elif message_type == "webrtc_offer":
                    call_id = data.get("call_id")
                    offer = data.get("offer")
                    
                    call = call_manager.get_call(call_id)
                    if call:
                        target_user_id = data.get("target_user_id")
                        if target_user_id:
                            await manager.send_personal_message({
                                "type": "webrtc_offer",
                                "call_id": call_id,
                                "offer": offer,
                                "from_user_id": user_id,
                                "call_type": call["call_type"]
                            }, target_user_id)
                
                elif message_type == "webrtc_answer":
                    call_id = data.get("call_id")
                    answer = data.get("answer")
                    target_user_id = data.get("target_user_id")
                    
                    if target_user_id:
                        await manager.send_personal_message({
                            "type": "webrtc_answer",
                            "call_id": call_id,
                            "answer": answer,
                            "from_user_id": user_id
                        }, target_user_id)
                
                elif message_type == "webrtc_ice_candidate":
                    call_id = data.get("call_id")
                    candidate = data.get("candidate")
                    target_user_id = data.get("target_user_id")
                    
                    if target_user_id:
                        await manager.send_personal_message({
                            "type": "webrtc_ice_candidate",
                            "call_id": call_id,
                            "candidate": candidate,
                            "from_user_id": user_id
                        }, target_user_id)
                
                elif message_type == "call_accept":
                    call_id = data.get("call_id")
                    call = call_manager.get_call(call_id)
                    
                    if call:
                        call_manager.add_participant(call_id, user_id)
                        call_manager.update_call_status(call_id, "ongoing")
                        
                        await manager.send_personal_message({
                            "type": "call_accepted",
                            "call_id": call_id,
                            "user_id": user_id
                        }, call["initiator_id"])
                
                elif message_type == "call_reject":
                    call_id = data.get("call_id")
                    call = call_manager.get_call(call_id)
                    
                    if call:
                        call_manager.update_call_status(call_id, "rejected")
                        
                        await manager.send_personal_message({
                            "type": "call_rejected",
                            "call_id": call_id,
                            "user_id": user_id
                        }, call["initiator_id"])
                
                elif message_type == "call_end":
                    call_id = data.get("call_id")
                    call = call_manager.get_call(call_id)
                    
                    if call:
                        call_manager.update_call_status(call_id, "ended")
                        
                        for participant_id in call["participants"]:
                            if participant_id != user_id:
                                await manager.send_personal_message({
                                    "type": "call_ended",
                                    "call_id": call_id,
                                    "ended_by": user_id
                                }, participant_id)
                
                elif message_type == "ping":
                    await manager.send_personal_message({
                        "type": "pong", 
                        "timestamp": datetime.utcnow().isoformat()
                    }, user_id)
                
                else:
                    ws_logger.warning(f"Unknown message type: {message_type}")
                    
            except asyncio.TimeoutError:
                # Таймаут - отправляем ping для проверки соединения
                if not await manager.send_personal_message({"type": "ping"}, user_id):
                    ws_logger.info(f"Ping failed, disconnecting")
                    break
                    
    except (WebSocketDisconnect, RuntimeError) as e:
        ws_logger.info(f"Disconnected: {e}")
        was_active = await manager.disconnect(websocket, user_id)

        if was_active:
            try:
                await update_user_status(db, user_id, False)
                await db.commit()
            except Exception as ex:
                ws_logger.error(f"Error updating user status on disconnect: {ex}")

            asyncio.create_task(notify_user_offline(user_id))

    except Exception as e:
        ws_logger.error(f"Error: {e}")
        await manager.disconnect(websocket, user_id)
    finally:
        await db.close()

async def notify_user_offline(user_id: int):
    """Уведомляет чаты о том, что пользователь оффлайн"""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ChatParticipant.user_id)
                .filter(
                    ChatParticipant.chat_id.in_(
                        select(ChatParticipant.chat_id).filter(ChatParticipant.user_id == user_id)
                    ),
                    ChatParticipant.user_id != user_id
                )
                .distinct()
            )
            peer_user_ids = result.scalars().all()

            status_message = {
                "type": "user_status",
                "user_id": user_id,
                "is_online": False,
                "last_seen": datetime.utcnow().isoformat()
            }

            for peer_id in peer_user_ids:
                if peer_id in manager.active_connections:
                    try:
                        await manager.active_connections[peer_id].send_json(status_message)
                    except Exception:
                        manager.active_connections.pop(peer_id, None)
    except Exception as e:
        logger.error(f"Error notifying user {user_id} offline: {e}")

# ==================== Обработчики WebSocket сообщений ====================

async def handle_message(data, user_id, db):
    try:
        # Создаем объект сообщения
        message_data = MessageCreate(
            chat_id=data["chat_id"],
            content=data.get("content"),
            message_type=data.get("message_type", "text"),
            file_url=data.get("file_url"),
            file_name=data.get("file_name"),
            file_size=data.get("file_size"),
            reply_to_id=data.get("reply_to_id")
        )
        
        # Проверяем, является ли пользователь участником чата
        result = await db.execute(
            select(ChatParticipant).filter(
                ChatParticipant.chat_id == data["chat_id"],
                ChatParticipant.user_id == user_id
            )
        )
        participant = result.scalar_one_or_none()
        
        if not participant:
            await manager.send_personal_message({
                "type": "error",
                "error": "Not a participant of this chat"
            }, user_id)
            return
        
        # Сохраняем сообщение в БД
        message = await create_message(db, message_data, user_id)
        await db.commit()
        
        # Создаем ответ с полными данными
        message_response = MessageResponse.from_orm(message).dict()
        
        # Отправляем подтверждение отправителю
        await manager.send_personal_message({
            "type": "message_sent",
            "message": message_response,
            "temp_id": data.get("temp_id"),
            "message_id": message.id
        }, user_id)
        
        # Рассылаем сообщение всем участникам чата
        await manager.broadcast_to_chat({
            "type": "new_message",
            "message": message_response,
            "chat_id": data["chat_id"],
            "sender_id": user_id
        }, data["chat_id"], db, exclude_user_id=user_id)
        
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error processing message: {e}")
        await manager.send_personal_message({
            "type": "error",
            "error": str(e)
        }, user_id)

async def handle_edit_message(data, user_id, db):
    try:
        message_id = data.get("message_id")
        new_content = data.get("content")
        
        if not message_id or not new_content:
            await manager.send_personal_message({
                "type": "error",
                "error": "Missing message_id or content"
            }, user_id)
            return
        
        # Обновляем сообщение
        message = await update_message(db, message_id, user_id, MessageUpdate(content=new_content))
        await db.commit()
        
        if message:
            # Уведомляем всех участников чата
            await manager.broadcast_to_chat({
                "type": "message_edited",
                "message_id": message_id,
                "chat_id": message.chat_id,
                "new_content": new_content,
                "edited_at": message.edited_at.isoformat() if message.edited_at else None
            }, message.chat_id, db)
            
            await manager.send_personal_message({
                "type": "edit_success",
                "message_id": message_id
            }, user_id)
        else:
            await manager.send_personal_message({
                "type": "error",
                "error": "Message not found or you don't have permission to edit"
            }, user_id)
    
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error editing message: {e}")
        await manager.send_personal_message({"type": "error", "error": str(e)}, user_id)

async def handle_delete_message(data, user_id, db):
    try:
        message_id = data.get("message_id")
        delete_for = data.get("delete_for", "me")
        
        if not message_id:
            await manager.send_personal_message({
                "type": "error",
                "error": "Missing message_id"
            }, user_id)
            return
        
        message = await get_message_by_id(db, message_id)
        if not message:
            await manager.send_personal_message({
                "type": "error",
                "error": "Message not found"
            }, user_id)
            return
        
        if delete_for == "everyone":
            if message.sender_id != user_id:
                await manager.send_personal_message({
                    "type": "error",
                    "error": "You can only delete your own messages for everyone"
                }, user_id)
                return
            
            result = await delete_message_for_everyone(db, message_id, user_id)
            await db.commit()
            
            if result:
                await manager.broadcast_to_chat({
                    "type": "message_deleted",
                    "message_id": message_id,
                    "chat_id": message.chat_id,
                    "delete_for": "everyone"
                }, message.chat_id, db)
                
                await manager.send_personal_message({
                    "type": "delete_success",
                    "message_id": message_id,
                    "delete_for": "everyone"
                }, user_id)
        else:
            result = await delete_message_for_me(db, message_id, user_id)
            await db.commit()
            
            if result:
                await manager.send_personal_message({
                    "type": "delete_success",
                    "message_id": message_id,
                    "delete_for": "me"
                }, user_id)
    
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error deleting message: {e}")
        await manager.send_personal_message({"type": "error", "error": str(e)}, user_id)

async def handle_add_reaction(data, user_id, db):
    try:
        message_id = data.get("message_id")
        reaction = data.get("reaction")
        
        if not message_id or not reaction:
            await manager.send_personal_message({
                "type": "error",
                "error": "Missing message_id or reaction"
            }, user_id)
            return
        
        reaction_obj = await add_reaction(db, message_id, user_id, reaction)
        await db.commit()
        
        if reaction_obj:
            message = await get_message_by_id(db, message_id)
            if message:
                await manager.broadcast_to_chat({
                    "type": "new_reaction",
                    "message_id": message_id,
                    "chat_id": message.chat_id,
                    "user_id": user_id,
                    "reaction": reaction,
                    "created_at": reaction_obj.created_at.isoformat()
                }, message.chat_id, db)
            
            await manager.send_personal_message({
                "type": "reaction_added",
                "message_id": message_id,
                "reaction": reaction
            }, user_id)
    
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error adding reaction: {e}")
        await manager.send_personal_message({"type": "error", "error": str(e)}, user_id)

async def handle_remove_reaction(data, user_id, db):
    try:
        message_id = data.get("message_id")
        reaction = data.get("reaction")
        
        if not message_id or not reaction:
            await manager.send_personal_message({
                "type": "error",
                "error": "Missing message_id or reaction"
            }, user_id)
            return
        
        success = await remove_reaction(db, message_id, user_id, reaction)
        await db.commit()
        
        if success:
            message = await get_message_by_id(db, message_id)
            if message:
                await manager.broadcast_to_chat({
                    "type": "reaction_removed",
                    "message_id": message_id,
                    "chat_id": message.chat_id,
                    "user_id": user_id,
                    "reaction": reaction
                }, message.chat_id, db)
            
            await manager.send_personal_message({
                "type": "reaction_removed",
                "message_id": message_id,
                "reaction": reaction
            }, user_id)
    
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error removing reaction: {e}")
        await manager.send_personal_message({"type": "error", "error": str(e)}, user_id)

async def handle_status(data, user_id, db):
    try:
        is_online = data.get("is_online", True)

        # Обновляем статус
        await update_user_status(db, user_id, is_online)
        await db.commit()

        # Находим всех пользователей, которые состоят в тех же чатах (одним запросом)
        try:
            result = await db.execute(
                select(ChatParticipant.user_id)
                .filter(
                    ChatParticipant.chat_id.in_(
                        select(ChatParticipant.chat_id).filter(ChatParticipant.user_id == user_id)
                    ),
                    ChatParticipant.user_id != user_id
                )
                .distinct()
            )
            peer_user_ids = result.scalars().all()

            status_message = {
                "type": "user_status",
                "user_id": user_id,
                "is_online": is_online,
                "last_seen": datetime.utcnow().isoformat()
            }

            # Отправляем статус каждому уникальному пользователю один раз
            dead_connections = []
            for peer_id in peer_user_ids:
                if peer_id in manager.active_connections:
                    try:
                        await manager.active_connections[peer_id].send_json(status_message)
                    except Exception:
                        dead_connections.append(peer_id)

            # Удаляем мёртвые соединения
            for peer_id in dead_connections:
                manager.active_connections.pop(peer_id, None)
                manager.user_chats.pop(peer_id, None)
                manager.user_last_seen.pop(peer_id, None)

            logger.info(f"User {user_id} status: {'online' if is_online else 'offline'}")
        except Exception as e:
            logger.error(f"Error broadcasting status update: {e}")

    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating status: {e}")

async def handle_typing(data, user_id, db):
    try:
        await manager.broadcast_to_chat({
            "type": "typing",
            "chat_id": data["chat_id"],
            "user_id": user_id,
            "is_typing": data.get("is_typing", True)
        }, data["chat_id"], db)
    
    except Exception as e:
        logger.error(f"Error broadcasting typing: {e}")

async def handle_read_messages(data, user_id, db):
    try:
        chat_id = data.get("chat_id")
        last_read_message_id = data.get("last_read_message_id")
        
        if chat_id and last_read_message_id:
            result = await db.execute(
                select(ChatParticipant)
                .filter(
                    ChatParticipant.chat_id == chat_id,
                    ChatParticipant.user_id == user_id
                )
            )
            participant = result.scalar_one_or_none()
            
            if participant:
                participant.last_read_message_id = last_read_message_id
                participant.last_read_at = datetime.utcnow()
                await db.commit()
                
                await manager.broadcast_to_chat({
                    "type": "messages_read",
                    "chat_id": chat_id,
                    "user_id": user_id,
                    "last_read_message_id": last_read_message_id
                }, chat_id, db, exclude_user_id=user_id)
    
    except Exception as e:
        await db.rollback()
        logger.error(f"Error marking messages as read: {e}")

# ==================== REST API Endpoints ====================

# ---------- Аутентификация ----------
@app.post("/api/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    
    # Проверяем, существует ли пользователь
    result = await db.execute(select(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username or email already registered"
        )
    
    user = await create_user(db, user_data)
    await db.commit()
    logger.info(f"👤 User registered: {user.username} (ID: {user.id})")
    return user

@app.post("/api/login", response_model=Token)
async def login(form_data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Обновляем статус онлайн
    user.is_online = True
    user.last_seen = datetime.utcnow()
    await db.commit()
    
    access_token = create_access_token(data={"sub": user.username})
    logger.info(f"🔑 User logged in: {user.username}")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.from_orm(user)
    }

# ---------- Пользователи ----------
@app.get("/api/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/api/users", response_model=List[UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy import select
    
    query = select(User).filter(User.id != current_user.id)
    
    if search:
        query = query.filter(
            or_(
                User.username.ilike(f"%{search}%"),
                User.full_name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%")
            )
        )
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()
    return users

@app.put("/api/users/me")
async def update_user_profile(
    full_name: Optional[str] = Form(None),
    bio: Optional[str] = Form(None),
    avatar: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if full_name:
        current_user.full_name = full_name
    if bio:
        current_user.bio = bio
    
    if avatar:
        # Проверяем размер
        content = await avatar.read()
        if len(content) > settings.MAX_AVATAR_SIZE:
            raise HTTPException(status_code=400, detail="Avatar too large")
        
        # Загружаем новый аватар
        file_ext = os.path.splitext(avatar.filename)[1]
        file_name = f"avatar_{current_user.id}_{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(settings.AVATAR_UPLOAD_DIR, file_name)
        
        async with aiofiles.open(file_path, 'wb') as out_file:
            await out_file.write(content)
        
        # Удаляем старый аватар
        if current_user.avatar_url:
            old_avatar_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(current_user.avatar_url))
            if os.path.exists(old_avatar_path):
                os.remove(old_avatar_path)
        
        current_user.avatar_url = f"/uploads/avatars/{file_name}"
    
    await db.commit()
    return {"success": True, "user": UserResponse.from_orm(current_user)}

# ---------- Чаты ----------
@app.post("/api/chats", response_model=ChatResponse)
async def create_new_chat(
    chat_data: ChatCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        logger.info(f"💬 Creating chat for user {current_user.id}: {chat_data.dict()}")
        chat = await create_chat(db, chat_data, current_user.id)
        await db.commit()
        logger.info(f"✅ Chat created successfully: {chat.id}")
        
        # Загружаем связанные данные
        await db.refresh(chat, ["participants", "pinned_messages"])
        for p in chat.participants:
            await db.refresh(p, ["user"])

        return ChatResponse.from_orm(chat)
    except Exception as e:
        logger.error(f"❌ Error creating chat: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create chat: {str(e)}")

@app.get("/api/chats", response_model=List[ChatResponse])
async def get_my_chats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        chats = await get_user_chats(db, current_user.id)
        logger.info(f"📋 User {current_user.id} has {len(chats)} chats")
        
        # Загружаем дополнительную информацию для каждого чата
        result = []
        for chat in chats:
            # Получаем последнее сообщение
            last_msg_result = await db.execute(
                select(Message)
                .filter(Message.chat_id == chat.id, Message.is_deleted == False)
                .order_by(Message.sent_at.desc())
                .limit(1)
                .options(selectinload(Message.sender))
            )
            last_message = last_msg_result.scalar_one_or_none()
            
            # Получаем количество непрочитанных
            participant_result = await db.execute(
                select(ChatParticipant)
                .filter(
                    ChatParticipant.chat_id == chat.id,
                    ChatParticipant.user_id == current_user.id
                )
            )
            participant = participant_result.scalar_one_or_none()
            
            unread_count = 0
            if participant and participant.last_read_message_id:
                unread_result = await db.execute(
                    select(Message)
                    .filter(
                        Message.chat_id == chat.id,
                        Message.id > participant.last_read_message_id,
                        Message.sender_id != current_user.id,
                        Message.is_deleted == False
                    )
                )
                unread_count = len(unread_result.scalars().all())
            
            chat_response = ChatResponse.from_orm(chat)
            if last_message:
                chat_response.last_message = {
                    "id": last_message.id,
                    "content": last_message.content[:50] if last_message.content else "[Медиа]",
                    "sent_at": last_message.sent_at.isoformat() if last_message.sent_at else None,
                    "sender_id": last_message.sender_id
                }
            chat_response.unread_count = unread_count
            result.append(chat_response)
        
        return result
    except Exception as e:
        logger.error(f"Error in get_my_chats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get chats: {str(e)}")

@app.get("/api/chats/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    chat = await get_chat_by_id(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    return ChatResponse.from_orm(chat)

@app.put("/api/chats/{chat_id}")
async def update_chat(
    chat_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    avatar: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем права (только создатель или админ)
    result = await db.execute(
        select(ChatParticipant)
        .filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == current_user.id,
            or_(
                ChatParticipant.role == "admin",
                ChatParticipant.role == "creator"
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    chat = await get_chat_by_id(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if name:
        chat.name = name
    if description:
        chat.description = description
    
    if avatar:
        # Проверяем размер
        content = await avatar.read()
        if len(content) > settings.MAX_AVATAR_SIZE:
            raise HTTPException(status_code=400, detail="Avatar too large")
        
        file_ext = os.path.splitext(avatar.filename)[1]
        file_name = f"chat_{chat_id}_{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(settings.CHAT_AVATAR_UPLOAD_DIR, file_name)
        
        async with aiofiles.open(file_path, 'wb') as out_file:
            await out_file.write(content)
        
        if chat.avatar_url:
            old_avatar_path = os.path.join(settings.UPLOAD_DIR, os.path.basename(chat.avatar_url))
            if os.path.exists(old_avatar_path):
                os.remove(old_avatar_path)
        
        chat.avatar_url = f"/uploads/chat_avatars/{file_name}"
    
    await db.commit()
    
    # Уведомляем участников об изменении чата
    await manager.broadcast_to_chat({
        "type": "chat_updated",
        "chat_id": chat_id,
        "name": chat.name,
        "description": chat.description,
        "avatar_url": chat.avatar_url
    }, chat_id, db)
    
    return {"success": True}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Только создатель может удалить чат
    chat = await get_chat_by_id(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if chat.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only creator can delete the chat")
    
    # Уведомляем участников перед удалением
    await manager.broadcast_to_chat({
        "type": "chat_deleted",
        "chat_id": chat_id
    }, chat_id, db)
    
    await db.delete(chat)
    await db.commit()
    
    return {"success": True}

# ---------- Участники чата ----------
@app.post("/api/chats/{chat_id}/participants")
async def add_participant(
    chat_id: int,
    user_id: int = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем права
    result = await db.execute(
        select(ChatParticipant)
        .filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == current_user.id,
            or_(
                ChatParticipant.role == "admin",
                ChatParticipant.role == "creator"
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Добавляем участника
    participant = await add_participant_to_chat(db, chat_id, user_id)
    await db.commit()
    
    if participant:
        # Уведомляем всех
        await manager.broadcast_to_chat({
            "type": "participant_added",
            "chat_id": chat_id,
            "user_id": user_id
        }, chat_id, db)
        
        return {"success": True}
    
    raise HTTPException(status_code=400, detail="Failed to add participant")

@app.delete("/api/chats/{chat_id}/participants/{user_id}")
async def remove_participant(
    chat_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем права
    result = await db.execute(
        select(ChatParticipant)
        .filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == current_user.id,
            or_(
                ChatParticipant.role == "admin",
                ChatParticipant.role == "creator"
            )
        )
    )
    if not result.scalar_one_or_none() and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Удаляем участника
    success = await remove_participant_from_chat(db, chat_id, user_id)
    await db.commit()
    
    if success:
        # Уведомляем всех
        await manager.broadcast_to_chat({
            "type": "participant_removed",
            "chat_id": chat_id,
            "user_id": user_id
        }, chat_id, db)
        
        return {"success": True}
    
    raise HTTPException(status_code=400, detail="Failed to remove participant")

@app.get("/api/chats/{chat_id}/participants")
async def get_chat_participants(
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant)
        .filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    # Получаем всех участников
    result = await db.execute(
        select(ChatParticipant)
        .filter(ChatParticipant.chat_id == chat_id)
        .options(selectinload(ChatParticipant.user))
    )
    participants = result.scalars().all()
    
    return [
        {
            "user_id": p.user_id,
            "username": p.user.username,
            "full_name": p.user.full_name,
            "role": p.role,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None,
            "is_online": p.user.is_online
        }
        for p in participants
    ]

# ---------- Сообщения ----------
@app.get("/api/chats/{chat_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    chat_id: int,
    before_id: Optional[int] = None,
    after_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    # Строим запрос
    query = select(Message).filter(
        Message.chat_id == chat_id,
        Message.is_deleted == False
    )
    
    # Проверяем удаленные для этого пользователя
    deleted_subquery = select(MessageDelete.message_id).filter(
        MessageDelete.user_id == current_user.id
    ).subquery()
    query = query.filter(~Message.id.in_(deleted_subquery))
    
    if before_id:
        subq = select(Message.sent_at).filter(Message.id == before_id).subquery()
        query = query.filter(Message.sent_at < subq)
    elif after_id:
        subq = select(Message.sent_at).filter(Message.id == after_id).subquery()
        query = query.filter(Message.sent_at > subq)
    
    query = query.order_by(Message.sent_at.desc()).limit(limit)
    query = query.options(
        selectinload(Message.sender),
        selectinload(Message.reply_to).selectinload(Message.sender),
        selectinload(Message.forwarded_from).selectinload(Message.sender),
        selectinload(Message.reactions).selectinload(MessageReaction.user)
    )
    
    result = await db.execute(query)
    messages = result.scalars().all()
    
    # Возвращаем в хронологическом порядке
    messages.reverse()
    
    logger.info(f"📨 Retrieved {len(messages)} messages for chat {chat_id}")
    
    return messages

@app.post("/api/messages", response_model=MessageResponse)
async def create_message_endpoint(
    message_data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        logger.info(f"💬 Creating message in chat {message_data.chat_id} by user {current_user.id}")
        
        # Проверяем, является ли пользователь участником чата
        result = await db.execute(
            select(ChatParticipant).filter(
                ChatParticipant.chat_id == message_data.chat_id,
                ChatParticipant.user_id == current_user.id
            )
        )
        participant = result.scalar_one_or_none()
        
        if not participant:
            raise HTTPException(status_code=403, detail="Not a participant of this chat")
        
        # Создаем сообщение
        message = await create_message(db, message_data, current_user.id)
        await db.commit()
        
        # Отправляем через WebSocket всем участникам чата
        message_response = MessageResponse.from_orm(message)
        
        await manager.broadcast_to_chat({
            "type": "new_message",
            "message": message_response.dict(),
            "chat_id": message.chat_id
        }, message.chat_id, db, exclude_user_id=current_user.id)
        
        logger.info(f"✅ Message {message.id} sent successfully")
        
        return message_response
        
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error creating message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/messages/{message_id}", response_model=MessageResponse)
async def get_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await get_message_by_id(db, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == message.chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    return message

@app.put("/api/messages/{message_id}")
async def edit_message(
    message_id: int,
    content: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await update_message(db, message_id, current_user.id, MessageUpdate(content=content))
    await db.commit()
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found or you don't have permission")
    
    # Уведомляем всех участников чата
    await manager.broadcast_to_chat({
        "type": "message_edited",
        "message_id": message_id,
        "chat_id": message.chat_id,
        "new_content": content,
        "edited_at": message.edited_at.isoformat() if message.edited_at else None
    }, message.chat_id, db)
    
    return {"success": True}

@app.delete("/api/messages/{message_id}")
async def delete_message(
    message_id: int,
    delete_for: str = Query("me", regex="^(me|everyone)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await get_message_by_id(db, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if delete_for == "everyone":
        if message.sender_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only delete your own messages for everyone")
        
        result = await delete_message_for_everyone(db, message_id, current_user.id)
        await db.commit()
        
        if result:
            await manager.broadcast_to_chat({
                "type": "message_deleted",
                "message_id": message_id,
                "chat_id": message.chat_id,
                "delete_for": "everyone"
            }, message.chat_id, db)
    else:
        result = await delete_message_for_me(db, message_id, current_user.id)
        await db.commit()
    
    if result:
        return {"success": True}
    
    raise HTTPException(status_code=400, detail="Failed to delete message")

@app.post("/api/messages/{message_id}/reply")
async def reply_to_message_endpoint(
    message_id: int,
    content: str = Form(...),
    message_type: str = Form("text"),
    file_url: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    original_message = await get_message_by_id(db, message_id)
    
    if not original_message:
        raise HTTPException(status_code=404, detail="Original message not found")
    
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == original_message.chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    message_data = MessageCreate(
        chat_id=original_message.chat_id,
        content=content,
        message_type=message_type,
        file_url=file_url,
        reply_to_id=message_id
    )
    
    reply = await reply_to_message(db, message_data, current_user.id, message_id)
    await db.commit()
    
    if reply:
        # Уведомляем всех участников
        await manager.broadcast_to_chat({
            "type": "new_message",
            "message": MessageResponse.from_orm(reply).dict(),
            "chat_id": reply.chat_id
        }, reply.chat_id, db, exclude_user_id=current_user.id)
        
        return MessageResponse.from_orm(reply)
    
    raise HTTPException(status_code=400, detail="Failed to reply")

@app.post("/api/messages/forward")
async def forward_messages_endpoint(
    forward_data: MessageForward,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем, является ли пользователь участником целевого чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == forward_data.target_chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of target chat")
    
    forwarded = await forward_messages(db, forward_data, current_user.id)
    await db.commit()
    
    if forwarded:
        # Уведомляем участников целевого чата
        for message in forwarded:
            await manager.broadcast_to_chat({
                "type": "new_message",
                "message": MessageResponse.from_orm(message).dict(),
                "chat_id": message.chat_id
            }, message.chat_id, db, exclude_user_id=current_user.id)
        
        return [MessageResponse.from_orm(m) for m in forwarded]
    
    raise HTTPException(status_code=400, detail="Failed to forward messages")

@app.post("/api/messages/{message_id}/pin")
async def pin_message_endpoint(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await get_message_by_id(db, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    pinned = await pin_message(db, message_id, message.chat_id, current_user.id)
    await db.commit()
    
    if pinned:
        await manager.broadcast_to_chat({
            "type": "message_pinned",
            "message_id": message_id,
            "chat_id": message.chat_id,
            "user_id": current_user.id
        }, message.chat_id, db)
        
        return {"success": True}
    
    raise HTTPException(status_code=403, detail="Not enough permissions")

@app.delete("/api/messages/{message_id}/pin")
async def unpin_message_endpoint(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await get_message_by_id(db, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    unpinned = await unpin_message(db, message_id, message.chat_id, current_user.id)
    await db.commit()
    
    if unpinned:
        await manager.broadcast_to_chat({
            "type": "message_unpinned",
            "message_id": message_id,
            "chat_id": message.chat_id,
            "user_id": current_user.id
        }, message.chat_id, db)
        
        return {"success": True}
    
    raise HTTPException(status_code=403, detail="Not enough permissions")

# ---------- Реакции ----------
@app.post("/api/messages/{message_id}/reactions")
async def add_message_reaction(
    message_id: int,
    reaction: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await get_message_by_id(db, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == message.chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    reaction_obj = await add_reaction(db, message_id, current_user.id, reaction)
    await db.commit()
    
    if reaction_obj:
        await manager.broadcast_to_chat({
            "type": "new_reaction",
            "message_id": message_id,
            "chat_id": message.chat_id,
            "user_id": current_user.id,
            "reaction": reaction
        }, message.chat_id, db)
        
        return {"success": True}
    
    raise HTTPException(status_code=400, detail="Failed to add reaction")

@app.delete("/api/messages/{message_id}/reactions")
async def remove_message_reaction(
    message_id: int,
    reaction: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    success = await remove_reaction(db, message_id, current_user.id, reaction)
    await db.commit()
    
    if success:
        message = await get_message_by_id(db, message_id)
        if message:
            await manager.broadcast_to_chat({
                "type": "reaction_removed",
                "message_id": message_id,
                "chat_id": message.chat_id,
                "user_id": current_user.id,
                "reaction": reaction
            }, message.chat_id, db)
        
        return {"success": True}
    
    raise HTTPException(status_code=400, detail="Failed to remove reaction")

@app.get("/api/messages/{message_id}/reactions")
async def get_message_reactions_endpoint(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await get_message_by_id(db, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == message.chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    reactions = await get_message_reactions(db, message_id)
    
    # Группируем по типу реакции
    result = {}
    for reaction in reactions:
        if reaction.reaction not in result:
            result[reaction.reaction] = []
        result[reaction.reaction].append({
            "user_id": reaction.user_id,
            "username": reaction.user.username if reaction.user else None,
            "full_name": reaction.user.full_name if reaction.user else None
        })
    
    return result

# ---------- Сохраненные сообщения ----------
@app.post("/api/messages/{message_id}/save")
async def save_message(
    message_id: int,
    note: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = await get_message_by_id(db, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Проверяем, есть ли уже в сохраненных
    result = await db.execute(
        select(SavedMessage)
        .filter(
            SavedMessage.user_id == current_user.id,
            SavedMessage.message_id == message_id
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=400, detail="Message already saved")
    
    saved = SavedMessage(
        user_id=current_user.id,
        message_id=message_id,
        note=note
    )
    db.add(saved)
    await db.commit()
    
    return {"success": True}

@app.delete("/api/messages/{message_id}/save")
async def unsave_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.execute(
        delete(SavedMessage)
        .filter(
            SavedMessage.user_id == current_user.id,
            SavedMessage.message_id == message_id
        )
    )
    await db.commit()
    
    return {"success": True}

@app.get("/api/saved-messages")
async def get_saved_messages(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(SavedMessage)
        .filter(SavedMessage.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .order_by(SavedMessage.saved_at.desc())
        .options(selectinload(SavedMessage.message).selectinload(Message.sender))
    )
    saved = result.scalars().all()
    
    return [
        {
            "id": s.id,
            "message": MessageResponse.from_orm(s.message).dict(),
            "note": s.note,
            "saved_at": s.saved_at.isoformat() if s.saved_at else None
        }
        for s in saved
    ]

# ---------- Поиск ----------
@app.post("/api/search/messages")
async def search_messages_endpoint(
    search_params: SearchMessages,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    messages = await search_messages(
        db=db,
        user_id=current_user.id,
        query=search_params.query,
        chat_id=search_params.chat_id,
        from_user_id=search_params.from_user_id,
        start_date=search_params.start_date,
        end_date=search_params.end_date,
        message_type=search_params.message_type,
        limit=search_params.limit,
        offset=search_params.offset
    )
    
    return [MessageResponse.from_orm(m) for m in messages]

# ---------- Звонки ----------
@app.post("/api/calls/start")
async def start_call(
    chat_id: int = Form(...),
    call_type: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверяем, является ли пользователь участником чата
    result = await db.execute(
        select(ChatParticipant).filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a participant of this chat")
    
    call_id = call_manager.create_call(chat_id, current_user.id, call_type)
    
    # Сохраняем в БД
    db_call = Call(
        call_id=call_id,
        chat_id=chat_id,
        initiator_id=current_user.id,
        call_type=call_type,
        status="ringing"
    )
    db.add(db_call)
    await db.commit()
    
    # Уведомляем всех участников чата
    await manager.broadcast_to_chat({
        "type": "incoming_call",
        "call_id": call_id,
        "chat_id": chat_id,
        "initiator_id": current_user.id,
        "initiator_name": current_user.full_name or current_user.username,
        "call_type": call_type
    }, chat_id, db, exclude_user_id=current_user.id)
    
    return {"call_id": call_id, "status": "ringing"}

@app.post("/api/calls/{call_id}/accept")
async def accept_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    call = call_manager.get_call(call_id)
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    call_manager.add_participant(call_id, current_user.id)
    call_manager.update_call_status(call_id, "ongoing")
    
    # Обновляем в БД
    await db.execute(
        update(Call)
        .where(Call.call_id == call_id)
        .values(status="ongoing")
    )
    await db.commit()
    
    # Уведомляем инициатора
    await manager.send_personal_message({
        "type": "call_accepted",
        "call_id": call_id,
        "user_id": current_user.id
    }, call["initiator_id"])
    
    return {"success": True}

@app.post("/api/calls/{call_id}/reject")
async def reject_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    call = call_manager.get_call(call_id)
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    call_manager.update_call_status(call_id, "rejected")
    
    # Обновляем в БД
    await db.execute(
        update(Call)
        .where(Call.call_id == call_id)
        .values(status="rejected", end_time=datetime.utcnow())
    )
    await db.commit()
    
    # Уведомляем инициатора
    await manager.send_personal_message({
        "type": "call_rejected",
        "call_id": call_id,
        "user_id": current_user.id
    }, call["initiator_id"])
    
    return {"success": True}

@app.post("/api/calls/{call_id}/end")
async def end_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    call = call_manager.get_call(call_id)
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    call_manager.update_call_status(call_id, "ended")
    
    # Рассчитываем длительность
    duration = None
    if call.get("start_time"):
        duration = int((datetime.utcnow() - call["start_time"]).total_seconds())
    
    # Обновляем в БД
    await db.execute(
        update(Call)
        .where(Call.call_id == call_id)
        .values(status="ended", end_time=datetime.utcnow(), duration=duration)
    )
    await db.commit()
    
    # Уведомляем всех участников
    for participant_id in call["participants"]:
        if participant_id != current_user.id:
            await manager.send_personal_message({
                "type": "call_ended",
                "call_id": call_id,
                "ended_by": current_user.id
            }, participant_id)
    
    return {"success": True}

# ---------- Загрузка файлов ----------
@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    # Проверяем расширение
    file_ext = os.path.splitext(file.filename)[1].lower()
    if not settings.is_extension_allowed(file_ext):
        raise HTTPException(status_code=400, detail="File type not allowed")
    
    # Проверяем размер
    content = await file.read()
    max_size = settings.get_file_size_limit(file_ext)
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail=f"File too large. Max size: {max_size // (1024*1024)}MB")
    
    # Определяем тип файла
    file_type = settings.get_file_type(file_ext)
    
    # Выбираем директорию
    if file_type == "image":
        upload_dir = settings.UPLOAD_DIR
    elif file_type in ["video", "audio"]:
        upload_dir = settings.FILE_UPLOAD_DIR
    else:
        upload_dir = settings.FILE_UPLOAD_DIR
    
    # Генерируем уникальное имя файла
    file_name = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(upload_dir, file_name)
    
    # Сохраняем файл
    async with aiofiles.open(file_path, 'wb') as out_file:
        await out_file.write(content)
    
    logger.info(f"📁 File uploaded by user {current_user.id}: {file_name}")
    
    return {
        "file_url": f"/uploads/{os.path.basename(upload_dir)}/{file_name}",
        "file_name": file.filename,
        "file_type": file_type,
        "file_size": len(content),
        "mime_type": file.content_type or "application/octet-stream"
    }

@app.get("/api/download/{file_name}")
async def download_file(
    file_name: str,
    current_user: User = Depends(get_current_user)
):
    # Ищем файл во всех директориях
    for directory in [settings.UPLOAD_DIR, settings.FILE_UPLOAD_DIR, settings.AVATAR_UPLOAD_DIR, settings.CHAT_AVATAR_UPLOAD_DIR]:
        file_path = os.path.join(directory, file_name)
        if os.path.exists(file_path):
            return FileResponse(
                file_path,
                media_type='application/octet-stream',
                filename=file_name
            )
    
    raise HTTPException(status_code=404, detail="File not found")

# ---------- Уведомления ----------
@app.get("/api/notifications")
async def get_notifications(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Notification).filter(Notification.user_id == current_user.id)
    
    if unread_only:
        query = query.filter(Notification.is_read == False)
    
    query = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit)
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return notifications

@app.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    await db.commit()
    
    return {"success": True}

@app.post("/api/notifications/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
        .values(is_read=True)
    )
    await db.commit()
    
    return {"success": True}

# ---------- Статистика ----------
@app.get("/api/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Общая статистика для пользователя
        chats = await get_user_chats(db, current_user.id)
        chats_count = len(chats)
        
        # Непрочитанные сообщения
        unread_count = 0
        
        for chat in chats:
            result = await db.execute(
                select(ChatParticipant)
                .filter(
                    ChatParticipant.chat_id == chat.id,
                    ChatParticipant.user_id == current_user.id
                )
            )
            participant = result.scalar_one_or_none()
            
            if participant and participant.last_read_message_id:
                unread_result = await db.execute(
                    select(Message)
                    .filter(
                        Message.chat_id == chat.id,
                        Message.id > participant.last_read_message_id,
                        Message.sender_id != current_user.id,
                        Message.is_deleted == False
                    )
                )
                unread_count += len(unread_result.scalars().all())
        
        return {
            "chats_count": chats_count,
            "unread_messages": unread_count,
            "is_online": current_user.is_online,
            "last_seen": current_user.last_seen.isoformat() if current_user.last_seen else None
        }
    except Exception as e:
        logger.error(f"Error in get_stats: {e}")
        return {
            "chats_count": 0,
            "unread_messages": 0,
            "is_online": current_user.is_online,
            "last_seen": current_user.last_seen.isoformat() if current_user.last_seen else None,
            "error": str(e)
        }

# ==================== ОТЛАДОЧНЫЕ ЭНДПОИНТЫ ====================

@app.post("/api/debug/create-chat")
async def debug_create_chat(
    name: str = "Test Chat",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Тестовый эндпоинт для создания чата"""
    try:
        logger.info(f"🔧 Debug: Creating chat for user {current_user.id}")
        
        # Создаем простой чат с текущим пользователем как единственным участником
        chat_data = ChatCreate(
            name=name,
            chat_type="private",
            description="Test chat",
            participant_ids=[current_user.id],
            topic_names=[]
        )
        
        chat = await create_chat(db, chat_data, current_user.id)
        await db.commit()
        
        return {
            "success": True,
            "chat_id": chat.id,
            "name": chat.name,
            "creator_id": current_user.id,
            "message": "Chat created successfully"
        }
    except Exception as e:
        await db.rollback()
        logger.error(f"🔧 Debug: Error creating chat: {e}")
        return {
            "success": False,
            "error": str(e),
            "user_id": current_user.id if current_user else None
        }

@app.get("/api/debug/chats")
async def debug_get_chats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить все чаты пользователя"""
    try:
        chats = await get_user_chats(db, current_user.id)
        return {
            "success": True,
            "user_id": current_user.id,
            "chats_count": len(chats),
            "chats": [
                {
                    "id": chat.id,
                    "name": chat.name,
                    "type": chat.chat_type,
                    "created_by": chat.created_by,
                    "created_at": chat.created_at.isoformat() if chat.created_at else None
                }
                for chat in chats
            ]
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/debug/messages/{chat_id}")
async def debug_get_messages(chat_id: int, db: AsyncSession = Depends(get_db)):
    """Отладочный endpoint для проверки сообщений"""
    try:
        result = await db.execute(
            select(Message)
            .filter(Message.chat_id == chat_id)
            .order_by(Message.sent_at)
        )
        messages = result.scalars().all()
        
        return {
            "success": True,
            "chat_id": chat_id,
            "count": len(messages),
            "messages": [
                {
                    "id": m.id,
                    "chat_id": m.chat_id,
                    "sender_id": m.sender_id,
                    "content": m.content,
                    "message_type": m.message_type,
                    "sent_at": m.sent_at.isoformat() if m.sent_at else None,
                    "is_read": m.is_read,
                    "is_deleted": m.is_deleted,
                    "is_edited": m.is_edited,
                    "reply_to_id": m.reply_to_id,
                    "forwarded_from_id": m.forwarded_from_id
                }
                for m in messages
            ]
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/debug/db-stats")
async def debug_db_stats(db: AsyncSession = Depends(get_db)):
    """Статистика базы данных"""
    try:
        from sqlalchemy import text
        
        tables = ["users", "chats", "chat_participants", "messages", "message_deletes", "message_reactions", "saved_messages", "calls"]
        stats = {}
        
        for table in tables:
            try:
                result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = result.scalar()
                stats[table] = count
            except:
                stats[table] = "Table does not exist"
        
        return {
            "success": True,
            "database": "SQLite",
            "stats": stats
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/debug/users")
async def debug_get_all_users(db: AsyncSession = Depends(get_db)):
    """Получить всех пользователей"""
    from sqlalchemy import select
    
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    return {
        "count": len(users),
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "full_name": u.full_name,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]
    }

@app.get("/api/health")
async def health_check():
    """Проверка здоровья сервера"""
    return {
        "status": "healthy",
        "service": "Company Messenger",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "SQLite",
        "websocket": "active",
        "websocket_connections": len(manager.active_connections)
    }

# ==================== Инициализация ====================

@app.on_event("startup")
async def startup_event():
    await init_db()
    logger.info("✅ Database initialized")
    
    # Создаем директории для загрузок
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.AVATAR_UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.FILE_UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.CHAT_AVATAR_UPLOAD_DIR, exist_ok=True)

@app.get("/")
async def root():
    return {
        "message": "Company Messenger API",
        "version": settings.PROJECT_VERSION,
        "docs": "/docs",
        "health": "/api/health",
        "websocket": "ws://localhost:8000/ws/{user_id}",
        "features": [
            "Real-time messaging",
            "Message editing",
            "Message deletion (for me/everyone)",
            "Message replies",
            "Message forwarding",
            "Message reactions",
            "Saved messages",
            "Pinned messages",
            "Voice/video calls",
            "File sharing",
            "Search",
            "Notifications"
        ],
        "debug": {
            "create_chat": "/api/debug/create-chat (POST)",
            "get_chats": "/api/debug/chats (GET)",
            "get_messages": "/api/debug/messages/{chat_id} (GET)",
            "db_stats": "/api/debug/db-stats (GET)",
            "users": "/api/debug/users (GET)"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="warning"  # Меняем на warning для уменьшения шума
    )