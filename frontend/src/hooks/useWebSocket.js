import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
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
  markMessagesAsRead as markMessagesAsReadAction,
  setUserOnline,
  setUserOffline
} from '../store/chatSlice';
import toast from 'react-hot-toast';

// ============ Context ============

const WebSocketContext = createContext(null);

// ============ Provider (единственное соединение на всё приложение) ============

export const WebSocketProvider = ({ children }) => {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  const connectionAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const pendingSubscriptionsRef = useRef(new Set());
  const connectionInProgressRef = useRef(false);
  const messageQueueRef = useRef([]);
  const pingIntervalRef = useRef(null);
  const userRef = useRef(null);
  const tokenRef = useRef(null);
  const activeChatRef = useRef(null);

  const dispatch = useDispatch();
  const { user, token } = useSelector(state => state.auth);
  const { activeChat } = useSelector(state => state.chat);

  // Синхронизируем refs
  userRef.current = user;
  tokenRef.current = token;
  activeChatRef.current = activeChat;

  // === Стабильные утилиты ===

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

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

  const processMessageQueue = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        messageQueueRef.current.unshift(message);
        break;
      }
    }
  }, []);

  // === Обработка входящих сообщений ===

  const handleWebSocketMessage = useCallback((data) => {
    const currentUser = userRef.current;
    const currentActiveChat = activeChatRef.current;

    switch (data.type) {
      case 'new_message':
        dispatch(addMessage({
          chatId: data.message.chat_id || data.chat_id,
          message: data.message
        }));
        if (data.message.sender_id !== currentUser?.id && currentActiveChat?.id === data.message.chat_id) {
          const chatId = data.message.chat_id;
          const msgId = data.message.id;
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'read_messages',
                chat_id: chatId,
                last_read_message_id: msgId
              }));
            }
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
        }
        break;
      case 'message_edited':
        dispatch(updateMessage({
          chatId: data.chat_id,
          messageId: data.message_id,
          content: data.new_content,
          editedAt: data.edited_at
        }));
        if (data.sender_id !== currentUser?.id) {
          toast('Сообщение было отредактировано', { icon: '✏️' });
        }
        break;
      case 'message_deleted':
        dispatch(deleteMessageFromList({
          chatId: data.chat_id,
          messageId: data.message_id,
          deleteFor: data.delete_for
        }));
        if (data.delete_for === 'everyone' && data.sender_id !== currentUser?.id) {
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
        if (data.user_id !== currentUser?.id) {
          toast('Сообщение было закреплено', { icon: '📌' });
        }
        break;
      case 'message_unpinned':
        dispatch(removePinnedMessage({
          chatId: data.chat_id,
          messageId: data.message_id
        }));
        if (data.user_id !== currentUser?.id) {
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
        dispatch(markMessagesAsReadAction({
          chatId: data.chat_id,
          messageIds: data.message_ids || [data.last_read_message_id]
        }));
        break;
      case 'chat_updated':
        break;
      case 'chat_deleted':
        toast.error('Чат был удален');
        window.location.href = '/';
        break;
      case 'participant_added':
        toast.success('Новый участник добавлен в чат');
        break;
      case 'participant_removed':
        if (data.user_id === currentUser?.id) {
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
        dispatch(setActiveCall({ call_id: data.call_id, status: 'ongoing' }));
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
      case 'subscribed':
        pendingSubscriptionsRef.current.delete(data.chat_id);
        break;
      case 'unsubscribed':
      case 'delete_success':
      case 'edit_success':
      case 'reaction_added':
      case 'pong':
        break;
      case 'error':
        console.error('Server error:', data.error);
        toast.error(data.error || 'Произошла ошибка');
        break;
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  }, [dispatch, playCallSound, stopCallSound]);

  // === connect ===

  const connect = useCallback(() => {
    const currentUser = userRef.current;
    const currentToken = tokenRef.current;

    if (!currentUser || !currentToken) return;
    if (connectionInProgressRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      wsRef.current.close();
      wsRef.current = null;
    }

    connectionInProgressRef.current = true;

    try {
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
      const ws = new WebSocket(`${wsUrl}/ws/${currentUser.id}?token=${currentToken}`);

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionAttempts(0);
        connectionAttemptsRef.current = 0;
        clearReconnectTimeout();
        connectionInProgressRef.current = false;
        wsRef.current = ws;

        try {
          ws.send(JSON.stringify({ type: 'status', is_online: true }));
        } catch (e) { /* ignore */ }

        pendingSubscriptionsRef.current.forEach(chatId => {
          try {
            ws.send(JSON.stringify({ type: 'subscribe', chat_id: chatId }));
          } catch (e) { /* ignore */ }
        });
        pendingSubscriptionsRef.current.clear();

        clearPingInterval();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* ignore */ }
          }
        }, 25000);

        processMessageQueue();
        toast.success('Подключено к серверу', { id: 'ws-connected', duration: 2000 });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          if (data.type !== 'pong') {
            handleWebSocketMessage(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        clearPingInterval();
        connectionInProgressRef.current = false;

        if (wsRef.current !== ws) return;

        wsRef.current = null;
        setIsConnected(false);

        if (event.code === 4000) return;

        if (event.code !== 1000) {
          toast.error('Соединение потеряно. Переподключение...', { id: 'ws-disconnected' });
        }

        if (userRef.current && tokenRef.current) {
          const attempts = connectionAttemptsRef.current;
          const delay = Math.min(1000 * Math.pow(1.5, attempts), 10000);
          connectionAttemptsRef.current = attempts + 1;
          setConnectionAttempts(attempts + 1);

          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            connectionInProgressRef.current = false;
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        connectionInProgressRef.current = false;
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setIsConnected(false);
      connectionInProgressRef.current = false;
    }
  }, [clearReconnectTimeout, clearPingInterval, processMessageQueue, handleWebSocketMessage]);

  // === disconnect ===

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    clearPingInterval();
    pendingSubscriptionsRef.current.clear();
    messageQueueRef.current = [];

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'status', is_online: false }));
        } catch (e) { /* ignore */ }
      }
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }

    stopCallSound();
    connectionInProgressRef.current = false;
  }, [clearReconnectTimeout, clearPingInterval, stopCallSound]);

  // === sendJsonMessage ===

  const sendJsonMessage = useCallback((data) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      if (data.type === 'subscribe' && data.chat_id) {
        pendingSubscriptionsRef.current.add(data.chat_id);
      } else if (data.type !== 'ping') {
        messageQueueRef.current.push(data);
      }
      return false;
    }

    try {
      wsRef.current.send(JSON.stringify(data));
      return true;
    } catch (error) {
      if (data.type !== 'ping') {
        messageQueueRef.current.push(data);
      }
      return false;
    }
  }, []);

  // === Вспомогательные функции отправки ===

  const subscribeToChat = useCallback((chatId) => {
    if (!chatId) return false;
    return sendJsonMessage({ type: 'subscribe', chat_id: chatId });
  }, [sendJsonMessage]);

  const unsubscribeFromChat = useCallback((chatId) => {
    if (!chatId) return false;
    pendingSubscriptionsRef.current.delete(chatId);
    return sendJsonMessage({ type: 'unsubscribe', chat_id: chatId });
  }, [sendJsonMessage]);

  const sendMessage = useCallback((message) => {
    return sendJsonMessage({ type: 'message', ...message });
  }, [sendJsonMessage]);

  const sendTyping = useCallback((chatId, isTyping = true) => {
    return sendJsonMessage({ type: 'typing', chat_id: chatId, is_typing: isTyping });
  }, [sendJsonMessage]);

  const editMessage = useCallback((messageId, newContent) => {
    return sendJsonMessage({ type: 'edit_message', message_id: messageId, content: newContent });
  }, [sendJsonMessage]);

  const deleteMessage = useCallback((messageId, deleteFor = 'me') => {
    return sendJsonMessage({ type: 'delete_message', message_id: messageId, delete_for: deleteFor });
  }, [sendJsonMessage]);

  const addReaction = useCallback((messageId, reaction) => {
    return sendJsonMessage({ type: 'add_reaction', message_id: messageId, reaction });
  }, [sendJsonMessage]);

  const removeReaction = useCallback((messageId, reaction) => {
    return sendJsonMessage({ type: 'remove_reaction', message_id: messageId, reaction });
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
    return sendJsonMessage({ type: 'start_call', chat_id: chatId, call_type: callType });
  }, [sendJsonMessage]);

  const acceptCall = useCallback((callId) => {
    return sendJsonMessage({ type: 'call_accept', call_id: callId });
  }, [sendJsonMessage]);

  const rejectCall = useCallback((callId) => {
    return sendJsonMessage({ type: 'call_reject', call_id: callId });
  }, [sendJsonMessage]);

  const endCall = useCallback((callId) => {
    return sendJsonMessage({ type: 'call_end', call_id: callId });
  }, [sendJsonMessage]);

  const sendWebRTCSignal = useCallback((signal) => {
    return sendJsonMessage(signal);
  }, [sendJsonMessage]);

  const reconnect = useCallback(() => {
    disconnect();
    setConnectionAttempts(0);
    connectionAttemptsRef.current = 0;
    setTimeout(() => {
      connectionInProgressRef.current = false;
      connect();
    }, 100);
  }, [disconnect, connect]);

  // === Effects ===

  // Подключение при наличии user/token
  useEffect(() => {
    if (user && token) {
      const timeoutId = setTimeout(() => connect(), 500);
      return () => {
        clearTimeout(timeoutId);
        disconnect();
      };
    } else {
      disconnect();
    }
    // Зависим только от примитивов
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

  // Подписка на активный чат
  useEffect(() => {
    if (!activeChat?.id) return;

    const chatId = activeChat.id;

    if (isConnected) {
      subscribeToChat(chatId);
    } else {
      pendingSubscriptionsRef.current.add(chatId);
    }

    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendJsonMessage({ type: 'unsubscribe', chat_id: chatId });
      } else {
        pendingSubscriptionsRef.current.delete(chatId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, activeChat?.id]);

  // Обработчики звонков
  useEffect(() => {
    const handleAcceptCallEvent = (event) => acceptCall(event.detail.call_id);
    const handleRejectCallEvent = (event) => rejectCall(event.detail.call_id);

    window.addEventListener('accept_call', handleAcceptCallEvent);
    window.addEventListener('reject_call', handleRejectCallEvent);

    return () => {
      window.removeEventListener('accept_call', handleAcceptCallEvent);
      window.removeEventListener('reject_call', handleRejectCallEvent);
    };
  }, [acceptCall, rejectCall]);

  const value = {
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

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

// ============ Хуки-потребители (просто читают из контекста) ============

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const useWebSocketConnection = () => {
  const ctx = useWebSocket();
  return {
    ...ctx,
    send: ctx.sendJsonMessage,
    wsSend: ctx.sendJsonMessage,
    wsSendMessage: ctx.sendMessage,
    wsEditMessage: ctx.editMessage,
    wsDeleteMessage: ctx.deleteMessage,
    wsAddReaction: ctx.addReaction,
    wsRemoveReaction: ctx.removeReaction,
    wsSubscribe: ctx.subscribeToChat,
    wsUnsubscribe: ctx.unsubscribeFromChat,
    wsMarkAsRead: ctx.markMessagesAsRead
  };
};
