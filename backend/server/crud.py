from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, delete, update
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import logging

from models import User, Chat, Message, ChatParticipant, MessageDelete, MessageReaction
from schemas import UserCreate, ChatCreate, MessageCreate, MessageUpdate, MessageForward

logger = logging.getLogger(__name__)

# ==================== Пользователи ====================

async def create_user(db: AsyncSession, user: UserCreate):
    from auth import get_password_hash
    
    try:
        db_user = User(
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            hashed_password=get_password_hash(user.password)
        )
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        logger.info(f"User created: {db_user.id} - {db_user.username}")
        return db_user
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating user: {e}")
        raise

async def get_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(select(User).filter(User.username == username))
    return result.scalar_one_or_none()

async def get_user_by_id(db: AsyncSession, user_id: int):
    result = await db.execute(select(User).filter(User.id == user_id))
    return result.scalar_one_or_none()

async def update_user_status(db: AsyncSession, user_id: int, is_online: bool):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.is_online = is_online
        user.last_seen = datetime.utcnow()
        await db.commit()
        return user
    return None

# ==================== Чаты ====================

async def get_user_chats(db: AsyncSession, user_id: int):
    try:
        # Получаем чаты с предзагрузкой участников
        result = await db.execute(
            select(Chat)
            .join(ChatParticipant)
            .filter(ChatParticipant.user_id == user_id)
            .order_by(Chat.created_at.desc())
            .options(
                selectinload(Chat.participants).selectinload(ChatParticipant.user)
            )
        )
        chats = result.scalars().all()
        
        # Для каждого чата получаем дополнительную информацию отдельными запросами
        for chat in chats:
            # Получаем последнее сообщение
            last_msg_result = await db.execute(
                select(Message)
                .filter(
                    Message.chat_id == chat.id,
                    Message.is_deleted == False
                )
                .order_by(Message.sent_at.desc())
                .limit(1)
                .options(selectinload(Message.sender))
            )
            # Сохраняем как атрибут объекта (не часть модели SQLAlchemy)
            chat._last_message = last_msg_result.scalar_one_or_none()
            
            # Получаем информацию о непрочитанных сообщениях
            participant_info = await db.execute(
                select(ChatParticipant)
                .filter(
                    ChatParticipant.chat_id == chat.id,
                    ChatParticipant.user_id == user_id
                )
            )
            participant = participant_info.scalar_one_or_none()
            
            if participant and participant.last_read_message_id:
                unread_result = await db.execute(
                    select(Message)
                    .filter(
                        Message.chat_id == chat.id,
                        Message.id > participant.last_read_message_id,
                        Message.sender_id != user_id,
                        Message.is_deleted == False
                    )
                )
                chat._unread_count = len(unread_result.scalars().all())
            else:
                all_msgs_result = await db.execute(
                    select(Message)
                    .filter(
                        Message.chat_id == chat.id,
                        Message.sender_id != user_id,
                        Message.is_deleted == False
                    )
                )
                chat._unread_count = len(all_msgs_result.scalars().all())
        
        logger.info(f"Found {len(chats)} chats for user {user_id}")
        return chats
    except Exception as e:
        logger.error(f"Error getting user chats: {e}", exc_info=True)
        return []

async def get_chat_by_id(db: AsyncSession, chat_id: int):
    result = await db.execute(
        select(Chat)
        .filter(Chat.id == chat_id)
        .options(
            selectinload(Chat.participants).selectinload(ChatParticipant.user)
        )
    )
    return result.scalar_one_or_none()

async def create_chat(db: AsyncSession, chat_data: ChatCreate, creator_id: int):
    try:
        logger.info(f"Starting chat creation for creator {creator_id}")
        
        # Если это приватный чат и имя не указано, генерируем его
        chat_name = chat_data.name
        if chat_data.chat_type == "private" and not chat_name:
            # Для приватных чатов получаем имена участников
            participant_ids = [creator_id] + [uid for uid in chat_data.participant_ids if uid != creator_id]
            
            # Получаем имена пользователей
            users = []
            for user_id in participant_ids:
                user_result = await db.execute(select(User).filter(User.id == user_id))
                user = user_result.scalar_one_or_none()
                if user:
                    users.append(user.full_name or user.username)
            
            # Генерируем имя чата как имена участников через запятую
            if users:
                chat_name = ", ".join(users[:3])  # Берем максимум 3 имени
                if len(users) > 3:
                    chat_name += f" и ещё {len(users) - 3}"
            else:
                chat_name = "Личный чат"
        
        # Создаем чат
        db_chat = Chat(
            name=chat_name,
            chat_type=chat_data.chat_type,
            description=chat_data.description,
            created_by=creator_id
        )
        db.add(db_chat)
        await db.flush()
        
        logger.info(f"Chat object created with id: {db_chat.id}, name: {db_chat.name}")
        
        # Добавляем создателя как участника
        db_participant_creator = ChatParticipant(
            chat_id=db_chat.id,
            user_id=creator_id,
            role="admin"
        )
        db.add(db_participant_creator)
        logger.info(f"Added creator {creator_id} to chat {db_chat.id}")
        
        # Добавляем других участников
        added_participants = [creator_id]
        
        for user_id in chat_data.participant_ids:
            if user_id != creator_id and user_id not in added_participants:
                # Проверяем существует ли пользователь
                user_exists = await db.execute(
                    select(User).filter(User.id == user_id)
                )
                if user_exists.scalar_one_or_none():
                    db_participant = ChatParticipant(
                        chat_id=db_chat.id,
                        user_id=user_id,
                        role="member"
                    )
                    db.add(db_participant)
                    added_participants.append(user_id)
                    logger.info(f"Added participant {user_id} to chat {db_chat.id}")
                else:
                    logger.warning(f"User {user_id} does not exist, skipping")
        
        await db.commit()
        await db.refresh(db_chat)
        
        logger.info(f"Chat {db_chat.id} successfully created with {len(added_participants)} participants")
        
        return db_chat
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating chat: {e}", exc_info=True)
        raise

async def add_participant_to_chat(db: AsyncSession, chat_id: int, user_id: int, role: str = "member"):
    try:
        participant = ChatParticipant(
            chat_id=chat_id,
            user_id=user_id,
            role=role
        )
        db.add(participant)
        await db.commit()
        return participant
    except Exception as e:
        await db.rollback()
        logger.error(f"Error adding participant to chat: {e}")
        return None

async def remove_participant_from_chat(db: AsyncSession, chat_id: int, user_id: int):
    try:
        await db.execute(
            delete(ChatParticipant)
            .filter(
                ChatParticipant.chat_id == chat_id,
                ChatParticipant.user_id == user_id
            )
        )
        await db.commit()
        return True
    except Exception as e:
        await db.rollback()
        logger.error(f"Error removing participant from chat: {e}")
        return False

# ==================== Сообщения ====================

async def create_message(db: AsyncSession, message_data: MessageCreate, sender_id: int):
    try:
        print(f"DEBUG: Creating message: chat={message_data.chat_id}, sender={sender_id}, content={message_data.content}")
        
        db_message = Message(
            chat_id=message_data.chat_id,
            content=message_data.content,
            message_type=message_data.message_type,
            file_url=message_data.file_url,
            file_name=message_data.file_name,
            file_size=message_data.file_size,
            sender_id=sender_id,
            sent_at=datetime.utcnow(),
            reply_to_id=message_data.reply_to_id,
            message_metadata={}  # ИСПРАВЛЕНО: metadata -> message_metadata
        )
        
        # Если это ответ на сообщение, добавляем метаданные
        if message_data.reply_to_id:
            reply_to_msg = await get_message_by_id(db, message_data.reply_to_id)
            if reply_to_msg:
                sender = await get_user_by_id(db, reply_to_msg.sender_id)
                db_message.message_metadata = {  # ИСПРАВЛЕНО: metadata -> message_metadata
                    "reply_to_sender_id": reply_to_msg.sender_id,
                    "reply_to_sender_name": sender.full_name or sender.username if sender else "Пользователь",
                    "reply_to_content": reply_to_msg.content[:100] if reply_to_msg.content else "[Медиа]",
                    "reply_to_message_type": reply_to_msg.message_type
                }
        
        db.add(db_message)
        await db.commit()
        await db.refresh(db_message)
        
        # Загружаем связанные данные
        result = await db.execute(
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reply_to).selectinload(Message.sender)
            )
            .filter(Message.id == db_message.id)
        )
        message = result.scalar_one()
        
        print(f"DEBUG: Message created: id={message.id}, sent_at={message.sent_at}")
        logger.info(f"Message created in chat {message_data.chat_id} by user {sender_id}")
        
        return message
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating message: {e}")
        print(f"DEBUG: Error in create_message: {e}")
        raise

async def get_message_by_id(db: AsyncSession, message_id: int):
    result = await db.execute(
        select(Message)
        .filter(Message.id == message_id)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.forwarded_from).selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user)
        )
    )
    return result.scalar_one_or_none()

async def get_chat_messages(db: AsyncSession, chat_id: int, skip: int = 0, limit: int = 100):
    try:
        result = await db.execute(
            select(Message)
            .filter(
                Message.chat_id == chat_id,
                Message.is_deleted == False
            )
            .order_by(Message.sent_at.desc())
            .offset(skip)
            .limit(limit)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reply_to).selectinload(Message.sender),
                selectinload(Message.forwarded_from).selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(MessageReaction.user)
            )
        )
        messages = result.scalars().all()
        # Возвращаем в хронологическом порядке
        messages.reverse()
        logger.info(f"Retrieved {len(messages)} messages for chat {chat_id}")
        return messages
    except Exception as e:
        logger.error(f"Error getting chat messages: {e}")
        return []

async def update_message(db: AsyncSession, message_id: int, user_id: int, update_data: MessageUpdate):
    """Обновление сообщения (редактирование)"""
    try:
        result = await db.execute(
            select(Message)
            .filter(
                Message.id == message_id,
                Message.sender_id == user_id,
                Message.is_deleted == False
            )
        )
        message = result.scalar_one_or_none()
        
        if message and update_data.content:
            message.content = update_data.content
            message.is_edited = True
            message.edited_at = datetime.utcnow()  # ИСПРАВЛЕНО: updated_at -> edited_at
            
            await db.commit()
            await db.refresh(message)
            
            logger.info(f"Message {message_id} updated by user {user_id}")
            return message
        return None
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating message: {e}")
        return None

async def delete_message_for_me(db: AsyncSession, message_id: int, user_id: int):
    """Удалить сообщение только для себя"""
    try:
        # Проверяем, существует ли уже запись об удалении
        result = await db.execute(
            select(MessageDelete)
            .filter(
                MessageDelete.message_id == message_id,
                MessageDelete.user_id == user_id
            )
        )
        existing = result.scalar_one_or_none()
        
        if not existing:
            delete_record = MessageDelete(
                message_id=message_id,
                user_id=user_id
            )
            db.add(delete_record)
            await db.commit()
            logger.info(f"Message {message_id} deleted for user {user_id}")
        
        return {"success": True}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting message for me: {e}")
        return {"success": False, "error": str(e)}

async def delete_message_for_everyone(db: AsyncSession, message_id: int, user_id: int):
    """Удалить сообщение для всех (только свои сообщения)"""
    try:
        result = await db.execute(
            select(Message)
            .filter(
                Message.id == message_id,
                Message.sender_id == user_id
            )
        )
        message = result.scalar_one_or_none()
        
        if message:
            message.is_deleted = True
            message.content = "[Сообщение удалено]"
            message.message_type = "deleted"
            message.file_url = None
            message.file_name = None
            message.file_size = None
            message.edited_at = datetime.utcnow()  # ИСПРАВЛЕНО: updated_at -> edited_at
            
            await db.commit()
            
            # Удаляем все записи об удалении для этого сообщения
            await db.execute(
                delete(MessageDelete).filter(MessageDelete.message_id == message_id)
            )
            await db.commit()
            
            logger.info(f"Message {message_id} deleted for everyone by user {user_id}")
            return message
        
        return None
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting message for everyone: {e}")
        return None

async def reply_to_message(db: AsyncSession, message_data: MessageCreate, user_id: int, reply_to_id: int):
    """Ответить на сообщение"""
    try:
        # Проверяем, существует ли сообщение, на которое отвечаем
        reply_to_msg = await get_message_by_id(db, reply_to_id)
        
        if not reply_to_msg:
            return None
        
        # Создаем сообщение-ответ
        message = Message(
            chat_id=message_data.chat_id,
            sender_id=user_id,
            content=message_data.content,
            message_type=message_data.message_type,
            file_url=message_data.file_url,
            file_name=message_data.file_name,
            file_size=message_data.file_size,
            reply_to_id=reply_to_id,
            sent_at=datetime.utcnow()
        )
        
        db.add(message)
        await db.commit()
        await db.refresh(message)
        
        # Загружаем связанные данные
        result = await db.execute(
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reply_to).selectinload(Message.sender)
            )
            .filter(Message.id == message.id)
        )
        return result.scalar_one()
    except Exception as e:
        await db.rollback()
        logger.error(f"Error replying to message: {e}")
        return None

async def forward_messages(db: AsyncSession, forward_data: MessageForward, user_id: int):
    """Переслать сообщения в другой чат"""
    try:
        forwarded_messages = []
        
        for message_id in forward_data.message_ids:
            # Получаем оригинальное сообщение
            original_msg = await get_message_by_id(db, message_id)
            
            if not original_msg:
                continue
            
            # Проверяем, что пользователь является участником исходного чата
            participant_check = await db.execute(
                select(ChatParticipant)
                .filter(
                    ChatParticipant.chat_id == original_msg.chat_id,
                    ChatParticipant.user_id == user_id
                )
            )
            if not participant_check.scalar_one_or_none():
                continue
            
            # Создаем пересланное сообщение
            new_message = Message(
                chat_id=forward_data.target_chat_id,
                sender_id=user_id,
                content=original_msg.content,
                message_type=original_msg.message_type,
                file_url=original_msg.file_url,
                file_name=original_msg.file_name,
                file_size=original_msg.file_size,
                forwarded_from_id=original_msg.id,
                sent_at=datetime.utcnow(),
                message_metadata={  # ИСПРАВЛЕНО: metadata -> message_metadata
                    "forwarded_from_sender_id": original_msg.sender_id,
                    "forwarded_from_sender_name": original_msg.sender.full_name if original_msg.sender else "Пользователь",
                    "forwarded_from_chat_id": original_msg.chat_id
                }
            )
            
            db.add(new_message)
            await db.flush()
            
            # Загружаем созданное сообщение с данными
            result = await db.execute(
                select(Message)
                .options(
                    selectinload(Message.sender),
                    selectinload(Message.forwarded_from).selectinload(Message.sender)
                )
                .filter(Message.id == new_message.id)
            )
            forwarded_messages.append(result.scalar_one())
        
        await db.commit()
        logger.info(f"Forwarded {len(forwarded_messages)} messages to chat {forward_data.target_chat_id}")
        
        return forwarded_messages
    except Exception as e:
        await db.rollback()
        logger.error(f"Error forwarding messages: {e}")
        return []

async def pin_message(db: AsyncSession, message_id: int, chat_id: int, user_id: int):
    """Закрепить сообщение в чате"""
    try:
        # Проверяем права пользователя (админ или создатель чата)
        chat = await get_chat_by_id(db, chat_id)
        if not chat or (chat.created_by != user_id):
            # Проверяем, является ли пользователь админом
            participant = await db.execute(
                select(ChatParticipant)
                .filter(
                    ChatParticipant.chat_id == chat_id,
                    ChatParticipant.user_id == user_id,
                    ChatParticipant.role == "admin"
                )
            )
            if not participant.scalar_one_or_none():
                return None
        
        # Обновляем сообщение
        result = await db.execute(
            select(Message)
            .filter(Message.id == message_id, Message.chat_id == chat_id)
        )
        message = result.scalar_one_or_none()
        
        if message:
            message.is_pinned = True
            message.edited_at = datetime.utcnow()  # ИСПРАВЛЕНО: updated_at -> edited_at
            
            await db.commit()
            
            logger.info(f"Message {message_id} pinned in chat {chat_id}")
            return message
        
        return None
    except Exception as e:
        await db.rollback()
        logger.error(f"Error pinning message: {e}")
        return None

async def unpin_message(db: AsyncSession, message_id: int, chat_id: int, user_id: int):
    """Открепить сообщение"""
    try:
        result = await db.execute(
            select(Message)
            .filter(Message.id == message_id, Message.chat_id == chat_id)
        )
        message = result.scalar_one_or_none()
        
        if message:
            message.is_pinned = False
            message.edited_at = datetime.utcnow()  # ИСПРАВЛЕНО: updated_at -> edited_at
            
            await db.commit()
            
            logger.info(f"Message {message_id} unpinned in chat {chat_id}")
            return message
        
        return None
    except Exception as e:
        await db.rollback()
        logger.error(f"Error unpinning message: {e}")
        return None

# ==================== Реакции ====================

async def add_reaction(db: AsyncSession, message_id: int, user_id: int, reaction: str):
    """Добавить реакцию на сообщение"""
    try:
        # Проверяем, есть ли уже такая реакция
        result = await db.execute(
            select(MessageReaction)
            .filter(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user_id,
                MessageReaction.reaction == reaction
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            return existing
        
        # Удаляем другие реакции этого пользователя на это сообщение
        await db.execute(
            delete(MessageReaction)
            .filter(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user_id
            )
        )
        
        # Добавляем новую реакцию
        db_reaction = MessageReaction(
            message_id=message_id,
            user_id=user_id,
            reaction=reaction
        )
        db.add(db_reaction)
        await db.commit()
        await db.refresh(db_reaction)
        
        logger.info(f"Reaction {reaction} added to message {message_id} by user {user_id}")
        return db_reaction
    except Exception as e:
        await db.rollback()
        logger.error(f"Error adding reaction: {e}")
        return None

async def remove_reaction(db: AsyncSession, message_id: int, user_id: int, reaction: str):
    """Удалить реакцию с сообщения"""
    try:
        await db.execute(
            delete(MessageReaction)
            .filter(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user_id,
                MessageReaction.reaction == reaction
            )
        )
        await db.commit()
        logger.info(f"Reaction removed from message {message_id} by user {user_id}")
        return True
    except Exception as e:
        await db.rollback()
        logger.error(f"Error removing reaction: {e}")
        return False

async def get_message_reactions(db: AsyncSession, message_id: int):
    """Получить все реакции на сообщение"""
    result = await db.execute(
        select(MessageReaction)
        .filter(MessageReaction.message_id == message_id)
        .options(selectinload(MessageReaction.user))
    )
    return result.scalars().all()

# ==================== Поиск ====================

async def search_messages(
    db: AsyncSession,
    user_id: int,
    query: str,
    chat_id: Optional[int] = None,
    from_user_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    message_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Поиск сообщений"""
    try:
        # Базовый запрос - только чаты, в которых участвует пользователь
        user_chats = await db.execute(
            select(ChatParticipant.chat_id)
            .filter(ChatParticipant.user_id == user_id)
        )
        user_chat_ids = [row[0] for row in user_chats.fetchall()]
        
        if not user_chat_ids:
            return []
        
        # Строим запрос для поиска
        stmt = select(Message).filter(
            Message.chat_id.in_(user_chat_ids),
            Message.is_deleted == False,
            Message.content.ilike(f"%{query}%")
        )
        
        if chat_id:
            stmt = stmt.filter(Message.chat_id == chat_id)
        
        if from_user_id:
            stmt = stmt.filter(Message.sender_id == from_user_id)
        
        if start_date:
            stmt = stmt.filter(Message.sent_at >= start_date)
        
        if end_date:
            stmt = stmt.filter(Message.sent_at <= end_date)
        
        if message_type:
            stmt = stmt.filter(Message.message_type == message_type)
        
        stmt = stmt.order_by(Message.sent_at.desc()).offset(offset).limit(limit)
        stmt = stmt.options(
            selectinload(Message.sender), 
            selectinload(Message.chat)
        )
        
        result = await db.execute(stmt)
        messages = result.scalars().all()
        
        logger.info(f"Found {len(messages)} messages matching query: {query}")
        return messages
    except Exception as e:
        logger.error(f"Error searching messages: {e}")
        return []