import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  fetchMessages, 
  addOptimisticMessage, 
  updateOptimisticMessage,
  addMessage 
} from '../../store/chatSlice';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import { useWebSocket } from '../../hooks/useWebSocket';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

const ChatWindow = () => {
  const { activeChat, messages, optimisticMessages } = useSelector(state => state.chat);
  const { user } = useSelector(state => state.auth);
  const dispatch = useDispatch();
  const { sendJsonMessage, isConnected, lastMessage } = useWebSocket();
  const messagesEndRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Для отслеживания отправленных сообщений и избежания дубликатов
  const sentTempIdsRef = useRef(new Set());
  const [lastProcessedMessage, setLastProcessedMessage] = useState(null);

  // Загрузка сообщений при смене чата
  useEffect(() => {
    if (activeChat) {
      setIsLoading(true);
      dispatch(fetchMessages({ chatId: activeChat.id }))
        .finally(() => setIsLoading(false));
    }
  }, [activeChat, dispatch]);

  // Обработка входящих WebSocket сообщений
  useEffect(() => {
    if (lastMessage && lastMessage !== lastProcessedMessage) {
      console.log('📨 Received WebSocket message:', lastMessage);
      setLastProcessedMessage(lastMessage);
      
      switch (lastMessage.type) {
        case 'new_message':
          // Это сообщение от другого пользователя или от нас самих через broadcast
          const messageId = lastMessage.message?.id;
          const senderId = lastMessage.message?.sender_id;
          const isFromMe = senderId === user?.id;
          
          if (messageId && !isFromMe) {
            // Добавляем только сообщения от других пользователей
            dispatch(addMessage({
              chatId: lastMessage.chat_id || lastMessage.message?.chat_id,
              message: lastMessage.message
            }));
          }
          break;
          
        case 'message_sent':
          // Это ответ от сервера на НАШЕ отправленное сообщение
          const tempId = lastMessage.temp_id;
          const realMessage = lastMessage.message;
          
          if (tempId && realMessage) {
            // Проверяем, не обрабатывали ли мы уже это сообщение
            if (sentTempIdsRef.current.has(tempId)) {
              console.log('⚠️ Already processed tempId:', tempId);
              return;
            }
            
            sentTempIdsRef.current.add(tempId);
            
            // Обновляем оптимистичное сообщение реальным
            dispatch(updateOptimisticMessage({
              chatId: realMessage.chat_id,
              tempId,
              realMessage
            }));
            
            console.log('✅ Message confirmed by server:', realMessage.id);
          }
          break;
          
        case 'error':
          toast.error(lastMessage.error || 'Произошла ошибка');
          break;
          
        case 'echo':
          // Игнорируем эхо-сообщения
          break;
      }
    }
  }, [lastMessage, lastProcessedMessage, dispatch, user]);

  // Прокрутка к последнему сообщению
  useEffect(() => {
    if (activeChat && messages[activeChat.id]?.length > 0) {
      scrollToBottom();
    }
  }, [activeChat, messages]);

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
    
    // 1. Добавляем tempId в отслеживаемые
    sentTempIdsRef.current.add(tempId);
    
    // 2. Оптимистичное обновление - сразу показываем сообщение
    dispatch(addOptimisticMessage({
      chatId: activeChat.id,
      tempId,
      content: trimmedContent,
      senderId: user.id,
      senderName: user.full_name || user.username
    }));

    // 3. Отправляем ТОЛЬКО через WebSocket
    if (isConnected) {
      const messageData = {
        type: 'message',
        chat_id: activeChat.id,
        content: trimmedContent,
        message_type: messageType,
        file_url: fileUrl,
        sender_id: user.id,
        temp_id: tempId  // Важно: отправляем temp_id на сервер
      };
      
      console.log('📤 Sending message via WebSocket:', messageData);
      const sent = sendJsonMessage(messageData);
      
      if (!sent) {
        toast.error('Не удалось отправить сообщение');
        // Удаляем из отслеживаемых при ошибке
        sentTempIdsRef.current.delete(tempId);
      }
    } else {
      toast.error('Нет соединения с сервером');
      // Удаляем из отслеживаемых при отсутствии соединения
      sentTempIdsRef.current.delete(tempId);
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
  }, [activeChat, isConnected, sendJsonMessage]);

  // Получение сообщений для текущего чата
  const getCurrentMessages = () => {
    if (!activeChat) return [];
    
    const chatId = activeChat.id;
    const realMessages = messages[chatId] || [];
    const optimisticMsgs = optimisticMessages[chatId] || [];
    
    // Объединяем, но фильтруем дубликаты
    const allMessages = [...realMessages];
    
    // Добавляем оптимистичные сообщения, которые еще не подтверждены сервером
    optimisticMsgs.forEach(optMsg => {
      // Проверяем, нет ли уже такого сообщения среди реальных
      const existsInReal = realMessages.some(realMsg => 
        realMsg.id === optMsg.tempId || // Если есть ID
        (realMsg.content === optMsg.content && 
         realMsg.sender_id === optMsg.sender_id &&
         Math.abs(new Date(realMsg.sent_at) - new Date(optMsg.sent_at)) < 5000) // Похожие по времени
      );
      
      if (!existsInReal && sentTempIdsRef.current.has(optMsg.id)) {
        allMessages.push(optMsg);
      }
    });
    
    // Сортируем по времени
    return allMessages.sort((a, b) => {
      const timeA = new Date(a.sent_at || a.sentAt || 0);
      const timeB = new Date(b.sent_at || b.sentAt || 0);
      return timeA - timeB;
    });
  };

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

  const currentMessages = getCurrentMessages();

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