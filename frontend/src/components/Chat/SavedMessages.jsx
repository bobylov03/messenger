import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  FaBookmark, FaTimes, FaSearch, FaTrash, 
  FaStickyNote, FaRegClock, FaUser, FaChevronLeft,
  FaFile, FaImage, FaVideo, FaMicrophone, FaLink
} from 'react-icons/fa';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fetchSavedMessages, unsaveMessage } from '../../store/chatSlice';
import toast from 'react-hot-toast';

const SavedMessages = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { savedMessages, savedMessagesLoading } = useSelector(state => state.chat);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [filter, setFilter] = useState('all'); // all, text, media, files

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchSavedMessages());
    }
  }, [isOpen, dispatch]);

  const handleRemove = async (savedId, messageId) => {
    if (window.confirm('Удалить из сохраненных?')) {
      await dispatch(unsaveMessage(messageId));
      toast.success('Удалено из сохраненных');
      
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
    }
  };

  const handleAddNote = (savedId) => {
    // Можно добавить функционал заметок
    toast.success('Функция в разработке');
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

  const filteredMessages = savedMessages.filter(item => {
    if (filter === 'text' && item.message.message_type !== 'text') return false;
    if (filter === 'media' && !['image', 'video', 'audio'].includes(item.message.message_type)) return false;
    if (filter === 'files' && item.message.message_type !== 'file') return false;
    
    if (searchTerm) {
      const content = item.message.content || '';
      const fileName = item.message.file_name || '';
      const note = item.note || '';
      return content.toLowerCase().includes(searchTerm.toLowerCase()) ||
             fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             note.toLowerCase().includes(searchTerm.toLowerCase());
    }
    
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl h-[80vh] flex shadow-2xl">
        {/* Левая панель - список сохраненных */}
        <div className="w-2/5 border-r flex flex-col">
          {/* Заголовок */}
          <div className="p-4 border-b flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <FaBookmark className="text-yellow-500" />
              <h2 className="text-lg font-semibold">Сохраненные</h2>
              <span className="text-sm text-gray-500">
                ({savedMessages.length})
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition"
            >
              <FaTimes className="text-gray-500" />
            </button>
          </div>

          {/* Поиск */}
          <div className="p-3 border-b">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Поиск в сохраненных..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Фильтры */}
          <div className="p-3 border-b flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full text-sm transition ${
                filter === 'all' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setFilter('text')}
              className={`px-3 py-1 rounded-full text-sm transition ${
                filter === 'text' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Текст
            </button>
            <button
              onClick={() => setFilter('media')}
              className={`px-3 py-1 rounded-full text-sm transition ${
                filter === 'media' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Медиа
            </button>
            <button
              onClick={() => setFilter('files')}
              className={`px-3 py-1 rounded-full text-sm transition ${
                filter === 'files' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Файлы
            </button>
          </div>

          {/* Список */}
          <div className="flex-1 overflow-y-auto p-2">
            {savedMessagesLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : filteredMessages.length > 0 ? (
              <div className="space-y-2">
                {filteredMessages.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedMessage(item)}
                    className={`
                      w-full p-3 rounded-lg transition text-left
                      ${selectedMessage?.id === item.id 
                        ? 'bg-blue-50 border-2 border-blue-500' 
                        : 'hover:bg-gray-50 border-2 border-transparent'
                      }
                    `}
                  >
                    <div className="flex items-start space-x-3">
                      {/* Иконка типа */}
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {getMessageIcon(item.message.message_type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Дата и заметка */}
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500 flex items-center">
                            <FaRegClock className="mr-1" />
                            {format(new Date(item.saved_at), 'dd MMM yyyy', { locale: ru })}
                          </span>
                          {item.note && (
                            <FaStickyNote className="text-yellow-500 text-xs" />
                          )}
                        </div>

                        {/* Превью сообщения */}
                        <p className="text-sm text-gray-800 truncate">
                          {item.message.content || 
                           item.message.file_name || 
                           `[${item.message.message_type}]`}
                        </p>

                        {/* Отправитель */}
                        <div className="flex items-center text-xs text-gray-500 mt-1">
                          <FaUser className="mr-1" />
                          {item.message.sender?.full_name || item.message.sender?.username}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {searchTerm ? 'Ничего не найдено' : 'Нет сохраненных сообщений'}
              </div>
            )}
          </div>
        </div>

        {/* Правая панель - детали сообщения */}
        <div className="flex-1 flex flex-col">
          {selectedMessage ? (
            <>
              {/* Заголовок */}
              <div className="p-4 border-b flex items-center justify-between">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="lg:hidden p-1 hover:bg-gray-100 rounded-full"
                >
                  <FaChevronLeft />
                </button>
                <h3 className="font-medium">Детали сообщения</h3>
                <button
                  onClick={() => handleRemove(selectedMessage.id, selectedMessage.message.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-full transition"
                  title="Удалить из сохраненных"
                >
                  <FaTrash />
                </button>
              </div>

              {/* Сообщение */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  {/* Информация о сообщении */}
                  <div className="flex items-start space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0">
                      {selectedMessage.message.sender?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="font-medium">
                        {selectedMessage.message.sender?.full_name || selectedMessage.message.sender?.username}
                      </div>
                      <div className="text-sm text-gray-500">
                        {format(new Date(selectedMessage.message.sent_at), 'dd MMMM yyyy, HH:mm', { locale: ru })}
                      </div>
                    </div>
                  </div>

                  {/* Содержимое */}
                  <div className="mt-4">
                    {selectedMessage.message.message_type === 'text' && (
                      <p className="text-gray-800 whitespace-pre-wrap">
                        {selectedMessage.message.content}
                      </p>
                    )}

                    {selectedMessage.message.message_type === 'image' && (
                      <img
                        src={selectedMessage.message.file_url}
                        alt=""
                        className="max-w-full rounded-lg cursor-pointer"
                        onClick={() => window.open(selectedMessage.message.file_url, '_blank')}
                      />
                    )}

                    {selectedMessage.message.message_type === 'video' && (
                      <video
                        src={selectedMessage.message.file_url}
                        controls
                        className="max-w-full rounded-lg"
                      />
                    )}

                    {selectedMessage.message.message_type === 'audio' && (
                      <audio
                        src={selectedMessage.message.file_url}
                        controls
                        className="w-full"
                      />
                    )}

                    {selectedMessage.message.message_type === 'file' && (
                      <div className="flex items-center p-4 bg-white rounded-lg">
                        <FaFile className="w-8 h-8 text-gray-500 mr-3" />
                        <div className="flex-1">
                          <p className="font-medium">{selectedMessage.message.file_name}</p>
                          <p className="text-sm text-gray-500">
                            {selectedMessage.message.file_size ? 
                              `${(selectedMessage.message.file_size / 1024 / 1024).toFixed(2)} MB` : 
                              'Файл'
                            }
                          </p>
                        </div>
                        <a
                          href={selectedMessage.message.file_url}
                          download
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          Скачать
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Заметка */}
                  {selectedMessage.note && (
                    <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-center text-yellow-700 mb-1">
                        <FaStickyNote className="mr-2" />
                        <span className="font-medium">Заметка</span>
                      </div>
                      <p className="text-gray-700">{selectedMessage.note}</p>
                    </div>
                  )}
                </div>

                {/* Кнопка добавить заметку */}
                <button
                  onClick={() => handleAddNote(selectedMessage.id)}
                  className="mt-4 w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 transition flex items-center justify-center space-x-2"
                >
                  <FaStickyNote />
                  <span>Добавить заметку</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <FaBookmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Выберите сообщение для просмотра</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedMessages;