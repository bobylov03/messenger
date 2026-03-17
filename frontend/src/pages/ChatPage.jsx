import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchChats, setActiveChat, createChat } from '../store/chatSlice';
import ChatWindow from '../components/Chat/ChatWindow';
import { FaPlus, FaSearch, FaVideo, FaPhone } from 'react-icons/fa';
import Modal from '../components/Common/Modal';
import api from '../services/api';
import toast from 'react-hot-toast';

const ChatPage = ({ onStartCall }) => {
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [chatName, setChatName] = useState('');
  const [chatType, setChatType] = useState('private');
  const [topics, setTopics] = useState(['']);
  
  const { chats, activeChat, loading } = useSelector(state => state.chat);
  const { user } = useSelector(state => state.auth);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchChats());
    fetchAvailableUsers();
  }, [dispatch]);

  const fetchAvailableUsers = async () => {
    try {
      const response = await api.get('/api/users');
      setAvailableUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Выберите хотя бы одного участника');
      return;
    }

    if (chatType === 'group' && !chatName.trim()) {
      toast.error('Введите название группы');
      return;
    }

    try {
      const chatData = {
        name: chatType === 'group' ? chatName.trim() : null,
        chat_type: chatType,
        participant_ids: selectedUsers.map(u => u.id),
        topic_names: chatType === 'group' ? topics.filter(t => t.trim()) : []
      };

      console.log('Creating chat with data:', chatData);
      
      // Используем Redux action для создания чата
      const resultAction = await dispatch(createChat(chatData));
      
      if (createChat.fulfilled.match(resultAction)) {
        const newChat = resultAction.payload;
        setShowNewChatModal(false);
        resetForm();
        
        toast.success('Чат успешно создан');
        
        // Обновляем список чатов
        dispatch(fetchChats());
        
        // Автоматически выбираем созданный чат
        dispatch(setActiveChat(newChat));
        
        console.log('Chat created successfully:', newChat);
      } else {
        throw new Error(resultAction.payload || 'Ошибка создания чата');
      }
      
    } catch (error) {
      console.error('Create chat error:', error);
      toast.error(error.message || 'Ошибка создания чата');
    }
  };

  const resetForm = () => {
    setSelectedUsers([]);
    setChatName('');
    setChatType('private');
    setTopics(['']);
  };

  const handleAddTopic = () => {
    setTopics([...topics, '']);
  };

  const handleTopicChange = (index, value) => {
    const newTopics = [...topics];
    newTopics[index] = value;
    setTopics(newTopics);
  };

  const handleRemoveTopic = (index) => {
    const newTopics = topics.filter((_, i) => i !== index);
    setTopics(newTopics);
  };

  // Отладочный вывод
  console.log('Chats in component:', chats);
  console.log('Chats count:', chats?.length);

  const filteredChats = Array.isArray(chats) ? chats.filter(chat => {
    if (!chat) return false;
    
    const searchLower = searchQuery.toLowerCase();
    
    // Проверка по названию чата
    if (chat.name && chat.name.toLowerCase().includes(searchLower)) {
      return true;
    }
    
    // Для приватных чатов показываем имя собеседника
    if (chat.chat_type === 'private') {
      // Здесь можно добавить логику поиска по собеседнику
      // когда будут данные о участниках
      return chat.name?.toLowerCase().includes(searchLower) || false;
    }
    
    return false;
  }) : [];

  const getChatDisplayName = (chat) => {
  // Если у чата есть имя - используем его
  if (chat.name && chat.name.trim()) {
    return chat.name;
  }
  
  // Для приватных чатов показываем имя собеседника
  if (chat.chat_type === 'private') {
    // Попробуйте получить участников из данных чата
    // Если есть информация об участниках, показываем первого не-тебя
    if (chat.participants && Array.isArray(chat.participants)) {
      const otherParticipants = chat.participants.filter(p => p.id !== user?.id);
      if (otherParticipants.length > 0) {
        const firstParticipant = otherParticipants[0];
        return firstParticipant.full_name || firstParticipant.username || 'Пользователь';
      }
    }
    
    // Если нет данных, показываем заглушку
    return 'Личный чат';
  }
  
  // Для групповых чатов без имени
  if (chat.chat_type === 'group') {
    return 'Групповой чат';
  }
  
  return 'Чат без названия';
};

  const getChatParticipantsText = (chat) => {
    if (chat.chat_type === 'private') {
      return 'Личный чат';
    }
    
    if (chat.chat_type === 'group') {
      const participantCount = 2; // Примерное количество
      return `Группа • ${participantCount} участника`;
    }
    
    return 'Чат';
  };

  return (
    <div className="flex h-full">
      {/* Сайдбар */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Чаты</h2>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"
              disabled={loading}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <FaPlus className="w-5 h-5" />
              )}
            </button>
          </div>
          
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск чатов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={loading}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredChats.length > 0 ? (
            filteredChats.map(chat => {
              if (!chat) return null;
              
              return (
                <div
                  key={chat.id}
                  onClick={() => dispatch(setActiveChat(chat))}
                  className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition ${
                    activeChat?.id === chat.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex items-center">
                    <div className="relative">
                      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                        {getChatDisplayName(chat)[0]?.toUpperCase() || '?'}
                      </div>
                    </div>
                    
                    <div className="ml-3 flex-1">
                      <div className="flex justify-between items-start">
                        <h3 className="font-medium text-gray-800">
                          {getChatDisplayName(chat)}
                        </h3>
                      </div>
                      
                      <p className="text-sm text-gray-600 truncate">
                        {getChatParticipantsText(chat)}
                      </p>
                      
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">
                          {chat.chat_type === 'private' ? 'Личный' : 'Группа'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Нет чатов</h3>
              <p className="text-gray-500">Создайте новый чат или дождитесь приглашения</p>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Создать чат
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Основное окно чата */}
      <div className="flex-1 flex flex-col">
        <ChatWindow />
        
        {/* Кнопки быстрого вызова */}
        {activeChat && (
          <div className="absolute bottom-6 right-6 flex space-x-3">
            <button
              onClick={() => onStartCall(activeChat.id, 'audio')}
              className="p-4 bg-green-500 text-white rounded-full shadow-lg hover:bg-green-600 transition"
              title="Аудиозвонок"
            >
              <FaPhone className="w-6 h-6" />
            </button>
            <button
              onClick={() => onStartCall(activeChat.id, 'video')}
              className="p-4 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition"
              title="Видеозвонок"
            >
              <FaVideo className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>

      {/* Модальное окно создания чата */}
      <Modal
        isOpen={showNewChatModal}
        onClose={() => {
          setShowNewChatModal(false);
          resetForm();
        }}
        title="Создать чат"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тип чата
            </label>
            <select
              value={chatType}
              onChange={(e) => setChatType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="private">Личный чат</option>
              <option value="group">Групповой чат</option>
            </select>
          </div>
          
          {chatType === 'group' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Название группы *
              </label>
              <input
                type="text"
                value={chatName}
                onChange={(e) => setChatName(e.target.value)}
                placeholder="Введите название группы"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">Обязательное поле для групповых чатов</p>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Участники *
            </label>
            <div className="border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto">
              {availableUsers.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500">Загрузка пользователей...</p>
                </div>
              ) : (
                availableUsers
                  .filter(u => u.id !== user?.id)
                  .map(u => (
                    <div
                      key={u.id}
                      onClick={() => {
                        if (selectedUsers.find(su => su.id === u.id)) {
                          setSelectedUsers(selectedUsers.filter(su => su.id !== u.id));
                        } else {
                          setSelectedUsers([...selectedUsers, u]);
                        }
                      }}
                      className={`flex items-center p-2 rounded cursor-pointer mb-1 transition ${
                        selectedUsers.find(su => su.id === u.id)
                          ? 'bg-blue-100 border border-blue-300'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white mr-2">
                        {u.full_name?.[0] || u.username?.[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">
                          {u.full_name || u.username}
                        </p>
                        <p className="text-xs text-gray-500">{u.username}</p>
                      </div>
                      {selectedUsers.find(su => su.id === u.id) && (
                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Выбрано: {selectedUsers.length} участников
            </p>
          </div>
          
          {chatType === 'group' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Темы (опционально)
              </label>
              {topics.map((topic, index) => (
                <div key={index} className="flex mb-2">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => handleTopicChange(index, e.target.value)}
                    placeholder="Название темы"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(index)}
                      className="ml-2 px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                      disabled={loading}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddTopic}
                className="text-sm text-blue-500 hover:text-blue-600 transition"
                disabled={loading}
              >
                + Добавить тему
              </button>
            </div>
          )}
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setShowNewChatModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              disabled={loading}
            >
              Отмена
            </button>
            <button
              onClick={handleCreateChat}
              disabled={loading || selectedUsers.length === 0 || (chatType === 'group' && !chatName.trim())}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Создание...
                </>
              ) : (
                'Создать чат'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ChatPage;