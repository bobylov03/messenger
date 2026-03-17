import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../services/api';

// ==================== АСИНХРОННЫЕ ДЕЙСТВИЯ ====================

// Чаты
export const fetchChats = createAsyncThunk(
  'chat/fetchChats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/chats');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch chats');
    }
  }
);

export const createChat = createAsyncThunk(
  'chat/createChat',
  async (chatData, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/chats', chatData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to create chat');
    }
  }
);

export const updateChat = createAsyncThunk(
  'chat/updateChat',
  async ({ chatId, formData }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/chats/${chatId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return { chatId, data: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to update chat');
    }
  }
);

export const deleteChat = createAsyncThunk(
  'chat/deleteChat',
  async (chatId, { rejectWithValue }) => {
    try {
      await api.delete(`/api/chats/${chatId}`);
      return chatId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to delete chat');
    }
  }
);

export const fetchChatDetails = createAsyncThunk(
  'chat/fetchChatDetails',
  async (chatId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/chats/${chatId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch chat details');
    }
  }
);

// Участники чата
export const addParticipant = createAsyncThunk(
  'chat/addParticipant',
  async ({ chatId, userId }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('user_id', userId);
      const response = await api.post(`/api/chats/${chatId}/participants`, formData);
      return { chatId, userId, data: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to add participant');
    }
  }
);

export const removeParticipant = createAsyncThunk(
  'chat/removeParticipant',
  async ({ chatId, userId }, { rejectWithValue }) => {
    try {
      await api.delete(`/api/chats/${chatId}/participants/${userId}`);
      return { chatId, userId };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to remove participant');
    }
  }
);

export const fetchParticipants = createAsyncThunk(
  'chat/fetchParticipants',
  async (chatId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/chats/${chatId}/participants`);
      return { chatId, participants: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch participants');
    }
  }
);

// Сообщения
export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async ({ chatId, beforeId = null, afterId = null, limit = 50 }, { rejectWithValue }) => {
    try {
      let url = `/api/chats/${chatId}/messages?limit=${limit}`;
      if (beforeId) url += `&before_id=${beforeId}`;
      if (afterId) url += `&after_id=${afterId}`;
      
      const response = await api.get(url);
      return { chatId, messages: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch messages');
    }
  }
);

export const fetchMoreMessages = createAsyncThunk(
  'chat/fetchMoreMessages',
  async ({ chatId, beforeId, limit = 50 }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/chats/${chatId}/messages?before_id=${beforeId}&limit=${limit}`);
      return { chatId, messages: response.data, hasMore: response.data.length === limit };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch more messages');
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (messageData, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/messages', messageData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to send message');
    }
  }
);

export const editMessage = createAsyncThunk(
  'chat/editMessage',
  async ({ messageId, content }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('content', content);
      
      const response = await api.put(`/api/messages/${messageId}`, formData);
      return { messageId, content, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to edit message');
    }
  }
);

export const deleteMessage = createAsyncThunk(
  'chat/deleteMessage',
  async ({ messageId, deleteFor = 'me' }, { rejectWithValue }) => {
    try {
      await api.delete(`/api/messages/${messageId}?delete_for=${deleteFor}`);
      return { messageId, deleteFor };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to delete message');
    }
  }
);

export const replyToMessage = createAsyncThunk(
  'chat/replyToMessage',
  async ({ messageId, content, messageType = 'text', fileUrl = null }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('content', content);
      formData.append('message_type', messageType);
      if (fileUrl) formData.append('file_url', fileUrl);
      
      const response = await api.post(`/api/messages/${messageId}/reply`, formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to reply to message');
    }
  }
);

export const forwardMessages = createAsyncThunk(
  'chat/forwardMessages',
  async ({ messageIds, targetChatId }, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/messages/forward', {
        message_ids: messageIds,
        target_chat_id: targetChatId
      });
      return { messages: response.data, targetChatId };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to forward messages');
    }
  }
);

export const pinMessage = createAsyncThunk(
  'chat/pinMessage',
  async (messageId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/messages/${messageId}/pin`);
      return { messageId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to pin message');
    }
  }
);

export const unpinMessage = createAsyncThunk(
  'chat/unpinMessage',
  async (messageId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/api/messages/${messageId}/pin`);
      return { messageId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to unpin message');
    }
  }
);

export const getMessage = createAsyncThunk(
  'chat/getMessage',
  async (messageId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/messages/${messageId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to get message');
    }
  }
);

// Реакции
export const addReaction = createAsyncThunk(
  'chat/addReaction',
  async ({ messageId, reaction }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('reaction', reaction);
      
      const response = await api.post(`/api/messages/${messageId}/reactions`, formData);
      return { messageId, reaction, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to add reaction');
    }
  }
);

export const removeReaction = createAsyncThunk(
  'chat/removeReaction',
  async ({ messageId, reaction }, { rejectWithValue }) => {
    try {
      await api.delete(`/api/messages/${messageId}/reactions?reaction=${encodeURIComponent(reaction)}`);
      return { messageId, reaction };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to remove reaction');
    }
  }
);

export const fetchReactions = createAsyncThunk(
  'chat/fetchReactions',
  async (messageId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/messages/${messageId}/reactions`);
      return { messageId, reactions: response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch reactions');
    }
  }
);

// Сохраненные сообщения
export const saveMessage = createAsyncThunk(
  'chat/saveMessage',
  async ({ messageId, note = null }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      if (note) formData.append('note', note);
      
      const response = await api.post(`/api/messages/${messageId}/save`, formData);
      return { messageId, note, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to save message');
    }
  }
);

export const unsaveMessage = createAsyncThunk(
  'chat/unsaveMessage',
  async (messageId, { rejectWithValue }) => {
    try {
      await api.delete(`/api/messages/${messageId}/save`);
      return messageId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to unsave message');
    }
  }
);

export const fetchSavedMessages = createAsyncThunk(
  'chat/fetchSavedMessages',
  async ({ skip = 0, limit = 50 } = {}, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/saved-messages?skip=${skip}&limit=${limit}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch saved messages');
    }
  }
);

// Поиск
export const searchMessages = createAsyncThunk(
  'chat/searchMessages',
  async (searchParams, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/search/messages', searchParams);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to search messages');
    }
  }
);

// Звонки
export const startCall = createAsyncThunk(
  'chat/startCall',
  async ({ chatId, callType }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('call_type', callType);
      
      const response = await api.post('/api/calls/start', formData);
      return { chatId, callType, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to start call');
    }
  }
);

export const acceptCall = createAsyncThunk(
  'chat/acceptCall',
  async (callId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/calls/${callId}/accept`);
      return { callId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to accept call');
    }
  }
);

export const rejectCall = createAsyncThunk(
  'chat/rejectCall',
  async (callId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/calls/${callId}/reject`);
      return { callId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to reject call');
    }
  }
);

export const endCall = createAsyncThunk(
  'chat/endCall',
  async (callId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/calls/${callId}/end`);
      return { callId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to end call');
    }
  }
);

// Уведомления
export const fetchNotifications = createAsyncThunk(
  'chat/fetchNotifications',
  async ({ skip = 0, limit = 50, unreadOnly = false } = {}, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/notifications?skip=${skip}&limit=${limit}&unread_only=${unreadOnly}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch notifications');
    }
  }
);

export const markNotificationRead = createAsyncThunk(
  'chat/markNotificationRead',
  async (notificationId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/notifications/${notificationId}/read`);
      return { notificationId, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to mark notification as read');
    }
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  'chat/markAllNotificationsRead',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/notifications/read-all');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to mark all notifications as read');
    }
  }
);

// Статистика
export const fetchStats = createAsyncThunk(
  'chat/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/stats');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch stats');
    }
  }
);

// Загрузка файлов
export const uploadFile = createAsyncThunk(
  'chat/uploadFile',
  async (file, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to upload file');
    }
  }
);

// ==================== SLICE ====================

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    // Чаты
    chats: [],
    activeChat: null,
    chatDetails: {},
    participants: {},
    
    // Сообщения
    messages: {},
    optimisticMessages: {},
    hasMoreMessages: {},
    pinnedMessages: {},
    
    // Сохраненные сообщения
    savedMessages: [],
    savedMessagesLoading: false,
    
    // Реакции
    reactions: {},
    
    // Поиск
    searchResults: [],
    searchLoading: false,
    
    // Звонки
    activeCall: null,
    incomingCall: null,
    
    // Уведомления
    notifications: [],
    unreadNotifications: 0,
    
    // Статусы
    onlineUsers: {},
    typingUsers: {},
    
    // Загрузка и ошибки
    loading: false,
    loadingMore: false,
    sendingMessages: {},
    error: null,
    
    // Статистика
    stats: null,
  },
  
  reducers: {
    // Активный чат
    setActiveChat: (state, action) => {
      state.activeChat = action.payload;
    },
    
    // Сообщения (WebSocket)
    addMessage: (state, action) => {
      const { chatId, message } = action.payload;
      
      if (!state.messages[chatId]) {
        state.messages[chatId] = [];
      }
      
      // Проверяем дубликаты
      const exists = state.messages[chatId].some(m => 
        m.id === message.id || 
        (m.temp_id && m.temp_id === message.temp_id)
      );
      
      if (!exists) {
        state.messages[chatId].push(message);
        state.messages[chatId].sort((a, b) => 
          new Date(a.sent_at) - new Date(b.sent_at)
        );
      }
    },
    
    addOptimisticMessage: (state, action) => {
      const { chatId, tempId, content, senderId, senderName, replyToId, messageType = 'text', fileUrl } = action.payload;
      
      if (!state.optimisticMessages[chatId]) {
        state.optimisticMessages[chatId] = [];
      }
      
      if (!state.messages[chatId]) {
        state.messages[chatId] = [];
      }
      
      const optimisticMessage = {
        id: tempId,
        temp_id: tempId,
        chat_id: chatId,
        content,
        sender_id: senderId,
        sender_name: senderName,
        message_type: messageType,
        file_url: fileUrl,
        reply_to_id: replyToId,
        is_optimistic: true,
        is_sending: true,
        sent_at: new Date().toISOString(),
        is_read: false
      };
      
      state.optimisticMessages[chatId].push(optimisticMessage);
      state.messages[chatId].push(optimisticMessage);
      state.messages[chatId].sort((a, b) => 
        new Date(a.sent_at) - new Date(b.sent_at)
      );
      
      // Отмечаем как отправляемое
      if (!state.sendingMessages[chatId]) {
        state.sendingMessages[chatId] = {};
      }
      state.sendingMessages[chatId][tempId] = 'sending';
    },
    
    updateOptimisticMessage: (state, action) => {
      const { chatId, tempId, realMessage } = action.payload;
      
      // Удаляем из оптимистичных
      if (state.optimisticMessages[chatId]) {
        state.optimisticMessages[chatId] = state.optimisticMessages[chatId]
          .filter(msg => msg.id !== tempId && msg.temp_id !== tempId);
      }
      
      // Заменяем в основном списке
      if (state.messages[chatId]) {
        const index = state.messages[chatId].findIndex(m => 
          m.id === tempId || m.temp_id === tempId
        );
        
        if (index !== -1) {
          state.messages[chatId][index] = realMessage;
        } else {
          state.messages[chatId].push(realMessage);
        }
        
        state.messages[chatId].sort((a, b) => 
          new Date(a.sent_at) - new Date(b.sent_at)
        );
      }
      
      // Удаляем из отправляемых
      if (state.sendingMessages[chatId]) {
        delete state.sendingMessages[chatId][tempId];
      }
    },
    
    removeOptimisticMessage: (state, action) => {
      const { chatId, tempId } = action.payload;
      
      if (state.optimisticMessages[chatId]) {
        state.optimisticMessages[chatId] = state.optimisticMessages[chatId]
          .filter(msg => msg.id !== tempId && msg.temp_id !== tempId);
      }
      
      if (state.messages[chatId]) {
        state.messages[chatId] = state.messages[chatId]
          .filter(msg => msg.id !== tempId && msg.temp_id !== tempId);
      }
      
      if (state.sendingMessages[chatId]) {
        delete state.sendingMessages[chatId][tempId];
      }
    },
    
    // Редактирование сообщения
    updateMessage: (state, action) => {
      const { chatId, messageId, content, editedAt } = action.payload;
      
      if (state.messages[chatId]) {
        const message = state.messages[chatId].find(m => m.id === messageId);
        if (message) {
          message.content = content;
          message.is_edited = true;
          message.edited_at = editedAt;
        }
      }
    },
    
    // Удаление сообщения
    deleteMessageFromList: (state, action) => {
      const { chatId, messageId, deleteFor } = action.payload;
      
      if (state.messages[chatId]) {
        if (deleteFor === 'everyone') {
          // Заменяем на заглушку
          const message = state.messages[chatId].find(m => m.id === messageId);
          if (message) {
            message.content = '[Сообщение удалено]';
            message.message_type = 'deleted';
            message.is_deleted = true;
            message.file_url = null;
            message.file_name = null;
          }
        } else {
          // Для себя - просто удаляем из списка
          state.messages[chatId] = state.messages[chatId]
            .filter(m => m.id !== messageId);
        }
      }
    },
    
    // Реакции
    addReactionToMessage: (state, action) => {
      const { chatId, messageId, userId, reaction, user } = action.payload;
      
      if (state.messages[chatId]) {
        const message = state.messages[chatId].find(m => m.id === messageId);
        if (message) {
          if (!message.reactions) message.reactions = {};
          if (!message.reactions[reaction]) message.reactions[reaction] = [];
          
          // Проверяем, нет ли уже реакции от этого пользователя
          const existingIndex = message.reactions[reaction]
            .findIndex(r => r.user_id === userId);
          
          if (existingIndex === -1) {
            message.reactions[reaction].push({
              user_id: userId,
              username: user?.username,
              full_name: user?.full_name
            });
          }
        }
      }
    },
    
    removeReactionFromMessage: (state, action) => {
      const { chatId, messageId, userId, reaction } = action.payload;
      
      if (state.messages[chatId]) {
        const message = state.messages[chatId].find(m => m.id === messageId);
        if (message && message.reactions && message.reactions[reaction]) {
          message.reactions[reaction] = message.reactions[reaction]
            .filter(r => r.user_id !== userId);
          
          if (message.reactions[reaction].length === 0) {
            delete message.reactions[reaction];
          }
        }
      }
    },
    
    // Закрепленные сообщения
    addPinnedMessage: (state, action) => {
      const { chatId, messageId } = action.payload;
      
      if (!state.pinnedMessages[chatId]) {
        state.pinnedMessages[chatId] = [];
      }
      
      if (!state.pinnedMessages[chatId].includes(messageId)) {
        state.pinnedMessages[chatId].push(messageId);
      }
      
      // Отмечаем сообщение как закрепленное
      if (state.messages[chatId]) {
        const message = state.messages[chatId].find(m => m.id === messageId);
        if (message) {
          message.is_pinned = true;
        }
      }
    },
    
    removePinnedMessage: (state, action) => {
      const { chatId, messageId } = action.payload;
      
      if (state.pinnedMessages[chatId]) {
        state.pinnedMessages[chatId] = state.pinnedMessages[chatId]
          .filter(id => id !== messageId);
      }
      
      // Снимаем отметку
      if (state.messages[chatId]) {
        const message = state.messages[chatId].find(m => m.id === messageId);
        if (message) {
          message.is_pinned = false;
        }
      }
    },
    
    // Статусы пользователей
    setOnlineUsers: (state, action) => {
      const users = action.payload;
      users.forEach(userId => {
        state.onlineUsers[userId] = true;
      });
    },
    
    setUserOnline: (state, action) => {
      const userId = action.payload;
      state.onlineUsers[userId] = true;
    },
    
    setUserOffline: (state, action) => {
      const userId = action.payload;
      state.onlineUsers[userId] = false;
    },
    
    // Печатает...
    setTyping: (state, action) => {
      const { chatId, userId, isTyping } = action.payload;
      
      if (!state.typingUsers[chatId]) {
        state.typingUsers[chatId] = {};
      }
      
      if (isTyping) {
        state.typingUsers[chatId][userId] = Date.now();
      } else {
        delete state.typingUsers[chatId][userId];
      }
    },
    
    // Прочтение сообщений
    markMessagesAsRead: (state, action) => {
      const { chatId, messageIds } = action.payload;
      
      if (state.messages[chatId]) {
        state.messages[chatId] = state.messages[chatId].map(msg => {
          if (messageIds.includes(msg.id)) {
            return { ...msg, is_read: true };
          }
          return msg;
        });
      }
    },
    
    // Звонки
    setIncomingCall: (state, action) => {
      state.incomingCall = action.payload;
    },
    
    setActiveCall: (state, action) => {
      state.activeCall = action.payload;
      if (action.payload) {
        state.incomingCall = null;
      }
    },
    
    endActiveCall: (state) => {
      state.activeCall = null;
    },
    
    // Уведомления
    addNotification: (state, action) => {
      state.notifications.unshift(action.payload);
      if (!action.payload.is_read) {
        state.unreadNotifications += 1;
      }
    },
    
    markNotificationAsRead: (state, action) => {
      const notificationId = action.payload;
      const notification = state.notifications.find(n => n.id === notificationId);
      if (notification && !notification.is_read) {
        notification.is_read = true;
        state.unreadNotifications = Math.max(0, state.unreadNotifications - 1);
      }
    },
    
    // Сохраненные сообщения
    addSavedMessage: (state, action) => {
      state.savedMessages.unshift(action.payload);
    },
    
    removeSavedMessage: (state, action) => {
      const messageId = action.payload;
      state.savedMessages = state.savedMessages.filter(sm => sm.message.id !== messageId);
    },
    
    // Очистка
    clearChatState: (state) => {
      state.activeChat = null;
      state.messages = {};
      state.optimisticMessages = {};
    },
    
    clearMessages: (state, action) => {
      const chatId = action.payload;
      if (chatId) {
        delete state.messages[chatId];
        delete state.optimisticMessages[chatId];
        delete state.hasMoreMessages[chatId];
      } else {
        state.messages = {};
        state.optimisticMessages = {};
        state.hasMoreMessages = {};
      }
    },
    
    clearError: (state) => {
      state.error = null;
    },
  },
  
  extraReducers: (builder) => {
    builder
      // ========== ЧАТЫ ==========
      .addCase(fetchChats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChats.fulfilled, (state, action) => {
        state.loading = false;
        state.chats = action.payload;
      })
      .addCase(fetchChats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      .addCase(createChat.pending, (state) => {
        state.loading = true;
      })
      .addCase(createChat.fulfilled, (state, action) => {
        state.loading = false;
        state.chats.unshift(action.payload);
        state.activeChat = action.payload;
      })
      .addCase(createChat.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      .addCase(updateChat.fulfilled, (state, action) => {
        const { chatId, data } = action.payload;
        const chatIndex = state.chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          state.chats[chatIndex] = { ...state.chats[chatIndex], ...data };
        }
        if (state.activeChat?.id === chatId) {
          state.activeChat = { ...state.activeChat, ...data };
        }
      })
      
      .addCase(deleteChat.fulfilled, (state, action) => {
        const chatId = action.payload;
        state.chats = state.chats.filter(c => c.id !== chatId);
        if (state.activeChat?.id === chatId) {
          state.activeChat = null;
          delete state.messages[chatId];
        }
      })
      
      .addCase(fetchChatDetails.fulfilled, (state, action) => {
        const chat = action.payload;
        state.chatDetails[chat.id] = chat;
      })
      
      // ========== УЧАСТНИКИ ==========
      .addCase(fetchParticipants.fulfilled, (state, action) => {
        const { chatId, participants } = action.payload;
        state.participants[chatId] = participants;
      })
      
      .addCase(addParticipant.fulfilled, (state, action) => {
        const { chatId, userId } = action.payload;
        // Обновим позже через fetchParticipants
      })
      
      .addCase(removeParticipant.fulfilled, (state, action) => {
        const { chatId, userId } = action.payload;
        if (state.participants[chatId]) {
          state.participants[chatId] = state.participants[chatId]
            .filter(p => p.user_id !== userId);
        }
      })
      
      // ========== СООБЩЕНИЯ ==========
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loading = false;
        const { chatId, messages } = action.payload;
        
        if (!state.messages[chatId]) {
          state.messages[chatId] = [];
        }
        
        // Объединяем с существующими, избегая дубликатов
        const existingIds = new Set(state.messages[chatId].map(m => m.id));
        const newMessages = messages.filter(msg => !existingIds.has(msg.id));
        
        state.messages[chatId] = [...newMessages, ...state.messages[chatId]];
        state.messages[chatId].sort((a, b) => 
          new Date(a.sent_at) - new Date(b.sent_at)
        );
        
        state.hasMoreMessages[chatId] = messages.length === 50;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      .addCase(fetchMoreMessages.pending, (state) => {
        state.loadingMore = true;
      })
      .addCase(fetchMoreMessages.fulfilled, (state, action) => {
        state.loadingMore = false;
        const { chatId, messages, hasMore } = action.payload;
        
        if (!state.messages[chatId]) {
          state.messages[chatId] = [];
        }
        
        // Добавляем старые сообщения в начало
        const existingIds = new Set(state.messages[chatId].map(m => m.id));
        const newMessages = messages.filter(msg => !existingIds.has(msg.id));
        
        state.messages[chatId] = [...newMessages, ...state.messages[chatId]];
        state.messages[chatId].sort((a, b) => 
          new Date(a.sent_at) - new Date(b.sent_at)
        );
        
        state.hasMoreMessages[chatId] = hasMore;
      })
      .addCase(fetchMoreMessages.rejected, (state) => {
        state.loadingMore = false;
      })
      
      .addCase(sendMessage.pending, (state, action) => {
        // Ничего не делаем, optimistic update уже добавил сообщение
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const message = action.payload;
        const chatId = message.chat_id;
        
        // Заменяем оптимистичное сообщение
        if (state.messages[chatId]) {
          const index = state.messages[chatId].findIndex(m => 
            m.is_optimistic && m.content === message.content
          );
          
          if (index !== -1) {
            state.messages[chatId][index] = message;
          }
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload;
        // Можно добавить уведомление об ошибке
      })
      
      .addCase(editMessage.fulfilled, (state, action) => {
        const { messageId, content } = action.payload;
        
        // Ищем сообщение во всех чатах
        Object.keys(state.messages).forEach(chatId => {
          const message = state.messages[chatId]?.find(m => m.id === messageId);
          if (message) {
            message.content = content;
            message.is_edited = true;
          }
        });
      })
      
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const { messageId, deleteFor } = action.payload;
        
        Object.keys(state.messages).forEach(chatId => {
          if (deleteFor === 'everyone') {
            const message = state.messages[chatId]?.find(m => m.id === messageId);
            if (message) {
              message.content = '[Сообщение удалено]';
              message.message_type = 'deleted';
              message.is_deleted = true;
            }
          } else {
            state.messages[chatId] = state.messages[chatId]
              ?.filter(m => m.id !== messageId) || [];
          }
        });
      })
      
      .addCase(replyToMessage.fulfilled, (state, action) => {
        const message = action.payload;
        const chatId = message.chat_id;
        
        if (!state.messages[chatId]) {
          state.messages[chatId] = [];
        }
        
        state.messages[chatId].push(message);
        state.messages[chatId].sort((a, b) => 
          new Date(a.sent_at) - new Date(b.sent_at)
        );
      })
      
      .addCase(forwardMessages.fulfilled, (state, action) => {
        const { messages, targetChatId } = action.payload;
        
        if (!state.messages[targetChatId]) {
          state.messages[targetChatId] = [];
        }
        
        state.messages[targetChatId].push(...messages);
        state.messages[targetChatId].sort((a, b) => 
          new Date(a.sent_at) - new Date(b.sent_at)
        );
      })
      
      .addCase(pinMessage.fulfilled, (state, action) => {
        const { messageId } = action.payload;
        
        Object.keys(state.messages).forEach(chatId => {
          const message = state.messages[chatId]?.find(m => m.id === messageId);
          if (message) {
            message.is_pinned = true;
            
            if (!state.pinnedMessages[chatId]) {
              state.pinnedMessages[chatId] = [];
            }
            if (!state.pinnedMessages[chatId].includes(messageId)) {
              state.pinnedMessages[chatId].push(messageId);
            }
          }
        });
      })
      
      .addCase(unpinMessage.fulfilled, (state, action) => {
        const { messageId } = action.payload;
        
        Object.keys(state.messages).forEach(chatId => {
          const message = state.messages[chatId]?.find(m => m.id === messageId);
          if (message) {
            message.is_pinned = false;
          }
          
          if (state.pinnedMessages[chatId]) {
            state.pinnedMessages[chatId] = state.pinnedMessages[chatId]
              .filter(id => id !== messageId);
          }
        });
      })
      
      .addCase(getMessage.fulfilled, (state, action) => {
        const message = action.payload;
        const chatId = message.chat_id;
        
        if (!state.messages[chatId]) {
          state.messages[chatId] = [];
        }
        
        const index = state.messages[chatId].findIndex(m => m.id === message.id);
        if (index !== -1) {
          state.messages[chatId][index] = message;
        } else {
          state.messages[chatId].push(message);
          state.messages[chatId].sort((a, b) => 
            new Date(a.sent_at) - new Date(b.sent_at)
          );
        }
      })
      
      // ========== РЕАКЦИИ ==========
      .addCase(addReaction.fulfilled, (state, action) => {
        // Уже обработано в addReactionToMessage
      })
      
      .addCase(removeReaction.fulfilled, (state, action) => {
        // Уже обработано в removeReactionFromMessage
      })
      
      .addCase(fetchReactions.fulfilled, (state, action) => {
        const { messageId, reactions } = action.payload;
        
        Object.keys(state.messages).forEach(chatId => {
          const message = state.messages[chatId]?.find(m => m.id === messageId);
          if (message) {
            message.reactions = reactions;
          }
        });
      })
      
      // ========== СОХРАНЕННЫЕ СООБЩЕНИЯ ==========
      .addCase(fetchSavedMessages.pending, (state) => {
        state.savedMessagesLoading = true;
      })
      .addCase(fetchSavedMessages.fulfilled, (state, action) => {
        state.savedMessagesLoading = false;
        state.savedMessages = action.payload;
      })
      .addCase(fetchSavedMessages.rejected, (state) => {
        state.savedMessagesLoading = false;
      })
      
      .addCase(saveMessage.fulfilled, (state, action) => {
        // Может быть обновлено через fetchSavedMessages
      })
      
      .addCase(unsaveMessage.fulfilled, (state, action) => {
        const messageId = action.payload;
        state.savedMessages = state.savedMessages
          .filter(sm => sm.message.id !== messageId);
      })
      
      // ========== ПОИСК ==========
      .addCase(searchMessages.pending, (state) => {
        state.searchLoading = true;
      })
      .addCase(searchMessages.fulfilled, (state, action) => {
        state.searchLoading = false;
        state.searchResults = action.payload;
      })
      .addCase(searchMessages.rejected, (state) => {
        state.searchLoading = false;
      })
      
      // ========== ЗВОНКИ ==========
      .addCase(startCall.fulfilled, (state, action) => {
        state.activeCall = action.payload;
      })
      
      .addCase(acceptCall.fulfilled, (state, action) => {
        if (state.incomingCall?.call_id === action.payload.callId) {
          state.activeCall = state.incomingCall;
          state.incomingCall = null;
        }
      })
      
      .addCase(rejectCall.fulfilled, (state) => {
        state.incomingCall = null;
      })
      
      .addCase(endCall.fulfilled, (state) => {
        state.activeCall = null;
      })
      
      // ========== УВЕДОМЛЕНИЯ ==========
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.notifications = action.payload;
        state.unreadNotifications = action.payload.filter(n => !n.is_read).length;
      })
      
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const { notificationId } = action.payload;
        const notification = state.notifications.find(n => n.id === notificationId);
        if (notification && !notification.is_read) {
          notification.is_read = true;
          state.unreadNotifications = Math.max(0, state.unreadNotifications - 1);
        }
      })
      
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.notifications.forEach(n => { n.is_read = true; });
        state.unreadNotifications = 0;
      })
      
      // ========== СТАТИСТИКА ==========
      .addCase(fetchStats.fulfilled, (state, action) => {
        state.stats = action.payload;
      })
      
      // ========== ЗАГРУЗКА ФАЙЛОВ ==========
      .addCase(uploadFile.fulfilled, (state, action) => {
        // Ничего не делаем, результат используется в компонентах
      });
  },
});

// ==================== ЭКСПОРТЫ ====================

export const { 
  // Чаты
  setActiveChat,
  
  // Сообщения
  addMessage,
  addOptimisticMessage,
  updateOptimisticMessage,
  removeOptimisticMessage,
  updateMessage,
  deleteMessageFromList,
  
  // Реакции
  addReactionToMessage,
  removeReactionFromMessage,
  
  // Закрепленные
  addPinnedMessage,
  removePinnedMessage,
  
  // Статусы
  setOnlineUsers,
  setUserOnline,
  setUserOffline,
  setTyping,
  
  // Прочтение
  markMessagesAsRead,
  
  // Звонки
  setIncomingCall,
  setActiveCall,
  endActiveCall,
  
  // Уведомления
  addNotification,
  markNotificationAsRead,
  
  // Сохраненные
  addSavedMessage,
  removeSavedMessage,
  
  // Очистка
  clearChatState,
  clearMessages,
  clearError
} = chatSlice.actions;

export default chatSlice.reducer;