import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  addMessage, 
  setOnlineUsers, 
  setTyping, 
  updateOptimisticMessage,
  updateMessage,
  deleteMessageFromList,
  addReactionToMessage,
  removeReactionFromMessage,
  addPinnedMessage,
  removePinnedMessage,
  setIncomingCall,
  setActiveCall,
  addNotification,
  markMessagesAsRead,
  setUserOnline,
  setUserOffline
} from '../store/chatSlice';
import toast from 'react-hot-toast';

export const useWebSocket = () => {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const connectionAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const pendingSubscriptionsRef = useRef(new Set());
  const connectionInProgressRef = useRef(false);
  const messageQueueRef = useRef([]); // Очередь сообщений
  const pingIntervalRef = useRef(null);
  const connectRef = useRef(null);
  const disconnectRef = useRef(null);
  
  const dispatch = useDispatch();
  const { user, token } = useSelector(state => state.auth);
  const { activeChat } = useSelector(state => state.chat);

  // Очистка таймера переподключения
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Очистка ping интервала
  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // Отправка сообщения из очереди
  const processMessageQueue = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      try {
        wsRef.current.send(JSON.stringify(message));
        console.log('📤 Sent queued message:', message.type);
      } catch (error) {
        console.error('❌ Error sending queued message:', error);
        // Возвращаем в очередь для повторной отправки
        messageQueueRef.current.unshift(message);
        break;
      }
    }
  }, []);

  const connect = useCallback(() => {
    if (!user || !token) {
      console.log('⏸️ No user or token, skipping WebSocket connection');
      return;
    }

    if (connectionInProgressRef.current) {
      console.log('⏳ Connection already in progress, skipping...');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return;
    }

    connectionInProgressRef.current = true;

    try {
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
      const ws = new WebSocket(`${wsUrl}/ws/${user.id}?token=${token}`);

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setIsConnected(true);
        setConnectionAttempts(0);
        connectionAttemptsRef.current = 0;
        clearReconnectTimeout();
        connectionInProgressRef.current = false;
        wsRef.current = ws;
        
        // Отправляем статус онлайн
        const statusMessage = {
          type: 'status',
          is_online: true
        };
        
        try {
          ws.send(JSON.stringify(statusMessage));
          console.log('📤 Sent status: online');
        } catch (error) {
          console.error('❌ Error sending status:', error);
          messageQueueRef.current.push(statusMessage);
        }
        
        // Подписываемся на все ожидающие чаты
        if (pendingSubscriptionsRef.current.size > 0) {
          pendingSubscriptionsRef.current.forEach(chatId => {
            const subscribeMessage = {
              type: 'subscribe',
              chat_id: chatId
            };
            try {
              ws.send(JSON.stringify(subscribeMessage));
              console.log(`📤 Subscribed to chat ${chatId}`);
            } catch (error) {
              console.error(`❌ Error subscribing to chat ${chatId}:`, error);
              messageQueueRef.current.push(subscribeMessage);
            }
          });
          pendingSubscriptionsRef.current.clear();
        }
        
        // Запускаем ping интервал
        clearPingInterval();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch (error) {
              console.error('❌ Error sending ping:', error);
            }
          }
        }, 25000); // Каждые 25 секунд
        
        // Обрабатываем очередь сообщений
        processMessageQueue();
        
        toast.success('Подключено к серверу', { id: 'ws-connected', duration: 2000 });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', data.type, data);
          setLastMessage(data);
          
          // Обрабатываем pong ответы
          if (data.type === 'pong') {
            console.log('🏓 Pong received');
            return;
          }
          
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error, event.data);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        clearPingInterval();
        connectionInProgressRef.current = false;

        // Если wsRef уже указывает на другой WS — значит это старое соединение,
        // новое уже активно. Не нужно реконнектиться.
        if (wsRef.current !== ws) {
          console.log('Old WebSocket closed, new one already active');
          return;
        }

        wsRef.current = null;
        setIsConnected(false);

        // 4000 = сервер заменил соединение новым от того же юзера.
        // Не реконнектимся — другая вкладка/сессия уже подключена.
        if (event.code === 4000) {
          console.log('Connection replaced by new session');
          return;
        }

        // Для всех остальных кодов (включая 1000) — пытаемся переподключиться
        if (event.code !== 1000) {
          toast.error('Соединение потеряно. Переподключение...', { id: 'ws-disconnected' });
        }

        if (user && token) {
          const attempts = connectionAttemptsRef.current;
          const delay = Math.min(1000 * Math.pow(1.5, attempts), 10000);
          connectionAttemptsRef.current = attempts + 1;
          setConnectionAttempts(attempts + 1);

          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            connectionInProgressRef.current = false;
            connect();
          }, delay);
          console.log(`Reconnecting in ${delay}ms (attempt ${attempts + 1})`);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectionInProgressRef.current = false;
      };

      // Сохраняем ссылку сразу, чтобы onclose мог сравнить
      wsRef.current = ws;
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setIsConnected(false);
      connectionInProgressRef.current = false;
    }
  }, [user, token, clearReconnectTimeout, clearPingInterval, processMessageQueue]);

  const sendJsonMessage = useCallback((data, retryCount = 0) => {
    // Проверяем наличие WebSocket
    if (!wsRef.current) {
      console.warn('⚠️ WebSocket not initialized');
      
      // Добавляем в очередь для подписок
      if (data.type === 'subscribe' && data.chat_id) {
        pendingSubscriptionsRef.current.add(data.chat_id);
      } else {
        // Добавляем в очередь сообщений
        messageQueueRef.current.push(data);
      }
      
      // Пытаемся подключиться
      if (!connectionInProgressRef.current) {
        connect();
      }
      
      return false;
    }

    const readyState = wsRef.current.readyState;
    
    if (readyState === WebSocket.OPEN) {
      try {
        const jsonData = JSON.stringify(data);
        console.log('📤 Sending WebSocket message:', data.type, data);
        wsRef.current.send(jsonData);
        return true;
      } catch (error) {
        console.error('❌ Error sending WebSocket message:', error);
        
        // Добавляем в очередь при ошибке
        if (data.type !== 'ping') {
          messageQueueRef.current.push(data);
        }
        
        return false;
      }
    } else if (readyState === WebSocket.CONNECTING) {
      console.log('⏳ WebSocket connecting, adding to queue...');
      
      // Добавляем в очередь
      if (data.type === 'subscribe' && data.chat_id) {
        pendingSubscriptionsRef.current.add(data.chat_id);
      } else if (data.type !== 'ping') {
        messageQueueRef.current.push(data);
      }
      
      return true;
    } else {
      console.warn('⚠️ WebSocket is not open, readyState:', readyState);
      
      // Добавляем в очередь
      if (data.type === 'subscribe' && data.chat_id) {
        pendingSubscriptionsRef.current.add(data.chat_id);
      } else if (data.type !== 'ping') {
        messageQueueRef.current.push(data);
      }
      
      // Пытаемся переподключиться
      if (!connectionInProgressRef.current) {
        connect();
      }
      
      return false;
    }
  }, [connect]);

  const subscribeToChat = useCallback((chatId) => {
    if (!chatId) return false;
    return sendJsonMessage({
      type: 'subscribe',
      chat_id: chatId
    });
  }, [sendJsonMessage]);

  const unsubscribeFromChat = useCallback((chatId) => {
    if (!chatId) return false;
    pendingSubscriptionsRef.current.delete(chatId);
    return sendJsonMessage({
      type: 'unsubscribe',
      chat_id: chatId
    });
  }, [sendJsonMessage]);

  const sendMessage = useCallback((message) => {
    return sendJsonMessage({
      type: 'message',
      ...message
    });
  }, [sendJsonMessage]);

  const sendTyping = useCallback((chatId, isTyping = true) => {
    return sendJsonMessage({
      type: 'typing',
      chat_id: chatId,
      is_typing: isTyping
    });
  }, [sendJsonMessage]);

  const editMessage = useCallback((messageId, newContent) => {
    return sendJsonMessage({
      type: 'edit_message',
      message_id: messageId,
      content: newContent
    });
  }, [sendJsonMessage]);

  const deleteMessage = useCallback((messageId, deleteFor = 'me') => {
    return sendJsonMessage({
      type: 'delete_message',
      message_id: messageId,
      delete_for: deleteFor
    });
  }, [sendJsonMessage]);

  const addReaction = useCallback((messageId, reaction) => {
    return sendJsonMessage({
      type: 'add_reaction',
      message_id: messageId,
      reaction
    });
  }, [sendJsonMessage]);

  const removeReaction = useCallback((messageId, reaction) => {
    return sendJsonMessage({
      type: 'remove_reaction',
      message_id: messageId,
      reaction
    });
  }, [sendJsonMessage]);

  const markMessagesAsRead = useCallback((chatId, messageIds) => {
    if (!messageIds || messageIds.length === 0) return false;
    
    return sendJsonMessage({
      type: 'read_messages',
      chat_id: chatId,
      last_read_message_id: Math.max(...messageIds)
    });
  }, [sendJsonMessage]);

  const startCall = useCallback((chatId, callType) => {
    return sendJsonMessage({
      type: 'start_call',
      chat_id: chatId,
      call_type: callType
    });
  }, [sendJsonMessage]);

  const acceptCall = useCallback((callId) => {
    return sendJsonMessage({
      type: 'call_accept',
      call_id: callId
    });
  }, [sendJsonMessage]);

  const rejectCall = useCallback((callId) => {
    return sendJsonMessage({
      type: 'call_reject',
      call_id: callId
    });
  }, [sendJsonMessage]);

  const endCall = useCallback((callId) => {
    return sendJsonMessage({
      type: 'call_end',
      call_id: callId
    });
  }, [sendJsonMessage]);

  const sendWebRTCSignal = useCallback((signal) => {
    return sendJsonMessage(signal);
  }, [sendJsonMessage]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    clearPingInterval();
    pendingSubscriptionsRef.current.clear();
    messageQueueRef.current = [];
    
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'status',
            is_online: false
          }));
        } catch (e) {
          // Игнорируем ошибки при отправке
        }
      }
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
    
    stopCallSound();
    connectionInProgressRef.current = false;
  }, [clearReconnectTimeout, clearPingInterval]);

  // Обновляем refs при каждом рендере
  connectRef.current = connect;
  disconnectRef.current = disconnect;

  const reconnect = useCallback(() => {
    disconnect();
    setConnectionAttempts(0);
    connectionAttemptsRef.current = 0;
    setTimeout(() => {
      connectionInProgressRef.current = false;
      connect();
    }, 100);
  }, [disconnect, connect]);

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'new_message':
        dispatch(addMessage({
          chatId: data.message.chat_id || data.chat_id,
          message: data.message
        }));
        
        if (data.message.sender_id !== user?.id && activeChat?.id === data.message.chat_id) {
          setTimeout(() => {
            markMessagesAsRead(data.message.chat_id, [data.message.id]);
          }, 1000);
        }
        break;
      
      case 'message_sent':
        if (data.temp_id && data.message) {
          dispatch(updateOptimisticMessage({
            chatId: data.message.chat_id,
            tempId: data.temp_id,
            realMessage: data.message
          }));
          console.log(`✅ Message ${data.message.id} confirmed (temp: ${data.temp_id})`);
        }
        break;
      
      case 'message_edited':
        dispatch(updateMessage({
          chatId: data.chat_id,
          messageId: data.message_id,
          content: data.new_content,
          editedAt: data.edited_at
        }));
        
        if (data.sender_id !== user?.id) {
          toast('Сообщение было отредактировано', { icon: '✏️' });
        }
        break;
      
      case 'message_deleted':
        dispatch(deleteMessageFromList({
          chatId: data.chat_id,
          messageId: data.message_id,
          deleteFor: data.delete_for
        }));
        
        if (data.delete_for === 'everyone' && data.sender_id !== user?.id) {
          toast('Сообщение было удалено', { icon: '🗑️' });
        }
        break;
      
      case 'new_reaction':
        dispatch(addReactionToMessage({
          chatId: data.chat_id,
          messageId: data.message_id,
          userId: data.user_id,
          reaction: data.reaction,
          user: { username: data.username, full_name: data.full_name }
        }));
        break;
      
      case 'reaction_removed':
        dispatch(removeReactionFromMessage({
          chatId: data.chat_id,
          messageId: data.message_id,
          userId: data.user_id,
          reaction: data.reaction
        }));
        break;
      
      case 'message_pinned':
        dispatch(addPinnedMessage({
          chatId: data.chat_id,
          messageId: data.message_id
        }));
        
        if (data.user_id !== user?.id) {
          toast('Сообщение было закреплено', { icon: '📌' });
        }
        break;
      
      case 'message_unpinned':
        dispatch(removePinnedMessage({
          chatId: data.chat_id,
          messageId: data.message_id
        }));
        
        if (data.user_id !== user?.id) {
          toast('Сообщение было откреплено', { icon: '🔓' });
        }
        break;
      
      case 'user_status':
        if (data.is_online) {
          dispatch(setUserOnline(data.user_id));
        } else {
          dispatch(setUserOffline(data.user_id));
        }
        break;
      
      case 'user_typing':
        dispatch(setTyping({
          chatId: data.chat_id,
          userId: data.user_id,
          isTyping: data.is_typing
        }));
        break;
      
      case 'messages_read':
        dispatch(markMessagesAsRead({
          chatId: data.chat_id,
          messageIds: data.message_ids || [data.last_read_message_id]
        }));
        break;
      
      case 'chat_updated':
        console.log('Chat updated:', data);
        break;
      
      case 'chat_deleted':
        toast.error('Чат был удален');
        window.location.href = '/';
        break;
      
      case 'participant_added':
        toast.success('Новый участник добавлен в чат');
        break;
      
      case 'participant_removed':
        if (data.user_id === user?.id) {
          toast.error('Вас удалили из чата');
          window.location.href = '/';
        }
        break;
      
      case 'incoming_call':
        dispatch(setIncomingCall({
          call_id: data.call_id,
          chat_id: data.chat_id,
          initiator_id: data.initiator_id,
          initiator_name: data.initiator_name,
          call_type: data.call_type
        }));
        
        playCallSound();
        break;
      
      case 'call_accepted':
        dispatch(setActiveCall({
          call_id: data.call_id,
          status: 'ongoing'
        }));
        toast.success('Звонок принят');
        stopCallSound();
        break;
      
      case 'call_rejected':
        dispatch(setActiveCall(null));
        toast.error('Звонок отклонен');
        stopCallSound();
        break;
      
      case 'call_ended':
        dispatch(setActiveCall(null));
        toast('Звонок завершен', { icon: '📞' });
        stopCallSound();
        break;
      
      case 'webrtc_offer':
        window.dispatchEvent(new CustomEvent('webrtc_offer', { detail: data }));
        break;
      
      case 'webrtc_answer':
        window.dispatchEvent(new CustomEvent('webrtc_answer', { detail: data }));
        break;
      
      case 'webrtc_ice_candidate':
        window.dispatchEvent(new CustomEvent('webrtc_ice_candidate', { detail: data }));
        break;
      
      case 'notification':
        dispatch(addNotification(data.notification));
        
        if (data.notification.type === 'mention') {
          toast(`Вас упомянули: ${data.notification.content}`, { icon: '@' });
        } else if (data.notification.type === 'reply') {
          toast(`Ответ на ваше сообщение: ${data.notification.content}`, { icon: '↩️' });
        }
        break;
      
      case 'connected':
        console.log('✅ Connection confirmed by server');
        break;
      
      case 'subscribed':
        console.log(`✅ Subscribed to chat ${data.chat_id}`);
        pendingSubscriptionsRef.current.delete(data.chat_id);
        break;
      
      case 'unsubscribed':
        console.log(`🔓 Unsubscribed from chat ${data.chat_id}`);
        break;
      
      case 'delete_success':
        console.log(`✅ Message ${data.message_id} deleted successfully`);
        break;
      
      case 'edit_success':
        console.log(`✅ Message ${data.message_id} edited successfully`);
        break;
      
      case 'reaction_added':
        console.log(`✅ Reaction added to message ${data.message_id}`);
        break;
      
      case 'reaction_removed':
        console.log(`✅ Reaction removed from message ${data.message_id}`);
        break;
      
      case 'pong':
        console.log('🏓 Pong received');
        break;
      
      case 'error':
        console.error('❌ Server error:', data.error);
        toast.error(data.error || 'Произошла ошибка');
        break;
      
      default:
        console.log('Unknown WebSocket message type:', data.type, data);
    }
  };

  const playCallSound = useCallback(() => {
    const audio = new Audio('/sounds/call.mp3');
    audio.loop = true;
    audio.play().catch(e => console.log('Audio play failed:', e));
    window.callSound = audio;
  }, []);

  const stopCallSound = useCallback(() => {
    if (window.callSound) {
      window.callSound.pause();
      window.callSound.currentTime = 0;
      window.callSound = null;
    }
  }, []);

  // Автоматическое подключение при изменении user/token
  useEffect(() => {
    if (user && token) {
      const timeoutId = setTimeout(() => {
        connectRef.current();
      }, 500);

      return () => {
        clearTimeout(timeoutId);
        disconnectRef.current();
      };
    } else {
      disconnectRef.current();
    }

    return () => {
      disconnectRef.current();
    };
  }, [user?.id, token]);

  // Автоматическая подписка на активный чат
  useEffect(() => {
    if (activeChat) {
      if (isConnected) {
        subscribeToChat(activeChat.id);
      } else {
        pendingSubscriptionsRef.current.add(activeChat.id);
      }
      
      return () => {
        if (isConnected) {
          unsubscribeFromChat(activeChat.id);
        } else {
          pendingSubscriptionsRef.current.delete(activeChat.id);
        }
      };
    }
  }, [isConnected, activeChat, subscribeToChat, unsubscribeFromChat]);

  // Обработчики для звонков из window событий
  useEffect(() => {
    const handleAcceptCall = (event) => {
      acceptCall(event.detail.call_id);
    };
    
    const handleRejectCall = (event) => {
      rejectCall(event.detail.call_id);
    };
    
    window.addEventListener('accept_call', handleAcceptCall);
    window.addEventListener('reject_call', handleRejectCall);
    
    return () => {
      window.removeEventListener('accept_call', handleAcceptCall);
      window.removeEventListener('reject_call', handleRejectCall);
    };
  }, [acceptCall, rejectCall]);

  return {
    sendJsonMessage,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    markMessagesAsRead,
    subscribeToChat,
    unsubscribeFromChat,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    sendWebRTCSignal,
    isConnected,
    lastMessage,
    connectionAttempts,
    connect,
    disconnect,
    reconnect,
    wsRef
  };
};

export const useWebSocketConnection = () => {
  const {
    sendJsonMessage,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    markMessagesAsRead,
    subscribeToChat,
    unsubscribeFromChat,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    sendWebRTCSignal,
    isConnected,
    lastMessage
  } = useWebSocket();

  return {
    sendJsonMessage,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    markMessagesAsRead,
    subscribeToChat,
    unsubscribeFromChat,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    sendWebRTCSignal,
    isConnected,
    lastMessage,
    send: sendJsonMessage,
    wsSend: sendJsonMessage,
    wsSendMessage: sendMessage,
    wsEditMessage: editMessage,
    wsDeleteMessage: deleteMessage,
    wsAddReaction: addReaction,
    wsRemoveReaction: removeReaction,
    wsSubscribe: subscribeToChat,
    wsUnsubscribe: unsubscribeFromChat,
    wsMarkAsRead: markMessagesAsRead
  };
};