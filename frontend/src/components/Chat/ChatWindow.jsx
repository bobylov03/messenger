import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  fetchMessages,
  addOptimisticMessage,
  removeOptimisticMessage
} from '../../store/chatSlice';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import { useWebSocket } from '../../hooks/useWebSocket';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

const ChatWindow = () => {
  const { activeChat, messages } = useSelector(state => state.chat);
  const { user } = useSelector(state => state.auth);
  const dispatch = useDispatch();
  const { sendJsonMessage, isConnected } = useWebSocket();
  const messagesEndRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  // Загрузка сообщений при смене чата
  useEffect(() => {
    if (activeChat) {
      setIsLoading(true);
      dispatch(fetchMessages({ chatId: activeChat.id }))
        .finally(() => setIsLoading(false));
    }
  }, [activeChat?.id, dispatch]);

  // Прокрутка к последнему сообщению
  useEffect(() => {
    if (activeChat && messages[activeChat.id]?.length > 0) {
      scrollToBottom();
    }
  }, [activeChat?.id, messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
      });
    }, 100);
  };

  const handleSendMessage = async (content, messageType = 'text', fileUrl = null) => {
    if ((!content || !content.trim()) && !fileUrl) return;
    if (!activeChat || !user) return;

    const tempId = `temp_${uuidv4()}`;
    const trimmedContent = content?.trim() || '';

    // 1. Оптимистичное обновление — сразу показываем сообщение
    dispatch(addOptimisticMessage({
      chatId: activeChat.id,
      tempId,
      content: trimmedContent,
      senderId: user.id,
      senderName: user.full_name || user.username,
      messageType,
      fileUrl
    }));

    // 2. Отправляем через WebSocket
    if (isConnected) {
      const sent = sendJsonMessage({
        type: 'message',
        chat_id: activeChat.id,
        content: trimmedContent,
        message_type: messageType,
        file_url: fileUrl,
        sender_id: user.id,
        temp_id: tempId
      });

      if (!sent) {
        toast.error('Не удалось отправить сообщение');
        dispatch(removeOptimisticMessage({ chatId: activeChat.id, tempId }));
      }
    } else {
      toast.error('Нет соединения с сервером');
      dispatch(removeOptimisticMessage({ chatId: activeChat.id, tempId }));
    }
  };

  const handleTyping = useCallback((isTyping) => {
    if (activeChat && isConnected) {
      sendJsonMessage({
        type: 'typing',
        chat_id: activeChat.id,
        is_typing: isTyping
      });
    }
  }, [activeChat?.id, isConnected, sendJsonMessage]);

  if (!activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Выберите чат</h3>
          <p className="text-gray-500">Начните общение, выбрав чат из списка</p>
        </div>
      </div>
    );
  }

  // messages[chatId] уже содержит и реальные, и оптимистичные сообщения
  // (addOptimisticMessage добавляет в state.messages, updateOptimisticMessage заменяет)
  const currentMessages = messages[activeChat.id] || [];

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <ChatHeader chat={activeChat} />

      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            <MessageList
              messages={currentMessages}
              currentUserId={user?.id}
            />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="border-t border-gray-200 p-4 bg-white">
        <MessageInput
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          disabled={!isConnected}
          placeholder={isConnected ? "Введите сообщение..." : "Подключение..."}
        />
      </div>
    </div>
  );
};

export default ChatWindow;
