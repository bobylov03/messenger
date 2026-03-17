import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  FaSearch, FaTimes, FaFilter, FaCalendar, FaUser, 
  FaFile, FaImage, FaVideo, FaMicrophone, FaLink,
  FaChevronLeft, FaChevronRight, FaRegClock
} from 'react-icons/fa';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { searchMessages } from '../../store/chatSlice';
import { useDebounce } from '../../hooks/useDebounce';
import toast from 'react-hot-toast';

const SearchMessages = ({ isOpen, onClose, onResultClick }) => {
  const dispatch = useDispatch();
  const { chats, searchResults, searchLoading } = useSelector(state => state.chat);
  const { user } = useSelector(state => state.auth);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    chatId: null,
    fromUserId: null,
    messageType: null,
    startDate: null,
    endDate: null
  });
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  
  const searchInputRef = useRef(null);
  const debouncedQuery = useDebounce(query, 500);

  // Фокус на поиск при открытии
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Выполнение поиска
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      performSearch();
    }
  }, [debouncedQuery, filters, currentPage]);

  const performSearch = async (resetPage = true) => {
    if (resetPage) {
      setCurrentPage(0);
    }

    try {
      const result = await dispatch(searchMessages({
        query: debouncedQuery,
        chatId: filters.chatId,
        fromUserId: filters.fromUserId,
        messageType: filters.messageType,
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: 20,
        offset: resetPage ? 0 : currentPage * 20
      })).unwrap();

      setHasMore(result.length === 20);
    } catch (error) {
      toast.error('Ошибка при поиске');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(0);
  };

  const clearFilters = () => {
    setFilters({
      chatId: null,
      fromUserId: null,
      messageType: null,
      startDate: null,
      endDate: null
    });
  };

  const getMessageIcon = (type) => {
    switch (type) {
      case 'image': return <FaImage className="text-green-500" />;
      case 'video': return <FaVideo className="text-red-500" />;
      case 'audio': return <FaMicrophone className="text-purple-500" />;
      case 'file': return <FaFile className="text-blue-500" />;
      default: return <FaLink className="text-gray-500" />;
    }
  };

  const highlightText = (text, highlight) => {
    if (!highlight.trim()) return text;
    
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === highlight.toLowerCase() ? 
        <mark key={i} className="bg-yellow-200">{part}</mark> : part
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-20 z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Заголовок */}
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Поиск сообщений</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition"
          >
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        {/* Поле поиска */}
        <div className="p-4 border-b">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по сообщениям..."
              className="w-full pl-10 pr-24 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-lg transition ${
                  showFilters || Object.values(filters).some(v => v !== null)
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Фильтры"
              >
                <FaFilter className="w-4 h-4" />
              </button>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <FaTimes className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Фильтры */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
              {/* Выбор чата */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Чат
                </label>
                <select
                  value={filters.chatId || ''}
                  onChange={(e) => handleFilterChange('chatId', e.target.value || null)}
                  className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Все чаты</option>
                  {chats.map(chat => (
                    <option key={chat.id} value={chat.id}>
                      {chat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Тип сообщения */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Тип сообщения
                </label>
                <select
                  value={filters.messageType || ''}
                  onChange={(e) => handleFilterChange('messageType', e.target.value || null)}
                  className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Все типы</option>
                  <option value="text">Текст</option>
                  <option value="image">Изображения</option>
                  <option value="video">Видео</option>
                  <option value="audio">Аудио</option>
                  <option value="file">Файлы</option>
                </select>
              </div>

              {/* Дата */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    С
                  </label>
                  <input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => handleFilterChange('startDate', e.target.value || null)}
                    className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    По
                  </label>
                  <input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => handleFilterChange('endDate', e.target.value || null)}
                    className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Кнопка сброса */}
              <button
                onClick={clearFilters}
                className="text-sm text-blue-500 hover:text-blue-700"
              >
                Сбросить фильтры
              </button>
            </div>
          )}
        </div>

        {/* Результаты */}
        <div className="flex-1 overflow-y-auto p-2">
          {searchLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => {
                    setSelectedResult(result);
                    onResultClick?.(result);
                  }}
                  className={`
                    w-full p-3 rounded-lg transition text-left
                    ${selectedResult?.id === result.id 
                      ? 'bg-blue-50 border-2 border-blue-500' 
                      : 'hover:bg-gray-50 border-2 border-transparent'
                    }
                  `}
                >
                  <div className="flex items-start space-x-3">
                    {/* Иконка чата */}
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0">
                      {result.chat?.avatar_url ? (
                        <img 
                          src={result.chat.avatar_url} 
                          alt="" 
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        result.chat?.name?.charAt(0) || 'Ч'
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Информация о чате и отправителе */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900">
                          {result.chat?.name}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center">
                          <FaRegClock className="mr-1" />
                          {format(new Date(result.sent_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                        </span>
                      </div>

                      {/* Отправитель */}
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <FaUser className="mr-1 text-xs" />
                        {result.sender?.full_name || result.sender?.username}
                      </div>

                      {/* Сообщение */}
                      <div className="flex items-start space-x-2">
                        <span className="text-gray-500 text-sm mt-1">
                          {getMessageIcon(result.message_type)}
                        </span>
                        <p className="text-gray-800 text-sm break-words line-clamp-2">
                          {highlightText(result.content || '[Медиа]', query)}
                        </p>
                      </div>

                      {/* Метаданные */}
                      {result.message_type !== 'text' && (
                        <div className="mt-1 text-xs text-gray-400">
                          {result.file_name && (
                            <span className="truncate">{result.file_name}</span>
                          )}
                          {result.file_size && (
                            <span className="ml-2">
                              ({(result.file_size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="text-center py-8 text-gray-500">
              Ничего не найдено
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              Введите минимум 2 символа для поиска
            </div>
          )}
        </div>

        {/* Пагинация */}
        {searchResults.length > 0 && (
          <div className="p-4 border-t flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <FaChevronLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>
            <span className="text-sm text-gray-600">
              Страница {currentPage + 1}
            </span>
            <button
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={!hasMore}
              className="px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <span>Вперед</span>
              <FaChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchMessages;