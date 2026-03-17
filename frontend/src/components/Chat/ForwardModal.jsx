import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { forwardMessages } from '../../store/chatSlice';
import { FaTimes, FaSearch, FaCheck } from 'react-icons/fa';
import toast from 'react-hot-toast';

const ForwardModal = ({ messages, onClose, onForward }) => {
  const dispatch = useDispatch();
  const { chats } = useSelector(state => state.chat);
  const { user } = useSelector(state => state.auth);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChat, setSelectedChat] = useState(null);
  const [loading, setLoading] = useState(false);

  // Фильтрация чатов (исключаем текущий, если сообщения из одного чата)
  const filteredChats = chats.filter(chat => {
    // Исключаем чат, из которого пересылаются сообщения (если все из одного)
    if (messages.length > 0 && messages.every(m => m.chat_id === chat.id)) {
      return false;
    }
    
    // Поиск по названию
    if (searchTerm && !chat.name?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  const handleForward = async () => {
    if (!selectedChat) {
      toast.error('Выберите чат для пересылки');
      return;
    }

    setLoading(true);
    try {
      await dispatch(forwardMessages({
        messageIds: messages.map(m => m.id),
        targetChatId: selectedChat.id
      })).unwrap();
      
      toast.success(`Сообщения пересланы в ${selectedChat.name}`);
      onForward?.();
      onClose();
    } catch (error) {
      toast.error('Ошибка при пересылке');
    } finally {
      setLoading(false);
    }
  };

  // Предпросмотр пересылаемых сообщений
  const renderMessagePreview = () => {
    if (messages.length === 1) {
      const msg = messages[0];
      return (
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-500 mb-1">
            {msg.sender?.full_name || 'Пользователь'}:
          </div>
          <div className="flex items-center space-x-2">
            {msg.message_type === 'text' && (
              <p className="text-gray-800 truncate">{msg.content}</p>
            )}
            {msg.message_type === 'image' && (
              <>
                <img src={msg.file_url} alt="" className="w-10 h-10 object-cover rounded" />
                <span>Фото</span>
              </>
            )}
            {msg.message_type === 'video' && <span>Видео</span>}
            {msg.message_type === 'audio' && <span>Аудио</span>}
            {msg.message_type === 'file' && <span>Файл: {msg.file_name}</span>}
          </div>
        </div>
      );
    }

    return (
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium mb-2">
          Переслать {messages.length} сообщений:
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {messages.slice(0, 5).map((msg, i) => (
            <div key={i} className="text-sm text-gray-600 truncate">
              • {msg.sender?.full_name || 'Пользователь'}: {msg.content || '[Медиа]'}
            </div>
          ))}
          {messages.length > 5 && (
            <div className="text-sm text-gray-500">
              и ещё {messages.length - 5}...
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Заголовок */}
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">Переслать сообщения</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition"
          >
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        {/* Предпросмотр сообщений */}
        <div className="p-4 border-b">
          {renderMessagePreview()}
        </div>

        {/* Поиск чатов */}
        <div className="p-4 border-b">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск чата..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Список чатов */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredChats.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'Нет подходящих чатов' : 'Нет доступных чатов'}
            </div>
          ) : (
            filteredChats.map(chat => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`w-full p-3 flex items-center space-x-3 rounded-lg transition ${
                  selectedChat?.id === chat.id
                    ? 'bg-blue-50 border-2 border-blue-500'
                    : 'hover:bg-gray-50 border-2 border-transparent'
                }`}
              >
                {/* Аватар чата */}
                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0">
                  {chat.avatar_url ? (
                    <img src={chat.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    chat.name?.charAt(0) || 'Ч'
                  )}
                </div>

                {/* Информация о чате */}
                <div className="flex-1 text-left">
                  <div className="font-medium">{chat.name}</div>
                  <div className="text-sm text-gray-500">
                    {chat.chat_type === 'private' ? 'Личный чат' : 'Группа'}
                  </div>
                </div>

                {/* Индикатор выбора */}
                {selectedChat?.id === chat.id && (
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center">
                    <FaCheck className="text-xs" />
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Кнопки действий */}
        <div className="p-4 border-t flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            Отмена
          </button>
          <button
            onClick={handleForward}
            disabled={!selectedChat || loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Пересылка...</span>
              </>
            ) : (
              <span>Переслать</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForwardModal;